const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { URL } = require("url");
const { findPrompt, publicModelConfig, readData, resetRuntimeWorkspaceData, updateData } = require("./data-store");
const { gradeEssayReport, recognizeEssayText, testCompatibleModelConnection } = require("./model-client");
const { normalizeModelReport } = require("./report-engine");
const { createLegacyQueueRefreshGuard, getLegacyQueueRefreshKey } = require("./queue-refresh-guard");
const {
  buildAttachmentDisposition,
  getLearningSheetAsset,
  resolveLocalLearningSheetPath,
  withLearningSheetAvailability
} = require("./learning-sheet-catalog");
const {
  TASK_RETENTION_DAYS,
  getTaskExpiresAt,
  itemBelongsToTeacher,
  normalizeTeacherName,
  removeExpiredWorkspaceItems,
  resolveTeacherId
} = require("./workspace-policy");
const {
  collectImageObjectKeys,
  createImageUploadSlots,
  createSignedGetUrl,
  deleteObjectKeys,
  getStorageRuntimeInfo,
  hydrateImageListForClient,
  isOssEnabled,
  materializeImageList,
  persistImageList
} = require("./oss-storage");

const PORT = Number(process.env.PORT || process.env.FC_CUSTOM_LISTEN_PORT || 8787);
const ROOT_DIR = path.join(__dirname, "..");
const SERVER_SESSION_ID = `${Date.now()}-${process.pid}`;
const SERVER_STARTED_AT = new Date().toISOString();
const LOCAL_DOWNLOAD_SECRET = crypto.randomBytes(32);
const RETENTION_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const RESET_WORKSPACE_ON_START = !isOssEnabled() && (process.env.RESET_WORKSPACE_ON_START === "1" || process.argv.includes("--reset-session"));
let startupReset = null;
let lastRetentionSweepAt = 0;
let retentionSweepPromise = null;
const legacyQueueRefreshGuard = createLegacyQueueRefreshGuard();
const STARTUP_READY = RESET_WORKSPACE_ON_START
  ? resetRuntimeWorkspaceData().then((result) => {
      startupReset = result;
      return result;
    })
  : Promise.resolve(null);
const PUBLIC_FILES = new Set([
  "/",
  "/index.html",
  "/styles.css",
  "/yuexingren-theme.css",
  "/runtime-config.js",
  "/app.js",
  "/MiSans-Regular.ttf",
  "/MiSansLatin-Regular.ttf",
  "/yuexingren-logo-mark.png"
]);
const MAX_IMAGE_PAGES = 12;
const MAX_JSON_BODY_BYTES = 64 * 1024 * 1024;
const VISION_READING_PROVIDER_IDS = new Set(["kimi", "deepseek"]);
const CORS_ALLOWED_HEADERS = "Authorization, Content-Type, X-Teacher-Id, X-App-Client-Id";
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf"
};

const server = http.createServer(async (req, res) => {
  try {
    await STARTUP_READY;
    if (!applyCors(req, res)) return;
    if (!ensureAuthorized(req, res)) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, {
      error: "internal_error",
      message: error.message
    });
  }
});

server.timeout = 0;
server.keepAliveTimeout = 0;
server.listen(PORT, "0.0.0.0", () => {
  const urls = getAccessUrls(PORT);
  console.log(`Essay grading prototype backend running at ${urls.local}`);
  if (startupReset) {
    console.log(`Workspace session reset at ${startupReset.resetAt}`);
  }
  if (urls.lan.length) {
    console.log(`LAN workspace: ${urls.lan[0]}/index.html`);
  }
});

function getRuntimeInfo() {
  return {
    sessionId: SERVER_SESSION_ID,
    startedAt: SERVER_STARTED_AT,
    resetOnStart: RESET_WORKSPACE_ON_START,
    resetAt: startupReset?.resetAt || "",
    storage: getStorageRuntimeInfo(),
    serverManagedModelKeys: usesServerManagedModelKeys(),
    taskRetentionDays: TASK_RETENTION_DAYS
  };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, time: new Date().toISOString() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/learning-sheet-download") {
    await sendLocalLearningSheetDownload(res, url);
    return;
  }

  await sweepExpiredWorkspaceItems();

  if (req.method === "GET" && url.pathname === "/api/network-info") {
    const urls = getAccessUrls(PORT);
    const origin = getRequestOrigin(req);
    sendJson(res, 200, {
      ok: true,
      origin,
      localUrl: urls.local,
      lanUrls: urls.lan,
      captureUrl: buildCaptureUrl(origin, urls),
      captureUrls: buildCaptureUrls(origin, urls)
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const data = await readData();
    const teacherId = getRequestTeacherId(req, data);
    sendJson(res, 200, {
      runtime: getRuntimeInfo(),
      promptLibrary: withLearningSheetAvailability(data.promptLibrary),
      modelProviders: data.modelProviders,
      teacherProfiles: data.teacherProfiles,
      activeTeacherId: teacherId,
      queueItems: data.queueItems.filter((item) => itemBelongsToTeacher(item, teacherId, data.teacherProfiles)).map(toQueueSummary),
      modelConfig: publicRuntimeModelConfig(data.modelConfig)
    });
    return;
  }

  const teacherProfileMatch = url.pathname.match(/^\/api\/teacher-profiles\/([^/]+)$/);
  if (req.method === "PUT" && teacherProfileMatch) {
    const profileId = decodeURIComponent(teacherProfileMatch[1]);
    const body = await readJsonBody(req);
    const profile = await updateData((data) => {
      const current = data.teacherProfiles.find((item) => item.id === profileId);
      if (!current) return null;
      current.name = normalizeTeacherName(body.name, current.name);
      return current;
    });
    if (!profile) {
      sendJson(res, 404, { error: "teacher_profile_not_found", message: "教师身份不存在" });
      return;
    }
    sendJson(res, 200, profile);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/prompts") {
    sendJson(res, 200, withLearningSheetAvailability((await readData()).promptLibrary));
    return;
  }

  const learningSheetMatch = url.pathname.match(/^\/api\/prompts\/([^/]+)\/learning-sheet$/);
  if (req.method === "GET" && learningSheetMatch) {
    const promptId = decodeURIComponent(learningSheetMatch[1]);
    const format = String(url.searchParams.get("format") || "pdf").toLowerCase();
    if (!new Set(["pdf", "docx"]).has(format)) {
      sendJson(res, 400, {
        error: "learning_sheet_format_invalid",
        message: "学习单格式只支持 PDF 或 Word"
      });
      return;
    }
    const asset = getLearningSheetAsset(promptId, format);
    if (!asset) {
      sendJson(res, 404, {
        error: "learning_sheet_unavailable",
        message: "这道题暂时没有已核对的学习单"
      });
      return;
    }
    if (isOssEnabled()) {
      sendJson(res, 200, {
        fileName: asset.fileName,
        format: asset.format,
        url: await createSignedGetUrl(asset.objectKey, 15 * 60, {
          contentDisposition: buildAttachmentDisposition(asset.fileName, `${asset.promptId}.${asset.format}`)
        })
      });
      return;
    }
    const filePath = resolveLocalLearningSheetPath(asset);
    if (!filePath || !fs.existsSync(filePath)) {
      sendJson(res, 404, {
        error: "learning_sheet_file_missing",
        message: "本机尚未安装这份学习单文件"
      });
      return;
    }
    sendJson(res, 200, {
      fileName: asset.fileName,
      format: asset.format,
      url: createLocalLearningSheetDownloadUrl(asset.promptId, asset.format)
    });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/prompts/requirements") {
    const body = await readJsonBody(req);
    const result = await updateData((data) => {
      const prompt = findPrompt(data, body);
      if (!prompt) return null;
      prompt.requirements = Array.isArray(body.requirements) ? body.requirements.filter(Boolean) : prompt.requirements;
      prompt.status = "本地已配置";
      prompt.updatedAt = new Date().toISOString();
      return prompt;
    });
    if (!result) {
      sendJson(res, 404, { error: "prompt_not_found" });
      return;
    }
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/model-config") {
    const data = await readData();
    sendJson(res, 200, {
      providers: data.modelProviders,
      config: publicRuntimeModelConfig(data.modelConfig)
    });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/model-config") {
    const body = await readJsonBody(req);
    const result = await updateData((data) => {
      const provider = data.modelProviders.find((item) => item.id === body.provider) || data.modelProviders[0];
      const ocrProvider = resolveOcrProvider(data.modelProviders, body.ocrProvider) || provider;
      const ocrJudgeProvider = data.modelProviders.find((item) => item.id === body.ocrJudgeProvider) || data.modelProviders.find((item) => item.id === "deepseek") || provider;
      const textModels = textModelsForProvider(provider);
      const judgeTextModels = textModelsForProvider(ocrJudgeProvider);
      const model = textModels.includes(body.model) ? body.model : textModels[0] || provider.models[0];
      const ocrModels = visionModelsForProvider(ocrProvider);
      const ocrModel = ocrModels.includes(body.ocrModel)
        ? body.ocrModel
        : preferredOcrModel(ocrProvider);
      const ocrJudgeModel = judgeTextModels.includes(body.ocrJudgeModel) ? body.ocrJudgeModel : judgeTextModels[0] || ocrJudgeProvider.models[0];
      const currentVersion = Number(data.modelConfig.version || 1);
      data.modelConfig = {
        provider: provider.id,
        model,
        apiMode: body.apiMode || "server",
        baseUrl: body.baseUrl || provider.baseUrl,
        apiKey: persistentUiApiKey(body.apiKey, data.modelConfig.apiKey),
        allowInsecureTls: Boolean(body.allowInsecureTls),
        ocrMode: body.ocrMode || data.modelConfig.ocrMode || "enhanced",
        ocrProvider: ocrProvider.id,
        ocrModel,
        ocrBaseUrl: body.ocrBaseUrl || ocrProvider.baseUrl,
        ocrApiKey: persistentUiApiKey(body.ocrApiKey, data.modelConfig.ocrApiKey),
        ocrAllowInsecureTls: Boolean(body.ocrAllowInsecureTls),
        ocrJudgeProvider: ocrJudgeProvider.id,
        ocrJudgeModel,
        ocrJudgeBaseUrl: body.ocrJudgeBaseUrl || ocrJudgeProvider.baseUrl,
        ocrJudgeApiKey: persistentUiApiKey(body.ocrJudgeApiKey, data.modelConfig.ocrJudgeApiKey),
        ocrJudgeAllowInsecureTls: Boolean(body.ocrJudgeAllowInsecureTls),
        routes: {
          ocr: ocrModel,
          grading: textModels.includes(body.routes?.grading) ? body.routes.grading : model,
          polish: textModels.includes(body.routes?.polish) ? body.routes.polish : model
        },
        version: currentVersion + 1,
        updatedAt: new Date().toISOString()
      };
      return publicRuntimeModelConfig(data.modelConfig);
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/model-config/test") {
    const body = await readJsonBody(req);
    const data = await readData();
    const testingOcr = body.scope === "ocr";
    const testingOcrJudge = body.scope === "ocrJudge";
    const requestedProvider = testingOcrJudge ? body.ocrJudgeProvider : (testingOcr ? body.ocrProvider : body.provider);
    const requestedModel = testingOcrJudge ? body.ocrJudgeModel : (testingOcr ? body.ocrModel : body.model);
    const provider = testingOcr
      ? (resolveOcrProvider(data.modelProviders, requestedProvider) || data.modelProviders[0])
      : (data.modelProviders.find((item) => item.id === requestedProvider) || data.modelProviders[0]);
    const allowedModels = testingOcr ? visionModelsForProvider(provider) : textModelsForProvider(provider);
    const model = allowedModels.includes(requestedModel) ? requestedModel : allowedModels[0] || provider.models[0];
    const baseUrl = testingOcrJudge ? body.ocrJudgeBaseUrl : (testingOcr ? body.ocrBaseUrl : body.baseUrl);
    const savedKey = testingOcrJudge ? data.modelConfig.ocrJudgeApiKey : (testingOcr ? data.modelConfig.ocrApiKey : data.modelConfig.apiKey);
    const requestMainKey = body.provider === data.modelConfig.provider ? body.apiKey : "";
    const reuseMainKey = (testingOcr || testingOcrJudge) && provider.id === data.modelConfig.provider
      ? (requestMainKey || data.modelConfig.apiKey)
      : "";
    const submittedKey = testingOcrJudge ? body.ocrJudgeApiKey : (testingOcr ? body.ocrApiKey : body.apiKey);
    const apiKey = resolveModelApiKey({
      providerId: provider.id,
      scope: testingOcrJudge ? "judge" : (testingOcr ? "vision" : "grading"),
      submittedKey,
      storedKey: savedKey || reuseMainKey
    });
    const allowInsecureTls = testingOcrJudge
      ? Boolean(body.ocrJudgeAllowInsecureTls || data.modelConfig.ocrJudgeAllowInsecureTls)
      : Boolean((testingOcr ? body.ocrAllowInsecureTls : body.allowInsecureTls) || (testingOcr ? data.modelConfig.ocrAllowInsecureTls : data.modelConfig.allowInsecureTls));
    const result = await testCompatibleModelConnection({
      provider: provider.id,
      model,
      baseUrl: baseUrl || provider.baseUrl,
      apiKey,
      allowInsecureTls
    });
    sendJson(res, 200, {
      ok: result.ok,
      provider: provider.id,
      model,
      mode: body.apiMode || "server",
      latencyMs: result.latencyMs,
      message: `连接正常，模型返回：${result.reply || "OK"}`
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/submissions") {
    const refreshLimit = legacyQueueRefreshGuard.check(getLegacyQueueRefreshKey(req));
    if (refreshLimit.limited) {
      sendJson(res, 429, {
        error: "refresh_rate_limited",
        message: "请刷新页面以加载最新版本"
      }, {
        "Retry-After": String(refreshLimit.retryAfterSeconds)
      });
      return;
    }
    const data = await readData();
    const teacherId = getRequestTeacherId(req, data);
    sendJson(res, 200, data.queueItems.filter((item) => itemBelongsToTeacher(item, teacherId, data.teacherProfiles)).map(toQueueSummary));
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/submissions") {
    const dataBeforeDelete = await readData();
    const teacherId = getRequestTeacherId(req, dataBeforeDelete);
    const teacherItems = dataBeforeDelete.queueItems.filter((item) => itemBelongsToTeacher(item, teacherId, dataBeforeDelete.teacherProfiles));
    const objectKeys = collectImageObjectKeys(teacherItems);
    const deleted = await updateData((data) => {
      const removedIds = new Set(data.queueItems
        .filter((item) => itemBelongsToTeacher(item, teacherId, data.teacherProfiles))
        .map((item) => item.id));
      const count = removedIds.size;
      data.queueItems = data.queueItems.filter((item) => !removedIds.has(item.id));
      data.reports = (Array.isArray(data.reports) ? data.reports : []).filter((report) => (
        !removedIds.has(report.queueId) && report.teacherId !== teacherId
      ));
      return count;
    });
    await deleteObjectKeys(objectKeys).catch((error) => console.warn(`OSS cleanup warning: ${error.message}`));
    sendJson(res, 200, { ok: true, deletedCount: deleted });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/submissions") {
    const body = await readJsonBody(req);
    const persistedImages = await persistImageList(normalizeImageData(body.imageData));
    const submission = await updateData((data) => {
      const teacherId = getRequestTeacherId(req, data);
      const id = `q${data.nextIds.submission++}`;
      const imageData = persistedImages;
      const item = {
        id,
        teacherId,
        student: body.student || "未命名学生",
        meta: body.meta || body.task || "未设置任务",
        promptId: body.promptId || "",
        grade: body.grade || "",
        book: body.book || "",
        unit: body.unit || "",
        essay: body.essay || "",
        ocrText: body.ocrText || body.essay || "",
        ocrPages: Array.isArray(body.ocrPages) ? body.ocrPages : [],
        ocrStatus: body.ocrStatus || "pending",
        images: imageData.length || Number(body.images || 0),
        imageMeta: imageData.map(toImageMeta),
        imageData,
        gradingHint: String(body.gradingHint || ""),
        gradingError: String(body.gradingError || ""),
        customPrompt: body.customPrompt || null,
        report: stripReportImageCopies(body.report),
        status: body.status || "pending",
        createdAt: new Date().toISOString()
      };
      data.queueItems.unshift(item);
      return item;
    });
    sendJson(res, 201, await hydrateSubmissionForClient(submission));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/uploads/presign") {
    if (!isOssEnabled()) {
      sendJson(res, 200, { ok: true, enabled: false, uploads: [] });
      return;
    }
    const body = await readJsonBody(req);
    const uploads = await createImageUploadSlots(Array.isArray(body.files) ? body.files : []);
    sendJson(res, 200, { ok: true, enabled: true, uploads });
    return;
  }

  const submissionItemMatch = url.pathname.match(/^\/api\/submissions\/([^/]+)(?:\/autosave)?$/);
  if (req.method === "GET" && submissionItemMatch && !url.pathname.endsWith("/autosave")) {
    const id = decodeURIComponent(submissionItemMatch[1]);
    const data = await readData();
    const teacherId = getRequestTeacherId(req, data);
    const item = data.queueItems.find((entry) => entry.id === id && itemBelongsToTeacher(entry, teacherId, data.teacherProfiles));
    if (!item) {
      sendJson(res, 404, { error: "submission_not_found", message: "任务不存在或已删除" });
      return;
    }
    sendJson(res, 200, await hydrateSubmissionForClient(item));
    return;
  }

  if ((req.method === "PATCH" || (req.method === "POST" && url.pathname.endsWith("/autosave"))) && submissionItemMatch) {
    const id = decodeURIComponent(submissionItemMatch[1]);
    const body = await readJsonBody(req);
    if (Object.prototype.hasOwnProperty.call(body, "imageData")) {
      body.imageData = await persistImageList(normalizeImageData(body.imageData));
    }
    const updated = await updateData((data) => {
      const teacherId = getRequestTeacherId(req, data);
      const item = data.queueItems.find((entry) => entry.id === id && itemBelongsToTeacher(entry, teacherId, data.teacherProfiles));
      if (!item) return null;
      applySubmissionPatch(item, body);
      return item;
    });
    if (!updated) {
      sendJson(res, 404, { error: "submission_not_found", message: "任务不存在或已删除" });
      return;
    }
    sendJson(res, 200, await hydrateSubmissionForClient(updated));
    return;
  }

  if (req.method === "DELETE" && submissionItemMatch) {
    const id = decodeURIComponent(submissionItemMatch[1]);
    const deleted = await updateData((data) => {
      const teacherId = getRequestTeacherId(req, data);
      const index = data.queueItems.findIndex((item) => item.id === id && itemBelongsToTeacher(item, teacherId, data.teacherProfiles));
      if (index < 0) return null;
      const [item] = data.queueItems.splice(index, 1);
      const reportId = item.report?.id;
      data.reports = Array.isArray(data.reports)
        ? data.reports.filter((report) => report.queueId !== id && report.id !== reportId)
        : [];
      return item;
    });
    if (!deleted) {
      sendJson(res, 404, { error: "submission_not_found", message: "任务不存在或已删除" });
      return;
    }
    await deleteObjectKeys(collectImageObjectKeys([deleted])).catch((error) => console.warn(`OSS cleanup warning: ${error.message}`));
    sendJson(res, 200, { ok: true, deletedId: id });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ocr") {
    const body = await readJsonBody(req);
    const data = await readData();
    const teacherId = getRequestTeacherId(req, data);
    const queueItem = body.queueId
      ? data.queueItems.find((item) => item.id === body.queueId && itemBelongsToTeacher(item, teacherId, data.teacherProfiles))
      : null;
    const images = await materializeImageList(normalizeImageData(body.images || queueItem?.imageData || []));
    if (!images.length) {
      sendJson(res, 400, { error: "no_images", message: "请先上传作文图片" });
      return;
    }

    const provider = resolveOcrProvider(data.modelProviders, data.modelConfig.ocrProvider) || data.modelProviders[0];
    const model = data.modelConfig.ocrModel || data.modelConfig.routes?.ocr || preferredOcrModel(provider);
    const judgeProvider = data.modelProviders.find((item) => item.id === data.modelConfig.ocrJudgeProvider) || data.modelProviders.find((item) => item.id === "deepseek") || data.modelProviders[0];
    const judgeTextModels = textModelsForProvider(judgeProvider);
    const judgeModel = judgeTextModels.includes(data.modelConfig.ocrJudgeModel) ? data.modelConfig.ocrJudgeModel : judgeTextModels[0] || judgeProvider.models[0];
    const ocrApiKey = resolveModelApiKey({
      providerId: provider.id,
      scope: "vision",
      storedKey: data.modelConfig.ocrApiKey || (provider.id === data.modelConfig.provider ? data.modelConfig.apiKey : "")
    });
    const judgeApiKey = resolveModelApiKey({
      providerId: judgeProvider.id,
      scope: "judge",
      storedKey: data.modelConfig.ocrJudgeApiKey || (judgeProvider.id === data.modelConfig.provider ? data.modelConfig.apiKey : "")
    });
    try {
      const result = await recognizeEssayText({
        provider: provider.id,
        providerName: provider.name,
        model,
        baseUrl: data.modelConfig.ocrBaseUrl || provider.baseUrl,
        apiKey: ocrApiKey,
        allowInsecureTls: Boolean(data.modelConfig.ocrAllowInsecureTls),
        mode: data.modelConfig.ocrMode || "enhanced",
        judge: {
          enabled: (data.modelConfig.ocrMode || "enhanced") !== "fast",
          provider: judgeProvider.id,
          providerName: judgeProvider.name,
          model: judgeModel,
          baseUrl: data.modelConfig.ocrJudgeBaseUrl || judgeProvider.baseUrl,
          apiKey: judgeApiKey,
          allowInsecureTls: Boolean(data.modelConfig.ocrJudgeAllowInsecureTls)
        },
        images
      });
      if (queueItem) {
        await updateData((nextData) => {
          const nextItem = nextData.queueItems.find((item) => (
            item.id === queueItem.id && itemBelongsToTeacher(item, teacherId, nextData.teacherProfiles)
          ));
          if (nextItem) {
            nextItem.essay = result.text;
            nextItem.ocrText = result.text;
            nextItem.ocrPages = result.pageTexts || [];
            nextItem.ocrStatus = "done";
            nextItem.updatedAt = new Date().toISOString();
          }
          return nextItem;
        });
      }
      sendJson(res, 200, {
        ok: true,
        text: result.text,
        pageTexts: result.pageTexts || [],
        pageCount: result.expectedPages || images.length,
        recognizedPages: result.recognizedPages || result.pageTexts?.length || images.length,
        expectedPages: result.expectedPages || images.length,
        model,
        ocrModel: model,
        rawText: result.rawText || result.text,
        refinedBy: result.refinedBy || null,
        uncertainties: result.uncertainties || [],
        judgeWarning: result.judgeWarning || "",
        latencyMs: result.latencyMs,
        message: buildOcrSuccessMessage(result, images.length)
      });
    } catch (error) {
      const partialResult = error.partialResult || {};
      if (queueItem && (partialResult.text || partialResult.pageTexts?.length)) {
        await updateData((nextData) => {
          const nextItem = nextData.queueItems.find((item) => (
            item.id === queueItem.id && itemBelongsToTeacher(item, teacherId, nextData.teacherProfiles)
          ));
          if (nextItem) {
            nextItem.essay = partialResult.text || nextItem.essay || "";
            nextItem.ocrText = partialResult.text || nextItem.ocrText || "";
            nextItem.ocrPages = partialResult.pageTexts || [];
            nextItem.ocrStatus = "manual";
            nextItem.updatedAt = new Date().toISOString();
          }
          return nextItem;
        });
      }
      sendJson(res, 200, {
        ok: false,
        text: partialResult.text || queueItem?.essay || "",
        pageTexts: partialResult.pageTexts || [],
        pageCount: partialResult.expectedPages || images.length,
        recognizedPages: partialResult.recognizedPages || 0,
        expectedPages: partialResult.expectedPages || images.length,
        model,
        ocrModel: model,
        rawText: partialResult.rawText || partialResult.text || "",
        refinedBy: partialResult.refinedBy || null,
        uncertainties: partialResult.uncertainties || [],
        judgeWarning: partialResult.judgeWarning || "",
        message: error.message,
        manualRequired: true
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/generate-report") {
    const body = await readJsonBody(req);
    if (!String(body.essay || "").replace(/\s/g, "") || String(body.essay || "").replace(/\s/g, "").length < 30) {
      sendJson(res, 400, {
        error: "essay_required",
        message: "请先粘贴或输入作文全文后再批改"
      });
      return;
    }
    const data = await readData();
    const teacherId = getRequestTeacherId(req, data);
    const prompt = body.prompt || findPrompt(data, body.promptRef || {});
    if (!prompt) {
      sendJson(res, 404, { error: "prompt_not_found" });
      return;
    }
    const provider = data.modelProviders.find((item) => item.id === data.modelConfig.provider) || data.modelProviders[0];
    const gradingModel = data.modelConfig.routes?.grading || data.modelConfig.model || provider.models[0];
    if (body.queueId) {
      const queueItem = await updateData((nextData) => {
        const target = nextData.queueItems.find((item) => (
          item.id === body.queueId && itemBelongsToTeacher(item, teacherId, nextData.teacherProfiles)
        ));
        if (target) {
          target.status = "grading";
          target.gradingError = "";
          target.updatedAt = new Date().toISOString();
        }
        return target;
      });
      if (!queueItem) {
        sendJson(res, 404, { error: "submission_not_found", message: "任务不存在、已过期或不属于当前教师" });
        return;
      }
    }
    try {
      const modelResult = await gradeEssayReport({
        provider: provider.id,
        model: gradingModel,
        baseUrl: data.modelConfig.baseUrl || provider.baseUrl,
        apiKey: resolveModelApiKey({
          providerId: provider.id,
          scope: "grading",
          storedKey: data.modelConfig.apiKey
        }),
        allowInsecureTls: Boolean(data.modelConfig.allowInsecureTls),
        prompt,
        essay: body.essay,
        customInstructions: body.customInstructions
      });
      let report;
      await updateData((nextData) => {
        const reportId = `r${nextData.nextIds.report++}`;
        report = normalizeModelReport({
          id: reportId,
          student: body.student,
          school: body.school,
          teacher: body.teacher,
          prompt,
          essay: body.essay,
          modelConfig: {
            ...nextData.modelConfig,
            model: gradingModel
          },
          modelProviders: nextData.modelProviders,
          modelReport: modelResult.report,
          latencyMs: modelResult.latencyMs
        });
        report.queueId = body.queueId || "";
        report.teacherId = teacherId;
        nextData.reports.unshift(report);
        if (body.queueId) {
          const queueItem = nextData.queueItems.find((item) => (
            item.id === body.queueId && itemBelongsToTeacher(item, teacherId, nextData.teacherProfiles)
          ));
          if (queueItem) {
            const essayUnchanged = String(queueItem.essay || "").trim() === String(body.essay || "").trim();
            if (essayUnchanged) {
              queueItem.report = report;
              queueItem.gradingHint = String(body.customInstructions || queueItem.gradingHint || "");
              queueItem.status = "done";
              queueItem.gradingError = "";
            } else {
              queueItem.report = null;
              queueItem.status = "draft";
              queueItem.gradingError = "";
            }
            queueItem.updatedAt = new Date().toISOString();
          }
        }
        return report;
      });
      sendJson(res, 200, report);
    } catch (error) {
      if (body.queueId) {
        await updateData((nextData) => {
          const queueItem = nextData.queueItems.find((item) => (
            item.id === body.queueId && itemBelongsToTeacher(item, teacherId, nextData.teacherProfiles)
          ));
          if (queueItem) {
            queueItem.status = "failed";
            queueItem.gradingError = String(error.message || "批改失败");
            queueItem.updatedAt = new Date().toISOString();
          }
          return queueItem;
        });
      }
      sendJson(res, 502, {
        error: "model_grading_failed",
        message: error.message
      });
    }
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

function getRequestOrigin(req) {
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || (req.socket.encrypted ? "https" : "http");
  return `${protocol}://${host}`;
}

function applyCors(req, res) {
  const origin = String(req.headers.origin || "").trim();
  const allowedOrigins = String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const normalizedOrigin = origin.replace(/\/$/, "");
  const originAllowed = Boolean(origin && allowedOrigins.includes(normalizedOrigin));

  if (originAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS);
    res.setHeader("Access-Control-Max-Age", "600");
    res.setHeader("Vary", "Origin");
  }

  if (req.method !== "OPTIONS") return true;
  if (!originAllowed) {
    sendJson(res, 403, { error: "cors_origin_denied", message: "当前网页来源未被允许访问批改服务" });
    return false;
  }
  res.writeHead(204);
  res.end();
  return false;
}

function ensureAuthorized(req, res) {
  if (String(req.url || "").split("?")[0] === "/api/health") return true;
  if (!isOssEnabled() && isValidLocalLearningSheetDownloadRequest(req)) return true;
  const password = String(process.env.APP_PASSWORD || "");
  if (!password) {
    if (isOssEnabled() && process.env.ALLOW_INSECURE_PUBLIC_ACCESS !== "1") {
      sendJson(res, 503, {
        error: "server_auth_required",
        message: "云端部署必须设置 APP_PASSWORD 环境变量"
      });
      return false;
    }
    return true;
  }
  const username = String(process.env.APP_USERNAME || "teacher");
  const authorization = String(req.headers.authorization || "");
  if (authorization.startsWith("Basic ")) {
    try {
      const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf8");
      const separator = credentials.indexOf(":");
      const suppliedUser = separator >= 0 ? credentials.slice(0, separator) : credentials;
      const suppliedPassword = separator >= 0 ? credentials.slice(separator + 1) : "";
      if (safeEqual(suppliedUser, username) && safeEqual(suppliedPassword, password)) return true;
    } catch (error) {
      // Fall through to the authentication challenge.
    }
  }
  res.writeHead(401, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "WWW-Authenticate": "Basic realm=\"Essay Grading App\", charset=\"UTF-8\""
  });
  res.end("需要教师账号登录");
  return false;
}

function createLocalLearningSheetDownloadUrl(promptId, format, ttlSeconds = 15 * 60) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${promptId}\n${format}\n${expires}`;
  const token = crypto.createHmac("sha256", LOCAL_DOWNLOAD_SECRET).update(payload).digest("hex");
  const params = new URLSearchParams({ promptId, format, expires: String(expires), token });
  return `/api/learning-sheet-download?${params.toString()}`;
}

function isValidLocalLearningSheetDownloadRequest(req) {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/api/learning-sheet-download") return false;
    return isValidLocalLearningSheetDownloadUrl(url);
  } catch (error) {
    return false;
  }
}

function isValidLocalLearningSheetDownloadUrl(url) {
  const promptId = String(url.searchParams.get("promptId") || "");
  const format = String(url.searchParams.get("format") || "").toLowerCase();
  const expires = Number(url.searchParams.get("expires") || 0);
  const suppliedToken = String(url.searchParams.get("token") || "");
  if (!promptId || !getLearningSheetAsset(promptId, format) || !Number.isInteger(expires)) return false;
  if (expires < Math.floor(Date.now() / 1000)) return false;
  const payload = `${promptId}\n${format}\n${expires}`;
  const expectedToken = crypto.createHmac("sha256", LOCAL_DOWNLOAD_SECRET).update(payload).digest("hex");
  return safeEqual(suppliedToken, expectedToken);
}

async function sendLocalLearningSheetDownload(res, url) {
  if (isOssEnabled() || !isValidLocalLearningSheetDownloadUrl(url)) {
    sendJson(res, 403, { error: "learning_sheet_download_denied", message: "学习单下载地址已失效" });
    return;
  }
  const promptId = String(url.searchParams.get("promptId") || "");
  const format = String(url.searchParams.get("format") || "").toLowerCase();
  const asset = getLearningSheetAsset(promptId, format);
  const filePath = resolveLocalLearningSheetPath(asset);
  if (!filePath || !fs.existsSync(filePath)) {
    sendJson(res, 404, { error: "learning_sheet_file_missing", message: "本机尚未安装这份学习单文件" });
    return;
  }
  const stat = await fs.promises.stat(filePath);
  res.writeHead(200, {
    "Content-Type": asset.contentType,
    "Content-Length": stat.size,
    "Content-Disposition": buildAttachmentDisposition(asset.fileName, `${asset.promptId}.${asset.format}`),
    "Cache-Control": "private, no-store"
  });
  fs.createReadStream(filePath).pipe(res);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && cryptoSafeCompare(leftBuffer, rightBuffer);
}

function cryptoSafeCompare(left, right) {
  return crypto.timingSafeEqual(left, right);
}

function usesServerManagedModelKeys() {
  return isOssEnabled() || process.env.SERVER_MANAGED_MODEL_KEYS === "1";
}

function persistentUiApiKey(submittedKey, storedKey) {
  if (usesServerManagedModelKeys() && process.env.ALLOW_UI_API_KEYS !== "1") return "";
  return submittedKey || storedKey || "";
}

function publicRuntimeModelConfig(modelConfig) {
  const visible = publicModelConfig(modelConfig);
  return {
    ...visible,
    apiKeySet: Boolean(resolveModelApiKey({
      providerId: modelConfig?.provider,
      scope: "grading",
      storedKey: modelConfig?.apiKey
    })),
    ocrApiKeySet: Boolean(resolveModelApiKey({
      providerId: modelConfig?.ocrProvider,
      scope: "vision",
      storedKey: modelConfig?.ocrApiKey
    })),
    ocrJudgeApiKeySet: Boolean(resolveModelApiKey({
      providerId: modelConfig?.ocrJudgeProvider,
      scope: "judge",
      storedKey: modelConfig?.ocrJudgeApiKey
    })),
    serverManagedKeys: usesServerManagedModelKeys()
  };
}

function resolveModelApiKey({ providerId, scope, submittedKey = "", storedKey = "" }) {
  const scopedEnvironmentKey = scope === "vision"
    ? process.env.VISION_API_KEY
    : (scope === "judge" ? process.env.JUDGE_API_KEY : process.env.MODEL_API_KEY);
  const providerEnvironmentKeys = {
    deepseek: process.env.DEEPSEEK_API_KEY,
    kimi: process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    azure: process.env.AZURE_OPENAI_API_KEY,
    qwen: process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY,
    zhipu: process.env.ZHIPU_API_KEY
  };
  const environmentKey = String(scopedEnvironmentKey || providerEnvironmentKeys[providerId] || "").trim();
  if (environmentKey) return environmentKey;
  if (!usesServerManagedModelKeys() || process.env.ALLOW_UI_API_KEYS === "1") {
    return String(submittedKey || storedKey || "").trim();
  }
  return "";
}

async function hydrateSubmissionForClient(item) {
  if (!item) return item;
  const imageData = await hydrateImageListForClient(item.imageData || []);
  return {
    ...item,
    expiresAt: getTaskExpiresAt(item),
    imageData,
    report: item.report ? { ...item.report, sourceImages: imageData } : item.report
  };
}

function getRequestTeacherId(req, data) {
  const requestedId = String(req.headers["x-teacher-id"] || "").trim();
  return resolveTeacherId(requestedId, data.teacherProfiles);
}

async function sweepExpiredWorkspaceItems() {
  const now = Date.now();
  if (now - lastRetentionSweepAt < RETENTION_SWEEP_INTERVAL_MS) return;
  if (retentionSweepPromise) return retentionSweepPromise;
  lastRetentionSweepAt = now;
  retentionSweepPromise = (async () => {
    const snapshot = await readData();
    const preview = removeExpiredWorkspaceItems(snapshot, now);
    if (!preview.changed) return;
    const removedItems = await updateData((data) => removeExpiredWorkspaceItems(data, now).removedItems);
    const objectKeys = collectImageObjectKeys(removedItems);
    await deleteObjectKeys(objectKeys).catch((error) => console.warn(`OSS retention cleanup warning: ${error.message}`));
  })().finally(() => {
    retentionSweepPromise = null;
  });
  return retentionSweepPromise;
}

function buildCaptureUrl(origin, urls) {
  if (origin && !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(origin)) {
    return `${origin}/capture.html`;
  }
  return `${(urls.lan[0] || urls.local)}/capture.html`;
}

function buildCaptureUrls(origin, urls) {
  const values = [
    buildCaptureUrl(origin, urls),
    `${urls.local}/capture.html`,
    ...urls.lan.map((item) => `${item}/capture.html`)
  ];
  return [...new Set(values)];
}

function getAccessUrls(port) {
  const candidates = Object.entries(os.networkInterfaces())
    .flatMap(([name, items]) => (items || []).map((item) => ({ name, ...item })))
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .filter((item) => isUsableLanAddress(item.address))
    .sort((a, b) => scoreNetworkAddress(a) - scoreNetworkAddress(b))
    .map((item) => `http://${item.address}:${port}`);
  return {
    local: `http://127.0.0.1:${port}`,
    lan: [...new Set(candidates)]
  };
}

function isUsableLanAddress(address) {
  if (!address) return false;
  if (/^169\.254\./.test(address)) return false;
  if (/^198\.(18|19)\./.test(address)) return false;
  return isPrivateIPv4(address);
}

function isPrivateIPv4(address) {
  return /^10\./.test(address)
    || /^192\.168\./.test(address)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(address);
}

function scoreNetworkAddress(item) {
  const name = item.name || "";
  const address = item.address || "";
  if (name === "en0") return 0;
  if (name === "en1") return 1;
  if (/^en\d+$/.test(name)) return 2;
  if (/^192\.168\./.test(address)) return 3;
  if (/^10\./.test(address)) return 4;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) return 5;
  return 9;
}

function serveStatic(req, res, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  if (!PUBLIC_FILES.has(cleanPath)) {
    sendText(res, 404, "Not found");
    return;
  }
  const filePath = path.join(ROOT_DIR, cleanPath);
  if (!filePath.startsWith(ROOT_DIR) || !fs.existsSync(filePath)) {
    sendText(res, 404, "Not found");
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(filePath).pipe(res);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_JSON_BODY_BYTES) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function normalizeImageData(images) {
  if (!Array.isArray(images)) return [];
  return images
    .filter((item) => item && (
      (typeof item.dataUrl === "string" && (item.dataUrl.startsWith("data:image/") || /^https:\/\//i.test(item.dataUrl)))
      || (typeof item.storageKey === "string" && item.storageKey)
    ))
    .slice(0, MAX_IMAGE_PAGES)
    .map((item, index) => ({
      id: item.id || `img-${index + 1}`,
      name: item.name || `作文图片${index + 1}.jpg`,
      type: item.type || (typeof item.dataUrl === "string" && item.dataUrl.startsWith("data:")
        ? item.dataUrl.slice(5, item.dataUrl.indexOf(";"))
        : "image/jpeg"),
      size: Number(item.size || 0),
      originalSize: Number(item.originalSize || item.size || 0),
      dataUrl: String(item.dataUrl || ""),
      previewDataUrl: typeof item.previewDataUrl === "string" && (item.previewDataUrl.startsWith("data:image/") || /^https:\/\//i.test(item.previewDataUrl)) ? item.previewDataUrl : item.dataUrl,
      previewSize: Number(item.previewSize || 0),
      storageKey: String(item.storageKey || ""),
      previewStorageKey: String(item.previewStorageKey || "")
    }));
}

function applySubmissionPatch(item, body) {
  const textFields = [
    "student",
    "meta",
    "promptId",
    "grade",
    "book",
    "unit",
    "essay",
    "ocrText",
    "ocrStatus",
    "gradingHint",
    "gradingError",
    "status"
  ];
  textFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      item[field] = String(body[field] || "");
    }
  });
  if (Object.prototype.hasOwnProperty.call(body, "customPrompt")) {
    item.customPrompt = body.customPrompt || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "report")) {
    item.report = stripReportImageCopies(body.report);
  }
  if (Object.prototype.hasOwnProperty.call(body, "ocrPages")) {
    item.ocrPages = Array.isArray(body.ocrPages) ? body.ocrPages : [];
  }
  if (Object.prototype.hasOwnProperty.call(body, "imageData")) {
    const imageData = normalizeImageData(body.imageData);
    item.imageData = imageData;
    item.imageMeta = imageData.map(toImageMeta);
    item.images = imageData.length;
  } else {
    if (Object.prototype.hasOwnProperty.call(body, "imageMeta")) {
      item.imageMeta = Array.isArray(body.imageMeta) ? body.imageMeta : [];
    }
    if (Object.prototype.hasOwnProperty.call(body, "images")) {
      item.images = Number(body.images || 0);
    }
  }
  item.updatedAt = new Date().toISOString();
}

function toQueueSummary(item) {
  const imageMeta = Array.isArray(item.imageMeta) ? item.imageMeta : normalizeImageData(item.imageData).map(toImageMeta);
  return {
    id: item.id,
    teacherId: item.teacherId,
    student: item.student || "未命名学生",
    meta: item.meta || "未设置任务",
    promptId: item.promptId || "",
    grade: item.grade || "",
    book: item.book || "",
    unit: item.unit || "",
    essay: item.essay || "",
    ocrText: item.ocrText || item.essay || "",
    ocrPages: Array.isArray(item.ocrPages) ? item.ocrPages : [],
    ocrStatus: item.ocrStatus || "pending",
    images: Number(item.images || imageMeta.length || 0),
    imageMeta,
    imageData: [],
    hasImageData: normalizeImageData(item.imageData).length > 0,
    gradingHint: String(item.gradingHint || ""),
    gradingError: String(item.gradingError || ""),
    customPrompt: item.customPrompt || null,
    report: stripReportImageCopies(item.report),
    status: item.status || "pending",
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || "",
    expiresAt: getTaskExpiresAt(item)
  };
}

function toImageMeta(image) {
  return {
    id: image.id,
    name: image.name,
    type: image.type,
    size: image.size,
    originalSize: image.originalSize,
    previewSize: image.previewSize
  };
}

function stripReportImageCopies(report) {
  if (!report || typeof report !== "object") return null;
  const { sourceImages, ...summary } = report;
  return summary;
}

function preferredOcrModel(provider) {
  const visionModels = visionModelsForProvider(provider);
  return [
    "moonshot-v1-128k-vision-preview",
    "deepseek-v4-flash-vision-exp",
    "moonshot-v1-32k-vision-preview",
    "moonshot-v1-8k-vision-preview"
  ].find((model) => visionModels.includes(model)) || visionModels[0] || provider.models[0];
}

function providerSupportsVision(providerId, model) {
  if (providerId === "deepseek") return /deepseek-v4-flash-vision-exp/i.test(model);
  return /gpt-4o|gpt-4\.1|qwen-vl|glm-4v|moonshot-v1-.+-vision-preview|vision|vl/i.test(model);
}

function resolveOcrProvider(providers, requestedProviderId) {
  const allowed = (providers || []).filter((provider) => (
    VISION_READING_PROVIDER_IDS.has(provider.id) &&
    visionModelsForProvider(provider).length
  ));
  return allowed.find((provider) => provider.id === requestedProviderId)
    || allowed.find((provider) => provider.id === "kimi")
    || allowed[0];
}

function visionModelsForProvider(provider) {
  if (!provider) return [];
  return provider.models.filter((model) => providerSupportsVision(provider.id, model));
}

function textModelsForProvider(provider) {
  if (!provider) return [];
  return provider.models.filter((model) => !isVisionOnlyModel(provider.id, model));
}

function isVisionOnlyModel(providerId, model) {
  return providerId === "deepseek" && /deepseek-v4-flash-vision-exp/i.test(model || "");
}

function buildOcrSuccessMessage(result, imageCount) {
  const expected = result.expectedPages || imageCount;
  const recognized = result.recognizedPages || result.pageTexts?.length || imageCount;
  const base = expected > 1
    ? `图片文字已逐页识别 ${recognized}/${expected} 页并合并`
    : "图片文字读取完成";
  if (result.refinedBy) {
    const warning = result.judgeWarning ? `；校对提示：${result.judgeWarning}` : "";
    return `${base}，已由 ${result.refinedBy.providerName || result.refinedBy.provider || "校对模型"} · ${result.refinedBy.model} 保守校对${warning}，请老师确认后批改`;
  }
  if (result.judgeWarning) {
    return `${base}，但校对模型未完成：${result.judgeWarning}。请老师确认后批改`;
  }
  return `${base}，请老师确认后批改`;
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}
