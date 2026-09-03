const fs = require("fs");
const path = require("path");
const { promptCatalog } = require("./prompt-catalog");
const { createSeedData, modelProviders: seedModelProviders } = require("./seed-data");
const { getObjectBuffer, isOssEnabled, putObjectBuffer } = require("./oss-storage");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "app-data.json");
const DATA_OBJECT_KEY = String(process.env.OSS_DATA_OBJECT || "essay-grading/data/app-data.json").replace(/^\/+/, "");
const DEEPSEEK_LEGACY_MODEL_ALIASES = {
  "deepseek-chat": "deepseek-v4-flash",
  "deepseek-reasoner": "deepseek-v4-flash"
};
const VISION_READING_PROVIDER_IDS = new Set(["kimi", "deepseek"]);

let dataOperationQueue = Promise.resolve();

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    writeLocalData(createSeedData());
  }
}

function readLocalData() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  return JSON.parse(raw);
}

function writeLocalData(data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

async function readData() {
  return enqueueDataOperation(async () => cloneData(await readDataUnlocked()));
}

async function writeData(data) {
  return enqueueDataOperation(async () => writeDataUnlocked(cloneData(data)));
}

async function updateData(mutator) {
  return enqueueDataOperation(async () => {
    const data = await readDataUnlocked();
    const result = await mutator(data);
    await writeDataUnlocked(data);
    return result;
  });
}

async function resetRuntimeWorkspaceData() {
  return updateData((data) => {
    const removed = {
      queueItems: Array.isArray(data.queueItems) ? data.queueItems.length : 0,
      reports: Array.isArray(data.reports) ? data.reports.length : 0,
      submissions: Array.isArray(data.submissions) ? data.submissions.length : 0
    };
    data.queueItems = [];
    data.reports = [];
    data.submissions = [];
    return {
      ...removed,
      resetAt: new Date().toISOString()
    };
  });
}

async function readDataUnlocked() {
  let data;
  if (isOssEnabled()) {
    try {
      const content = await getObjectBuffer(DATA_OBJECT_KEY);
      data = JSON.parse(content.toString("utf8"));
    } catch (error) {
      if (!isMissingObjectError(error)) throw error;
      data = createSeedData();
      await writeDataUnlocked(data);
    }
  } else {
    data = readLocalData();
  }
  if (migrateData(data)) {
    await writeDataUnlocked(data);
  }
  return data;
}

async function writeDataUnlocked(data) {
  const persisted = sanitizeDataForPersistence(data);
  if (isOssEnabled()) {
    await putObjectBuffer(DATA_OBJECT_KEY, Buffer.from(JSON.stringify(persisted, null, 2), "utf8"), "application/json; charset=utf-8");
  } else {
    writeLocalData(persisted);
  }
}

function enqueueDataOperation(operation) {
  const next = dataOperationQueue.then(operation, operation);
  dataOperationQueue = next.then(() => undefined, () => undefined);
  return next;
}

function sanitizeDataForPersistence(data) {
  const persisted = cloneData(data);
  if (isOssEnabled() && persisted.modelConfig) {
    persisted.modelConfig.apiKey = "";
    persisted.modelConfig.ocrApiKey = "";
    persisted.modelConfig.ocrJudgeApiKey = "";
  }
  if (Array.isArray(persisted.queueItems)) {
    persisted.queueItems.forEach((item) => {
      if (item?.report) item.report = stripReportImageCopies(item.report);
    });
  }
  if (Array.isArray(persisted.reports)) {
    persisted.reports = persisted.reports.map(stripReportImageCopies);
  }
  return persisted;
}

function stripReportImageCopies(report) {
  if (!report || typeof report !== "object") return report;
  const { sourceImages, ...persistedReport } = report;
  return persistedReport;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function isMissingObjectError(error) {
  return error?.status === 404
    || error?.statusCode === 404
    || error?.code === "NoSuchKey"
    || error?.name === "NoSuchKeyError";
}

function publicModelConfig(modelConfig) {
  const {
    apiKey,
    ocrApiKey,
    ocrJudgeApiKey,
    ...visibleConfig
  } = modelConfig || {};
  delete visibleConfig["ocr" + "SecretKey"];
  return {
    ...visibleConfig,
    apiKey: "",
    ocrApiKey: "",
    ocrJudgeApiKey: "",
    apiKeySet: Boolean(apiKey),
    ocrApiKeySet: Boolean(ocrApiKey),
    ocrJudgeApiKeySet: Boolean(ocrJudgeApiKey)
  };
}

function migrateData(data) {
  let changed = false;

  if (!Array.isArray(data.promptLibrary)) {
    data.promptLibrary = [];
    changed = true;
  }

  if (!Array.isArray(data.modelProviders) || JSON.stringify(data.modelProviders) !== JSON.stringify(seedModelProviders)) {
    data.modelProviders = seedModelProviders;
    changed = true;
  }

  const existingById = new Map(data.promptLibrary.map((item) => [item.id, item]));
  const mergedPrompts = promptCatalog.map((catalogItem) => {
    const existing = existingById.get(catalogItem.id);
    if (!existing) {
      changed = true;
      return cloneData(catalogItem);
    }

    const catalogVersion = Number(catalogItem.catalogVersion || 1);
    const existingCatalogVersion = Number(existing.catalogVersion || 1);
    const catalogUpdated = catalogVersion > existingCatalogVersion;
    const userEdited = !catalogUpdated && (existing.status === "本地已配置" || existing.status === "本地草稿");
    const merged = userEdited
      ? {
          ...catalogItem,
          ...existing,
          requirements: Array.isArray(existing.requirements) ? existing.requirements : catalogItem.requirements
        }
      : cloneData(catalogItem);

    if (JSON.stringify(existing) !== JSON.stringify(merged)) {
      changed = true;
    }
    return merged;
  });

  if (data.promptLibrary.length !== mergedPrompts.length) {
    changed = true;
  }
  data.promptLibrary = mergedPrompts;

  if (!Array.isArray(data.reports)) {
    data.reports = [];
    changed = true;
  }
  if (!Array.isArray(data.submissions)) {
    data.submissions = [];
    changed = true;
  }
  if (!data.nextIds) {
    data.nextIds = { submission: 1, report: 1 };
    changed = true;
  }
  if (data.modelConfig && typeof data.modelConfig.allowInsecureTls !== "boolean") {
    data.modelConfig.allowInsecureTls = false;
    changed = true;
  }
  if (migrateDeepSeekModelNames(data)) {
    changed = true;
  }
  if (data.modelConfig && Object.prototype.hasOwnProperty.call(data.modelConfig, "ocr" + "SecretKey")) {
    delete data.modelConfig["ocr" + "SecretKey"];
    changed = true;
  }
  if (data.modelConfig && !data.modelConfig.ocrProvider) {
    data.modelConfig.ocrProvider = "kimi";
    data.modelConfig.ocrModel = "moonshot-v1-128k-vision-preview";
    data.modelConfig.ocrBaseUrl = "https://api.moonshot.cn/v1";
    data.modelConfig.ocrApiKey = "";
    data.modelConfig.ocrAllowInsecureTls = false;
    changed = true;
  }
  if (data.modelConfig && !data.modelConfig.ocrMode) {
    data.modelConfig.ocrMode = "enhanced";
    changed = true;
  }
  if (data.modelConfig && data.modelConfig.ocrProvider === "kimi" && data.modelConfig.ocrJudgeProvider === "deepseek" && data.modelConfig.ocrMode === "fast") {
    data.modelConfig.ocrMode = "enhanced";
    changed = true;
  }
  if (data.modelConfig && data.modelConfig.ocrProvider === "kimi" && /^kimi-k2/i.test(data.modelConfig.ocrModel || "")) {
    data.modelConfig.ocrModel = "moonshot-v1-128k-vision-preview";
    if (data.modelConfig.routes) data.modelConfig.routes.ocr = data.modelConfig.ocrModel;
    changed = true;
  }
  if (data.modelConfig && !isAllowedVisionReadingProvider(data.modelConfig.ocrProvider)) {
    data.modelConfig.ocrProvider = "kimi";
    data.modelConfig.ocrModel = "moonshot-v1-128k-vision-preview";
    data.modelConfig.ocrBaseUrl = "https://api.moonshot.cn/v1";
    if (data.modelConfig.routes) data.modelConfig.routes.ocr = data.modelConfig.ocrModel;
    changed = true;
  }
  if (data.modelConfig && data.modelConfig.ocrProvider === "deepseek" && !providerSupportsVision("deepseek", data.modelConfig.ocrModel)) {
    data.modelConfig.ocrModel = "deepseek-v4-flash-vision-exp";
    data.modelConfig.ocrBaseUrl = "https://api.deepseek.com";
    if (data.modelConfig.routes) data.modelConfig.routes.ocr = data.modelConfig.ocrModel;
    changed = true;
  }
  if (data.modelConfig && data.modelConfig.ocrProvider === "openai" && !data.modelConfig.ocrApiKey) {
    data.modelConfig.ocrProvider = "kimi";
    data.modelConfig.ocrModel = "moonshot-v1-128k-vision-preview";
    data.modelConfig.ocrBaseUrl = "https://api.moonshot.cn/v1";
    if (data.modelConfig.routes) data.modelConfig.routes.ocr = data.modelConfig.ocrModel;
    changed = true;
  }
  if (data.modelConfig && typeof data.modelConfig.ocrAllowInsecureTls !== "boolean") {
    data.modelConfig.ocrAllowInsecureTls = Boolean(data.modelConfig.allowInsecureTls);
    changed = true;
  }
  if (data.modelConfig && !data.modelConfig.ocrJudgeProvider) {
    data.modelConfig.ocrJudgeProvider = "deepseek";
    data.modelConfig.ocrJudgeModel = "deepseek-v4-flash";
    data.modelConfig.ocrJudgeBaseUrl = "https://api.deepseek.com";
    data.modelConfig.ocrJudgeApiKey = "";
    data.modelConfig.ocrJudgeAllowInsecureTls = Boolean(data.modelConfig.allowInsecureTls);
    changed = true;
  }
  if (data.modelConfig && typeof data.modelConfig.ocrJudgeAllowInsecureTls !== "boolean") {
    data.modelConfig.ocrJudgeAllowInsecureTls = Boolean(data.modelConfig.allowInsecureTls);
    changed = true;
  }
  if (data.modelConfig?.provider === "deepseek" && data.modelConfig.baseUrl === "https://api.deepseek.com/v1") {
    data.modelConfig.baseUrl = "https://api.deepseek.com";
    changed = true;
  }

  return changed;
}

function migrateDeepSeekModelNames(data) {
  if (!data.modelConfig) return false;
  let changed = false;
  const modelConfig = data.modelConfig;

  if (modelConfig.provider === "deepseek") {
    const nextModel = normalizeDeepSeekModelAlias(modelConfig.model);
    if (nextModel !== modelConfig.model) {
      modelConfig.model = nextModel;
      changed = true;
    }
    if (isVisionOnlyModel("deepseek", modelConfig.model)) {
      modelConfig.model = "deepseek-v4-flash";
      changed = true;
    }
  }

  if (modelConfig.ocrJudgeProvider === "deepseek") {
    const nextJudgeModel = normalizeDeepSeekModelAlias(modelConfig.ocrJudgeModel);
    if (nextJudgeModel !== modelConfig.ocrJudgeModel) {
      modelConfig.ocrJudgeModel = nextJudgeModel;
      changed = true;
    }
    if (isVisionOnlyModel("deepseek", modelConfig.ocrJudgeModel)) {
      modelConfig.ocrJudgeModel = "deepseek-v4-flash";
      changed = true;
    }
  }

  if (modelConfig.routes) {
    ["grading", "polish"].forEach((routeName) => {
      const nextRouteModel = normalizeDeepSeekModelAlias(modelConfig.routes[routeName]);
      if (nextRouteModel !== modelConfig.routes[routeName]) {
        modelConfig.routes[routeName] = nextRouteModel;
        changed = true;
      }
      if (modelConfig.provider === "deepseek" && isVisionOnlyModel("deepseek", modelConfig.routes[routeName])) {
        modelConfig.routes[routeName] = "deepseek-v4-flash";
        changed = true;
      }
    });
  }

  return changed;
}

function normalizeDeepSeekModelAlias(model) {
  return DEEPSEEK_LEGACY_MODEL_ALIASES[model] || model;
}

function providerSupportsVision(providerId, model) {
  if (providerId === "deepseek") return /deepseek-v4-flash-vision-exp/i.test(model || "");
  return /gpt-4o|gpt-4\.1|qwen-vl|glm-4v|moonshot-v1-.+-vision-preview|vision|vl/i.test(model || "");
}

function isVisionOnlyModel(providerId, model) {
  return providerId === "deepseek" && /deepseek-v4-flash-vision-exp/i.test(model || "");
}

function isAllowedVisionReadingProvider(providerId) {
  if (!VISION_READING_PROVIDER_IDS.has(providerId)) return false;
  const provider = seedModelProviders.find((item) => item.id === providerId);
  return Boolean(provider && provider.models.some((model) => providerSupportsVision(provider.id, model)));
}

function findPrompt(data, target) {
  return data.promptLibrary.find((item) => {
    if (target.id && item.id === target.id) return true;
    return item.grade === target.grade && item.book === target.book && item.unit === target.unit;
  });
}

module.exports = {
  DATA_FILE,
  findPrompt,
  migrateData,
  publicModelConfig,
  readData,
  resetRuntimeWorkspaceData,
  updateData,
  writeData
};
