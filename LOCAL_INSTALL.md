# 作文批改台本地安装说明

## 给老师的最简单用法

1. 双击 `prepare-local-package.command`，在桌面生成干净的老师安装包。
2. 把生成的文件夹或压缩包复制到老师电脑。
3. 安装 Node.js LTS：<https://nodejs.org/zh-cn/download>
4. macOS 双击 `start-local.command`；Windows 双击 `start-local-windows.bat`。
5. 浏览器打开后，点击“新建”，选择题目并粘贴作文全文。
6. 根据需要修改本任务的批改提示词，然后点击“批改”。
7. 第一篇批改期间可继续新建第二篇、第三篇，任务状态会分别显示。

报告图片为可选附件，不参与文字识别、评分或点评定位。

## 为什么要用安装包脚本

安装包会自动排除本机数据、API Key、Git 记录和开发缓存，避免把个人配置交给其他老师。

## 停止服务

- macOS 双击 `stop-local.command`，或者关闭启动窗口。
- Windows 关闭启动窗口，或双击 `stop-local-windows.bat`。

## 常见问题

### 双击后提示没有 Node.js

先安装 Node.js LTS，再重新双击启动脚本。

### 端口被占用

先运行停止脚本，再重新启动。

### 数据保存在哪里

本地数据保存在 `backend/data/app-data.json`。刷新或返回页面不会清空；重新启动带清空参数的老师启动器时会开始新的工作批次。
