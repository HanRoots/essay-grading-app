#!/bin/bash
set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-8787}"
cd "$APP_DIR" || exit 1

clear 2>/dev/null || true
echo "作文批改台 本地版"
echo "=================="
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js。"
  echo "请先安装 Node.js LTS，然后重新双击本文件。"
  echo "下载地址：https://nodejs.org/zh-cn/download"
  command -v open >/dev/null 2>&1 && open "https://nodejs.org/zh-cn/download"
  echo ""
  read -r -p "安装完成后按回车退出。" || true
  exit 1
fi

if lsof -ti tcp:"$PORT" >/dev/null 2>&1; then
  echo "检测到作文批改台已经在 ${PORT} 端口运行。"
  echo "正在打开电脑端页面..."
  open "http://127.0.0.1:${PORT}/index.html"
  echo ""
  echo "如果页面无法使用，请先双击 stop-local.command，再重新启动。"
  read -r -p "按回车关闭此窗口。" || true
  exit 0
fi

echo "正在启动本地服务..."
RESET_WORKSPACE_ON_START=1 node backend/server.js &
SERVER_PID=$!
echo "$SERVER_PID" > .local-server.pid

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo ""
    echo "正在停止作文批改台..."
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

sleep 1
open "http://127.0.0.1:${PORT}/index.html"

echo ""
echo "电脑端页面：http://127.0.0.1:${PORT}/index.html"
echo "手机拍照地址会显示在网页顶部。手机和电脑需要连接同一个 Wi-Fi。"
echo ""
echo "保持这个窗口打开，服务就会持续运行。"
echo "关闭这个窗口，服务会停止。"
echo ""

wait "$SERVER_PID"
