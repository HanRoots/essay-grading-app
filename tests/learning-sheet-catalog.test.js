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

assert.strictEqual(Object.keys(VERIFIED_SOURCE_TITLES).length, 56);
assert.strictEqual(Object.keys(REVIEW_REQUIRED_SOURCE_TITLES).length, 4);

const assets = getVerifiedLearningSheetAssets();
assert.strictEqual(assets.length, 112);
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
assert.strictEqual(decorated.filter((prompt) => prompt.learningSheet.available).length, 56);
assert.deepStrictEqual(decorated.find((prompt) => prompt.id === "g3a-u1").learningSheet.formats, ["pdf", "docx"]);
assert.strictEqual(decorated.find((prompt) => prompt.id === "g3b-u3").title, "我做了一项小实验");
assert.deepStrictEqual(decorated.find((prompt) => prompt.id === "g3b-u3").learningSheet.formats, ["pdf", "docx"]);
assert.strictEqual(getLearningSheetAsset("g3b-u3", "pdf").objectKey, "essay-grading/learning-sheets/g3b-u3.pdf");
assert.strictEqual(decorated.find((prompt) => prompt.id === "g3b-u4").title, "中华传统节日");
assert.deepStrictEqual(decorated.find((prompt) => prompt.id === "g3b-u4").learningSheet.formats, ["pdf", "docx"]);
assert.strictEqual(decorated.find((prompt) => prompt.id === "g5b-u5").title, "形形色色的人");
assert.deepStrictEqual(decorated.find((prompt) => prompt.id === "g5b-u5").learningSheet.formats, ["pdf", "docx"]);
[
  "g3b-u2",
  "g3b-u4",
  "g4a-u2",
  "g5a-u3",
  "g5b-u3",
  "g6a-u6",
  "g6a-u7",
  "g6a-u8"
].forEach((promptId) => {
  assert.deepStrictEqual(decorated.find((prompt) => prompt.id === promptId).learningSheet.formats, ["pdf", "docx"]);
});
assert.deepStrictEqual(decorated.find((prompt) => prompt.id === "g7a-u1").learningSheet.formats, []);
assert.strictEqual("objectKey" in decorated.find((prompt) => prompt.id === "g3a-u1").learningSheet, false);

const sourceRoot = getLearningSheetSourceRoot();
if (fs.existsSync(sourceRoot)) {
  assets.forEach((asset) => {
    assert.ok(fs.existsSync(resolveLocalLearningSheetPath(asset, sourceRoot)), `缺少学习单：${asset.relativePath}`);
  });
}

console.log("learning sheet catalog test passed");
