# 后端框架说明

当前后端是一个 Node.js 服务，同时支持本地模式和阿里云无服务器模式：

- 静态页面服务：`index.html`、`capture.html`、`styles.css`、`app.js`
- 本地 JSON 数据存储：`backend/data/app-data.json`
- 云端 OSS 数据存储和浏览器短期签名直传
- 题库与写作要求配置
- 大模型 API 配置
- 手机拍照提交队列
- 报告生成 API

## 启动

```bash
npm run dev
```

默认地址：

```text
http://127.0.0.1:8787
```

阿里云函数计算部署请参阅根目录的 `ALIYUN_SERVERLESS_DEPLOY.md`。云端模式使用 `ali-oss`，本地模式不会加载这个依赖。

## API

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/bootstrap` | 前端启动所需数据 |
| GET | `/api/prompts` | 获取作文题库 |
| PUT | `/api/prompts/requirements` | 更新某篇作文的写作要求 |
| GET | `/api/model-config` | 获取模型配置和服务商 |
| PUT | `/api/model-config` | 保存模型配置 |
| POST | `/api/model-config/test` | 测试模型配置 |
| GET | `/api/submissions` | 获取待处理作文队列 |
| POST | `/api/submissions` | 手机端提交作文图片与任务信息 |
| GET | `/api/submissions/:id` | 按需取得完整任务及临时原图地址 |
| PATCH | `/api/submissions/:id` | 自动保存任务和报告 |
| DELETE | `/api/submissions/:id` | 删除任务及其 OSS 图片 |
| POST | `/api/uploads/presign` | 生成 OSS 短期图片上传地址 |
| POST | `/api/ocr` | 使用当前视觉模型读取作文图片文字 |
| POST | `/api/generate-report` | 生成作文批改报告 |

## 拍照到报告链路

1. 手机页选择学生、作文任务并拍照，前端为模型准备高质量图片和页面预览图。
2. 本地模式把图片随任务保存；云端模式先获取短期签名，把每一页直接上传到私有 OSS，再把 Object Key 写入任务。
3. Web 工作台先读取轻量队列，打开任务时再按需取得临时原图地址，老师可以在识别文本区调用 `/api/ocr`。
4. 图片文字读取结果直接进入识别文本区，老师在同一区域校对和补充。
5. `/api/generate-report` 根据作文题目、后台配置要求和确认后的识别文本完成批改。

DeepSeek 当前可用于 OpenAI-compatible 文本接口连通性测试；图片文字读取需要选择支持视觉输入的模型，例如 Kimi 的 `moonshot-v1-128k-vision-preview`、OpenAI 的 `gpt-4.1`、`gpt-4o` 系列或自定义兼容视觉模型。

## 作文题库

题库源文件在 `backend/prompt-catalog.js`。当前已整理 3-6 年级上下册共 62 条单元习作，其中六年级下册为 6 条。

每条题库包含：

- `title`：作文题目。
- `requirements`：核心写作要求，可在后台界面继续修改。
- `abilityGoal`：能力目标，例如写人、写景、读后感、说明文、应用文。
- `wordCountGuide`：年级建议字数范围。
- `source`：整理来源与对应人教社教材链接。

## 存储边界

- 本地模式保留当前 JSON 文件和本地 API Key 配置，兼容老师电脑单机运行。
- 云端模式把状态和图片保存到私有 OSS，并从函数环境变量读取模型 API Key。
- 云端任务状态当前是单个 OSS JSON 文件，函数实例数和单实例并发需设为 `1`。多人高并发时应迁移到表格存储或数据库。
