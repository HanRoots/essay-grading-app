const assert = require("assert");
const {
  createLegacyQueueRefreshGuard,
  getLegacyQueueRefreshKey
} = require("../backend/queue-refresh-guard");

const guard = createLegacyQueueRefreshGuard({ minIntervalMs: 60 * 1000 });
assert.deepStrictEqual(guard.check("203.0.113.1:teacher-1", 1000), {
  limited: false,
  retryAfterSeconds: 0
});

const limited = guard.check("203.0.113.1:teacher-1", 2500);
assert.strictEqual(limited.limited, true);
assert.strictEqual(limited.retryAfterSeconds, 59);
assert.strictEqual(guard.check("203.0.113.1:teacher-1", 61000).limited, false);

assert.strictEqual(getLegacyQueueRefreshKey({
  headers: { "x-app-client-id": "fresh-tab" },
  socket: { remoteAddress: "203.0.113.1" }
}), "");
assert.strictEqual(getLegacyQueueRefreshKey({
  headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1", "x-teacher-id": "teacher-2" },
  socket: { remoteAddress: "10.0.0.1" }
}), "203.0.113.1:teacher-2");

console.log("queue refresh guard test passed");
