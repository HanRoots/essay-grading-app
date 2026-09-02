#!/bin/bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M)"
OUTPUT_DIR="$HOME/Desktop/作文批改台-Windows版-${STAMP}"
ZIP_PATH="${OUTPUT_DIR}.zip"

clear 2>/dev/null || true
echo "制作 Windows 老师安装包"
echo "======================"
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
  --exclude "start-local.command" \
  --exclude "stop-local.command" \
  --exclude "prepare-local-package.command" \
  --exclude "prepare-windows-package.command" \
  --exclude "启动作文批改台.command" \
  "$APP_DIR/" "$OUTPUT_DIR/"

(
  cd "$(dirname "$OUTPUT_DIR")"
  zip -qry "$(basename "$ZIP_PATH")" "$(basename "$OUTPUT_DIR")"
)

echo "已完成。"
echo ""
echo "给 Windows 老师时，直接发送这个压缩包："
echo "${ZIP_PATH}"
echo ""
echo "老师解压后，只需要双击：start-local-windows.bat"
echo "这份 Windows 包不包含 macOS 的 .command 文件，也不包含你的本地数据和 API Key。"
echo ""
read -r -p "按回车关闭此窗口。" || true
