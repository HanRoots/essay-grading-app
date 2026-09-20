#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  buildAttachmentDisposition,
  getLearningSheetSourceRoot,
  getVerifiedLearningSheetAssets,
  resolveLocalLearningSheetPath
} = require("../backend/learning-sheet-catalog");
const { isOssEnabled, putObjectBuffer } = require("../backend/oss-storage");

async function run() {
  const apply = process.argv.includes("--apply");
  const sourceArgument = process.argv.find((argument) => argument.startsWith("--source="));
  const sourceRoot = sourceArgument
    ? path.resolve(sourceArgument.slice("--source=".length))
    : getLearningSheetSourceRoot();
  const assets = getVerifiedLearningSheetAssets();
  const missing = assets.filter((asset) => !fs.existsSync(resolveLocalLearningSheetPath(asset, sourceRoot)));

  console.log(`学习单来源：${sourceRoot}`);
  console.log(`已核对题目：${assets.length / 2} 条；待处理文件：${assets.length} 个`);
  if (missing.length) {
    missing.forEach((asset) => console.error(`缺少：${asset.relativePath}`));
    throw new Error(`缺少 ${missing.length} 个学习单文件，已停止`);
  }

  if (!apply) {
    console.log("校验通过。增加 --apply 后才会上传到 OSS。");
    return;
  }
  if (!isOssEnabled()) {
    throw new Error("上传前请设置 STORAGE_DRIVER=oss 及 OSS 访问环境变量");
  }

  for (const [index, asset] of assets.entries()) {
    const content = await fs.promises.readFile(resolveLocalLearningSheetPath(asset, sourceRoot));
    await putObjectBuffer(asset.objectKey, content, asset.contentType, {
      cacheControl: "private, no-store",
      contentDisposition: buildAttachmentDisposition(asset.fileName, `${asset.promptId}.${asset.format}`)
    });
    console.log(`[${index + 1}/${assets.length}] ${asset.promptId} ${asset.format.toUpperCase()}`);
  }
  console.log("学习单上传完成。");
}

run().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
