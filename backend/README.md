# 后端框架说明

当前后端是一个 Node.js 服务，同时支持本地模式和阿里云无服务器模式：

- 静态页面服务：`index.html`、`styles.css`、`runtime-config.js`、`app.js`
- 本地 JSON 数据存储：`backend/data/app-data.json`
- 云端 OSS 任务数据存储和可选报告图片附件
- 教材题库、自定义题目与写作要求配置
- 每个任务独立保存批改提示词、正文、状态和报告
- 多任务提交，模型请求按服务商并发限制安全排队
- 大模型结构化批改、升格与全文润色

## 启动

```bash
npm run dev
```

默认地址：`http://127.0.0.1:8787`

阿里云函数计算部署请参阅根目录的 `ALIYUN_SERVERLESS_DEPLOY.md`。

## API

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/bootstrap` | 前端启动所需数据 |
| GET | `/api/prompts` | 获取作文题库 |
| PUT | `/api/prompts/requirements` | 更新作文写作要求 |
| GET | `/api/model-config` | 获取模型配置和服务商 |
| PUT | `/api/model-config` | 保存文字模型配置 |
| POST | `/api/model-config/test` | 测试文字模型配置 |
| GET | `/api/submissions` | 获取作文任务队列 |
| POST | `/api/submissions` | 新建作文任务 |
| GET | `/api/submissions/:id` | 获取完整任务和临时附件地址 |
| PATCH | `/api/submissions/:id` | 自动保存任务和报告 |
| DELETE | `/api/submissions/:id` | 删除任务及其 OSS 附件 |
| POST | `/api/uploads/presign` | 生成可选报告图片的 OSS 短期上传地址 |
| POST | `/api/generate-report` | 生成作文批改报告 |

## 文字批改链路

1. 老师新建任务，选择教材题目或填写自定义题目。
2. 粘贴学生作文全文，并按需修改本任务的批改提示词。
3. 正文和配置自动保存；老师可以切换任务继续录入其他作文。
4. 多个任务可以依次点击“批改”，各自显示处理状态并独立接收报告。
5. 报告保留要求检测、评分、编号点评、结构升格和按升格方向生成的全文润色。
6. 原稿图片仅作为可选报告附件，不参与识别、评分或点评定位。

## 存储边界

- 本地模式保留当前 JSON 文件和本地 API Key 配置。
- 云端模式把任务状态和可选图片附件保存到私有 OSS，并从函数环境变量读取模型 API Key。
- 云端任务状态当前是单个 OSS JSON 文件，函数实例数和单实例并发需设为 `1`。多人高并发时应迁移到数据库。
