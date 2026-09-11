const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("app.js", "utf8");
const start = source.indexOf("function formatPlainArticle");
const end = source.indexOf("function decorateReportWithImageAnchors");

assert.ok(start >= 0 && end > start, "could not load polished-text helpers from app.js");

const context = {
  Intl,
  Uint16Array,
  Map,
  Math,
  Array,
  String,
  escapeHTML: (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;")
};

vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

const original = "豆花是一只小猫，像一团会动的棉花糖。";
const polished = "豆花是一只小猫，像一团会跑会跳的棉花糖。";
const item = { original, polished, reason: "把动作写得更具体" };
const diff = context.buildHighlightedPolishedText(polished, [item], original);

assert.match(diff.html, /<mark[^>]*>跑会跳<sup>1<\/sup><\/mark>/);
assert.doesNotMatch(diff.html, /<mark[^>]*>豆花/);
assert.doesNotMatch(diff.html, /<mark[^>]*>像一团/);

const unchanged = context.buildHighlightedPolishedText(original, [], original);
assert.doesNotMatch(unchanged.html, /polished-highlight/);

const legacy = context.buildHighlightedPolishedText(polished, [item], "");
assert.match(legacy.html, /<mark[^>]*>豆花是一只小猫/);

console.log("polish diff test passed");
