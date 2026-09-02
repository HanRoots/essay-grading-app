#!/bin/bash
set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-8787}"
cd "$APP_DIR" || exit 1

clear 2>/dev/null || true
echo "停止作文批改台"
echo "=============="
echo ""

PIDS="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
if [ -z "$PIDS" ]; then
  echo "没有检测到正在运行的本地服务。"
  rm -f .local-server.pid
  read -r -p "按回车关闭此窗口。" || true
  exit 0
fi

echo "正在停止端口 ${PORT} 上的服务..."
for pid in $PIDS; do
  kill "$pid" >/dev/null 2>&1 || true
done
rm -f .local-server.pid
echo "已停止。"
read -r -p "按回车关闭此窗口。" || true
