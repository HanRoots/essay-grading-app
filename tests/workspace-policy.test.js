const assert = require("assert");
const {
  TASK_RETENTION_DAYS,
  ensureWorkspacePolicyData,
  getTaskExpiresAt,
  itemBelongsToTeacher,
  removeExpiredWorkspaceItems,
  resolveTeacherId
} = require("../backend/workspace-policy");

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-09-03T12:00:00.000Z");
const data = {
  queueItems: [
    {
      id: "old-task",
      createdAt: new Date(now - 20 * DAY_MS).toISOString(),
      updatedAt: new Date(now - 16 * DAY_MS).toISOString(),
      report: { id: "old-report" }
    },
    {
      id: "teacher-two-task",
      teacherId: "teacher-2",
      createdAt: new Date(now - 20 * DAY_MS).toISOString(),
      updatedAt: new Date(now - 2 * DAY_MS).toISOString()
    }
  ],
  reports: [
    { id: "old-report", generatedAt: new Date(now - 16 * DAY_MS).toISOString() },
    { id: "active-report", teacherId: "teacher-2", generatedAt: new Date(now - 2 * DAY_MS).toISOString() }
  ]
};

assert.strictEqual(TASK_RETENTION_DAYS, 15);
assert.strictEqual(ensureWorkspacePolicyData(data), true);
assert.strictEqual(data.teacherProfiles.length, 3);
assert.strictEqual(data.queueItems[0].teacherId, "teacher-1");
assert.strictEqual(resolveTeacherId("unknown", data.teacherProfiles), "teacher-1");
assert.strictEqual(itemBelongsToTeacher(data.queueItems[1], "teacher-2", data.teacherProfiles), true);
assert.strictEqual(
  getTaskExpiresAt(data.queueItems[1]),
  new Date(now + 13 * DAY_MS).toISOString()
);

const removed = removeExpiredWorkspaceItems(data, now);
assert.strictEqual(removed.changed, true);
assert.deepStrictEqual(removed.removedItems.map((item) => item.id), ["old-task"]);
assert.deepStrictEqual(data.queueItems.map((item) => item.id), ["teacher-two-task"]);
assert.deepStrictEqual(data.reports.map((report) => report.id), ["active-report"]);

console.log("workspace policy test passed");
