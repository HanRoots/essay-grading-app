const TEACHER_PROFILE_COUNT = 5;
const TASK_RETENTION_DAYS = 15;
const TASK_RETENTION_MS = TASK_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const DEFAULT_TEACHER_PROFILES = Array.from({ length: TEACHER_PROFILE_COUNT }, (_, index) => ({
  id: `teacher-${index + 1}`,
  name: `教师 ${index + 1}`
}));

function ensureWorkspacePolicyData(data) {
  let changed = false;
  const existingProfiles = Array.isArray(data.teacherProfiles) ? data.teacherProfiles : [];
  const existingById = new Map(existingProfiles.map((profile) => [profile?.id, profile]));
  const teacherProfiles = DEFAULT_TEACHER_PROFILES.map((fallback) => {
    const existing = existingById.get(fallback.id);
    return {
      id: fallback.id,
      name: normalizeTeacherName(existing?.name, fallback.name)
    };
  });
  if (JSON.stringify(existingProfiles) !== JSON.stringify(teacherProfiles)) {
    data.teacherProfiles = teacherProfiles;
    changed = true;
  }

  const defaultTeacherId = teacherProfiles[0].id;
  for (const item of Array.isArray(data.queueItems) ? data.queueItems : []) {
    if (!isTeacherId(item.teacherId, teacherProfiles)) {
      item.teacherId = defaultTeacherId;
      changed = true;
    }
    if (!item.updatedAt) {
      item.updatedAt = item.createdAt || new Date().toISOString();
      changed = true;
    }
  }
  for (const report of Array.isArray(data.reports) ? data.reports : []) {
    if (!isTeacherId(report.teacherId, teacherProfiles)) {
      report.teacherId = defaultTeacherId;
      changed = true;
    }
  }
  return changed;
}

function resolveTeacherId(requestedId, teacherProfiles) {
  const profiles = Array.isArray(teacherProfiles) && teacherProfiles.length
    ? teacherProfiles
    : DEFAULT_TEACHER_PROFILES;
  return isTeacherId(requestedId, profiles) ? requestedId : profiles[0].id;
}

function itemBelongsToTeacher(item, teacherId, teacherProfiles) {
  return resolveTeacherId(item?.teacherId, teacherProfiles) === resolveTeacherId(teacherId, teacherProfiles);
}

function getTaskExpiresAt(item) {
  const timestamp = Date.parse(item?.updatedAt || item?.createdAt || "");
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp + TASK_RETENTION_MS).toISOString();
}

function isTaskExpired(item, now = Date.now()) {
  const expiresAt = Date.parse(getTaskExpiresAt(item));
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function removeExpiredWorkspaceItems(data, now = Date.now()) {
  const queueItems = Array.isArray(data.queueItems) ? data.queueItems : [];
  const removedItems = queueItems.filter((item) => isTaskExpired(item, now));
  const removedIds = new Set(removedItems.map((item) => item.id));
  const removedReportIds = new Set(removedItems.map((item) => item.report?.id).filter(Boolean));
  data.queueItems = queueItems.filter((item) => !removedIds.has(item.id));
  const reports = Array.isArray(data.reports) ? data.reports : [];
  data.reports = reports.filter((report) => {
    if (report.queueId && removedIds.has(report.queueId)) return false;
    if (removedReportIds.has(report.id)) return false;
    return !isStandaloneReportExpired(report, now);
  });
  return {
    changed: removedItems.length > 0 || data.reports.length !== reports.length,
    removedItems
  };
}

function isStandaloneReportExpired(report, now) {
  const timestamp = Date.parse(report?.updatedAt || report?.generatedAt || report?.createdAt || "");
  return Number.isFinite(timestamp) && timestamp + TASK_RETENTION_MS <= now;
}

function normalizeTeacherName(value, fallback) {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 24);
  return name || fallback;
}

function isTeacherId(value, profiles) {
  return profiles.some((profile) => profile.id === value);
}

module.exports = {
  DEFAULT_TEACHER_PROFILES,
  TASK_RETENTION_DAYS,
  ensureWorkspacePolicyData,
  getTaskExpiresAt,
  itemBelongsToTeacher,
  normalizeTeacherName,
  removeExpiredWorkspaceItems,
  resolveTeacherId
};
