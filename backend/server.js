const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { URL } = require("url");
const { findPrompt, publicModelConfig, readData, resetRuntimeWorkspaceData, updateData, writeData } = require("./data-store");
const { gradeEssayReport, recognizeEssayText, testCompatibleModelConnection } = require("./model-client");
const { normalizeModelReport } = require("./report-engine");

const PORT = Number(process.env.PORT || 8787);
const ROOT_DIR = path.join(__dirname, "..");
const SERVER_SESSION_ID = `${Date.now()}-${process.pid}`;
const SERVER_STARTED_AT = new Date().toISOString();
const RESET_WORKSPACE_ON_START = process.env.RESET_WORKSPACE_ON_START === "1" || process.argv.includes("--reset-session");
const STARTUP_RESET = RESET_WORKSPACE_ON_START ? resetRuntimeWorkspaceData() : null;
const PUBLIC_FILES = new Set(["/", "/index.html", "/capture.html", "/styles.css", "/app.js"]);
const MAX_IMAGE_PAGES = 12;
const MAX_JSON_BODY_BYTES = 64 * 1024 * 1024;
const VISION_READING_PROVIDER_IDS = new Set(["kimi", "deepseek"]);
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  try {
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

server.listen(PORT, "0.0.0.0", () => {
  const urls = getAccessUrls(PORT);
  console.log(`Essay grading prototype backend running at ${urls.local}`);
  if (STARTUP_RESET) {
    console.log(`Workspace session reset at ${STARTUP_RESET.resetAt}`);
  }
  if (urls.lan.length) {
    console.log(`Phone capture page: ${urls.lan[0]}/capture.html`);
  }
});

function getRuntimeInfo() {
  return {
    sessionId: SERVER_SESSION_ID,
    startedAt: SERVER_STARTED_AT,
    resetOnStart: RESET_WORKSPACE_ON_START,
    resetAt: STARTUP_RESET?.resetAt || ""
  };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, time: new Date().toISOString() });
    return;
  }

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
    const data = readData();
    sendJson(res, 200, {
      runtime: getRuntimeInfo(),
      promptLibrary: data.promptLibrary,
      modelProviders: data.modelProviders,
      queueItems: data.queueItems.map(toQueueSummary),
      modelConfig: publicModelConfig(data.modelConfig)
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/prompts") {
    sendJson(res, 200, readData().promptLibrary);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/prompts/requirements") {
    const body = await readJsonBody(req);
    const result = updateData((data) => {
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
    const data = readData();
    sendJson(res, 200, {
      providers: data.modelProviders,
      config: publicModelConfig(data.modelConfig)
    });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/model-config") {
    const body = await readJsonBody(req);
    const result = updateData((data) => {
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
        apiKey: body.apiKey || data.modelConfig.apiKey || "",
        allowInsecureTls: Boolean(body.allowInsecureTls),
        ocrMode: body.ocrMode || data.modelConfig.ocrMode || "enhanced",
        ocrProvider: ocrProvider.id,
        ocrModel,
        ocrBaseUrl: body.ocrBaseUrl || ocrProvider.baseUrl,
        ocrApiKey: body.ocrApiKey || data.modelConfig.ocrApiKey || "",
        ocrAllowInsecureTls: Boolean(body.ocrAllowInsecureTls),
        ocrJudgeProvider: ocrJudgeProvider.id,
        ocrJudgeModel,
        ocrJudgeBaseUrl: body.ocrJudgeBaseUrl || ocrJudgeProvider.baseUrl,
        ocrJudgeApiKey: body.ocrJudgeApiKey || data.modelConfig.ocrJudgeApiKey || "",
        ocrJudgeAllowInsecureTls: Boolean(body.ocrJudgeAllowInsecureTls),
        routes: {
          ocr: ocrModel,
          grading: textModels.includes(body.routes?.grading) ? body.routes.grading : model,
          polish: textModels.includes(body.routes?.polish) ? body.routes.polish : model
        },
        version: currentVersion + 1,
        updatedAt: new Date().toISOString()
      };
      return publicModelConfig(data.modelConfig);
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/model-config/test") {
    const body = await readJsonBody(req);
    const data = readData();
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
    const apiKey = (testingOcrJudge ? body.ocrJudgeApiKey : (testingOcr ? body.ocrApiKey : body.apiKey)) || savedKey || reuseMainKey || "";
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
    const data = readData();
    sendJson(res, 200, data.queueItems.map(toQueueSummary));
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/submissions") {
    const deleted = updateData((data) => {
      const count = data.queueItems.length;
      data.queueItems = [];
      data.reports = Array.isArray(data.reports) ? [] : [];
      return count;
    });
    sendJson(res, 200, { ok: true, deletedCount: deleted });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/submissions") {
    const body = await readJsonBody(req);
    const submission = updateData((data) => {
      const id = `q${data.nextIds.submission++}`;
      const imageData = normalizeImageData(body.imageData);
      const item = {
        id,
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
        customPrompt: body.customPrompt || null,
        report: body.report || null,
        status: body.status || "pending",
        createdAt: new Date().toISOString()
      };
      data.queueItems.unshift(item);
      return item;
    });
    sendJson(res, 201, submission);
    return;
  }

  const submissionItemMatch = url.pathname.match(/^\/api\/submissions\/([^/]+)(?:\/autosave)?$/);
  if (req.method === "GET" && submissionItemMatch && !url.pathname.endsWith("/autosave")) {
    const id = decodeURIComponent(submissionItemMatch[1]);
    const item = readData().queueItems.find((entry) => entry.id === id);
    if (!item) {
      sendJson(res, 404, { error: "submission_not_found", message: "任务不存在或已删除" });
      return;
    }
    sendJson(res, 200, item);
    return;
  }

  if ((req.method === "PATCH" || (req.method === "POST" && url.pathname.endsWith("/autosave"))) && submissionItemMatch) {
    const id = decodeURIComponent(submissionItemMatch[1]);
    const body = await readJsonBody(req);
    const updated = updateData((data) => {
      const item = data.queueItems.find((entry) => entry.id === id);
      if (!item) return null;
      applySubmissionPatch(item, body);
      return item;
    });
    if (!updated) {
      sendJson(res, 404, { error: "submission_not_found", message: "任务不存在或已删除" });
      return;
    }
    sendJson(res, 200, updated);
    return;
  }

  if (req.method === "DELETE" && submissionItemMatch) {
    const id = decodeURIComponent(submissionItemMatch[1]);
    const deleted = updateData((data) => {
      const index = data.queueItems.findIndex((item) => item.id === id);
      if (index < 0) return null;
      const [item] = data.queueItems.splice(index, 1);
      data.reports = Array.isArray(data.reports) ? data.reports.filter((report) => report.queueId !== id) : [];
      return item;
    });
    if (!deleted) {
      sendJson(res, 404, { error: "submission_not_found", message: "任务不存在或已删除" });
      return;
    }
    sendJson(res, 200, { ok: true, deletedId: id });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ocr") {
    const body = await readJsonBody(req);
    const data = readData();
    const queueItem = body.queueId ? data.queueItems.find((item) => item.id === body.queueId) : null;
    const images = normalizeImageData(body.images || queueItem?.imageData || []);
    if (!images.length) {
      sendJson(res, 400, { error: "no_images", message: "请先上传作文图片" });
      return;
    }

    const provider = resolveOcrProvider(data.modelProviders, data.modelConfig.ocrProvider) || data.modelProviders[0];
    const model = data.modelConfig.ocrModel || data.modelConfig.routes?.ocr || preferredOcrModel(provider);
    const judgeProvider = data.modelProviders.find((item) => item.id === data.modelConfig.ocrJudgeProvider) || data.modelProviders.find((item) => item.id === "deepseek") || data.modelProviders[0];
    const judgeTextModels = textModelsForProvider(judgeProvider);
    const judgeModel = judgeTextModels.includes(data.modelConfig.ocrJudgeModel) ? data.modelConfig.ocrJudgeModel : judgeTextModels[0] || judgeProvider.models[0];
    const ocrApiKey = data.modelConfig.ocrApiKey || (provider.id === data.modelConfig.provider ? data.modelConfig.apiKey : "") || "";
    const judgeApiKey = data.modelConfig.ocrJudgeApiKey || (judgeProvider.id === data.modelConfig.provider ? data.modelConfig.apiKey : "") || "";
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
        updateData((nextData) => {
          const nextItem = nextData.queueItems.find((item) => item.id === queueItem.id);
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
        updateData((nextData) => {
          const nextItem = nextData.queueItems.find((item) => item.id === queueItem.id);
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
        message: "请先完成图片文字读取并确认识别文本后再批改"
      });
      return;
    }
    const data = readData();
    const prompt = body.prompt || findPrompt(data, body.promptRef || {});
    if (!prompt) {
      sendJson(res, 404, { error: "prompt_not_found" });
      return;
    }
    const provider = data.modelProviders.find((item) => item.id === data.modelConfig.provider) || data.modelProviders[0];
    const gradingModel = data.modelConfig.routes?.grading || data.modelConfig.model || provider.models[0];
    try {
      const modelResult = await gradeEssayReport({
        provider: provider.id,
        model: gradingModel,
        baseUrl: data.modelConfig.baseUrl || provider.baseUrl,
        apiKey: data.modelConfig.apiKey || "",
        allowInsecureTls: Boolean(data.modelConfig.allowInsecureTls),
        prompt,
        essay: body.essay,
        customInstructions: body.customInstructions
      });
      const reportId = `r${data.nextIds.report++}`;
      const report = normalizeModelReport({
        id: reportId,
        student: body.student,
        school: body.school,
        teacher: body.teacher,
        prompt,
        essay: body.essay,
        modelConfig: {
          ...data.modelConfig,
          model: gradingModel
        },
        modelProviders: data.modelProviders,
        modelReport: modelResult.report,
        latencyMs: modelResult.latencyMs
      });
      data.reports.unshift(report);
      if (body.queueId) {
        const queueItem = data.queueItems.find((item) => item.id === body.queueId);
        if (queueItem) {
          queueItem.essay = body.essay;
          queueItem.report = report;
          queueItem.updatedAt = new Date().toISOString();
        }
      }
      writeData(data);
      sendJson(res, 200, report);
    } catch (error) {
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
  return `http://${host}`;
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
    .filter((item) => item && typeof item.dataUrl === "string" && item.dataUrl.startsWith("data:image/"))
    .slice(0, MAX_IMAGE_PAGES)
    .map((item, index) => ({
      id: item.id || `img-${index + 1}`,
      name: item.name || `作文图片${index + 1}.jpg`,
      type: item.type || item.dataUrl.slice(5, item.dataUrl.indexOf(";")) || "image/jpeg",
      size: Number(item.size || 0),
      originalSize: Number(item.originalSize || item.size || 0),
      dataUrl: item.dataUrl,
      previewDataUrl: typeof item.previewDataUrl === "string" && item.previewDataUrl.startsWith("data:image/") ? item.previewDataUrl : item.dataUrl,
      previewSize: Number(item.previewSize || 0)
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
    item.report = body.report || null;
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
    customPrompt: item.customPrompt || null,
    report: item.report || null,
    status: item.status || "pending",
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || ""
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

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}
