# 后端框架说明

当前后端是一个无第三方依赖的 Node.js 原型服务，目标是先跑通产品闭环：

- 静态页面服务：`index.html`、`capture.html`、`styles.css`、`app.js`
- 本地 JSON 数据存储：`backend/data/app-data.json`
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
| POST | `/api/ocr` | 使用当前视觉模型读取作文图片文字 |
| POST | `/api/generate-report` | 生成作文批改报告 |

## 拍照到报告链路

1. 手机页选择学生、作文任务并拍照，前端把图片压缩为 JPEG data URL 后提交到 `/api/submissions`。
2. Web 工作台从队列读取 `imageData`，老师可以在识别文本区调用 `/api/ocr`。
3. 图片文字读取结果直接进入识别文本区，老师在同一区域校对和补充。
4. `/api/generate-report` 根据作文题目、后台配置要求和确认后的识别文本完成批改。

DeepSeek 当前可用于 OpenAI-compatible 文本接口连通性测试；图片文字读取需要选择支持视觉输入的模型，例如 Kimi 的 `moonshot-v1-128k-vision-preview`、OpenAI 的 `gpt-4.1`、`gpt-4o` 系列或自定义兼容视觉模型。

## 作文题库

题库源文件在 `backend/prompt-catalog.js`。当前已整理 3-6 年级上下册共 62 条单元习作，其中六年级下册为 6 条。

每条题库包含：

- `title`：作文题目。
- `requirements`：核心写作要求，可在后台界面继续修改。
- `abilityGoal`：能力目标，例如写人、写景、读后感、说明文、应用文。
- `wordCountGuide`：年级建议字数范围。
- `source`：整理来源与对应人教社教材链接。

## 下一步替换点

- `data-store.js`：替换为 Postgres、SQLite 或云数据库。
- `report-engine.js`：保留输出 schema，将规则生成替换为真实大模型调用。
- `server.js` 的 `/api/model-config`：API Key 应保存到服务端密钥管理，不返回给前端。
- `/api/submissions`：后续改为真实图片上传和对象存储。
