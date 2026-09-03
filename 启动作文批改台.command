#!/bin/bash
set -u

APP_DIR="/Users/han/Documents/改作文"
PORT="${PORT:-8787}"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

clear 2>/dev/null || true
echo "作文批改台 局域网启动器"
echo "======================"
echo ""

if [ ! -d "$APP_DIR" ]; then
  echo "没有找到应用文件夹："
  echo "$APP_DIR"
  echo ""
  echo "请确认“改作文”文件夹还在这个位置。"
  read -r -p "按回车关闭此窗口。" || true
  exit 1
fi

cd "$APP_DIR" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js。"
  echo "请先安装 Node.js LTS，然后重新双击本文件。"
  echo "下载地址：https://nodejs.org/zh-cn/download"
  command -v open >/dev/null 2>&1 && open "https://nodejs.org/zh-cn/download"
  echo ""
  read -r -p "安装完成后按回车退出。" || true
  exit 1
fi

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [ -z "$LAN_IP" ]; then
  LAN_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
fi
if [ -z "$LAN_IP" ]; then
  LAN_IP="$(ifconfig 2>/dev/null | awk '/inet / && $2 !~ /^127\./ {print $2; exit}')"
fi

LOCAL_URL="http://127.0.0.1:${PORT}/index.html"
if [ -n "$LAN_IP" ]; then
  LAN_WEB_URL="http://${LAN_IP}:${PORT}/index.html"
else
  LAN_WEB_URL=""
fi

if lsof -ti tcp:"$PORT" >/dev/null 2>&1; then
  echo "检测到作文批改台已经在 ${PORT} 端口运行。"
  echo ""
  echo "电脑端：$LOCAL_URL"
  [ -n "$LAN_WEB_URL" ] && echo "局域网电脑端：$LAN_WEB_URL"
  command -v open >/dev/null 2>&1 && open "$LOCAL_URL"
  echo ""
  read -r -p "按回车关闭此窗口。" || true
  exit 0
fi

echo "正在启动本地服务..."
echo ""
echo "电脑端：$LOCAL_URL"
if [ -n "$LAN_WEB_URL" ]; then
  echo "局域网电脑端：$LAN_WEB_URL"
else
  echo "未能自动识别局域网 IP，请确认电脑已连接 Wi-Fi。"
fi
echo ""
echo "第一次启动时，如果系统询问是否允许 Node.js 接收网络连接，请选择“允许”。"
echo ""
echo "保持这个窗口打开，服务就会持续运行。"
echo "关闭这个窗口，服务会停止。"
echo ""

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
command -v open >/dev/null 2>&1 && open "$LOCAL_URL"

wait "$SERVER_PID"
