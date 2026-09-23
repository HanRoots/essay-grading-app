const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const context = {
  LOCAL_DRAFT_ID_PREFIX: "draft-",
  queueItems: [
    { id: "q-grading", status: "grading", essay: "正在批改" },
    { id: "q-stale", status: "done" },
    { id: "draft-local", status: "draft" }
  ],
  state: {
    currentQueueId: "q-grading",
    currentReport: null,
    currentImages: [],
    ocrText: "",
    gradingJobs: new Map([["q-grading", { startedAt: Date.now() }]]),
    autosaveInFlightIds: new Set(),
    autosaveItems: {}
  },
  shouldAutoOpenIncomingSubmission: () => false,
  normalizeClientImages: () => [],
  renderAfterQueueRemoval: () => {},
  renderQueue: () => {},
  loadQueueItem: () => {},
  applyQueueItemToWorkspace: () => {},
  setGradingStatus: () => {},
  $: () => ({ value: "" })
};

vm.createContext(context);
vm.runInContext([
  extractFunction(appSource, "shouldPreserveLocalQueueItem"),
  extractFunction(appSource, "mergeQueueFromServer")
].join("\n"), context);

context.mergeQueueFromServer([{ id: "q-server", status: "done" }]);
assert.deepStrictEqual(
  Array.from(context.queueItems, (item) => item.id),
  ["q-grading", "draft-local", "q-server"],
  "a stale server snapshot must not remove grading or unsaved local tasks"
);

console.log("frontend queue sync test passed");
