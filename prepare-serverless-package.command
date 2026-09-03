#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"
BUILD_DIR="$DIST_DIR/essay-grading-serverless"
ZIP_FILE="$DIST_DIR/essay-grading-serverless.zip"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "未找到 Node.js/npm，请先安装 Node.js LTS。"
  read -r "?按回车键退出..."
  exit 1
fi

rm -rf "$BUILD_DIR" "$ZIP_FILE"
mkdir -p "$BUILD_DIR/backend"

cp "$ROOT_DIR/index.html" "$BUILD_DIR/"
cp "$ROOT_DIR/styles.css" "$BUILD_DIR/"
cp "$ROOT_DIR/runtime-config.js" "$BUILD_DIR/"
cp "$ROOT_DIR/app.js" "$BUILD_DIR/"
cp "$ROOT_DIR/package.json" "$BUILD_DIR/"
cp "$ROOT_DIR/backend/"*.js "$BUILD_DIR/backend/"

cd "$BUILD_DIR"
echo "正在安装阿里云 OSS 依赖..."
if [[ -f /etc/ssl/cert.pem ]]; then
  NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem npm install --omit=dev --ignore-scripts
else
  NODE_USE_SYSTEM_CA=1 npm install --omit=dev --ignore-scripts
fi

echo "正在生成函数计算代码包..."
zip -qry "$ZIP_FILE" . -x "*.DS_Store" "__MACOSX/*"

echo ""
echo "已生成：$ZIP_FILE"
echo "请按照 ALIYUN_SERVERLESS_DEPLOY.md 上传到阿里云函数计算。"
read -r "?按回车键关闭..."
