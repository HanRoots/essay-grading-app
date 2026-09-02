#!/bin/bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M)"
OUTPUT_DIR="$HOME/Desktop/作文批改台-本地版-${STAMP}"
ZIP_PATH="${OUTPUT_DIR}.zip"

clear 2>/dev/null || true
echo "制作老师安装包"
echo "=============="
echo ""
echo "输出目录：${OUTPUT_DIR}"
echo ""

mkdir -p "$OUTPUT_DIR"

rsync -a \
  --exclude ".git" \
  --exclude ".agents" \
  --exclude ".codex" \
  --exclude ".doubao-automation-profile" \
  --exclude "backend/data" \
  --exclude "node_modules" \
  --exclude "tools" \
  --exclude ".DS_Store" \
  --exclude ".local-server.pid" \
  --exclude "启动作文批改台.command" \
  "$APP_DIR/" "$OUTPUT_DIR/"

chmod +x "$OUTPUT_DIR/start-local.command" "$OUTPUT_DIR/stop-local.command" "$OUTPUT_DIR/prepare-local-package.command" 2>/dev/null || true

(
  cd "$(dirname "$OUTPUT_DIR")"
  zip -qry "$(basename "$ZIP_PATH")" "$(basename "$OUTPUT_DIR")"
)

echo "已完成。"
echo ""
echo "给老师时，把这个文件夹发过去："
echo "${OUTPUT_DIR}"
echo ""
echo "也可以直接发送这个压缩包："
echo "${ZIP_PATH}"
echo ""
echo "这份安装包不包含你的本地数据和 API Key。"
echo "老师第一次启动后，会自动生成自己的本地数据文件。"
echo ""
read -r -p "按回车关闭此窗口。" || true
