# 作文批改台：阿里云无服务器上线手册

## 上线后的结构

- **阿里云函数计算 FC Web 函数**：运行网页和 `/api/*`，无需购买或维护云服务器。
- **GitHub Pages**：正式访问时托管静态网页，避免 FC 默认测试域名强制下载 HTML；网页通过 HTTPS 调用 FC API。
- **私有 OSS Bucket**：保存任务状态、作文原图和预览图。
- **浏览器直传 OSS**：仅在老师选择报告图片附件时使用短期签名直传；图片不参与识别、评分或点评定位。
- **模型 API**：FC 在服务端调用 DeepSeek、Kimi 等模型；API Key 不发送给浏览器，也不写入 OSS 状态文件。

本地版仍可继续使用。只有设置 `STORAGE_DRIVER=oss` 时，程序才进入云端模式。

## 一、准备私有 OSS

1. 在阿里云 OSS 创建一个 **私有** Bucket。
2. Bucket 与函数计算选择同一地域，例如都在杭州。
3. 记下 Bucket 名称和地域代码，例如 `my-essay-bucket`、`oss-cn-hangzhou`。
4. 在 Bucket 的跨域设置中增加一条规则：
   - 来源：先填写 FC 的 HTTPS 域名；绑定自定义域名后再追加自定义域名。
   - 方法：`GET`、`PUT`、`HEAD`。
   - 允许 Headers：`*`。
   - 暴露 Headers：`ETag`。
   - 缓存时间：`600` 秒。

可参考 [deploy/oss-cors-example.json](deploy/oss-cors-example.json)，把两个占位域名替换成真实地址。不要把 Bucket 设置为公共读。

## 二、创建最小权限的 FC 角色

1. 在 RAM 控制台创建一个可信实体为“阿里云服务”的角色，受信服务选择函数计算。
2. 创建自定义权限策略，内容参考 [deploy/aliyun-fc-oss-policy.json](deploy/aliyun-fc-oss-policy.json)。
3. 把 `REPLACE_WITH_BUCKET` 替换为真实 Bucket 名称，再把策略授予该角色。
4. 创建 FC 函数时绑定这个角色。

函数计算会给程序注入临时 OSS 凭证，所以不需要在环境变量里保存阿里云长期 AccessKey。

## 三、生成部署 ZIP

在 Mac 上双击 [prepare-serverless-package.command](prepare-serverless-package.command)。脚本会：

1. 只复制运行所需文件；
2. 安装生产依赖 `ali-oss`；
3. 生成 `dist/essay-grading-serverless.zip`。

如果双击后 npm 报网络或证书错误，可以在网络正常的电脑上生成同一个 ZIP；不要通过关闭 TLS 校验绕过证书错误。

## 四、创建函数计算 Web 函数

在阿里云函数计算控制台选择“创建函数” > “Web 函数”，建议配置：

| 配置项 | 建议值 |
| --- | --- |
| 运行环境 | 自定义运行时，Node.js 20 |
| 代码上传 | 上传 `dist/essay-grading-serverless.zip` |
| 启动命令 | `npm run start:fc` |
| 监听端口 | `9000` |
| 内存 | `1024 MB` |
| 执行超时 | `600 秒` |
| 单实例并发度 | `1` |
| 最大按量实例数 | `1` |
| 公网访问 | 开启，供模型 API 调用 |
| 函数角色 | 第二步创建的 OSS 最小权限角色 |

当前版本用一个 OSS JSON 文件保存任务状态。把实例数和单实例并发都限制为 `1`，可以避免两个请求同时覆盖状态。多人高并发版本应把任务状态迁移到表格存储或数据库后再提高并发。

## 五、配置环境变量

参考 [.env.serverless.example](.env.serverless.example)，在 FC 控制台逐项添加，不要上传包含真实密钥的 `.env` 文件。

必须配置：

```text
STORAGE_DRIVER=oss
SERVER_MANAGED_MODEL_KEYS=1
APP_USERNAME=teacher
APP_PASSWORD=请换成长随机密码
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=你的私有Bucket名称
OSS_INTERNAL_ENDPOINT=https://oss-cn-hangzhou-internal.aliyuncs.com
OSS_DATA_OBJECT=essay-grading/data/app-data.json
OSS_ASSET_PREFIX=essay-grading/assets
OSS_SIGNED_URL_TTL_SECONDS=21600
DEEPSEEK_API_KEY=你的DeepSeek密钥
KIMI_API_KEY=你的Kimi密钥
TZ=Asia/Shanghai
CORS_ALLOWED_ORIGINS=https://你的GitHub用户名.github.io
```

`OSS_INTERNAL_ENDPOINT` 只供同地域 FC 在服务端读取、写入和删除对象，避免任务数据经 OSS 外网端点反复传输。浏览器需要使用的图片直传和查看链接仍由程序签发外网 URL，因此不要把 `OSS_PUBLIC_ENDPOINT` 配成内网地址。

只配置实际使用的模型密钥即可。网页中的 API Key 输入框在云端模式会锁定，避免老师误把密钥保存在浏览器或任务数据中。

## 六、创建公网入口并检查

1. 创建 HTTP 触发器，允许匿名 HTTP 调用。应用 API 仍要求教师账号密码。
2. 使用 HTTPS 的 FC 公网域名访问 `/api/health`，应看到 `"ok": true`。
3. 将静态网页发布到 GitHub Pages，并在 `runtime-config.js` 中填写 FC API 地址。打开 Pages 地址后输入 `APP_USERNAME`、`APP_PASSWORD`。
4. 在模型配置页测试文字模型。
5. 新建至少 3 个任务，分别粘贴作文并依次点击“批改”。
6. 切换任务，确认正文、题目、提示词、进度和报告互不串联；按需测试报告图片附件。
7. 回到 OSS，确认出现 `essay-grading/data/app-data.json` 和 `essay-grading/assets/`。

正式给老师使用时，建议绑定已经备案的自定义域名并开启 HTTPS。FC 临时域名更适合部署验证。

## 数据与安全说明

- OSS Bucket 必须保持私有；浏览器只获得短期、单文件的签名地址。
- 页面使用 HTTP Basic 登录，因此必须通过 HTTPS 访问。
- 不要把模型 API Key、APP 密码或阿里云 AccessKey 提交到 GitHub。
- 这套方案不需要购买 ECS 云服务器，但 FC、OSS 和模型 API 仍按实际用量计费。
- 当前 PDF 仍由老师浏览器生成并下载；任务、报告结构和原图会在 OSS 中保留。
