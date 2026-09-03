@echo off
setlocal
cd /d "%~dp0"
set PORT=8787
set RESET_WORKSPACE_ON_START=1

echo 作文批改台 本地版
echo ==================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js。
  echo 请先安装 Node.js LTS，然后重新双击本文件。
  echo 下载地址：https://nodejs.org/zh-cn/download
  start "" "https://nodejs.org/zh-cn/download"
  pause
  exit /b 1
)

start "" "http://127.0.0.1:%PORT%/index.html"
echo.
echo 电脑端页面：http://127.0.0.1:%PORT%/index.html
echo.
echo 保持这个窗口打开，服务就会持续运行。
echo 关闭这个窗口，服务会停止。
echo.

node backend\server.js
pause
