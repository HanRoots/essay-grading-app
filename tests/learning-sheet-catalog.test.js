const assert = require("assert");
const fs = require("fs");
const { promptCatalog } = require("../backend/prompt-catalog");
const {
  REVIEW_REQUIRED_SOURCE_TITLES,
  VERIFIED_SOURCE_TITLES,
  getLearningSheetAsset,
  getLearningSheetSourceRoot,
  getVerifiedLearningSheetAssets,
  resolveLocalLearningSheetPath,
  withLearningSheetAvailability
} = require("../backend/learning-sheet-catalog");

assert.strictEqual(Object.keys(VERIFIED_SOURCE_TITLES).length, 47);
assert.strictEqual(Object.keys(REVIEW_REQUIRED_SOURCE_TITLES).length, 10);

const assets = getVerifiedLearningSheetAssets();
assert.strictEqual(assets.length, 94);
assert.strictEqual(new Set(assets.map((asset) => asset.objectKey)).size, assets.length);
assets.forEach((asset) => {
  assert.match(asset.objectKey, /^essay-grading\/learning-sheets\/g[3-6][ab]-u\d+\.(pdf|docx)$/);
  assert.ok(["pdf", "docx"].includes(asset.format));
  assert.ok(asset.fileName.endsWith(`.${asset.format}`));
});

Object.keys(REVIEW_REQUIRED_SOURCE_TITLES).forEach((promptId) => {
  assert.strictEqual(getLearningSheetAsset(promptId, "pdf"), null);
  assert.strictEqual(getLearningSheetAsset(promptId, "docx"), null);
});

const decorated = withLearningSheetAvailability(promptCatalog);
assert.strictEqual(decorated.length, 68);
assert.strictEqual(decorated.filter((prompt) => prompt.learningSheet.available).length, 47);
assert.deepStrictEqual(decorated.find((prompt) => prompt.id === "g3a-u1").learningSheet.formats, ["pdf", "docx"]);
assert.deepStrictEqual(decorated.find((prompt) => prompt.id === "g7a-u1").learningSheet.formats, []);
assert.strictEqual("objectKey" in decorated.find((prompt) => prompt.id === "g3a-u1").learningSheet, false);

const sourceRoot = getLearningSheetSourceRoot();
if (fs.existsSync(sourceRoot)) {
  assets.forEach((asset) => {
    assert.ok(fs.existsSync(resolveLocalLearningSheetPath(asset, sourceRoot)), `缺少学习单：${asset.relativePath}`);
  });
}

console.log("learning sheet catalog test passed");
