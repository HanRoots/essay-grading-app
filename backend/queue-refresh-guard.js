const LEGACY_QUEUE_REFRESH_MIN_INTERVAL_MS = 60 * 1000;
const ENTRY_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;

function createLegacyQueueRefreshGuard(options = {}) {
  const minIntervalMs = Number(options.minIntervalMs || LEGACY_QUEUE_REFRESH_MIN_INTERVAL_MS);
  const recentRequests = new Map();

  function check(key, now = Date.now()) {
    if (!key) return { limited: false, retryAfterSeconds: 0 };

    prune(now);
    const previous = recentRequests.get(key);
    if (previous && now - previous < minIntervalMs) {
      return {
        limited: true,
        retryAfterSeconds: Math.max(1, Math.ceil((minIntervalMs - (now - previous)) / 1000))
      };
    }

    recentRequests.set(key, now);
    return { limited: false, retryAfterSeconds: 0 };
  }

  function prune(now) {
    if (recentRequests.size <= MAX_ENTRIES) return;
    for (const [key, timestamp] of recentRequests) {
      if (now - timestamp > ENTRY_TTL_MS) recentRequests.delete(key);
    }
    while (recentRequests.size > MAX_ENTRIES) {
      recentRequests.delete(recentRequests.keys().next().value);
    }
  }

  return { check };
}

function getLegacyQueueRefreshKey(req) {
  if (String(req.headers["x-app-client-id"] || "").trim()) return "";

  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const address = forwarded || req.socket?.remoteAddress || "unknown";
  const teacherId = String(req.headers["x-teacher-id"] || "default").trim() || "default";
  return `${address}:${teacherId}`;
}

module.exports = {
  LEGACY_QUEUE_REFRESH_MIN_INTERVAL_MS,
  createLegacyQueueRefreshGuard,
  getLegacyQueueRefreshKey
};
