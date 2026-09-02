# 作文批改台本地安装说明

## 给老师的最简单用法

1. 在你的电脑上双击 `prepare-local-package.command`，它会在桌面生成一份干净的老师安装包。
2. 把桌面上的 `作文批改台-本地版-日期时间` 文件夹复制到老师电脑。
3. 安装 Node.js LTS：<https://nodejs.org/zh-cn/download>
4. macOS 双击 `start-local.command`；Windows 双击 `start-local-windows.bat`。
5. 浏览器会自动打开电脑端批改台。
6. 手机和电脑连接同一个 Wi-Fi，用网页顶部显示的手机地址打开拍照页。
7. 手机拍照提交后，电脑端待处理队列会自动出现任务。

Windows 老师可直接查看：`WINDOWS_老师操作流程手册.md`。

## 如果只是自己电脑使用

1. 安装 Node.js LTS：<https://nodejs.org/zh-cn/download>
2. macOS 双击 `start-local.command`；Windows 双击 `start-local-windows.bat`。
3. 浏览器会自动打开电脑端批改台。
4. 手机和电脑连接同一个 Wi-Fi，用网页顶部显示的手机地址打开拍照页。
5. 手机拍照提交后，电脑端待处理队列会自动出现任务。

## 为什么要用安装包脚本

`prepare-local-package.command` 会自动排除：

- `backend/data`：本机数据和 API Key
- `.git`：开发版本记录
- `node_modules`：依赖缓存
- `.doubao-automation-profile` / `tools`：开发测试和网页自动化实验文件
- `.DS_Store`：系统临时文件

这样发给老师更干净，也不会误带你的模型 API Key。

## 直接复制整个文件夹也可以吗

可以，但不推荐。直接复制可能会把你本机的 `backend/data/app-data.json` 一起复制给老师，其中可能包含你的模型配置或 API Key。

## 停止服务

- macOS 双击 `stop-local.command`，或者直接关闭启动窗口。
- Windows 关闭启动窗口，或双击 `stop-local-windows.bat`。

## 常见问题

### 手机打不开拍照页

确认手机和电脑在同一个 Wi-Fi 下。部分学校网络会开启“设备隔离”，这种网络下手机无法访问老师电脑，需要换到同一个普通路由器网络或手机热点。

### 双击后提示没有 Node.js

先安装 Node.js LTS，再重新双击启动脚本。

### 端口被占用

先运行停止脚本，再重新启动。

### 数据保存在哪里

本地数据保存在 `backend/data/app-data.json`。如果要换电脑继续用，请把整个文件夹一起复制。
