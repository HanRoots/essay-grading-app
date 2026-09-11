const promptLibrary = [];
const MAX_IMAGE_PAGES = 12;
// Tasks are saved immediately after edits. A low-frequency foreground refresh
// keeps another teacher's changes visible without repeatedly reading OSS.
const QUEUE_POLL_INTERVAL_MS = 60 * 1000;
const AUTOSAVE_DEBOUNCE_MS = 650;
const LOCAL_DRAFT_ID_PREFIX = "draft-";
const CAPTURE_DRAFT_DB_NAME = "essayCaptureDrafts";
const CAPTURE_DRAFT_STORE = "drafts";
const CAPTURE_DRAFT_ID = "active";
const CAPTURE_DRAFT_META_KEY = "essayCaptureDraftMeta";
const APP_RUNTIME_STORAGE_KEY = "essayAppRuntimeSessionId";
const API_AUTH_SESSION_KEY = "essayApiAuthorization";
const TEACHER_PROFILE_STORAGE_KEY = "essayActiveTeacherId";
const DEFAULT_TEACHER_PROFILES = [
  { id: "teacher-1", name: "教师 1" },
  { id: "teacher-2", name: "教师 2" },
  { id: "teacher-3", name: "教师 3" },
  { id: "teacher-4", name: "教师 4" },
  { id: "teacher-5", name: "教师 5" }
];
const DEFAULT_TASK_RETENTION_DAYS = 15;
const APP_DEPLOYMENT_CONFIG = window.ESSAY_APP_CONFIG || {};
const API_BASE_URL = String(APP_DEPLOYMENT_CONFIG.apiBaseUrl || "").replace(/\/+$/, "");
const ROUTE_FOLLOW_VALUE = "__follow_main__";
const GRADING_HINT_STORAGE_KEY = "essayGradingCustomHint";
const OCR_IMAGE_KEEP_ORIGINAL_MAX_BYTES = 16 * 1024 * 1024;
const OCR_IMAGE_MAX_EDGE = 6000;
const OCR_IMAGE_JPEG_QUALITY = 0.98;
const PREVIEW_IMAGE_MAX_EDGE = 1200;
const PREVIEW_IMAGE_JPEG_QUALITY = 0.78;
const MODEL_SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const DEFAULT_GRADING_HINT = [
  "请以小学语文老师的口吻批改作文，评价必须基于学生原文。",
  "点评要具体、客观，指出原句位置、问题原因和可执行修改建议。",
  "不要套模板，不要拔高孩子思想；润色要保留孩子原有想法和语言水平。"
].join("\n");
const GRADE_SEVEN_GRADING_HINT = [
  "请以老师的口吻批改作文，评价必须基于学生原文。",
  "点评要具体、客观，指出原句位置、问题原因和可执行修改建议。",
  "不要套模板，不要拔高孩子思想；润色要保留孩子原有想法和语言水平。"
].join("\n");
const PREVIOUS_SHARED_GRADING_HINT = [
  "请以语文老师的口吻批改作文，评价必须基于学生原文。",
  "点评要具体、客观，指出原句位置、问题原因和可执行修改建议。",
  "不要套模板，不要拔高孩子思想；润色要保留孩子原有想法和语言水平。"
].join("\n");
const AI_RECOGNITION_PROMPT = "请识别孩子手写的作文，只输出识别出的原文。绝对不要添加、删减或修改任何内容，不要提供批改意见。请忽略红笔文字，并按不同同学分别整理输出。";
const DEFAULT_CUSTOM_PROMPT_REQUIREMENTS = [
  "围绕题目写清楚主要内容",
  "内容具体，语句通顺，表达真实",
  "注意段落结构和标点书写"
];

const EMPTY_PROMPT = {
  id: "",
  grade: "",
  book: "",
  unit: "",
  title: "题库未加载",
  type: "",
  status: "未加载",
  requirements: ["后端题库暂未连接，请检查本地服务后刷新页面"]
};

const queueItems = [];

const levels = ["优秀", "良好", "中等", "合格", "需完善"];
const typoRules = [
  { wrong: "偷悦", right: "愉悦" },
  { wrong: "拉来我", right: "拉住我" },
  { wrong: "看到见状", right: "见状" },
  { wrong: "响午", right: "中午" }
];
const modelProviders = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"]
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    baseUrl: "https://{resource}.openai.azure.com/openai/deployments/{deployment}",
    models: ["gpt-4.1", "gpt-4o", "custom-deployment"]
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-v4-flash-vision-exp"]
  },
  {
    id: "qwen",
    name: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-vl-plus", "qwen-vl-max"]
  },
  {
    id: "kimi",
    name: "Kimi / Moonshot",
    baseUrl: "https://api.moonshot.cn/v1",
    models: [
      "kimi-k2.6",
      "kimi-k2.5",
      "moonshot-v1-8k-vision-preview",
      "moonshot-v1-32k-vision-preview",
      "moonshot-v1-128k-vision-preview",
      "moonshot-v1-8k",
      "moonshot-v1-32k",
      "moonshot-v1-128k"
    ]
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-plus", "glm-4-air", "glm-4-flash", "glm-4v-plus", "glm-4v-flash"]
  },
  {
    id: "custom",
    name: "自定义兼容接口",
    baseUrl: "https://api.example.com/v1",
    models: ["custom-large", "custom-fast", "local-model"]
  }
];
const DEEPSEEK_LEGACY_MODEL_ALIASES = {
  "deepseek-chat": "deepseek-v4-flash",
  "deepseek-reasoner": "deepseek-v4-flash"
};
const VISION_READING_PROVIDER_IDS = new Set(["kimi", "deepseek"]);

const state = {
  currentQueueId: "",
  editMode: false,
  currentReport: null,
  backendAvailable: false,
  refreshingBootstrap: false,
  queuePollTimer: 0,
  queueRefreshInFlight: false,
  autosaveTimer: 0,
  autosaveInFlight: false,
  autosaveItems: {},
  networkInfo: null,
  runtime: null,
  annotationObserver: null,
  annotationConnectorFrame: 0,
  annotationConnectorEventsBound: false,
  annotationDrag: null,
  annotationDragClickSuppressed: false,
  activeAnnotationIndex: "",
  currentImages: [],
  gradingJobs: new Map(),
  taskFilter: "all",
  teacherId: readStoredTeacherId(),
  teacherProfiles: [...DEFAULT_TEACHER_PROFILES],
  taskRetentionDays: DEFAULT_TASK_RETENTION_DAYS,
  switchingTeacher: false,
  apiLoginPromise: null,
  ocrText: "",
  gradingHint: DEFAULT_GRADING_HINT,
  customPrompt: createDefaultCustomPrompt(false),
  modelConfig: {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    apiMode: "server",
    baseUrl: "https://api.deepseek.com",
    apiKey: "",
    allowInsecureTls: false,
    ocrMode: "enhanced",
    ocrProvider: "kimi",
    ocrModel: "moonshot-v1-128k-vision-preview",
    ocrBaseUrl: "https://api.moonshot.cn/v1",
    ocrApiKey: "",
    ocrAllowInsecureTls: false,
    ocrJudgeProvider: "deepseek",
    ocrJudgeModel: "deepseek-v4-flash",
    ocrJudgeBaseUrl: "https://api.deepseek.com",
    ocrJudgeApiKey: "",
    ocrJudgeAllowInsecureTls: false,
    serverManagedKeys: false,
    routes: {
      ocr: "moonshot-v1-128k-vision-preview",
      grading: "deepseek-v4-flash",
      polish: "deepseek-v4-flash"
    }
  }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const llmProviders = () => modelProviders.filter((provider) => !provider.ocrOnly);
const ocrProviders = () => modelProviders.filter((provider) => (
  !provider.ocrOnly &&
  VISION_READING_PROVIDER_IDS.has(provider.id) &&
  provider.models.some((model) => providerSupportsClientVision(provider.id, model))
));

function init() {
  if (redirectFilePageToLocalServer()) return;
  if (document.body.classList.contains("capture-page")) {
    initCapturePage();
    return;
  }
  initDesktopPage();
}

function redirectFilePageToLocalServer() {
  if (window.location.protocol !== "file:") return false;
  const pageName = document.body.classList.contains("capture-page") ? "capture.html" : "index.html";
  const target = new URL(pageName, "http://127.0.0.1:8787/");
  target.search = window.location.search;
  target.hash = window.location.hash;
  window.location.replace(target.toString());
  return true;
}

async function initDesktopPage() {
  await loadBackendBootstrap();
  renderTeacherProfiles();
  renderQueue();
  renderLibraryTable();
  populateGradeSelect();
  initModelConfig();
  initGradingHint();
  bindDesktopEvents();
  if (queueItems.length) {
    loadQueueItem(queueItems[0].id);
  } else {
    renderAfterQueueRemoval(true, 0);
  }
  updateCharCount();
  if (isFallbackPromptLibrary()) {
    setTimeout(refreshBootstrapIfFallback, 800);
  }
  startQueuePolling();
}

function bindDesktopEvents() {
  $("#copyAiRecognitionPromptButton")?.addEventListener("click", copyAiRecognitionPrompt);
  $("#gradeSelect").addEventListener("change", () => {
    populateBookSelect();
    populateUnitSelect();
    renderPrompt();
    syncSystemGradingHintForSelectedGrade();
    syncPromptSelectionToCurrentQueueItem();
  });
  $("#bookSelect").addEventListener("change", () => {
    populateUnitSelect();
    renderPrompt();
    syncPromptSelectionToCurrentQueueItem();
  });
  $("#unitSelect").addEventListener("change", () => {
    renderPrompt();
    syncPromptSelectionToCurrentQueueItem();
  });
  $("#currentStudentTitle").addEventListener("input", handleStudentTitleInput);
  $("#essayInput").addEventListener("input", handleEssayTextInput);
  $("#generateButton").addEventListener("click", startCurrentTaskGrading);
  $("#newTaskButton").addEventListener("click", createNewTextTask);
  $("#teacherProfileSelect")?.addEventListener("change", handleTeacherProfileChange);
  $("#renameTeacherProfileButton")?.addEventListener("click", renameCurrentTeacherProfile);
  $("#toggleTaskPanelButton").addEventListener("click", toggleTaskPanel);
  $("#closeTaskPanelButton").addEventListener("click", closeTaskPanel);
  $("#taskPanelScrim").addEventListener("click", closeTaskPanel);
  $$("[data-task-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.taskFilter = button.dataset.taskFilter || "all";
      renderQueue();
    });
  });
  $("#clearButton").addEventListener("click", () => {
    $("#essayInput").value = "";
    state.currentImages = [];
    state.ocrText = "";
    state.currentReport = null;
    syncCurrentQueueItem({
      essay: "",
      ocrText: "",
      imageData: [],
      imageMeta: [],
      images: 0,
      ocrPages: [],
      ocrStatus: "pending",
      report: null
    }, { immediate: true });
    renderImageWorkspace();
    renderQueue();
    setOcrStatus("", "");
    updateCharCount();
  });
  $("#clearQueueButton").addEventListener("click", clearAllQueueItems);
  $("#printButton").addEventListener("click", printReportAsPdf);
  $("#toggleEditButton").addEventListener("click", toggleEditMode);
  $("#reportPaper").addEventListener("mousedown", handlePolishFormatButton);
  $("#reportPaper").addEventListener("input", handleEditableReportInput);
  window.addEventListener("pagehide", persistCurrentQueueItemOnPageHide);
  document.addEventListener("visibilitychange", handleQueuePollingVisibilityChange);
  $("#toggleRequirementEditor").addEventListener("click", () => {
    if (state.customPrompt.active) {
      setGradingStatus("自定义题目可直接在下方修改要求", "pending");
      return;
    }
    const editor = $("#requirementEditor");
    editor.hidden = !editor.hidden;
    renderRequirementEditor();
  });
  $("#toggleCustomPromptButton").addEventListener("click", toggleCustomPromptMode);
  [
    "#customPromptTitleInput",
    "#customPromptGradeInput",
    "#customPromptBookInput",
    "#customPromptUnitInput",
    "#customPromptRequirementsInput"
  ].forEach((selector) => {
    $(selector).addEventListener("input", handleCustomPromptInput);
  });
  $("#addRequirementButton").addEventListener("click", () => {
    const prompt = getCurrentPrompt();
    prompt.requirements.push("新的写作要求");
    renderRequirementEditor();
    renderPrompt();
  });
  $("#saveRequirementButton").addEventListener("click", saveRequirementConfig);
  $("#gradingHintInput").addEventListener("input", () => {
    state.gradingHint = $("#gradingHintInput").value;
    window.localStorage.setItem(GRADING_HINT_STORAGE_KEY, state.gradingHint);
    syncCurrentQueueItem({ gradingHint: state.gradingHint });
  });
  $("#resetGradingHintButton").addEventListener("click", () => {
    const defaultHint = getDefaultGradingHintForGrade();
    state.gradingHint = defaultHint;
    $("#gradingHintInput").value = defaultHint;
    window.localStorage.removeItem(GRADING_HINT_STORAGE_KEY);
    syncCurrentQueueItem({ gradingHint: defaultHint });
    setGradingStatus("已恢复默认批改提示", "success");
  });
  $("#imageInput").addEventListener("change", handleImageUpload);
  $("#providerSelect").addEventListener("change", handleProviderChange);
  $("#modelSelect").addEventListener("change", () => {
    const previousModel = state.modelConfig.model;
    const nextModel = $("#modelSelect").value;
    if (state.modelConfig.routes?.grading === previousModel) state.modelConfig.routes.grading = nextModel;
    if (state.modelConfig.routes?.polish === previousModel) state.modelConfig.routes.polish = nextModel;
    state.modelConfig.model = nextModel;
    renderModelOptions();
    updateActiveModelUI();
  });
  $("#testModelButton").addEventListener("click", testModelConnection);
  $("#saveModelButton").addEventListener("click", saveModelConfig);

  $$(".nav-item[data-panel]").forEach((button) => {
    button.addEventListener("click", () => switchPanel(button.dataset.panel));
  });
  $$(".tab-button").forEach((button) => {
    button.addEventListener("click", () => switchReportTab(button.dataset.reportTab));
  });
}

async function createNewTextTask() {
  syncEssayTextToCurrentQueueItem();
  await flushAutosavesBeforeGrading();
  state.customPrompt = createDefaultCustomPrompt(false);
  state.currentImages = [];
  state.ocrText = "";
  state.currentReport = null;
  const item = createLocalQueueDraft({
    student: "未命名学生",
    essay: "",
    ocrText: "",
    imageData: [],
    gradingHint: getSavedDefaultGradingHint(),
    customPrompt: state.customPrompt,
    report: null,
    status: "draft"
  });
  applyQueueItemToWorkspace(item);
  setCurrentStudentTitle("");
  state.gradingHint = item.gradingHint;
  $("#gradingHintInput").value = item.gradingHint;
  syncCurrentQueueItem({
    student: "未命名学生",
    gradingHint: item.gradingHint,
    status: "draft"
  }, { immediate: true });
  setGradingStatus("已新建独立作文任务", "success");
  closeTaskPanelForWorkspace();
  $("#essayInput")?.focus();
}

function toggleTaskPanel() {
  const narrow = window.matchMedia("(max-width: 1120px)").matches;
  if (narrow) {
    document.body.classList.toggle("task-panel-open");
  } else {
    document.body.classList.toggle("task-panel-collapsed");
  }
  syncTaskPanelControls();
}

function closeTaskPanel() {
  if (window.matchMedia("(max-width: 1120px)").matches) {
    document.body.classList.remove("task-panel-open");
  } else {
    document.body.classList.add("task-panel-collapsed");
  }
  syncTaskPanelControls();
}

function closeTaskPanelForWorkspace() {
  if (!window.matchMedia("(max-width: 1120px)").matches) return;
  document.body.classList.remove("task-panel-open");
  syncTaskPanelControls();
}

function syncTaskPanelControls() {
  const narrow = window.matchMedia("(max-width: 1120px)").matches;
  const expanded = narrow
    ? document.body.classList.contains("task-panel-open")
    : !document.body.classList.contains("task-panel-collapsed");
  $("#toggleTaskPanelButton")?.setAttribute("aria-expanded", String(expanded));
  $("#closeTaskPanelButton")?.setAttribute("title", narrow ? "关闭任务列表" : "收起任务列表");
}

async function startCurrentTaskGrading() {
  syncEssayTextToCurrentQueueItem();
  if (!ensurePromptReadyForReport() || !ensureEssayReadyForReport()) return;
  await flushAutosavesBeforeGrading();
  const item = getCurrentQueueItem();
  if (!item) {
    setGradingStatus("任务保存失败，请稍后重试", "pending");
    return;
  }
  const taskId = item.id;
  if (state.gradingJobs.has(taskId)) {
    setGradingStatus("这个任务正在批改，可以先处理其他作文", "pending");
    return;
  }

  const request = buildTaskGradingRequest(item);
  item.status = "grading";
  item.gradingError = "";
  state.gradingJobs.set(taskId, { startedAt: Date.now() });
  scheduleQueueAutosave(taskId, { status: "grading", gradingError: "" }, true);
  renderQueue();
  updateGenerateButtonState();
  setGradingStatus("正在批改；可以新建或切换到其他任务继续提交", "pending");

  try {
    const report = await createReportForTask(request);
    const target = queueItems.find((entry) => entry.id === taskId);
    const essayChangedDuringGrading = Boolean(target && String(target.essay || "").trim() !== request.essay.trim());
    if (essayChangedDuringGrading) {
      target.report = null;
      target.status = "draft";
      target.gradingError = "";
      scheduleQueueAutosave(taskId, { report: null, status: "draft", gradingError: "" }, true);
      if (state.currentQueueId === taskId) {
        state.currentReport = null;
        renderEmptyReport();
        setGradingStatus("批改期间正文发生了修改，请按最新内容重新批改", "pending");
      }
      return;
    }
    if (target) {
      report.sourceImages = normalizeClientImages(target.imageData || []);
      target.report = report;
      target.status = "done";
      target.gradingError = "";
      target.gradingHint = request.customInstructions;
    }
    if (state.currentQueueId === taskId) {
      state.currentReport = report;
      renderReport(report);
      setGradingStatus("批改完成", "success");
    }
  } catch (error) {
    const message = error.message || "批改失败";
    const target = queueItems.find((entry) => entry.id === taskId);
    if (target) {
      target.status = "failed";
      target.gradingError = message;
      scheduleQueueAutosave(taskId, { status: "failed", gradingError: message }, true);
    }
    if (state.currentQueueId === taskId) setGradingStatus(message, "pending");
  } finally {
    state.gradingJobs.delete(taskId);
    renderQueue();
    updateGenerateButtonState();
  }
}

async function flushAutosavesBeforeGrading() {
  await flushQueueAutosaves();
  const deadline = Date.now() + 15000;
  while (state.autosaveInFlight && Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 60));
  }
  if (Object.keys(state.autosaveItems).length) await flushQueueAutosaves();
}

function buildTaskGradingRequest(item) {
  const prompt = JSON.parse(JSON.stringify(getCurrentPrompt()));
  return {
    queueId: item.id,
    student: getCurrentStudentName(item),
    prompt,
    essay: getEssayForReport(),
    customInstructions: getGradingHintForReport()
  };
}

function updateGenerateButtonState() {
  const button = $("#generateButton");
  if (!button) return;
  const running = Boolean(state.currentQueueId && state.gradingJobs.has(state.currentQueueId));
  button.disabled = running;
  button.textContent = running ? "批改中" : "批改";
}

function printReportAsPdf() {
  const reportPaper = $("#reportPaper");
  if (!reportPaper || !state.currentReport) {
    setGradingStatus("请先批改生成报告", "pending");
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.className = "print-frame";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const stylesheetHref = new URL("styles.css", window.location.href).href;
  const reportClone = reportPaper.cloneNode(true);
  reportClone.querySelectorAll("[contenteditable]").forEach((node) => {
    node.removeAttribute("contenteditable");
  });

  doc.open();
  doc.write(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title></title>
        <base href="${window.location.href}" />
        <link id="printStylesheet" rel="stylesheet" href="${stylesheetHref}" />
      </head>
      <body class="print-export-body">
        ${reportClone.outerHTML}
      </body>
    </html>
  `);
  doc.close();

  let didPrint = false;
  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 1200);
  };
  const runPrint = () => {
    if (didPrint) return;
    didPrint = true;
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    cleanup();
  };

  const stylesheet = doc.getElementById("printStylesheet");
  if (stylesheet) {
    stylesheet.addEventListener("load", () => window.setTimeout(runPrint, 80), { once: true });
    stylesheet.addEventListener("error", () => window.setTimeout(runPrint, 80), { once: true });
  }
  window.setTimeout(runPrint, 900);
}

window.printReportAsPdf = printReportAsPdf;

async function loadBackendBootstrap() {
  try {
    const data = await apiRequest("/api/bootstrap");
    state.runtime = data.runtime || null;
    await handleBackendRuntimeSession(data.runtime);
    if (Array.isArray(data.promptLibrary)) {
      promptLibrary.splice(0, promptLibrary.length, ...data.promptLibrary);
    }
    if (Array.isArray(data.modelProviders)) {
      modelProviders.splice(0, modelProviders.length, ...data.modelProviders);
    }
    if (Array.isArray(data.queueItems)) {
      queueItems.splice(0, queueItems.length, ...data.queueItems);
    }
    if (Array.isArray(data.teacherProfiles) && data.teacherProfiles.length) {
      state.teacherProfiles = data.teacherProfiles;
    }
    state.teacherId = data.activeTeacherId || state.teacherId || state.teacherProfiles[0]?.id || "teacher-1";
    state.taskRetentionDays = Number(data.runtime?.taskRetentionDays || DEFAULT_TASK_RETENTION_DAYS);
    saveStoredTeacherId(state.teacherId);
    if (data.modelConfig) {
      state.modelConfig = {
        ...state.modelConfig,
        ...data.modelConfig,
        apiKey: ""
      };
      normalizeModelConfigAliases();
    }
    state.backendAvailable = true;
  } catch (error) {
    state.backendAvailable = false;
  }
}

async function handleBackendRuntimeSession(runtime) {
  if (!runtime?.sessionId) return;
  let previousSessionId = "";
  try {
    previousSessionId = window.localStorage.getItem(APP_RUNTIME_STORAGE_KEY) || "";
  } catch (error) {
    previousSessionId = "";
  }
  const isNewResetSession = Boolean(runtime.resetOnStart && previousSessionId !== runtime.sessionId);
  if (isNewResetSession) {
    await clearCaptureDraft();
  }
  try {
    window.localStorage.setItem(APP_RUNTIME_STORAGE_KEY, runtime.sessionId);
  } catch (error) {
    // Ignore storage failures; backend workspace reset is still authoritative.
  }
}

async function loadNetworkInfo() {
  try {
    const info = await apiRequest("/api/network-info");
    state.networkInfo = API_BASE_URL
      ? {
          ...info,
          captureUrl: new URL("capture.html", window.location.href).href,
          captureUrls: [new URL("capture.html", window.location.href).href]
        }
      : info;
    renderCaptureShareInfo();
    renderCaptureConnectionInfo();
  } catch (error) {
    state.networkInfo = null;
    renderCaptureShareInfo();
    renderCaptureConnectionInfo(false);
  }
}

function renderCaptureShareInfo() {
  const chip = $("#captureShareChip");
  const urlNode = $("#captureShareUrl");
  if (!chip || !urlNode) return;
  const captureUrl = state.networkInfo?.captureUrl || "";
  chip.hidden = !captureUrl;
  urlNode.textContent = captureUrl;
}

function renderCaptureConnectionInfo(connected = Boolean(state.networkInfo?.captureUrl)) {
  const node = $("#captureConnection");
  if (!node) return;
  node.hidden = false;
  const captureUrl = state.networkInfo?.captureUrl || "";
  node.className = `capture-connection ${connected ? "success" : "pending"}`;
  node.innerHTML = connected
    ? `已连接 Web 服务<br><code>${escapeHTML(captureUrl)}</code>`
    : "未连接到 Web 服务，请确认电脑端服务正在运行";
}

async function copyCaptureUrl() {
  if (!state.networkInfo?.captureUrl) {
    await loadNetworkInfo();
  }
  const captureUrl = state.networkInfo?.captureUrl || $("#captureShareUrl")?.textContent || "";
  if (!captureUrl) {
    setOcrStatus("手机访问地址还没有加载出来", "pending");
    return;
  }
  const button = $("#copyCaptureUrlButton");
  const previousText = button?.textContent || "复制";
  let copied = false;
  try {
    if (button) {
      button.disabled = true;
      button.textContent = "复制中";
    }
    await copyTextToClipboard(captureUrl);
    copied = true;
    setOcrStatus("手机拍照页地址已复制", "success");
  } catch (error) {
    if (window.prompt) {
      window.prompt("请复制手机拍照页地址", captureUrl);
    }
    setOcrStatus(`请手动复制：${captureUrl}`, "pending");
  } finally {
    if (button) {
      button.textContent = copied ? "已复制" : previousText;
      window.setTimeout(() => {
        button.textContent = previousText;
        button.disabled = false;
      }, 1200);
    }
  }
}

async function copyAiRecognitionPrompt() {
  const button = $("#copyAiRecognitionPromptButton");
  const label = button?.querySelector("span");
  if (!button || !label) return;
  const previousText = label.textContent;
  let copied = false;
  try {
    button.disabled = true;
    await copyTextToClipboard(AI_RECOGNITION_PROMPT);
    copied = true;
    button.classList.add("copied");
    label.textContent = "已复制";
    setGradingStatus("AI 识别提示语已复制", "success");
  } catch (error) {
    window.prompt?.("请复制 AI 识别提示语", AI_RECOGNITION_PROMPT);
  } finally {
    window.setTimeout(() => {
      label.textContent = previousText;
      button.classList.remove("copied");
      button.disabled = false;
    }, copied ? 1400 : 0);
  }
}

function startQueuePolling() {
  if (state.queuePollTimer || document.visibilityState !== "visible") return;
  state.queuePollTimer = window.setInterval(refreshQueueFromBackend, QUEUE_POLL_INTERVAL_MS);
}

function stopQueuePolling() {
  if (!state.queuePollTimer) return;
  window.clearInterval(state.queuePollTimer);
  state.queuePollTimer = 0;
}

function handleQueuePollingVisibilityChange() {
  if (document.visibilityState === "hidden") {
    stopQueuePolling();
    return;
  }
  refreshQueueFromBackend();
  startQueuePolling();
}

async function refreshQueueFromBackend() {
  if (document.visibilityState !== "visible" || state.queueRefreshInFlight) return;
  const requestedTeacherId = state.teacherId;
  state.queueRefreshInFlight = true;
  try {
    const items = await apiRequest("/api/submissions");
    if (requestedTeacherId !== state.teacherId || state.switchingTeacher) return;
    mergeQueueFromServer(Array.isArray(items) ? items : []);
    state.backendAvailable = true;
  } catch (error) {
    state.backendAvailable = false;
  } finally {
    state.queueRefreshInFlight = false;
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("copy_failed");
  }
}

function mergeQueueFromServer(serverItems) {
  const previousLength = queueItems.length;
  const previousIds = new Set(queueItems.map((item) => item.id));
  const currentLocal = queueItems.find((item) => item.id === state.currentQueueId);
  const currentStillExists = serverItems.some((item) => item.id === state.currentQueueId);
  const newServerItems = serverItems.filter((item) => !previousIds.has(item.id));
  const newCount = newServerItems.length;
  const incomingItem = newServerItems[0] || null;
  const shouldOpenIncomingItem = shouldAutoOpenIncomingSubmission(currentLocal, currentStillExists, incomingItem);
  const localDrafts = queueItems.filter((item) => item.id?.startsWith?.(LOCAL_DRAFT_ID_PREFIX));
  const normalized = serverItems.map((item) => {
    if (item.id !== state.currentQueueId || !currentLocal) return item;
    const serverFinished = item.status === "done" && item.report;
    return {
      ...item,
      essay: $("#essayInput")?.value || currentLocal.essay || item.essay || "",
      ocrText: state.ocrText || currentLocal.ocrText || item.ocrText || "",
      gradingHint: $("#gradingHintInput")?.value || currentLocal.gradingHint || item.gradingHint || "",
      report: serverFinished ? item.report : (state.currentReport || currentLocal.report || item.report || null),
      imageData: normalizeClientImages(item.imageData || []).length
        ? normalizeClientImages(item.imageData)
        : normalizeClientImages(currentLocal.imageData || state.currentImages || []),
      imageMeta: Array.isArray(item.imageMeta) && item.imageMeta.length
        ? item.imageMeta
        : (currentLocal.imageMeta || normalizeClientImages(currentLocal.imageData || state.currentImages || []).map(toClientImageMeta)),
      images: Number(item.images || currentLocal.images || normalizeClientImages(currentLocal.imageData || state.currentImages || []).length || 0)
    };
  });
  const hadCurrent = Boolean(state.currentQueueId);
  queueItems.splice(0, queueItems.length, ...localDrafts, ...normalized);
  if (!queueItems.length) {
    if (previousLength) {
      renderAfterQueueRemoval(true, 0);
    } else {
      renderQueue();
    }
    return;
  }
  if (shouldOpenIncomingItem) {
    loadQueueItem(incomingItem.id);
  } else if (!hadCurrent || !currentStillExists) {
    loadQueueItem(queueItems[0].id);
  } else if (!state.gradingJobs.has(state.currentQueueId)) {
    const refreshedCurrent = queueItems.find((item) => item.id === state.currentQueueId);
    const reportChanged = refreshedCurrent?.report?.id && refreshedCurrent.report.id !== state.currentReport?.id;
    const failureChanged = refreshedCurrent?.status === "failed" && refreshedCurrent.gradingError;
    if (reportChanged || failureChanged) applyQueueItemToWorkspace(refreshedCurrent);
    else renderQueue();
  } else {
    renderQueue();
  }
  if (newCount > 0) {
    setGradingStatus(`已同步 ${newCount} 个新任务`, "success");
  }
}

function shouldAutoOpenIncomingSubmission(currentLocal, currentStillExists, incomingItem) {
  if (!incomingItem) return false;
  if (!state.currentQueueId || !currentLocal) return true;
  if (currentLocal.id?.startsWith?.(LOCAL_DRAFT_ID_PREFIX)) return true;
  if (!currentStillExists) return true;
  const currentText = String(currentLocal.essay || currentLocal.ocrText || $("#essayInput")?.value || "").trim();
  const currentImages = normalizeClientImages(currentLocal.imageData || state.currentImages || []);
  return !currentText && !currentImages.length && !currentLocal.report;
}

async function apiRequest(path, options = {}) {
  const authorization = readApiAuthorization();
  const response = await fetch(buildApiUrl(path), {
    method: options.method || "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(authorization ? { Authorization: authorization } : {}),
      ...(state.teacherId ? { "X-Teacher-Id": state.teacherId } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (response.status === 401 && options.retryAuth !== false) {
    clearApiAuthorization();
    await requestApiCredentials();
    return apiRequest(path, { ...options, retryAuth: false });
  }
  if (!response.ok) {
    const raw = await response.text();
    let message = raw;
    try {
      const payload = raw ? JSON.parse(raw) : {};
      message = payload.message || payload.error || raw;
    } catch (error) {
      message = raw;
    }
    throw new Error(message || `API error ${response.status}`);
  }
  return response.json();
}

function buildApiUrl(path) {
  if (!API_BASE_URL || !String(path).startsWith("/api/")) return path;
  return `${API_BASE_URL}${path}`;
}

function readApiAuthorization() {
  try {
    return window.sessionStorage.getItem(API_AUTH_SESSION_KEY) || "";
  } catch (error) {
    return "";
  }
}

function saveApiAuthorization(value) {
  try {
    window.sessionStorage.setItem(API_AUTH_SESSION_KEY, value);
  } catch (error) {
    // The current tab can continue even when session storage is unavailable.
  }
}

function clearApiAuthorization() {
  try {
    window.sessionStorage.removeItem(API_AUTH_SESSION_KEY);
  } catch (error) {
    // Ignore storage failures.
  }
}

function readStoredTeacherId() {
  try {
    return window.localStorage.getItem(TEACHER_PROFILE_STORAGE_KEY) || "teacher-1";
  } catch (error) {
    return "teacher-1";
  }
}

function saveStoredTeacherId(teacherId) {
  try {
    window.localStorage.setItem(TEACHER_PROFILE_STORAGE_KEY, teacherId);
  } catch (error) {
    // The current tab can continue without remembering the selected teacher.
  }
}

function encodeBasicAuthorization(username, password) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return `Basic ${window.btoa(binary)}`;
}

function requestApiCredentials() {
  if (state.apiLoginPromise) return state.apiLoginPromise;
  state.apiLoginPromise = new Promise((resolve, reject) => {
    const overlay = document.createElement("div");
    overlay.className = "cloud-login-overlay";
    overlay.innerHTML = `
      <form class="cloud-login-dialog" aria-label="教师登录">
        <div>
          <p class="eyebrow">云端批改台</p>
          <h2>教师登录</h2>
        </div>
        <label>
          用户名
          <input name="username" type="text" value="teacher" autocomplete="username" required />
        </label>
        <label>
          密码
          <input name="password" type="password" autocomplete="current-password" required autofocus />
        </label>
        <p class="cloud-login-note">账号只保留在当前浏览器标签页，关闭后需要重新登录。</p>
        <div class="cloud-login-actions">
          <button class="primary-button" type="submit">登录</button>
        </div>
      </form>
    `;
    const form = overlay.querySelector("form");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const username = String(data.get("username") || "teacher").trim();
      const password = String(data.get("password") || "");
      if (!password) return;
      saveApiAuthorization(encodeBasicAuthorization(username, password));
      overlay.remove();
      resolve();
    });
    document.body.appendChild(overlay);
    window.setTimeout(() => overlay.querySelector('input[name="password"]')?.focus(), 0);
  }).finally(() => {
    state.apiLoginPromise = null;
  });
  return state.apiLoginPromise;
}

function usesDirectOssUploads() {
  return Boolean(state.runtime?.storage?.directUploads);
}

async function ensureCloudImagesUploaded(images) {
  const normalized = normalizeClientImages(images || []);
  if (!usesDirectOssUploads()) return normalized;
  const pending = normalized.filter((image) => !image.storageKey && isImageDataUrl(image.dataUrl));
  if (!pending.length) return normalized;

  const result = await apiRequest("/api/uploads/presign", {
    method: "POST",
    body: {
      files: pending.map((image) => ({
        id: image.id,
        name: image.name,
        type: image.type,
        size: image.size,
        previewSize: image.previewSize
      }))
    }
  });
  if (!result.enabled || !Array.isArray(result.uploads) || result.uploads.length !== pending.length) {
    throw new Error("OSS 临时上传授权生成失败");
  }

  const slotsById = new Map(result.uploads.map((slot) => [slot.id, slot]));
  await runWithConcurrency(pending, 2, async (image) => {
    const slot = slotsById.get(image.id);
    if (!slot?.uploadUrl || !slot?.previewUploadUrl) throw new Error("OSS 上传地址不完整");
    await uploadDataUrlToSignedUrl(image.dataUrl, slot.uploadUrl);
    await uploadDataUrlToSignedUrl(isImageDataUrl(image.previewDataUrl) ? image.previewDataUrl : image.dataUrl, slot.previewUploadUrl);
    image.storageKey = slot.storageKey;
    image.previewStorageKey = slot.previewStorageKey;
  });
  return normalized;
}

async function uploadDataUrlToSignedUrl(dataUrl, uploadUrl) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: dataUrlToBlob(dataUrl)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`作文图片上传 OSS 失败（${response.status}）${detail ? `：${detail.slice(0, 120)}` : ""}`);
  }
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = String(dataUrl || "").split(",", 2);
  const mimeType = header.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
  const binary = window.atob(encoded || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

async function runWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(runners);
}

function serializeImagesForApi(images) {
  return normalizeClientImages(images || []).map((image) => {
    if (!image.storageKey) return image;
    return {
      ...image,
      dataUrl: "",
      previewDataUrl: ""
    };
  });
}

function initModelConfig() {
  normalizeModelConfigAliases();
  $("#providerSelect").innerHTML = llmProviders().map((provider) => `<option value="${provider.id}">${provider.name}</option>`).join("");
  $("#providerSelect").value = state.modelConfig.provider;
  renderModelOptions();
  updateActiveModelUI();
}

function handleProviderChange() {
  const selectedProviderId = $("#providerSelect").value;
  const provider = llmProviders().find((item) => item.id === selectedProviderId) || llmProviders()[0];
  const textModels = textModelsForProvider(provider);
  state.modelConfig.provider = provider.id;
  state.modelConfig.model = textModels[0] || provider.models[0];
  state.modelConfig.baseUrl = provider.baseUrl;
  state.modelConfig.routes = {
    ocr: state.modelConfig.ocrModel || "gpt-4.1-mini",
    grading: state.modelConfig.model,
    polish: state.modelConfig.model
  };
  renderModelOptions();
  updateActiveModelUI();
}

function handleOcrProviderChange() {
  const provider = getSelectedOcrProvider();
  state.modelConfig.ocrProvider = provider.id;
  state.modelConfig.ocrModel = preferredClientOcrModel(provider);
  state.modelConfig.ocrBaseUrl = provider.baseUrl;
  renderOcrModelOptions();
  updateOcrModelStatus();
}

function handleOcrJudgeProviderChange() {
  const provider = getSelectedOcrJudgeProvider();
  state.modelConfig.ocrJudgeProvider = provider.id;
  state.modelConfig.ocrJudgeModel = preferredClientJudgeModel(provider);
  state.modelConfig.ocrJudgeBaseUrl = provider.baseUrl;
  renderOcrJudgeOptions();
  updateOcrModelStatus();
}

function renderModelOptions() {
  const provider = getSelectedProvider();
  if (provider.id === "deepseek") {
    state.modelConfig.model = normalizeDeepSeekModelAlias(state.modelConfig.model);
  }
  const textModels = textModelsForProvider(provider);
  const mainModel = textModels.includes(state.modelConfig.model) ? state.modelConfig.model : textModels[0] || provider.models[0];
  state.modelConfig.model = mainModel;
  state.modelConfig.routes = state.modelConfig.routes || {};
  state.modelConfig.routes.grading = normalizeRouteModelAlias(provider.id, state.modelConfig.routes.grading);
  state.modelConfig.routes.polish = normalizeRouteModelAlias(provider.id, state.modelConfig.routes.polish);
  $("#modelSelect").innerHTML = textModels.map((model) => `<option value="${model}">${model}</option>`).join("");
  $("#modelSelect").value = mainModel;
  $("#apiModeSelect").value = state.modelConfig.apiMode;
  $("#baseUrlInput").value = state.modelConfig.baseUrl || provider.baseUrl;
  $("#apiKeyInput").value = state.modelConfig.apiKey;
  $("#apiKeyInput").disabled = Boolean(state.modelConfig.serverManagedKeys);
  $("#apiKeyInput").placeholder = state.modelConfig.serverManagedKeys
    ? (state.modelConfig.apiKeySet ? "已由云端环境变量配置" : "请在云端配置 MODEL_API_KEY")
    : "sk-... 仅原型本地展示";
  $("#allowInsecureTlsInput").checked = Boolean(state.modelConfig.allowInsecureTls);
  renderRouteSelect("#gradingModelRoute", state.modelConfig.routes.grading, textModels, mainModel);
  renderRouteSelect("#polishModelRoute", state.modelConfig.routes.polish, textModels, mainModel);
  updateAdvancedRouteState(provider, mainModel);
}

function renderOcrModelOptions() {
  const provider = getSelectedOcrProvider();
  const visionModels = visionModelsForProvider(provider);
  $("#ocrProviderSelect").value = provider.id;
  $("#ocrModeSelect").value = state.modelConfig.ocrMode || "enhanced";
  $("#ocrDedicatedModelSelect").innerHTML = visionModels.map((model) => `<option value="${model}">${model}</option>`).join("");
  $("#ocrDedicatedModelSelect").value = visionModels.includes(state.modelConfig.ocrModel)
    ? state.modelConfig.ocrModel
    : preferredClientOcrModel(provider);
  state.modelConfig.ocrModel = $("#ocrDedicatedModelSelect").value;
  $("#ocrBaseUrlInput").value = state.modelConfig.ocrBaseUrl || provider.baseUrl;
  $("#ocrApiKeyInput").value = state.modelConfig.ocrApiKey || "";
  $("#ocrApiKeyInput").disabled = Boolean(state.modelConfig.serverManagedKeys);
  $("#ocrApiKeyInput").placeholder = state.modelConfig.serverManagedKeys
    ? (state.modelConfig.ocrApiKeySet ? "已由云端环境变量配置" : "请在云端配置 VISION_API_KEY")
    : (provider.id === state.modelConfig.provider ? `留空时复用主 ${provider.name} Key` : `${provider.name} API Key`);
  $("#ocrAllowInsecureTlsInput").checked = Boolean(state.modelConfig.ocrAllowInsecureTls);
}

function renderOcrJudgeOptions() {
  const provider = getSelectedOcrJudgeProvider();
  const textModels = textModelsForProvider(provider);
  if (provider.id === "deepseek") {
    state.modelConfig.ocrJudgeModel = normalizeDeepSeekModelAlias(state.modelConfig.ocrJudgeModel);
  }
  $("#ocrJudgeProviderSelect").value = provider.id;
  $("#ocrJudgeModelSelect").innerHTML = textModels.map((model) => `<option value="${model}">${model}</option>`).join("");
  $("#ocrJudgeModelSelect").value = textModels.includes(state.modelConfig.ocrJudgeModel)
    ? state.modelConfig.ocrJudgeModel
    : preferredClientJudgeModel(provider);
  state.modelConfig.ocrJudgeModel = $("#ocrJudgeModelSelect").value;
  $("#ocrJudgeBaseUrlInput").value = state.modelConfig.ocrJudgeBaseUrl || provider.baseUrl;
  $("#ocrJudgeApiKeyInput").value = state.modelConfig.ocrJudgeApiKey || "";
  $("#ocrJudgeApiKeyInput").disabled = Boolean(state.modelConfig.serverManagedKeys);
  $("#ocrJudgeApiKeyInput").placeholder = state.modelConfig.serverManagedKeys
    ? (state.modelConfig.ocrJudgeApiKeySet ? "已由云端环境变量配置" : "请在云端配置 JUDGE_API_KEY")
    : `${provider.name} API Key`;
  $("#ocrJudgeAllowInsecureTlsInput").checked = Boolean(state.modelConfig.ocrJudgeAllowInsecureTls);
}

function renderRouteSelect(selector, selected, models, mainModel) {
  const select = $(selector);
  select.innerHTML = [
    `<option value="${ROUTE_FOLLOW_VALUE}">跟随主模型（${escapeHTML(mainModel)}）</option>`,
    ...models
      .filter((model) => model !== mainModel)
      .map((model) => `<option value="${model}">${model}</option>`)
  ].join("");
  select.value = models.includes(selected) && selected !== mainModel ? selected : ROUTE_FOLLOW_VALUE;
}

function updateAdvancedRouteState(provider, mainModel) {
  const box = $("#advancedRouteBox");
  if (!box) return;
  const routes = state.modelConfig.routes || {};
  const textModels = textModelsForProvider(provider);
  const hasCustomRoute = [routes.grading, routes.polish].some((route) => textModels.includes(route) && route !== mainModel);
  box.open = hasCustomRoute;
}

async function saveModelConfig() {
  const selectedProviderId = $("#providerSelect").value;
  const provider = llmProviders().find((item) => item.id === selectedProviderId) || llmProviders()[0];
  const textModels = textModelsForProvider(provider);
  const providerChanged = selectedProviderId !== state.modelConfig.provider;
  const selectedModel = textModels.includes($("#modelSelect").value) ? $("#modelSelect").value : textModels[0] || provider.models[0];
  const routeValue = (selector, fallback) => {
    const raw = $(selector).value;
    if (raw === ROUTE_FOLLOW_VALUE) return selectedModel;
    return textModels.includes(raw) ? raw : fallback;
  };
  const inputBaseUrl = $("#baseUrlInput").value.trim();
  state.modelConfig = {
    ...state.modelConfig,
    provider: selectedProviderId,
    model: selectedModel,
    apiMode: $("#apiModeSelect").value,
    baseUrl: providerChanged && !inputBaseUrl ? provider.baseUrl : (inputBaseUrl || provider.baseUrl),
    apiKey: $("#apiKeyInput").value.trim(),
    allowInsecureTls: $("#allowInsecureTlsInput").checked,
    routes: {
      ocr: state.modelConfig.routes?.ocr || state.modelConfig.ocrModel || "",
      grading: routeValue("#gradingModelRoute", selectedModel),
      polish: routeValue("#polishModelRoute", selectedModel)
    }
  };
  if (state.backendAvailable) {
    try {
      const saved = await apiRequest("/api/model-config", {
        method: "PUT",
        body: state.modelConfig
      });
      state.modelConfig = {
        ...state.modelConfig,
        ...saved,
        apiKey: ""
      };
    } catch (error) {
      $("#modelStatus").textContent = "保存失败";
      $("#modelStatus").className = "status-chip pending";
      return;
    }
  }
  renderModelOptions();
  $("#modelStatus").textContent = "已保存";
  $("#modelStatus").className = "status-chip success";
  updateActiveModelUI();
  if (state.currentReport) {
    $("#modelStatus").textContent = "已保存，请重新批改";
    $("#modelStatus").className = "status-chip success";
  }
}

async function testModelConnection() {
  if (state.backendAvailable) {
    try {
      await apiRequest("/api/model-config/test", {
        method: "POST",
        body: {
          provider: $("#providerSelect").value,
          model: $("#modelSelect").value,
          apiMode: $("#apiModeSelect").value,
          baseUrl: $("#baseUrlInput").value.trim(),
          apiKey: $("#apiKeyInput").value.trim(),
          allowInsecureTls: $("#allowInsecureTlsInput").checked
        }
      });
    } catch (error) {
      $("#modelStatus").textContent = error.message || "连接失败";
      $("#modelStatus").className = "status-chip pending";
      return;
    }
  }
  $("#modelStatus").textContent = "连接正常";
  $("#modelStatus").className = "status-chip success";
}

async function testOcrModelConnection() {
  if (state.backendAvailable) {
    try {
      await apiRequest("/api/model-config/test", {
        method: "POST",
        body: {
          scope: "ocr",
          provider: $("#providerSelect").value,
          apiKey: $("#apiKeyInput").value.trim(),
          ocrProvider: $("#ocrProviderSelect").value,
          ocrModel: $("#ocrDedicatedModelSelect").value,
          ocrBaseUrl: $("#ocrBaseUrlInput").value.trim(),
          ocrApiKey: $("#ocrApiKeyInput").value.trim(),
          ocrAllowInsecureTls: $("#ocrAllowInsecureTlsInput").checked
        }
      });
    } catch (error) {
      $("#ocrModelStatus").textContent = error.message || "视觉连接失败";
      $("#ocrModelStatus").className = "status-chip pending";
      return;
    }
  }
  $("#ocrModelStatus").textContent = "视觉连接正常";
  $("#ocrModelStatus").className = "status-chip success";
}

async function testOcrJudgeConnection() {
  if (state.backendAvailable) {
    try {
      await apiRequest("/api/model-config/test", {
        method: "POST",
        body: {
          scope: "ocrJudge",
          ocrJudgeProvider: $("#ocrJudgeProviderSelect").value,
          ocrJudgeModel: $("#ocrJudgeModelSelect").value,
          ocrJudgeBaseUrl: $("#ocrJudgeBaseUrlInput").value.trim(),
          ocrJudgeApiKey: $("#ocrJudgeApiKeyInput").value.trim(),
          ocrJudgeAllowInsecureTls: $("#ocrJudgeAllowInsecureTlsInput").checked
        }
      });
    } catch (error) {
      $("#ocrModelStatus").textContent = error.message || "校对连接失败";
      $("#ocrModelStatus").className = "status-chip pending";
      return;
    }
  }
  $("#ocrModelStatus").textContent = "校对连接正常";
  $("#ocrModelStatus").className = "status-chip success";
}

function updateActiveModelUI() {
  const provider = getSelectedProvider();
  const modelName = state.modelConfig.model || provider.models[0];
  $("#activeModelPill").textContent = `${provider.name} · ${modelName}`;
}

function updateOcrModelStatus() {
  const provider = getSelectedOcrProvider();
  const model = $("#ocrDedicatedModelSelect")?.value || state.modelConfig.ocrModel || provider.models[0];
  const supportsVision = providerSupportsClientVision(provider.id, model);
  const judgeProvider = getSelectedOcrJudgeProvider();
  const judgeModel = $("#ocrJudgeModelSelect")?.value || state.modelConfig.ocrJudgeModel || judgeProvider.models[0];
  const enhanced = ($("#ocrModeSelect")?.value || state.modelConfig.ocrMode || "enhanced") !== "fast";
  const statusText = enhanced && supportsVision
    ? `${provider.name} 识图 + ${judgeProvider.name} 校对`
    : (supportsVision ? "可识别图片" : "需视觉模型");
  $("#ocrModelStatus").textContent = statusText;
  $("#ocrModelStatus").className = `status-chip ${supportsVision && (!enhanced || Boolean(judgeModel)) ? "success" : "pending"}`;
}

function getSelectedProvider() {
  return llmProviders().find((provider) => provider.id === state.modelConfig.provider) || llmProviders()[0];
}

function getSelectedOcrProvider() {
  return ocrProviders().find((provider) => provider.id === ($("#ocrProviderSelect")?.value || state.modelConfig.ocrProvider)) || modelProviders.find((provider) => provider.id === "kimi") || ocrProviders()[0];
}

function getSelectedOcrJudgeProvider() {
  return llmProviders().find((provider) => provider.id === ($("#ocrJudgeProviderSelect")?.value || state.modelConfig.ocrJudgeProvider)) || modelProviders.find((provider) => provider.id === "deepseek") || llmProviders()[0];
}

function initGradingHint() {
  state.gradingHint = getSavedDefaultGradingHint();
  const input = $("#gradingHintInput");
  if (input) input.value = state.gradingHint;
}

function getDefaultGradingHintForGrade(grade = $("#gradeSelect")?.value || "") {
  return grade === "七年级" ? GRADE_SEVEN_GRADING_HINT : DEFAULT_GRADING_HINT;
}

function isSystemGradingHint(value) {
  const hint = String(value || "").trim();
  return [DEFAULT_GRADING_HINT, GRADE_SEVEN_GRADING_HINT, PREVIOUS_SHARED_GRADING_HINT].includes(hint);
}

function syncSystemGradingHintForSelectedGrade() {
  const input = $("#gradingHintInput");
  const currentHint = String(input?.value || state.gradingHint || "").trim();
  if (currentHint && !isSystemGradingHint(currentHint)) return;

  const defaultHint = getDefaultGradingHintForGrade();
  state.gradingHint = defaultHint;
  if (input) input.value = defaultHint;
  syncCurrentQueueItem({ gradingHint: defaultHint });
}

function getSavedDefaultGradingHint(grade = $("#gradeSelect")?.value || "") {
  const saved = window.localStorage.getItem(GRADING_HINT_STORAGE_KEY);
  return saved?.trim() && !isSystemGradingHint(saved)
    ? saved
    : getDefaultGradingHintForGrade(grade);
}

function getGradingHintForReport() {
  const defaultHint = getDefaultGradingHintForGrade();
  return ($("#gradingHintInput")?.value || state.gradingHint || defaultHint).trim() || defaultHint;
}

function preferredClientOcrModel(provider) {
  const visionModels = visionModelsForProvider(provider);
  return [
    "moonshot-v1-128k-vision-preview",
    "deepseek-v4-flash-vision-exp",
    "moonshot-v1-32k-vision-preview",
    "moonshot-v1-8k-vision-preview"
  ].find((model) => visionModels.includes(model)) || visionModels[0] || provider.models[0];
}

function preferredClientJudgeModel(provider) {
  const textModels = textModelsForProvider(provider);
  return textModels.find((model) => /deepseek-v4-flash|gpt-4\.1|gpt-4o|qwen-plus|glm-4-plus|moonshot-v1-32k/i.test(model)) || textModels[0] || provider.models[0];
}

function providerSupportsClientVision(providerId, model) {
  if (providerId === "deepseek") return /deepseek-v4-flash-vision-exp/i.test(model);
  return /gpt-4o|gpt-4\.1|qwen-vl|glm-4v|moonshot-v1-.+-vision-preview|vision|vl/i.test(model);
}

function visionModelsForProvider(provider) {
  if (!provider) return [];
  return provider.models.filter((model) => providerSupportsClientVision(provider.id, model));
}

function textModelsForProvider(provider) {
  if (!provider) return [];
  return provider.models.filter((model) => !isVisionOnlyModel(provider.id, model));
}

function isVisionOnlyModel(providerId, model) {
  return providerId === "deepseek" && /deepseek-v4-flash-vision-exp/i.test(model || "");
}

function normalizeModelConfigAliases() {
  const config = state.modelConfig || {};
  if (config.provider === "deepseek") {
    config.model = normalizeDeepSeekModelAlias(config.model);
  }
  if (config.ocrJudgeProvider === "deepseek") {
    config.ocrJudgeModel = normalizeDeepSeekModelAlias(config.ocrJudgeModel);
  }
  config.routes = config.routes || {};
  config.routes.grading = normalizeRouteModelAlias(config.provider, config.routes.grading);
  config.routes.polish = normalizeRouteModelAlias(config.provider, config.routes.polish);
  if (config.provider === "deepseek" && isVisionOnlyModel("deepseek", config.model)) {
    config.model = "deepseek-v4-flash";
  }
  if (config.ocrJudgeProvider === "deepseek" && isVisionOnlyModel("deepseek", config.ocrJudgeModel)) {
    config.ocrJudgeModel = "deepseek-v4-flash";
  }
  if (config.provider === "deepseek" && isVisionOnlyModel("deepseek", config.routes.grading)) {
    config.routes.grading = "deepseek-v4-flash";
  }
  if (config.provider === "deepseek" && isVisionOnlyModel("deepseek", config.routes.polish)) {
    config.routes.polish = "deepseek-v4-flash";
  }
}

function normalizeRouteModelAlias(providerId, model) {
  return providerId === "deepseek" ? normalizeDeepSeekModelAlias(model) : model;
}

function normalizeDeepSeekModelAlias(model) {
  return DEEPSEEK_LEGACY_MODEL_ALIASES[model] || model;
}

function renderQueue() {
  $("#queueCount").textContent = queueItems.length;
  if ($("#taskToggleCount")) $("#taskToggleCount").textContent = queueItems.length;
  $(".queue-panel")?.classList.toggle("empty", queueItems.length === 0);
  const statuses = new Map(queueItems.map((item) => [item.id, getQueueTaskStatus(item)]));
  const counts = {
    all: queueItems.length,
    pending: queueItems.filter((item) => statuses.get(item.id)?.tone !== "done").length,
    done: queueItems.filter((item) => statuses.get(item.id)?.tone === "done").length
  };
  $$("[data-task-filter-count]").forEach((node) => {
    node.textContent = counts[node.dataset.taskFilterCount] ?? 0;
  });
  $$("[data-task-filter]").forEach((button) => {
    const active = button.dataset.taskFilter === state.taskFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  const visibleItems = queueItems.filter((item) => {
    const tone = statuses.get(item.id)?.tone;
    if (state.taskFilter === "done") return tone === "done";
    if (state.taskFilter === "pending") return tone !== "done";
    return true;
  });
  $("#queueList").innerHTML = visibleItems.length ? visibleItems.map((item) => {
    const status = statuses.get(item.id);
    const attachment = Number(item.images || 0) ? ` · ${Number(item.images)} 张附件` : "";
    const retention = formatTaskRetention(item);
    return `
      <article class="queue-item ${item.id === state.currentQueueId ? "active" : ""}" data-id="${item.id}">
        <button class="queue-item-main" type="button" data-task-open-id="${item.id}">
          <strong>${escapeHTML(item.student || "未命名学生")}</strong>
          <span>${escapeHTML(item.meta || "未设置任务")}${attachment}</span>
          <div class="queue-item-footer">
            <em class="queue-task-status ${status.tone}">${status.label}</em>
            <small>${escapeHTML(retention)}</small>
          </div>
        </button>
        <button class="queue-close" type="button" data-close-id="${item.id}" aria-label="删除任务 ${escapeHTML(item.student || "未命名学生")}" title="删除任务">×</button>
      </article>
    `;
  }).join("") : `
    <div class="task-filter-empty">
      <strong>${queueItems.length ? "此分类暂无任务" : "还没有作文任务"}</strong>
      <span>${queueItems.length ? "可以切换其他分类查看" : "点击上方按钮开始第一篇作文"}</span>
    </div>
  `;
  $$("[data-task-open-id]").forEach((button) => {
    button.addEventListener("click", () => {
      loadQueueItem(button.dataset.taskOpenId);
      closeTaskPanelForWorkspace();
    });
  });
  $$("[data-close-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      closeQueueItem(button.dataset.closeId);
    });
  });
  syncTaskPanelControls();
}

function renderTeacherProfiles() {
  const select = $("#teacherProfileSelect");
  if (!select) return;
  select.innerHTML = state.teacherProfiles.map((profile) => (
    `<option value="${escapeHTML(profile.id)}">${escapeHTML(profile.name)}</option>`
  )).join("");
  if (!state.teacherProfiles.some((profile) => profile.id === state.teacherId)) {
    state.teacherId = state.teacherProfiles[0]?.id || "teacher-1";
  }
  select.value = state.teacherId;
  select.disabled = state.switchingTeacher;
  $("#renameTeacherProfileButton").disabled = state.switchingTeacher;
  $("#retentionPolicyLabel").textContent = `任务保留 ${state.taskRetentionDays} 天`;
}

async function handleTeacherProfileChange(event) {
  const nextTeacherId = String(event.target.value || "");
  if (!nextTeacherId || nextTeacherId === state.teacherId || state.switchingTeacher) return;
  const previousTeacherId = state.teacherId;
  state.switchingTeacher = true;
  renderTeacherProfiles();
  try {
    await flushAutosavesBeforeGrading();
    state.teacherId = nextTeacherId;
    saveStoredTeacherId(nextTeacherId);
    const items = await apiRequest("/api/submissions");
    queueItems.splice(0, queueItems.length, ...(Array.isArray(items) ? items : []));
    state.currentQueueId = "";
    state.currentImages = [];
    state.ocrText = "";
    state.currentReport = null;
    state.customPrompt = createDefaultCustomPrompt(false);
    if (queueItems.length) loadQueueItem(queueItems[0].id);
    else renderAfterQueueRemoval(true, 0);
    setGradingStatus(`已切换到${getCurrentTeacherProfile()?.name || "当前教师"}`, "success");
  } catch (error) {
    state.teacherId = previousTeacherId;
    saveStoredTeacherId(previousTeacherId);
    setGradingStatus(error.message || "切换教师失败", "pending");
  } finally {
    state.switchingTeacher = false;
    renderTeacherProfiles();
  }
}

async function renameCurrentTeacherProfile() {
  const profile = getCurrentTeacherProfile();
  if (!profile || state.switchingTeacher) return;
  const requestedName = window.prompt("请输入教师名称", profile.name);
  if (requestedName === null) return;
  const name = requestedName.trim().replace(/\s+/g, " ").slice(0, 24);
  if (!name || name === profile.name) return;
  try {
    const saved = await apiRequest(`/api/teacher-profiles/${encodeURIComponent(profile.id)}`, {
      method: "PUT",
      body: { name }
    });
    profile.name = saved.name;
    renderTeacherProfiles();
    setGradingStatus("教师名称已保存", "success");
  } catch (error) {
    setGradingStatus(error.message || "教师名称保存失败", "pending");
  }
}

function getCurrentTeacherProfile() {
  return state.teacherProfiles.find((profile) => profile.id === state.teacherId) || state.teacherProfiles[0] || null;
}

function formatTaskRetention(item) {
  const expiresAt = Date.parse(item.expiresAt || "");
  const fallbackUpdatedAt = Date.parse(item.updatedAt || item.createdAt || "");
  const resolvedExpiry = Number.isFinite(expiresAt)
    ? expiresAt
    : fallbackUpdatedAt + state.taskRetentionDays * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(resolvedExpiry)) return `保留 ${state.taskRetentionDays} 天`;
  const remainingDays = Math.max(1, Math.ceil((resolvedExpiry - Date.now()) / (24 * 60 * 60 * 1000)));
  return `剩余 ${remainingDays} 天`;
}

function getQueueTaskStatus(item) {
  if (state.gradingJobs.has(item.id) || item.status === "grading") return { label: "批改中", tone: "running" };
  if (item.status === "done" || item.report) return { label: "已完成", tone: "done" };
  if (item.status === "failed") return { label: "批改失败", tone: "failed" };
  if (String(item.essay || item.ocrText || "").replace(/\s/g, "").length >= 30) return { label: "待批改", tone: "ready" };
  return { label: "编辑中", tone: "draft" };
}

async function closeQueueItem(id) {
  const index = queueItems.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [removedItem] = queueItems.splice(index, 1);
  const wasCurrent = state.currentQueueId === id;
  renderAfterQueueRemoval(wasCurrent, index);
  if (!state.backendAvailable) {
    setOcrStatus("后端未连接，任务仅在当前页面关闭，刷新后会恢复", "pending");
    return;
  }
  try {
    await apiRequest(`/api/submissions/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    setOcrStatus("任务已删除", "success");
  } catch (error) {
    queueItems.splice(Math.min(index, queueItems.length), 0, removedItem);
    if (wasCurrent) {
      loadQueueItem(id);
    } else {
      renderQueue();
    }
    setOcrStatus(error.message || "删除任务失败", "pending");
  }
}

async function clearAllQueueItems() {
  if (!queueItems.length) {
    setOcrStatus("当前没有待处理任务", "pending");
    return;
  }
  const confirmed = window.confirm(`确定要清空全部 ${queueItems.length} 个待处理任务吗？此操作不可恢复。`);
  if (!confirmed) return;
  const removedItems = [...queueItems];
  queueItems.splice(0, queueItems.length);
  renderAfterQueueRemoval(true, 0);
  if (!state.backendAvailable) {
    queueItems.splice(0, queueItems.length, ...removedItems);
    loadQueueItem(queueItems[0]?.id);
    setOcrStatus("后端未连接，无法彻底清空任务", "pending");
    return;
  }
  try {
    const result = await apiRequest("/api/submissions", {
      method: "DELETE"
    });
    setOcrStatus(`已清空 ${result.deletedCount ?? removedItems.length} 个任务`, "success");
  } catch (error) {
    queueItems.splice(0, queueItems.length, ...removedItems);
    loadQueueItem(queueItems[0]?.id);
    setOcrStatus(error.message || "清空任务失败", "pending");
  }
}

function renderAfterQueueRemoval(wasCurrent, index) {
  if (!queueItems.length) {
    state.currentQueueId = "";
    state.currentImages = [];
    state.ocrText = "";
    state.currentReport = null;
    state.customPrompt = createDefaultCustomPrompt(false);
    setCurrentStudentTitle("");
    $("#essayInput").value = "";
    $("#ocrThumbGrid").innerHTML = "";
    renderImageWorkspace();
    setOcrStatus("", "");
    setGradingStatus("", "");
    renderPrompt();
    renderEmptyReport();
    updateCharCount();
    renderQueue();
    return;
  }
  if (wasCurrent) {
    const next = queueItems[Math.min(index, queueItems.length - 1)];
    loadQueueItem(next.id);
    return;
  }
  renderQueue();
}

function renderEmptyReport() {
  $("#reportEmpty").style.display = "grid";
  $$("[data-report-view]").forEach((view) => {
    view.innerHTML = "";
    view.classList.toggle("active", view.dataset.reportView === "overview");
  });
  clearAnnotationConnector();
}

async function loadQueueItem(id) {
  const item = queueItems.find((entry) => entry.id === id) || queueItems[0];
  if (!item) {
    renderAfterQueueRemoval(true, 0);
    return;
  }
  const fullItem = await ensureQueueItemImageData(item);
  applyQueueItemToWorkspace(fullItem);
}

async function ensureQueueItemImageData(item) {
  if (!item || item.id?.startsWith?.(LOCAL_DRAFT_ID_PREFIX)) return item;
  const images = normalizeClientImages(item.imageData || []);
  const expectedCount = Number(item.images || item.imageMeta?.length || 0);
  if (images.length || !expectedCount || !state.backendAvailable) return item;
  renderImageLoadingPlaceholders(expectedCount);
  setOcrStatus(`正在载入 ${expectedCount} 张原文图片`, "pending");
  try {
    const fullItem = await apiRequest(`/api/submissions/${encodeURIComponent(item.id)}`);
    Object.assign(item, fullItem);
    return item;
  } catch (error) {
    setOcrStatus(error.message || "原文图片载入失败，请刷新后重试", "pending");
    return item;
  }
}

function renderImageLoadingPlaceholders(count) {
  const safeCount = clamp(Number(count || 0), 1, MAX_IMAGE_PAGES);
  const thumbGrid = $("#ocrThumbGrid");
  if (thumbGrid) {
    thumbGrid.innerHTML = Array.from({ length: safeCount }, (_, index) => `
      <figure class="thumb-item thumb-placeholder">
        <div class="thumb-placeholder-box">载入中</div>
        <figcaption>${index + 1}</figcaption>
      </figure>
    `).join("");
  }
  const stage = $("#imageStage");
  if (stage) {
    stage.innerHTML = `
      <div class="image-empty-state">
        <strong>正在载入原文图片</strong>
        <p>手机或网页上传的照片正在同步到识别区。</p>
      </div>
    `;
  }
}

function applyQueueItemToWorkspace(item) {
  state.currentQueueId = item.id;
  setCurrentStudentTitle(item.student || "未命名学生");
  state.customPrompt = normalizeCustomPrompt(item.customPrompt);
  setSelectValue("#gradeSelect", item.grade);
  populateBookSelect();
  setSelectValue("#bookSelect", item.book);
  populateUnitSelect();
  setSelectValue("#unitSelect", item.unit);
  const essayText = item.essay || item.ocrText || "";
  $("#essayInput").value = essayText;
  state.currentImages = normalizeClientImages(item.imageData || []);
  state.ocrText = item.ocrText || essayText;
  const savedItemHint = String(item.gradingHint || "").trim();
  state.gradingHint = savedItemHint
    ? (isSystemGradingHint(savedItemHint) ? getDefaultGradingHintForGrade(item.grade) : savedItemHint)
    : getSavedDefaultGradingHint(item.grade);
  item.gradingHint = state.gradingHint;
  $("#gradingHintInput").value = state.gradingHint;
  state.currentReport = item.report || null;
  renderImageWorkspace();
  setOcrStatus(state.currentImages.length ? `${state.currentImages.length} 张报告图片附件已载入` : "", "success");
  if (state.gradingJobs.has(item.id) || item.status === "grading") {
    setGradingStatus("这个任务正在批改，可以切换到其他任务继续处理", "pending");
  } else if (item.status === "failed" && item.gradingError) {
    setGradingStatus(item.gradingError, "pending");
  } else {
    setGradingStatus("", "");
  }
  renderPrompt();
  if (state.currentReport) {
    renderReport(state.currentReport);
  } else {
    renderEmptyReport();
  }
  updateCharCount();
  renderQueue();
  updateGenerateButtonState();
}

function populateGradeSelect() {
  const gradeOrder = new Map(["三年级", "四年级", "五年级", "六年级", "七年级"].map((grade, index) => [grade, index]));
  const grades = unique(promptLibrary.map((item) => item.grade)).sort((left, right) => (
    (gradeOrder.get(left) ?? 99) - (gradeOrder.get(right) ?? 99)
  ));
  if (!grades.length) {
    $("#gradeSelect").innerHTML = "<option value=\"\">未加载</option>";
    populateBookSelect();
    return;
  }
  $("#gradeSelect").innerHTML = grades.map((grade) => `<option value="${grade}">${grade}</option>`).join("");
  populateBookSelect();
}

function populateBookSelect() {
  const grade = $("#gradeSelect").value;
  const bookOrder = new Map(["上册", "下册"].map((book, index) => [book, index]));
  const books = unique(promptLibrary.filter((item) => item.grade === grade).map((item) => item.book)).sort((left, right) => (
    (bookOrder.get(left) ?? 99) - (bookOrder.get(right) ?? 99)
  ));
  if (!books.length) {
    $("#bookSelect").innerHTML = "<option value=\"\">未加载</option>";
    populateUnitSelect();
    return;
  }
  $("#bookSelect").innerHTML = books.map((book) => `<option value="${book}">${book}</option>`).join("");
}

function populateUnitSelect() {
  const grade = $("#gradeSelect").value;
  const book = $("#bookSelect").value;
  const units = sortedPromptLibrary().filter((item) => item.grade === grade && item.book === book);
  if (!units.length) {
    $("#unitSelect").innerHTML = "<option value=\"\">未加载</option>";
    return;
  }
  $("#unitSelect").innerHTML = units.map((item) => `<option value="${item.unit}">${item.unit}</option>`).join("");
}

function renderPrompt() {
  const customActive = Boolean(state.customPrompt.active);
  const customEditor = $("#customPromptEditor");
  if (customEditor) {
    customEditor.hidden = !customActive;
    if (customActive && !customEditor.contains(document.activeElement)) {
      syncCustomPromptInputs();
    }
  }
  const customButton = $("#toggleCustomPromptButton");
  if (customButton) {
    customButton.classList.toggle("active", customActive);
    customButton.textContent = customActive ? "使用教材题库" : "自定义题目";
  }
  const requirementButton = $("#toggleRequirementEditor");
  if (requirementButton) {
    requirementButton.disabled = customActive;
    requirementButton.title = customActive ? "自定义题目可直接在下方修改作文要求" : "修改教材题库作文要求";
  }
  if (customActive) {
    $("#requirementEditor").hidden = true;
  }
  const prompt = getCurrentPrompt();
  $("#promptTitle").textContent = prompt.title;
  $("#requirementList").innerHTML = prompt.requirements.map((req) => `<li>${escapeHTML(req)}</li>`).join("");
  if (!$("#requirementEditor").hidden) {
    renderRequirementEditor();
  }
}

function getCurrentPrompt() {
  if (state.customPrompt.active) return buildCustomPrompt();
  return getSelectedLibraryPrompt();
}

function getSelectedLibraryPrompt() {
  const grade = $("#gradeSelect").value;
  const book = $("#bookSelect").value;
  const unit = $("#unitSelect").value;
  return promptLibrary.find((item) => item.grade === grade && item.book === book && item.unit === unit) || promptLibrary[0] || EMPTY_PROMPT;
}

function createDefaultCustomPrompt(active = false) {
  return {
    active,
    title: "",
    grade: "",
    book: "",
    unit: "自定义作文",
    requirements: [...DEFAULT_CUSTOM_PROMPT_REQUIREMENTS]
  };
}

function normalizeCustomPrompt(input = {}) {
  if (!input || typeof input !== "object") {
    input = {};
  }
  const requirements = normalizeRequirementLines(input.requirements);
  return {
    active: Boolean(input.active),
    title: String(input.title || "").trim(),
    grade: String(input.grade || "").trim(),
    book: String(input.book || "").trim(),
    unit: String(input.unit || "自定义作文").trim(),
    requirements: requirements.length ? requirements : [...DEFAULT_CUSTOM_PROMPT_REQUIREMENTS]
  };
}

function normalizeRequirementLines(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toggleCustomPromptMode() {
  if (state.customPrompt.active) {
    state.customPrompt = {
      ...normalizeCustomPrompt(state.customPrompt),
      active: false
    };
    persistCustomPromptToCurrentQueueItem();
    renderPrompt();
    setGradingStatus("已切回教材题库", "success");
    return;
  }
  const current = normalizeCustomPrompt(state.customPrompt);
  state.customPrompt = {
    ...current,
    active: true,
    grade: current.grade || $("#gradeSelect").value || "",
    book: current.book || $("#bookSelect").value || "",
    unit: current.unit || "自定义作文"
  };
  persistCustomPromptToCurrentQueueItem();
  renderPrompt();
  $("#customPromptTitleInput")?.focus();
  setGradingStatus("已启用自定义题目", "success");
}

function handleCustomPromptInput() {
  state.customPrompt = readCustomPromptFromInputs(true);
  persistCustomPromptToCurrentQueueItem();
  renderPrompt();
}

function readCustomPromptFromInputs(active = state.customPrompt.active) {
  return normalizeCustomPrompt({
    active,
    title: $("#customPromptTitleInput")?.value || "",
    grade: $("#customPromptGradeInput")?.value || "",
    book: $("#customPromptBookInput")?.value || "",
    unit: $("#customPromptUnitInput")?.value || "自定义作文",
    requirements: $("#customPromptRequirementsInput")?.value || ""
  });
}

function syncCustomPromptInputs() {
  const custom = normalizeCustomPrompt(state.customPrompt);
  $("#customPromptTitleInput").value = custom.title;
  $("#customPromptGradeInput").value = custom.grade;
  $("#customPromptBookInput").value = custom.book;
  $("#customPromptUnitInput").value = custom.unit;
  $("#customPromptRequirementsInput").value = custom.requirements.join("\n");
}

function persistCustomPromptToCurrentQueueItem() {
  syncCurrentQueueItem({
    customPrompt: normalizeCustomPrompt(state.customPrompt)
  });
}

function buildCustomPrompt() {
  const custom = $("#customPromptEditor") && !$("#customPromptEditor").hidden
    ? readCustomPromptFromInputs(true)
    : normalizeCustomPrompt(state.customPrompt);
  return {
    id: "custom-prompt",
    grade: custom.grade || $("#gradeSelect")?.value || "",
    book: custom.book || $("#bookSelect")?.value || "",
    unit: custom.unit || "自定义作文",
    title: custom.title || "请填写自定义作文题目",
    type: "自定义",
    status: "自定义",
    requirements: custom.requirements.length ? custom.requirements : ["按自定义作文题进行整体批改"]
  };
}

function renderRequirementEditor() {
  const prompt = getCurrentPrompt();
  $("#requirementEditorList").innerHTML = prompt.requirements.map((req, index) => `
    <div class="requirement-edit-row">
      <input type="text" value="${escapeAttr(req)}" data-req-index="${index}" aria-label="写作要求 ${index + 1}" />
      <button class="remove-row-button" type="button" data-remove-req="${index}" aria-label="删除要求 ${index + 1}">
        <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
          <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" />
        </svg>
      </button>
    </div>
  `).join("");
  $$("[data-remove-req]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeReq);
      if (prompt.requirements.length <= 1) return;
      prompt.requirements.splice(index, 1);
      renderRequirementEditor();
      renderPrompt();
    });
  });
}

async function saveRequirementConfig() {
  if (state.customPrompt.active) {
    handleCustomPromptInput();
    setGradingStatus("自定义题目要求已更新", "success");
    return;
  }
  const prompt = getCurrentPrompt();
  const values = $$("[data-req-index]").map((input) => input.value.trim()).filter(Boolean);
  if (!values.length) return;
  prompt.requirements = values;
  prompt.status = "本地已配置";
  if (state.backendAvailable) {
    try {
      const saved = await apiRequest("/api/prompts/requirements", {
        method: "PUT",
        body: {
          id: prompt.id,
          grade: prompt.grade,
          book: prompt.book,
          unit: prompt.unit,
          requirements: values
        }
      });
      Object.assign(prompt, saved);
    } catch (error) {
      prompt.status = "本地草稿";
    }
  }
  renderPrompt();
  renderLibraryTable();
  if (state.currentReport) {
    await startCurrentTaskGrading();
  }
}

function updateCharCount() {
  const text = $("#essayInput").value.replace(/\s/g, "");
  $("#charCount").textContent = text.length;
}

function handleEssayTextInput() {
  updateCharCount();
  const text = $("#essayInput")?.value || "";
  const reportBecameStale = Boolean(state.currentReport && String(state.currentReport.essay || "") !== text.trim());
  if (reportBecameStale) {
    state.currentReport = null;
    renderEmptyReport();
  }
  syncEssayTextToCurrentQueueItem();
  const item = getCurrentQueueItem();
  if (item) {
    const status = state.gradingJobs.has(item.id) ? "grading" : "draft";
    syncCurrentQueueItem({ status, ...(reportBecameStale ? { report: null } : {}) });
    renderQueue();
  }
}

function syncEssayTextToCurrentQueueItem() {
  const text = $("#essayInput")?.value || "";
  state.ocrText = text;
  syncCurrentQueueItem({
    essay: text,
    ocrText: text
  });
}

function getEssayForReport() {
  return $("#essayInput").value.trim();
}

function ensurePromptReadyForReport() {
  if (!state.customPrompt.active) return true;
  const custom = readCustomPromptFromInputs(true);
  if (custom.title.trim()) return true;
  const message = "请先填写自定义作文题目";
  setGradingStatus(message, "pending");
  switchPanel("workspace");
  requestAnimationFrame(() => {
    const target = $("#customPromptTitleInput");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("attention-pulse");
    setTimeout(() => target.classList.remove("attention-pulse"), 1300);
    target.focus({ preventScroll: true });
  });
  return false;
}

function ensureEssayReadyForReport() {
  const essay = getEssayForReport();
  const compactLength = essay.replace(/\s/g, "").length;
  if (compactLength >= 30) return true;
  const message = "请先粘贴或输入作文全文后再批改";
  setGradingStatus(message, "pending");
  setOcrStatus(message, "pending");
  switchPanel("workspace");
  requestAnimationFrame(() => {
    const target = $("#essayInput");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("attention-pulse");
    setTimeout(() => target.classList.remove("attention-pulse"), 1300);
    target.focus({ preventScroll: true });
  });
  return false;
}

function generateReport() {
  const prompt = getCurrentPrompt();
  const essay = getEssayForReport();
  const analysis = analyzeEssay(essay, prompt);
  const currentItem = queueItems.find((item) => item.id === state.currentQueueId) || queueItems[0];
  return {
    student: getCurrentStudentName(currentItem),
    school: "",
    teacher: "",
    prompt,
    model: getReportModelInfo(),
    customInstructions: getGradingHintForReport(),
    essay,
    analysis,
    requirements: prompt.requirements.map((req) => evaluateRequirement(req, essay, analysis)),
    scores: buildScores(analysis, prompt),
    annotations: buildAnnotations(prompt, analysis),
    guide: buildUpgradeGuide(prompt, analysis),
    polished: buildPolishedEssay(prompt, essay, analysis),
    polishedItems: []
  };
}

async function createReportForTask(request) {
  if (!state.backendAvailable) {
    throw new Error("报告评价必须由服务端大模型生成。请先启动后端服务并配置模型 API。");
  }
  try {
    const prompt = request.prompt;
    return await apiRequest("/api/generate-report", {
      method: "POST",
      body: {
        queueId: request.queueId,
        student: request.student,
        promptRef: {
          id: prompt.id,
          grade: prompt.grade,
          book: prompt.book,
          unit: prompt.unit
        },
        prompt,
        essay: request.essay,
        customInstructions: request.customInstructions
      }
    });
  } catch (error) {
    throw new Error(error.message || "大模型批改失败，请检查模型配置和网络连接");
  }
}

function getCurrentStudentName(item) {
  const titleName = $("#currentStudentTitle")?.value?.trim();
  return titleName ? titleName : (item?.student || "未命名学生");
}

function setCurrentStudentTitle(value) {
  const input = $("#currentStudentTitle");
  if (input) input.value = value || "";
}

function handleStudentTitleInput() {
  const value = $("#currentStudentTitle").value.trim();
  const student = value || "未命名学生";
  syncCurrentQueueItem({
    student
  });
  syncReportStudentName(student);
  renderQueue();
}

function syncReportStudentName(student) {
  if (!state.currentReport) return;
  state.currentReport.student = student;
  const overview = $("[data-report-view='overview']");
  if (overview) overview.innerHTML = renderOverview(state.currentReport);
  syncCurrentQueueItem({
    report: state.currentReport
  });
}

function getReportModelInfo() {
  const provider = getSelectedProvider();
  return {
    provider: provider.name,
    model: state.modelConfig.routes.grading || state.modelConfig.model,
    mode: $("#apiModeSelect")?.value || state.modelConfig.apiMode
  };
}

function analyzeEssay(essay, prompt) {
  const compact = essay.replace(/\s/g, "");
  const paragraphs = essay.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const sentences = extractSentences(essay);
  const emotionWords = matchCount(compact, ["开心", "高兴", "快乐", "紧张", "害怕", "着急", "沮丧", "自豪", "难过", "激动", "兴奋", "放弃", "坚持", "喜欢", "感动", "担心", "勇敢"]);
  const actionWords = matchCount(compact, ["跑", "跳", "滑", "扶", "拉", "看", "听", "说", "蹬", "摔", "站", "拿", "走", "拍", "写", "练", "踏", "穿", "找", "寻", "爬", "钻", "跨"]);
  const sensoryWords = matchCount(compact, ["呼呼", "咯吱", "冰凉", "温暖", "香", "甜", "刺", "风", "声音", "颜色", "味道", "脸颊", "眼前", "闷热", "黏腻", "潮湿", "阳光", "树木", "水声", "泥土"]);
  const difficultyWords = matchCount(compact, ["困难", "不会", "失败", "摔", "慌", "怕", "紧张", "不稳", "难", "问题", "控制", "累", "饿", "渴", "危险"]);
  const solutionWords = matchCount(compact, ["办法", "解决", "教练", "老师", "妈妈", "练习", "尝试", "坚持", "指导", "方法", "终于", "寻找", "发现", "跟着", "一起", "同学"]);
  const quoteCount = (essay.match(/[“”"]/g) || []).length;
  const hasTitleLine = paragraphs[0] && paragraphs[0].length <= 16;
  const hasEndingInsight = /懂得|明白|收获|告诉我|让我知道|体会|道理|坚持|成长/.test(compact);
  const sequenceCount = matchCount(compact, ["先", "再", "然后", "接着", "最后", "一开始", "终于", "那天", "这时"]);
  const punctuationIssues = (essay.match(/，，|。。|！！|？？|,,|\.\./g) || []).length;
  const typoFindings = findTypoFindings(essay);
  const typoHints = typoFindings.length;
  return {
    compactLength: compact.length,
    paragraphs,
    sentences,
    emotionWords,
    actionWords,
    sensoryWords,
    difficultyWords,
    solutionWords,
    quoteCount,
    hasTitleLine,
    hasEndingInsight,
    sequenceCount,
    punctuationIssues,
    typoHints,
    typoFindings,
    topic: inferTopic(prompt, essay)
  };
}

function evaluateRequirement(requirement, essay, analysis) {
  let value = 2;
  let note = "已经有相关内容，但还可以写得更具体。";
  const req = requirement;
  if (/题目|补全/.test(req)) {
    value = analysis.hasTitleLine || essay.includes("我学会") ? 5 : 2;
    note = value >= 4 ? "题目明确，能围绕本次习作任务展开。" : "题目或中心还不够明确，建议先补全题目。";
  } else if (/心情|感受|真情|情感/.test(req)) {
    value = clamp(2 + Math.min(analysis.emotionWords, 3), 1, 5);
    note = value >= 4 ? "能写出心情变化，情感比较真实。" : "心情描写偏少，可以补充心理活动和转折。";
  } else if (/顺序|过程|经过/.test(req)) {
    value = clamp(2 + analysis.sequenceCount + Math.min(analysis.paragraphs.length, 3) - 2, 1, 5);
    note = value >= 4 ? "能按顺序推进过程，事件发展比较清楚。" : "过程顺序还可以再清楚，建议按起因、经过、结果重组。";
  } else if (/困难|办法|解决/.test(req)) {
    value = clamp(2 + Math.min(analysis.difficultyWords, 2) + Math.min(analysis.solutionWords, 2), 1, 5);
    note = value >= 4 ? "写出了困难和解决办法，学习过程有波折。" : "困难或解决办法不够突出，可以补充失败和调整。";
  } else if (/特点|具体|动作|语言|神态|细节|场面/.test(req)) {
    value = clamp(2 + Math.min(analysis.actionWords, 2) + Math.min(analysis.sensoryWords, 1) + (analysis.quoteCount > 1 ? 1 : 0), 1, 5);
    note = value >= 4 ? "有动作、语言或感官描写，画面感较好。" : "细节还可以更丰富，建议补动作、语言或感官体验。";
  } else if (/标点|语句|通顺|自然段/.test(req)) {
    value = clamp(5 - analysis.punctuationIssues - analysis.typoHints, 1, 5);
    note = value >= 4 ? "整体语句通顺，标点使用较规范。" : "存在错别字、语序或标点问题，需要认真修改。";
  } else {
    value = clamp(Math.round(analysis.compactLength / 120) + 2, 1, 5);
  }
  return {
    text: requirement,
    level: valueToLevel(value),
    value,
    note
  };
}

function buildScores(analysis) {
  const content = clamp(Math.round((analysis.compactLength / 110) + Math.min(analysis.difficultyWords, 2) + Math.min(analysis.solutionWords, 2)), 1, 5);
  const expression = clamp(2 + Math.min(analysis.actionWords, 2) + Math.min(analysis.sensoryWords, 1) + (analysis.quoteCount > 1 ? 1 : 0) - Math.min(analysis.typoHints, 1), 1, 5);
  const structure = clamp(2 + Math.min(analysis.paragraphs.length, 3) + (analysis.sequenceCount > 2 ? 1 : 0) - (analysis.paragraphs.length < 3 ? 1 : 0), 1, 5);
  const norm = clamp(5 - analysis.punctuationIssues - analysis.typoHints, 1, 5);
  const contentPoints = Math.round((content / 5) * 35);
  const expressionPoints = Math.round((expression / 5) * 25);
  const structurePoints = Math.round((structure / 5) * 25);
  const normPoints = Math.round((norm / 5) * 15);
  const total = Math.round(contentPoints + expressionPoints + structurePoints + normPoints - analysis.typoHints - analysis.punctuationIssues);
  const cappedTotal = analysis.compactLength < 120 ? Math.min(total, 70) : total;
  return {
    total: clamp(cappedTotal, 45, 96),
    items: [
      { name: "内容", value: content, note: `约${contentPoints}/35：切题与事件完整度` },
      { name: "表达", value: expression, note: `约${expressionPoints}/25：细节、修辞与句子表现` },
      { name: "结构", value: structure, note: `约${structurePoints}/25：开头、中间、结尾与顺序` },
      { name: "行文规范", value: norm, note: `约${normPoints}/15：标点、错别字与格式` }
    ]
  };
}

function buildAnnotations(prompt, analysis) {
  const sentences = analysis.sentences;
  const used = new Set();
  const vivid = pickVividSentence(sentences, analysis);
  markUsed(used, vivid);
  const detailTarget = pickDetailSentence(sentences, analysis, used);
  markUsed(used, detailTarget);
  const emotionTarget = pickEmotionSentence(sentences, analysis, used) || pickUnusedSentence(sentences, analysis, used);
  return [
    {
      type: "佳句",
      tone: "red",
      original: vivid,
      comment: vivid ? "这里有画面或声音描写，能让读者看到当时的场景。" : "可以补充一句有画面感的描写。",
      suggestion: buildVividSuggestion(vivid, analysis)
    },
    {
      type: "润色",
      tone: "blue",
      original: detailTarget,
      comment: buildDetailComment(detailTarget, analysis),
      suggestion: buildDetailSuggestion(detailTarget, analysis)
    },
    {
      type: "润色",
      tone: "blue",
      original: emotionTarget,
      comment: buildEmotionComment(emotionTarget, analysis),
      suggestion: buildEmotionSuggestion(emotionTarget, analysis, prompt)
    }
  ];
}

function buildUpgradeGuide(prompt, analysis) {
  const topic = analysis.topic;
  const paragraphs = getStructureParagraphs(analysis);
  const buckets = buildStructureBuckets(paragraphs);
  const totalChars = Math.max(1, paragraphs.reduce((sum, paragraph) => sum + paragraphCharCount(paragraph), 0));
  const opening = pickFirstBodySentence(analysis);
  const middle = pickEmotionSentence(analysis.sentences, analysis, new Set()) || pickDetailSentence(analysis.sentences, analysis, new Set());
  const ending = analysis.sentences.filter((sentence) => !isLikelyTitle(sentence, analysis)).at(-1) || "";
  const focus = inferStructureFocus(prompt, analysis);
  const guide = [
    {
      section: "开头",
      title: "先交代对象和起因",
      advice: isTitleOpeningMixed(opening, analysis)
        ? "现在题目和开头容易粘在一起。建议题目单独成行，第一段再交代人物、地点和出发原因。"
        : `开头约${percentText(paragraphCharCount(buckets.opening), totalChars)}，应简洁交代“谁、在哪里、为什么写${topic}”，不要把重点过程提前写完。`,
      example: buildOpeningExample(opening, analysis)
    }
  ];
  const middleParagraphs = buckets.middle.length ? buckets.middle : [middle].filter(Boolean);
  middleParagraphs.forEach((paragraph, index) => {
    const count = paragraphCharCount(paragraph);
    guide.push({
      section: `中间${index + 1}`,
      title: buildMiddleStructureTitle(index, middleParagraphs.length),
      advice: paragraph
        ? `这一部分约${count}字，占全文${percentText(count, totalChars)}。它应该服务“${focus}”，建议按“发生了什么、怎么推进、结果怎样”的顺序展开，重点情节要详写，过渡内容略写。`
        : `中间部分要围绕“${focus}”展开，建议按“铺垫、关键经过、结果”的顺序分段。`,
      example: buildMiddleStructureExample(paragraph, focus)
    });
  });
  guide.push({
    section: "详略安排",
    title: "把篇幅放在主题重点上",
    advice: `目前中间部分约${percentText(paragraphCharCount(buckets.middle.join("")), totalChars)}。小学作文通常让中间主体占 70% 左右；如果开头或结尾过长，要压缩说明，把字数留给“${focus}”。`,
    example: `建议比例：开头 10%-15%，中间 70%-80%，结尾 10% 左右。中间重点写“${focus}”，普通交代一句带过。`
  });
  guide.push(
    {
      section: "结尾",
      title: "用一两句自然收束",
      advice: ending && analysis.hasEndingInsight
        ? `结尾约${percentText(paragraphCharCount(buckets.ending), totalChars)}，已经有收束意识。建议只用一两句扣回“${topic}”，不要重新展开新情节。`
        : `结尾约${percentText(paragraphCharCount(buckets.ending), totalChars)}，可以补一句和“${topic}”有关的自然收束，让文章从事情结束回到主题。`,
      example: buildEndingExample(analysis)
    }
  );
  return guide;
}

function getStructureParagraphs(analysis) {
  const paragraphs = (analysis.paragraphs || []).filter((paragraph, index) => (
    !isLikelyTitle(paragraph, analysis) &&
    !(index === 0 && isStructureTitleLine(paragraph, analysis))
  ));
  if (paragraphs.length) return paragraphs;
  return (analysis.sentences || []).filter((sentence) => !isLikelyTitle(sentence, analysis));
}

function isStructureTitleLine(text, analysis) {
  const compact = String(text || "").replace(/\s/g, "");
  const topic = String(analysis.topic || "").replace(/\s/g, "");
  return compact.length <= 16 && (
    compact === `我学会了${topic}` ||
    compact === `我的${topic}` ||
    compact.endsWith(topic) && !/[，,。！？!?；;：:]/.test(compact)
  );
}

function buildStructureBuckets(paragraphs) {
  if (!paragraphs.length) return { opening: "", middle: [], ending: "" };
  if (paragraphs.length === 1) return { opening: paragraphs[0], middle: [], ending: "" };
  if (paragraphs.length === 2) return { opening: paragraphs[0], middle: [paragraphs[1]], ending: "" };
  return {
    opening: paragraphs[0],
    middle: paragraphs.slice(1, -1),
    ending: paragraphs.at(-1)
  };
}

function paragraphCharCount(text) {
  return String(text || "").replace(/\s/g, "").length;
}

function percentText(count, total) {
  return `${Math.round((count / Math.max(total, 1)) * 100)}%`;
}

function inferStructureFocus(prompt, analysis) {
  const title = `${prompt?.title || ""}${analysis.topic || ""}`;
  if (/探险|冒险/.test(title)) return "遇到危险、怎样应对和最终结果";
  if (/我学会/.test(title)) return "学习过程、遇到困难和解决办法";
  if (/乐园|地方|景/.test(title)) return "地点特点和最能体现乐趣的活动";
  if (/心爱|植物|动物|朋友/.test(title)) return "对象特点和最能表现喜爱的事例";
  if (/自画像|自己|他是谁/.test(title)) return "人物特点和对应事例";
  if (/真情|感受|心愿/.test(title)) return "情感变化的原因和过程";
  return "最能表现主题的关键经过";
}

function buildMiddleStructureTitle(index, total) {
  if (total <= 1) return "把主体经过分清层次";
  if (index === 0) return "中间前段先铺垫原因";
  if (index === total - 1) return "中间后段写清结果";
  return "中间重点段展开过程";
}

function buildMiddleStructureExample(paragraph, focus) {
  if (!paragraph) return `中间可以分成：先写背景，再写“${focus}”，最后写结果。`;
  return `这一段可以整理成：先交代“${shortText(paragraph)}”发生的背景，再展开“${focus}”，最后用一句话交代结果或变化。`;
}

function buildPolishedEssay(prompt, essay, analysis) {
  const parts = splitTitleAndBody(prompt, essay, analysis);
  const body = parts.bodyParagraphs
    .map((paragraph, index) => polishParagraph(paragraph, analysis, index, parts.bodyParagraphs.length))
    .filter(Boolean);
  if (!body.length) {
    return `${parts.title}\n\n${applyTypoFixes(essay)}`;
  }
  return `${parts.title}\n\n${body.join("\n\n")}`;
}

function renderReport(report) {
  $("#reportEmpty").style.display = "none";
  state.currentReport = report;
  decorateReportForTextReview(report);
  const overview = $("[data-report-view='overview']");
  const annotations = $("[data-report-view='annotations']");
  const upgrade = $("[data-report-view='upgrade']");
  const polished = $("[data-report-view='polished']");
  renderReportSection(overview, () => renderOverview(report), "首页");
  renderReportSection(annotations, () => renderAnnotations(report), "点评");
  renderReportSection(upgrade, () => renderUpgrade(report), "升格");
  renderReportSection(polished, () => renderPolished(report), "润色");
  applyEditMode();
  bindAnnotationLinks();
  switchReportTab("overview");
}

function renderReportSection(node, renderer, label) {
  if (!node) return;
  try {
    node.innerHTML = renderer();
  } catch (error) {
    console.error(`${label}模块渲染失败`, error);
    node.innerHTML = `<div class="report-block"><h3>${escapeHTML(label)}</h3><div class="empty-report-panel">${escapeHTML(error.message || "模块渲染失败，请重新批改。")}</div></div>`;
  }
}

function renderOverview(report) {
  return `
    <div class="report-head">
      <h2>作文批阅报告</h2>
      <div class="student-line">
        <span>${report.student}</span>
      </div>
    </div>
    <div class="essay-title-row">
      <div>
        <p class="eyebrow">${report.prompt.grade}${report.prompt.book} · ${report.prompt.unit}</p>
        <h2>${report.prompt.title}</h2>
      </div>
      <div class="score-number">${report.scores.total}</div>
    </div>
    <div class="report-block">
      <h3>写作要求检测</h3>
      ${report.requirements.map(renderRequirementRow).join("")}
    </div>
    <div class="report-block">
      <h3>打分详情</h3>
      <div class="score-grid">
        ${report.scores.items.map((item) => `
          <div class="score-card">
            <strong>${item.name}</strong>
            <div class="stars">${starString(item.value)}</div>
            <p class="eyebrow">${item.note}</p>
          </div>
        `).join("")}
      </div>
    </div>
    <div class="report-block">
      <h3>教师评语</h3>
      <div class="comment-box editable-report-text" data-report-edit="teacherComment">${escapeHTML(report.teacherComment || "模型未返回教师评语，请重新批改。")}</div>
    </div>
  `;
}

function renderRequirementRow(item) {
  return `
    <div class="requirement-row">
      <div>
        <strong>${escapeHTML(item.text)}</strong>
        <p class="eyebrow">${escapeHTML(item.note)}</p>
      </div>
      <div class="level-group">
        ${levels.map((level) => `<span class="level-pill ${level === item.level ? "active" : ""}">${level}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderAnnotations(report) {
  return `
    <div class="report-block">
      <h3>原文点评</h3>
      <div class="annotation-list text-annotation-list">
        ${report.annotations.map((item, index) => `
          <article class="annotation-card" data-annotation-index="${index}" id="annotation-card-${index + 1}">
            <button
              class="annotation-delete-button"
              type="button"
              data-delete-annotation-index="${index}"
              aria-label="删除第 ${index + 1} 条点评"
              title="删除这条点评"
            >×</button>
            <header>
              <b><span class="annotation-card-number ${item.tone === "red" ? "red" : "blue"}">${index + 1}</span>${escapeHTML(item.type)}</b>
              <span class="tag ${item.tone === "red" ? "red" : ""}">${escapeHTML(item.type)}</span>
            </header>
            <p><strong>原句：</strong>${escapeHTML(item.original || "原文中缺少对应表达")}</p>
            <p>${escapeHTML(item.comment)}</p>
            <div class="editable-note editable-report-text" data-report-edit="annotationSuggestion" data-report-edit-index="${index}">${escapeHTML(item.suggestion)}</div>
          </article>
        `).join("")}
      </div>
    </div>
    ${renderReportImageAttachments(report)}
  `;
}

function renderReportImageAttachments(report) {
  const images = normalizeClientImages(report.sourceImages || []);
  if (!images.length) return "";
  return `
    <div class="report-block report-image-attachments">
      <h3>原稿图片（附件）</h3>
      <div class="report-image-list">
        ${images.map((image, index) => `
          <figure class="report-image-page">
            <img src="${escapeAttr(image.dataUrl)}" alt="原稿附件第 ${index + 1} 页" />
            <figcaption>第 ${index + 1} 页</figcaption>
          </figure>
        `).join("")}
      </div>
    </div>
  `;
}

function decorateReportForTextReview(report) {
  report.sourceImages = report.sourceImages?.length ? normalizeClientImages(report.sourceImages) : getReportImages();
  report.annotations = (report.annotations || [])
    .map((item, index) => {
      const range = findAnnotationTextRange(report, item, index);
      const { anchor, ...textItem } = item;
      return { ...textItem, orderOffset: range.offset, sourceIndex: index };
    })
    .sort((left, right) => (left.orderOffset - right.orderOffset) || (left.sourceIndex - right.sourceIndex))
    .map(({ orderOffset, sourceIndex, ...item }) => item);
}

function renderAnnotatedImages(report) {
  const images = report.sourceImages || [];
  if (!images.length) {
    return `
      <div class="annotation-image-panel annotation-image-empty report-annotation-image-panel">
        <div class="annotation-panel-head">
          <div>
            <p class="eyebrow">原文图片</p>
            <h4>批注定位</h4>
          </div>
        </div>
        <p>当前报告没有原图。上传或拍照后批改，会在这里显示带编号的原文标注。</p>
      </div>
    `;
  }
  return `
    <div class="annotation-image-panel report-annotation-image-panel">
      <div class="annotation-panel-head">
        <div>
          <p class="eyebrow">原文图片</p>
          <h4>批注定位</h4>
        </div>
        <div class="annotation-legend" aria-label="批注类型图例">
          <span><i class="legend-dot red"></i>佳句</span>
          <span><i class="legend-dot blue"></i>修改建议</span>
        </div>
      </div>
      <div class="annotated-image-stack">
        ${images.map((image, pageIndex) => `
          <figure class="annotated-page">
            <div class="annotated-page-frame">
              <img src="${image.dataUrl}" alt="原文图片第 ${pageIndex + 1} 页" />
              <div class="annotation-overlay" aria-label="原文批注标记">
                ${renderAnnotationMarksForPage(report, pageIndex)}
              </div>
            </div>
          </figure>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAnnotationMarksForPage(report, pageIndex) {
  return report.annotations.map((item, index) => {
    const point = item.anchor?.point;
    if (!point || point.pageIndex !== pageIndex) return "";
    return `
      <button
        class="annotation-mark ${item.tone === "red" ? "red" : "blue"}"
        type="button"
        data-annotation-index="${index}"
        style="left:${point.x}%;top:${point.y}%"
        aria-label="查看第 ${index + 1} 条${item.type}点评"
        title="拖动可微调位置，方向键可小步调整"
      >
        <span>${index + 1}</span>
      </button>
    `;
  }).join("");
}

function renderUpgrade(report) {
  const guide = Array.isArray(report.guide) ? report.guide : [];
  return `
    <div class="report-block">
      <h3>结构升格</h3>
      <div class="guide-list">
        ${guide.length ? guide.map((item, index) => `
          <div class="guide-card">
            <header>
              <b>${escapeHTML(item.section || "结构")}：${escapeHTML(item.title || "结构调整")}</b>
              <span class="tag green">${escapeHTML(item.section || "结构")}</span>
            </header>
            <p>${escapeHTML(item.advice || "暂无具体建议，请重新批改。")}</p>
            <div class="editable-note editable-report-text" data-report-edit="guideExample" data-report-edit-index="${index}"><strong>调整示例：</strong>${escapeHTML(item.example || "")}</div>
          </div>
        `).join("") : `<div class="empty-report-panel">暂无结构升格建议，请重新批改。</div>`}
      </div>
    </div>
  `;
}

function renderPolished(report) {
  const polishedItems = getPolishedItemsForDisplay(report);
  const highlighted = buildHighlightedPolishedText(report.polished || "", polishedItems, report.essay || "");
  const polishedHtml = report.polishedHtmlOverride || highlighted.html;
  return `
    <div class="report-block">
      <h3>全文润色</h3>
      <div class="polish-single-panel">
        <div class="polish-compare-head">
          <span>润色文章</span>
          <div class="polish-head-actions">
            <small>红色为修改处</small>
            <div class="polish-format-toolbar" role="toolbar" aria-label="润色文字标注">
              <button class="polish-format-button" type="button" data-polish-format="red" title="标为红色">
                <i class="format-dot red"></i>红色
              </button>
              <button class="polish-format-button" type="button" data-polish-format="green" title="标为绿色">
                <i class="format-dot green"></i>绿色
              </button>
              <button class="polish-format-button" type="button" data-polish-format="normal" title="恢复正常字体">正常</button>
            </div>
          </div>
        </div>
        <div class="polish-article polished-article editable-report-text" data-report-edit="polishedHtml">${polishedHtml}</div>
      </div>
    </div>
  `;
}

function getPolishedItemsForDisplay(report) {
  const explicitItems = Array.isArray(report.polishedItems)
    ? report.polishedItems.filter((item) => item?.original && item?.polished && item?.reason)
    : [];
  if (explicitItems.length) return explicitItems;
  return (report.annotations || [])
    .filter((item) => !/佳句/.test(item.type || "") && item.original && item.suggestion && item.comment)
    .map((item) => ({
      original: item.original,
      polished: cleanPolishedSuggestion(item.suggestion),
      reason: item.comment
    }))
    .filter((item) => item.polished);
}

function cleanPolishedSuggestion(text) {
  const value = String(text || "").trim();
  const quoted = value.match(/[“"]([^“”"]{4,})[”"]/);
  if (quoted) return quoted[1].trim();
  return value.replace(/^(可以|建议)?(改成|改为|修改为|润色为|建议改为)[:：]?/u, "").trim();
}

function formatPlainArticle(text) {
  return escapeHTML(text || "").replace(/\n/g, "<br />");
}

function buildHighlightedPolishedText(polished, items, originalEssay = "") {
  const source = String(polished || "");
  const ranges = collectPolishedNoteRanges(source, items);
  const notes = ranges.map((range, index) => ({
    number: index + 1,
    original: range.item.original,
    polished: range.item.polished,
    reason: range.item.reason
  }));
  const changes = buildPolishedChangeRuns(originalEssay, source);

  // Older reports may not retain the original essay. Keep their existing
  // whole-suggestion marking rather than silently removing all highlights.
  const runs = changes.length || String(originalEssay || "").trim()
    ? changes
    : ranges.map((range) => ({ start: range.start, end: range.end }));
  if (!runs.length) return { html: formatPlainArticle(source) || "暂无润色文章", notes };

  const numberedRuns = attachPolishNotesToRuns(runs, ranges);
  let cursor = 0;
  let html = "";
  numberedRuns.forEach((run) => {
    html += formatPlainArticle(source.slice(cursor, run.start));
    const note = run.noteNumber ? ` data-polish-note="${run.noteNumber}"` : "";
    const superscript = run.showNote ? `<sup>${run.noteNumber}</sup>` : "";
    html += `<mark class="polished-highlight"${note}>${formatPlainArticle(source.slice(run.start, run.end))}${superscript}</mark>`;
    cursor = run.end;
  });
  html += formatPlainArticle(source.slice(cursor));
  return { html: html || "暂无润色文章", notes };
}

function collectPolishedNoteRanges(source, items) {
  const ranges = [];
  (items || []).forEach((item) => {
    const range = findPolishedRange(source, item.polished);
    if (!range) return;
    const overlaps = ranges.some((existing) => range.start < existing.end && existing.start < range.end);
    if (!overlaps) ranges.push({ ...range, item });
  });
  return ranges.sort((left, right) => left.start - right.start);
}

function buildPolishedChangeRuns(originalEssay, polishedEssay) {
  const original = String(originalEssay || "");
  const polished = String(polishedEssay || "");
  if (!original.trim() || !polished.trim()) return [];

  const sourceTokens = tokenizePolishDiff(original);
  const targetTokens = tokenizePolishDiff(polished);
  if (!sourceTokens.length || !targetTokens.length) return [];

  const maxCells = 1_250_000;
  if (sourceTokens.length * targetTokens.length > maxCells) {
    return buildCoarsePolishChangeRun(original, polished);
  }

  const width = targetTokens.length + 1;
  const matrix = new Uint16Array((sourceTokens.length + 1) * width);
  for (let sourceIndex = sourceTokens.length - 1; sourceIndex >= 0; sourceIndex -= 1) {
    for (let targetIndex = targetTokens.length - 1; targetIndex >= 0; targetIndex -= 1) {
      const cell = sourceIndex * width + targetIndex;
      if (sourceTokens[sourceIndex].value === targetTokens[targetIndex].value) {
        matrix[cell] = matrix[(sourceIndex + 1) * width + targetIndex + 1] + 1;
      } else {
        matrix[cell] = Math.max(matrix[(sourceIndex + 1) * width + targetIndex], matrix[sourceIndex * width + targetIndex + 1]);
      }
    }
  }

  const changed = new Array(targetTokens.length).fill(false);
  let sourceIndex = 0;
  let targetIndex = 0;
  while (targetIndex < targetTokens.length) {
    if (sourceIndex < sourceTokens.length && sourceTokens[sourceIndex].value === targetTokens[targetIndex].value) {
      sourceIndex += 1;
      targetIndex += 1;
    } else if (sourceIndex < sourceTokens.length && matrix[(sourceIndex + 1) * width + targetIndex] >= matrix[sourceIndex * width + targetIndex + 1]) {
      sourceIndex += 1;
    } else {
      changed[targetIndex] = true;
      targetIndex += 1;
    }
  }

  return mergePolishChangeTokens(targetTokens, changed);
}

function tokenizePolishDiff(text) {
  const source = String(text || "");
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
    return Array.from(segmenter.segment(source)).flatMap((part) => splitChineseDiffToken(part.segment, part.index));
  }

  const tokens = [];
  let offset = 0;
  for (const value of Array.from(source)) {
    tokens.push({ value, start: offset, end: offset + value.length });
    offset += value.length;
  }
  return tokens;
}

function splitChineseDiffToken(value, start) {
  if (!/^[\u3400-\u9fff]+$/u.test(value)) {
    return [{ value, start, end: start + value.length }];
  }

  const tokens = [];
  let offset = start;
  for (const char of Array.from(value)) {
    tokens.push({ value: char, start: offset, end: offset + char.length });
    offset += char.length;
  }
  return tokens;
}

function mergePolishChangeTokens(tokens, changed) {
  const runs = [];
  tokens.forEach((token, index) => {
    if (!changed[index]) return;
    const previous = runs.at(-1);
    if (previous && previous.end === token.start) {
      previous.end = token.end;
    } else {
      runs.push({ start: token.start, end: token.end });
    }
  });
  return runs;
}

function buildCoarsePolishChangeRun(original, polished) {
  let prefix = 0;
  while (prefix < original.length && prefix < polished.length && original[prefix] === polished[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < original.length - prefix &&
    suffix < polished.length - prefix &&
    original[original.length - suffix - 1] === polished[polished.length - suffix - 1]
  ) suffix += 1;

  const end = polished.length - suffix;
  return end > prefix ? [{ start: prefix, end }] : [];
}

function attachPolishNotesToRuns(runs, ranges) {
  const lastRunIndexByNote = new Map();
  const numberedRuns = runs.map((run) => {
    const noteIndex = ranges.findIndex((range) => run.start < range.end && run.end > range.start);
    const noteNumber = noteIndex >= 0 ? noteIndex + 1 : null;
    return { ...run, noteNumber, showNote: false };
  });
  numberedRuns.forEach((run, index) => {
    if (run.noteNumber) lastRunIndexByNote.set(run.noteNumber, index);
  });
  numberedRuns.forEach((run, index) => {
    if (run.noteNumber && lastRunIndexByNote.get(run.noteNumber) === index) run.showNote = true;
  });
  return numberedRuns;
}

function findPolishedRange(text, needle) {
  const raw = String(needle || "").trim().replace(/^["“]|["”]$/g, "");
  if (!text || raw.length < 2) return null;
  const exactStart = text.indexOf(raw);
  if (exactStart >= 0) return { start: exactStart, end: exactStart + raw.length };
  const sentenceParts = raw
    .split(/[。！？!?；;，,]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 6)
    .sort((left, right) => right.length - left.length);
  for (const part of sentenceParts) {
    const start = text.indexOf(part);
    if (start >= 0) return { start, end: start + part.length };
  }
  return findNormalizedTextRange(text, raw);
}

function findNormalizedTextRange(text, needle) {
  const haystack = buildComparableIndex(text);
  const target = buildComparableIndex(needle).value;
  if (target.length < 4) return null;
  const start = haystack.value.indexOf(target);
  if (start < 0) return null;
  const end = start + target.length - 1;
  return {
    start: haystack.map[start],
    end: haystack.map[end] + 1
  };
}

function buildComparableIndex(text) {
  const map = [];
  let value = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/[\s　，,。！？!?；;：:“”"‘’、（）()《》【】\[\]—…·]/.test(char)) continue;
    value += char;
    map.push(index);
  }
  return { value, map };
}

function decorateReportWithImageAnchors(report) {
  const images = getReportImages();
  const ocrPages = getReportOcrPages();
  report.sourceImages = images;
  report.sourceOcrPages = ocrPages;
  report.annotations = (report.annotations || [])
    .map((item, index) => {
      const range = findAnnotationTextRange(report, item, index);
      const existingManualAnchor = normalizeManualAnnotationAnchor(item.anchor, images);
      return {
        ...item,
        anchor: existingManualAnchor || buildAnnotationImageAnchorFromOcrPages(report, item, images, ocrPages) || buildAnnotationImageAnchor(range, images),
        orderOffset: range.offset,
        sourceIndex: index
      };
    })
    .sort((left, right) => (
      (left.orderOffset - right.orderOffset) || (left.sourceIndex - right.sourceIndex)
    ))
    .map(({ orderOffset, sourceIndex, ...item }) => item);
}

function normalizeManualAnnotationAnchor(anchor, images) {
  if (!anchor?.manual || !anchor.point || !images.length) return null;
  const pageIndex = clamp(Number(anchor.point.pageIndex ?? anchor.pageIndex ?? 0), 0, images.length - 1);
  const x = Number.isFinite(Number(anchor.point.x)) ? Number(anchor.point.x) : 50;
  const y = Number.isFinite(Number(anchor.point.y)) ? Number(anchor.point.y) : 50;
  return {
    ...anchor,
    pageIndex,
    manual: true,
    point: {
      ...anchor.point,
      pageIndex,
      x: roundPercent(clamp(x, 2, 98)),
      y: roundPercent(clamp(y, 2, 98)),
      manual: true
    }
  };
}

function getReportImages() {
  const currentItem = queueItems.find((item) => item.id === state.currentQueueId);
  return normalizeClientImages(state.currentImages.length ? state.currentImages : currentItem?.imageData || []);
}

function getReportOcrPages() {
  const currentItem = queueItems.find((item) => item.id === state.currentQueueId);
  const pages = Array.isArray(currentItem?.ocrPages) ? currentItem.ocrPages : [];
  return pages
    .map((item, index) => ({
      pageIndex: Math.max(0, Number(item.page || index + 1) - 1),
      text: cleanClientOcrPageText(item.text || "")
    }))
    .filter((item) => item.text.trim());
}

function buildAnnotationImageAnchor(range, images) {
  if (!images.length || !range) return null;
  const point = buildAnnotationImagePoint(range, images.length);
  if (!point) return null;
  return {
    pageIndex: point.pageIndex,
    charOffset: range.offset,
    charLength: range.length,
    point
  };
}

function buildAnnotationImageAnchorFromOcrPages(report, annotation, images, ocrPages) {
  if (!images.length || !ocrPages.length) return null;
  const targetTexts = getAnnotationLocatorTargets(report, annotation);
  for (const target of targetTexts) {
    for (const page of ocrPages) {
      if (page.pageIndex < 0 || page.pageIndex >= images.length) continue;
      const located = locateTextInOcrPage(page.text, target);
      if (!located) continue;
      const point = buildOcrPagePoint(page.pageIndex, located);
      return {
        pageIndex: page.pageIndex,
        charOffset: located.layoutOffset,
        charLength: normalizeLayoutText(target).length || 1,
        source: "ocr-page-lines",
        point
      };
    }
  }
  return null;
}

function getAnnotationLocatorTargets(report, annotation) {
  const targets = [];
  const original = String(annotation?.original || "").trim();
  const sentences = report.analysis?.sentences || extractSentences(report.essay || "");
  const relatedIndex = findRelatedSentenceIndex(sentences, original);
  if (relatedIndex >= 0) targets.push(sentences[relatedIndex]);
  if (original) targets.push(original);
  return unique(targets.map((item) => item.trim()).filter((item) => normalizeLocatorText(item).length >= 2));
}

function locateTextInOcrPage(pageText, targetText) {
  const pageMap = buildOcrPageLocationMap(pageText);
  const target = normalizeLocatorText(targetText);
  if (!pageMap.comparableText || !target) return null;
  const candidates = [target, ...buildLocatorFragments(targetText)];
  for (const candidate of candidates) {
    if (candidate.length < 2) continue;
    const comparableIndex = pageMap.comparableText.indexOf(candidate);
    if (comparableIndex < 0) continue;
    const position = pageMap.comparableToPositions[comparableIndex];
    if (!position) continue;
    return {
      ...position,
      lineCount: pageMap.lines.length,
      charsPerLine: pageMap.charsPerLine
    };
  }
  return null;
}

function buildLocatorFragments(text) {
  return String(text || "")
    .split(/[。！？!?；;，,、：:]/)
    .map((item) => normalizeLocatorText(item))
    .filter((item) => item.length >= 4)
    .sort((left, right) => right.length - left.length);
}

function buildOcrPageLocationMap(text) {
  const rawLines = cleanClientOcrPageText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lines = rawLines.length ? rawLines : [cleanClientOcrPageText(text)];
  const map = {
    comparableText: "",
    comparableToPositions: [],
    lines: [],
    charsPerLine: 20
  };
  let layoutOffset = 0;
  lines.forEach((line, lineIndex) => {
    let column = 0;
    for (const char of line) {
      if (/\s/.test(char)) continue;
      if (!isIgnoredLocatorPunctuation(char)) {
        map.comparableText += char;
        map.comparableToPositions.push({
          lineIndex,
          column,
          layoutOffset
        });
      }
      layoutOffset += 1;
      column += 1;
    }
    map.lines.push({
      text: line,
      length: column
    });
  });
  const maxLineLength = Math.max(...map.lines.map((line) => line.length), 1);
  map.charsPerLine = clamp(maxLineLength, 12, 24);
  return map;
}

function buildOcrPagePoint(pageIndex, located) {
  const textLeft = 7;
  const textWidth = 84;
  const pageTop = 10;
  const pageHeight = 82;
  const rowCount = Math.max(located.lineCount, 15);
  const rowGap = rowCount > 1 ? pageHeight / (rowCount - 1) : 0;
  const colWidth = textWidth / Math.max(located.charsPerLine, 1);
  const x = textLeft + located.column * colWidth + colWidth * 0.5;
  const y = pageTop + located.lineIndex * rowGap;
  return {
    pageIndex,
    x: roundPercent(clamp(x, 3, 97)),
    y: roundPercent(clamp(y, 5, 95))
  };
}

function cleanClientOcrPageText(text) {
  return String(text || "")
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .replace(/^第\s*[一二三四五六七八九十\d]+\s*页[：:\s]*/i, "")
    .trim();
}

function findAnnotationTextRange(report, annotation, index) {
  const essay = report.essay || getEssayForReport();
  const original = annotation.original || "";
  const located = findLayoutTextRange(essay, original);
  if (located.offset >= 0) {
    const sentenceStart = findContainingSentenceStart(essay, located.offset, original);
    return {
      offset: Math.max(0, sentenceStart.offset),
      gridOffset: Math.max(0, sentenceStart.gridOffset),
      length: Math.max(located.length, 1)
    };
  }
  const sentences = report.analysis?.sentences || extractSentences(report.essay || "");
  const sentenceIndex = findRelatedSentenceIndex(sentences, original);
  const sentenceCount = Math.max(sentences.length, report.annotations?.length || 1, 1);
  const fallbackIndex = sentenceIndex >= 0 ? sentenceIndex : index;
  const essayLength = normalizeLayoutText(essay).length || 45;
  const offset = Math.floor((fallbackIndex / sentenceCount) * Math.max(essayLength, 45));
  return {
    offset,
    gridOffset: offset,
    length: Math.max(normalizeLayoutText(original).length, 1)
  };
}

function buildAnnotationImagePoint(range, imageCount) {
  const charsPerLine = 20;
  const rowsPerPage = 15;
  const pageTop = 14;
  const pageHeight = 75;
  const textLeft = 8;
  const textWidth = 82;
  const colWidth = textWidth / charsPerLine;
  const start = Math.max(0, range.gridOffset ?? range.offset);
  const startLine = Math.floor(start / charsPerLine);
  let pageIndex = Math.floor(startLine / rowsPerPage);
  let rowInPage = startLine % rowsPerPage;
  if (pageIndex >= imageCount) {
    pageIndex = imageCount - 1;
    rowInPage = imageCount === 1 ? Math.min(startLine, rowsPerPage - 1) : rowsPerPage - 1;
  }
  const startCol = start % charsPerLine;
  const y = pageTop + rowInPage * (pageHeight / Math.max(rowsPerPage - 1, 1));
  const x = textLeft + startCol * colWidth + colWidth * 0.5;
  return {
    pageIndex,
    x: roundPercent(clamp(x, 4, 96)),
    y: roundPercent(clamp(y, 6, 94))
  };
}

function bindAnnotationLinks() {
  state.annotationObserver?.disconnect();
  state.annotationObserver = null;
  state.activeAnnotationIndex = "";
  clearAnnotationConnector();
  $$("[data-delete-annotation-index]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteAnnotation(Number(button.dataset.deleteAnnotationIndex));
    });
  });
  $$(".annotation-card[data-annotation-index], .annotation-mark[data-annotation-index]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (state.annotationDragClickSuppressed) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.target.closest?.('[contenteditable="true"]')) return;
      if (event.target.closest?.(".annotation-delete-button")) return;
      const index = node.dataset.annotationIndex;
      focusAnnotationLink(index, node.classList.contains("annotation-mark") ? "mark" : "card");
    });
  });
  bindAnnotationMarkDrag();
  bindAnnotationConnectorEvents();
  observeAnnotationCards();
}

function deleteAnnotation(index) {
  const report = state.currentReport;
  if (!report?.annotations?.[index]) return;
  report.annotations.splice(index, 1);
  state.activeAnnotationIndex = "";
  syncCurrentQueueItem({ report });
  const annotationsView = $("[data-report-view='annotations']");
  if (annotationsView) {
    annotationsView.innerHTML = renderAnnotations(report);
  }
  applyEditMode();
  bindAnnotationLinks();
  switchReportTab("annotations");
  setGradingStatus("已删除这条点评，报告已同步更新", "success");
  if (!report.annotations.length) {
    clearAnnotationConnector();
    return;
  }
  const nextIndex = Math.min(index, report.annotations.length - 1);
  window.requestAnimationFrame(() => setActiveAnnotation(nextIndex));
}

function bindAnnotationMarkDrag() {
  $$(".annotation-mark[data-annotation-index]").forEach((mark) => {
    if (mark.dataset.dragBound === "true") return;
    mark.dataset.dragBound = "true";
    mark.addEventListener("pointerdown", handleAnnotationMarkPointerDown);
    mark.addEventListener("keydown", handleAnnotationMarkKeydown);
  });
}

function handleAnnotationMarkPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const mark = event.currentTarget;
  const index = Number(mark.dataset.annotationIndex);
  const report = state.currentReport;
  if (!report?.annotations?.[index]) return;
  const frame = mark.closest(".uploaded-page-frame, .annotated-page-frame");
  if (!frame) return;
  event.preventDefault();
  event.stopPropagation();
  const pageIndex = getAnnotationMarkPageIndex(mark);
  state.annotationDrag = {
    index,
    pageIndex,
    frame,
    mark,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false
  };
  mark.classList.add("dragging");
  document.body.classList.add("annotation-mark-dragging");
  mark.setPointerCapture?.(event.pointerId);
  setActiveAnnotation(index);
  document.addEventListener("pointermove", handleAnnotationMarkPointerMove, true);
  document.addEventListener("pointerup", handleAnnotationMarkPointerEnd, true);
  document.addEventListener("pointercancel", handleAnnotationMarkPointerEnd, true);
}

function handleAnnotationMarkPointerMove(event) {
  const drag = state.annotationDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  event.preventDefault();
  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (distance > 2) drag.moved = true;
  const point = getAnnotationPointFromPointer(event, drag.frame);
  updateAnnotationAnchorPoint(drag.index, drag.pageIndex, point);
}

function handleAnnotationMarkPointerEnd(event) {
  const drag = state.annotationDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  event.preventDefault();
  drag.mark?.releasePointerCapture?.(event.pointerId);
  drag.mark?.classList.remove("dragging");
  document.body.classList.remove("annotation-mark-dragging");
  document.removeEventListener("pointermove", handleAnnotationMarkPointerMove, true);
  document.removeEventListener("pointerup", handleAnnotationMarkPointerEnd, true);
  document.removeEventListener("pointercancel", handleAnnotationMarkPointerEnd, true);
  state.annotationDrag = null;
  if (drag.moved) {
    state.annotationDragClickSuppressed = true;
    window.setTimeout(() => {
      state.annotationDragClickSuppressed = false;
    }, 0);
    setGradingStatus(`已微调第 ${drag.index + 1} 个批注点位置`, "success");
  }
  queueAnnotationConnectorUpdate();
}

function getAnnotationMarkPageIndex(mark) {
  const pointPageIndex = state.currentReport?.annotations?.[Number(mark.dataset.annotationIndex)]?.anchor?.point?.pageIndex;
  if (Number.isInteger(pointPageIndex)) return pointPageIndex;
  const frame = mark.closest(".uploaded-page-frame, .annotated-page-frame");
  const stack = mark.closest(".uploaded-image-stack, .annotated-image-stack");
  if (!frame || !stack) return 0;
  const frames = [...stack.querySelectorAll(".uploaded-page-frame, .annotated-page-frame")];
  return Math.max(0, frames.indexOf(frame));
}

function getAnnotationPointFromPointer(event, frame) {
  const rect = frame.getBoundingClientRect();
  const x = rect.width ? ((event.clientX - rect.left) / rect.width) * 100 : 50;
  const y = rect.height ? ((event.clientY - rect.top) / rect.height) * 100 : 50;
  return {
    x: roundPercent(clamp(x, 2, 98)),
    y: roundPercent(clamp(y, 2, 98))
  };
}

function updateAnnotationAnchorPoint(index, pageIndex, point) {
  const report = state.currentReport;
  const item = report?.annotations?.[index];
  if (!item) return;
  const safePageIndex = Number.isInteger(pageIndex) ? pageIndex : item.anchor?.pageIndex || 0;
  item.anchor = {
    ...(item.anchor || {}),
    pageIndex: safePageIndex,
    manual: true,
    point: {
      ...(item.anchor?.point || {}),
      pageIndex: safePageIndex,
      x: point.x,
      y: point.y,
      manual: true
    }
  };
  updateAnnotationMarkPosition(index, safePageIndex, point);
  syncCurrentQueueItem({ report });
  queueAnnotationConnectorUpdate();
}

function updateAnnotationMarkPosition(index, pageIndex, point) {
  $$(`.annotation-mark[data-annotation-index="${index}"]`).forEach((mark) => {
    const markPageIndex = getAnnotationMarkPageIndex(mark);
    if (markPageIndex !== pageIndex) return;
    mark.style.left = `${point.x}%`;
    mark.style.top = `${point.y}%`;
  });
}

function handleAnnotationMarkKeydown(event) {
  const directions = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1]
  };
  const direction = directions[event.key];
  if (!direction) return;
  const mark = event.currentTarget;
  const index = Number(mark.dataset.annotationIndex);
  const item = state.currentReport?.annotations?.[index];
  const point = item?.anchor?.point;
  if (!point) return;
  event.preventDefault();
  event.stopPropagation();
  const step = event.shiftKey ? 3 : 0.8;
  const nextPoint = {
    x: roundPercent(clamp(Number(point.x) + direction[0] * step, 2, 98)),
    y: roundPercent(clamp(Number(point.y) + direction[1] * step, 2, 98))
  };
  updateAnnotationAnchorPoint(index, point.pageIndex ?? item.anchor?.pageIndex ?? 0, nextPoint);
  setActiveAnnotation(index);
  setGradingStatus(`已微调第 ${index + 1} 个批注点位置`, "success");
}

function focusAnnotationLink(index, source) {
  setActiveAnnotation(index);
  const card = $(`.annotation-card[data-annotation-index="${index}"]`);
  const mark = getPreferredAnnotationMark(index);
  if (source === "mark") {
    if (card) scrollAnnotationCardIntoPanel(card, "smooth");
  } else if (mark) {
    scrollAnnotationMarkIntoPanel(mark, "smooth");
  }
}

function setActiveAnnotation(index) {
  if (state.activeAnnotationIndex === String(index)) return;
  state.activeAnnotationIndex = String(index);
  $$(".annotation-card.active, .annotation-mark.active").forEach((node) => node.classList.remove("active"));
  const card = $(`.annotation-card[data-annotation-index="${index}"]`);
  const marks = $$(`.annotation-mark[data-annotation-index="${index}"]`);
  card?.classList.add("active");
  marks.forEach((mark) => mark.classList.add("active"));
  queueAnnotationConnectorUpdate();
}

function observeAnnotationCards() {
  const cards = $$(".annotation-card[data-annotation-index]");
  if (!cards.length || typeof IntersectionObserver === "undefined") return;
  const root = getAnnotationScrollRoot();
  state.annotationObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => (
        Math.abs(left.boundingClientRect.top - getAnnotationListTargetY(root)) -
        Math.abs(right.boundingClientRect.top - getAnnotationListTargetY(root))
      ))[0];
    if (!visible) return;
    const index = visible.target.dataset.annotationIndex;
    setActiveAnnotation(index);
    const mark = getPreferredAnnotationMark(index);
    if (mark) scrollAnnotationMarkIntoPanel(mark, "smooth");
  }, {
    root,
    rootMargin: root ? "-24% 0px -46% 0px" : "-18% 0px -48% 0px",
    threshold: [0.2, 0.45, 0.7]
  });
  cards.forEach((card) => state.annotationObserver.observe(card));
}

function activateNearestVisibleAnnotation() {
  const cards = $$(".annotation-card[data-annotation-index]");
  if (!cards.length) return;
  const root = getAnnotationScrollRoot();
  const rootRect = root?.getBoundingClientRect();
  const viewportHeight = root ? root.clientHeight : window.innerHeight;
  const viewportTop = rootRect?.top || 0;
  const targetY = viewportTop + viewportHeight * 0.35;
  const visibleCards = cards
    .map((card) => ({
      card,
      rect: card.getBoundingClientRect()
    }))
    .filter(({ rect }) => rect.bottom > viewportTop && rect.top < viewportTop + viewportHeight)
    .sort((left, right) => (
      Math.abs(left.rect.top - targetY) - Math.abs(right.rect.top - targetY)
    ));
  const target = visibleCards[0]?.card || cards[0];
  if (target?.dataset.annotationIndex) {
    setActiveAnnotation(target.dataset.annotationIndex);
    const mark = getPreferredAnnotationMark(target.dataset.annotationIndex);
    if (mark) scrollAnnotationMarkIntoPanel(mark, "auto");
  }
}

function getAnnotationListTargetY(root) {
  if (!root) return window.innerHeight * 0.35;
  const rect = root.getBoundingClientRect();
  return rect.top + root.clientHeight * 0.35;
}

function getAnnotationScrollRoot() {
  const list = $(".annotation-list");
  if (!list) return null;
  const style = window.getComputedStyle(list);
  const scrollable = list.scrollHeight > list.clientHeight + 4 && /(auto|scroll)/.test(style.overflowY);
  return scrollable ? list : null;
}

function getPreferredAnnotationMark(index) {
  const marks = $$(`.annotation-mark[data-annotation-index="${index}"]`);
  if (!marks.length) return null;
  const visible = marks.find((mark) => isAnnotationMarkVisible(mark));
  return visible || marks[0];
}

function isAnnotationMarkVisible(mark) {
  const rect = mark.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const viewportVisible = rect.bottom >= 0 && rect.top <= window.innerHeight && rect.right >= 0 && rect.left <= window.innerWidth;
  if (!viewportVisible) return false;
  const container = mark.closest(".annotated-image-stack") || mark.closest(".image-stage");
  if (!container) return true;
  const containerRect = container.getBoundingClientRect();
  return rect.bottom >= containerRect.top && rect.top <= containerRect.bottom && rect.right >= containerRect.left && rect.left <= containerRect.right;
}

function scrollAnnotationMarkIntoPanel(mark, behavior = "auto") {
  const container = mark.closest(".annotation-image-panel")?.querySelector(".annotated-image-stack") || mark.closest("#imageStage") || mark.closest(".image-stage");
  if (!container) {
    mark.scrollIntoView({ behavior, block: "center", inline: "center" });
    return;
  }
  const markerRect = mark.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const markerCenterTop = markerRect.top - containerRect.top + container.scrollTop + markerRect.height / 2;
  const markerCenterLeft = markerRect.left - containerRect.left + container.scrollLeft + markerRect.width / 2;
  const targetTop = markerCenterTop - container.clientHeight * 0.42;
  const targetLeft = markerCenterLeft - container.clientWidth * 0.5;
  const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);
  container.scrollTo({
    top: clamp(targetTop, 0, maxTop),
    left: clamp(targetLeft, 0, maxLeft),
    behavior
  });
  queueAnnotationConnectorUpdate();
  if (behavior === "smooth") {
    window.setTimeout(queueAnnotationConnectorUpdate, 160);
    window.setTimeout(queueAnnotationConnectorUpdate, 360);
  }
}

function scrollAnnotationCardIntoPanel(card, behavior = "auto") {
  const container = getAnnotationScrollRoot();
  if (!container) {
    card.scrollIntoView({ behavior, block: "center" });
    return;
  }
  const cardRect = card.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const cardCenterTop = cardRect.top - containerRect.top + container.scrollTop + cardRect.height / 2;
  const targetTop = cardCenterTop - container.clientHeight * 0.36;
  const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTo({
    top: clamp(targetTop, 0, maxTop),
    behavior
  });
  queueAnnotationConnectorUpdate();
  if (behavior === "smooth") {
    window.setTimeout(queueAnnotationConnectorUpdate, 160);
    window.setTimeout(queueAnnotationConnectorUpdate, 360);
  }
}

function bindAnnotationConnectorEvents() {
  if (state.annotationConnectorEventsBound) return;
  state.annotationConnectorEventsBound = true;
  window.addEventListener("resize", queueAnnotationConnectorUpdate);
  document.addEventListener("scroll", queueAnnotationConnectorUpdate, true);
}

function queueAnnotationConnectorUpdate() {
  if (state.annotationConnectorFrame) return;
  state.annotationConnectorFrame = window.requestAnimationFrame(() => {
    state.annotationConnectorFrame = 0;
    renderAnnotationConnector();
  });
}

function renderAnnotationConnector() {
  const layer = getAnnotationLinkLayer();
  if (!layer) return;
  const annotationsView = $("[data-report-view='annotations']");
  if (!annotationsView?.classList.contains("active") || window.innerWidth <= 1120) {
    clearAnnotationConnector();
    return;
  }
  const index = state.activeAnnotationIndex;
  const card = $(`.annotation-card[data-annotation-index="${index}"]`);
  const mark = getPreferredAnnotationMark(index);
  if (!card || !mark) {
    clearAnnotationConnector();
    return;
  }
  const cardRect = card.getBoundingClientRect();
  const markRect = mark.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const isVisible = (rect) => (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom >= 0 &&
    rect.top <= viewportHeight &&
    rect.right >= 0 &&
    rect.left <= viewportWidth
  );
  if (!isVisible(cardRect) || !isVisible(markRect)) {
    clearAnnotationConnector();
    return;
  }
  const fromX = markRect.left + markRect.width / 2;
  const fromY = markRect.top + markRect.height / 2;
  const toX = cardRect.left <= fromX ? cardRect.right : cardRect.left;
  const toY = Math.min(Math.max(fromY, cardRect.top + 34), cardRect.bottom - 34);
  const bend = Math.min(260, Math.max(96, Math.abs(toX - fromX) * 0.42));
  const direction = toX > fromX ? 1 : -1;
  const path = `M ${fromX} ${fromY} C ${fromX + bend * direction} ${fromY}, ${toX - bend * direction} ${toY}, ${toX} ${toY}`;
  const tone = mark.classList.contains("red") ? "red" : "blue";
  layer.setAttribute("viewBox", `0 0 ${viewportWidth} ${viewportHeight}`);
  layer.innerHTML = `
    <path class="annotation-link-path ${tone}" d="${path}" />
    <circle class="annotation-link-end ${tone}" cx="${fromX}" cy="${fromY}" r="5" />
    <circle class="annotation-link-end card ${tone}" cx="${toX}" cy="${toY}" r="4" />
  `;
}

function clearAnnotationConnector() {
  const layer = getAnnotationLinkLayer();
  if (layer) layer.innerHTML = "";
}

function getAnnotationLinkLayer() {
  let layer = $("#annotationLinkLayer");
  const embeddedLayer = $(".annotation-workbench .annotation-link-layer");
  if (!layer && embeddedLayer) {
    layer = embeddedLayer;
    layer.id = "annotationLinkLayer";
    document.body.appendChild(layer);
  } else if (layer && embeddedLayer && embeddedLayer !== layer) {
    embeddedLayer.remove();
  }
  if (!layer) {
    layer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    layer.id = "annotationLinkLayer";
    layer.classList.add("annotation-link-layer");
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
  }
  return layer;
}

function findLayoutTextRange(essay, original) {
  const source = String(essay || "");
  const needle = String(original || "").trim();
  const sourceMap = buildTextLocationMap(source);
  const needleMap = buildTextLocationMap(needle);
  if (!needleMap.layoutText) {
    return { offset: -1, length: 0 };
  }

  const rawIndex = source.indexOf(needle);
  if (rawIndex >= 0) {
    const offset = rawIndexToLayoutOffset(source, rawIndex);
    return {
      offset,
      gridOffset: sourceMap.layoutToGridOffsets[offset] ?? offset,
      length: needleMap.layoutText.length
    };
  }

  const layoutIndex = sourceMap.layoutText.indexOf(needleMap.layoutText);
  if (layoutIndex >= 0) {
    return {
      offset: layoutIndex,
      gridOffset: sourceMap.layoutToGridOffsets[layoutIndex] ?? layoutIndex,
      length: needleMap.layoutText.length
    };
  }

  if (needleMap.comparableText.length >= 4) {
    const comparableIndex = sourceMap.comparableText.indexOf(needleMap.comparableText);
    if (comparableIndex >= 0) {
      const offset = sourceMap.comparableToLayoutOffsets[comparableIndex] ?? comparableIndex;
      return {
        offset,
        gridOffset: sourceMap.layoutToGridOffsets[offset] ?? offset,
        length: needleMap.layoutText.length
      };
    }
  }

  return { offset: -1, length: needleMap.layoutText.length };
}

function findContainingSentenceStart(essay, layoutOffset, original) {
  const ranges = extractSentenceLayoutRanges(essay);
  const containing = ranges.find((range) => layoutOffset >= range.offset && layoutOffset < range.offset + range.length);
  if (containing) {
    return {
      offset: containing.offset,
      gridOffset: containing.gridOffset ?? containing.offset
    };
  }

  const originalText = normalizeLocatorText(original || "");
  if (originalText) {
    const related = ranges.find((range) => {
      const text = normalizeLocatorText(range.text);
      return text.includes(originalText) || originalText.includes(text);
    });
    if (related) {
      return {
        offset: related.offset,
        gridOffset: related.gridOffset ?? related.offset
      };
    }
  }

  return {
    offset: layoutOffset,
    gridOffset: layoutOffsetToGridOffset(essay, layoutOffset)
  };
}

function findRelatedSentenceIndex(sentences, original) {
  const originalText = normalizeLocatorText(original || "");
  if (!originalText) return -1;
  return sentences.findIndex((sentence) => {
    const normalized = normalizeLocatorText(sentence);
    return normalized.includes(originalText) || originalText.includes(normalized);
  });
}

function extractSentenceLayoutRanges(text) {
  const ranges = [];
  const source = String(text || "");
  let layoutOffset = 0;
  let line = 0;
  let column = 0;
  let startOffset = null;
  let startGridOffset = null;
  let sentenceText = "";

  const closeRange = () => {
    if (startOffset === null) return;
    const cleanText = sentenceText.trim();
    if (cleanText.length > 1) {
      ranges.push({
        offset: startOffset,
        gridOffset: startGridOffset ?? startOffset,
        length: Math.max(1, layoutOffset - startOffset),
        text: cleanText
      });
    }
    startOffset = null;
    startGridOffset = null;
    sentenceText = "";
  };

  for (const char of source) {
    if (/\s/.test(char)) {
      if (char === "\n" && sentenceText.trim().length <= 18) closeRange();
      if (char === "\n" && column > 0) {
        line += 1;
        column = 0;
      }
      continue;
    }
    if (startOffset === null) {
      startOffset = layoutOffset;
      startGridOffset = line * 20 + column;
    }
    sentenceText += char;
    layoutOffset += 1;
    column += 1;
    if (column >= 20) {
      line += 1;
      column = 0;
    }
    if (/[。！？!?；;]/.test(char)) closeRange();
  }
  closeRange();
  return ranges;
}

function buildTextLocationMap(text) {
  const map = {
    layoutText: "",
    comparableText: "",
    comparableToLayoutOffsets: [],
    layoutToGridOffsets: []
  };
  let line = 0;
  let column = 0;
  for (const char of String(text || "")) {
    if (/\s/.test(char)) {
      if (char === "\n" && column > 0) {
        line += 1;
        column = 0;
      }
      continue;
    }
    const layoutOffset = map.layoutText.length;
    map.layoutToGridOffsets.push(line * 20 + column);
    map.layoutText += char;
    if (!isIgnoredLocatorPunctuation(char)) {
      map.comparableText += char;
      map.comparableToLayoutOffsets.push(layoutOffset);
    }
    column += 1;
    if (column >= 20) {
      line += 1;
      column = 0;
    }
  }
  return map;
}

function rawIndexToLayoutOffset(text, rawIndex) {
  return String(text || "").slice(0, rawIndex).replace(/\s/g, "").length;
}

function normalizeLayoutText(text) {
  return String(text || "").replace(/\s/g, "");
}

function layoutOffsetToGridOffset(text, layoutOffset) {
  const map = buildTextLocationMap(text);
  return map.layoutToGridOffsets[layoutOffset] ?? layoutOffset;
}

function isIgnoredLocatorPunctuation(char) {
  return /[，,。！？!?；;：:“”"‘’、（）()《》【】\[\]]/.test(char);
}

function normalizeLocatorText(text) {
  return String(text || "")
    .replace(/\s/g, "")
    .replace(/[，,。！？!?；;：:“”"‘’、（）()《》【】\[\]]/g, "");
}

function roundPercent(value) {
  return Number(value.toFixed(2));
}

function buildTeacherComment(report) {
  const weak = report.requirements.filter((item) => item.value <= 3).map((item) => item.text);
  const strong = report.requirements.filter((item) => item.value >= 4).map((item) => item.text);
  const topic = report.analysis.topic;
  const strength = strong[0] || "能围绕题目展开";
  const gap = weak[0] || "细节还可以继续丰富";
  return `这篇作文围绕“${topic}”展开，${strength}，能看出你认真回忆了事情经过。文章也有一些值得保留的表达，尤其是具体场景和心情变化的部分。不过，${gap}，建议继续补充动作、语言、心理或感官描写，让过程更连贯、更有画面感。继续加油，把关键细节写实，作文会更有感染力。`;
}

async function switchPanel(panel) {
  $$(".nav-item[data-panel]").forEach((button) => button.classList.toggle("active", button.dataset.panel === panel));
  $$("[data-panel-view]").forEach((view) => view.classList.toggle("active", view.dataset.panelView === panel));
  if (panel === "library" || panel === "workspace") {
    await refreshBootstrapIfFallback();
  }
}

async function refreshBootstrapIfFallback() {
  if (state.refreshingBootstrap || !isFallbackPromptLibrary()) return;
  state.refreshingBootstrap = true;
  try {
    await loadBackendBootstrap();
    if (!isFallbackPromptLibrary()) {
      renderQueue();
      renderLibraryTable();
      populateGradeSelect();
      loadQueueItem(state.currentQueueId);
      initModelConfig();
    }
  } finally {
    state.refreshingBootstrap = false;
  }
}

function isFallbackPromptLibrary() {
  return promptLibrary.length === 0 || promptLibrary.length <= 14 || promptLibrary.some((prompt) => prompt.status === "待审核");
}

function switchReportTab(tab) {
  $$(".tab-button").forEach((button) => button.classList.toggle("active", button.dataset.reportTab === tab));
  $$("[data-report-view]").forEach((view) => view.classList.toggle("active", view.dataset.reportView === tab));
  $("#workspacePanel")?.classList.remove("annotation-sync-mode");
  clearAnnotationConnector();
}

function toggleEditMode() {
  state.editMode = !state.editMode;
  applyEditMode();
  $("#toggleEditButton").classList.toggle("active", state.editMode);
}

function applyEditMode() {
  $("#reportPaper")?.classList.toggle("editing-report", state.editMode);
  $$(".editable-report-text").forEach((node) => {
    node.setAttribute("contenteditable", state.editMode ? "true" : "false");
  });
}

function handlePolishFormatButton(event) {
  const button = event.target.closest("[data-polish-format]");
  if (!button) return;
  event.preventDefault();
  applyPolishTextFormat(button.dataset.polishFormat);
}

function applyPolishTextFormat(format) {
  if (!state.editMode) {
    setGradingStatus("请先开启编辑模式", "pending");
    return;
  }
  const article = $(".report-section.active .polish-article");
  if (!article) {
    setGradingStatus("请先切换到润色页", "pending");
    return;
  }
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) {
    setGradingStatus("请先选中润色稿中的文字", "pending");
    return;
  }
  const range = selection.getRangeAt(0);
  if (!rangeBelongsToNode(range, article)) {
    setGradingStatus("只能标注润色稿中的文字", "pending");
    return;
  }
  const wrapper = document.createElement("span");
  wrapper.className = `teacher-polish-${format}`;
  const fragment = range.extractContents();
  unwrapTeacherPolishSpans(fragment);
  wrapper.appendChild(fragment);
  range.insertNode(wrapper);
  selection.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.selectNodeContents(wrapper);
  selection.addRange(nextRange);
  article.focus();
  persistEditableReportNode(article);
  setGradingStatus({
    red: "已标为红色",
    green: "已标为绿色",
    normal: "已恢复正常字体"
  }[format] || "已更新润色标注", "success");
}

function handleEditableReportInput(event) {
  const node = event.target.closest?.(".editable-report-text[data-report-edit]");
  if (!node || !state.editMode) return;
  persistEditableReportNode(node);
}

function persistEditableReportNode(node) {
  const report = state.currentReport;
  if (!report || !node) return;
  const type = node.dataset.reportEdit;
  const index = Number(node.dataset.reportEditIndex);
  if (type === "teacherComment") {
    report.teacherComment = node.innerText.trim();
  } else if (type === "annotationSuggestion" && Number.isInteger(index) && report.annotations?.[index]) {
    report.annotations[index].suggestion = node.innerText.trim();
  } else if (type === "guideExample" && Number.isInteger(index) && report.guide?.[index]) {
    report.guide[index].example = node.innerText.replace(/^调整示例[:：]\s*/, "").trim();
  } else if (type === "polishedHtml") {
    report.polishedHtmlOverride = node.innerHTML;
    report.polished = node.innerText.trim();
  }
  syncCurrentQueueItem({ report });
}

function rangeBelongsToNode(range, node) {
  const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
  const end = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement;
  return node.contains(start) && node.contains(end);
}

function unwrapTeacherPolishSpans(root) {
  root.querySelectorAll?.(".teacher-polish-red, .teacher-polish-green, .teacher-polish-normal").forEach((node) => {
    const parent = node.parentNode;
    if (!parent) return;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    parent.removeChild(node);
  });
}

async function handleImageUpload(event) {
  const files = [...(event.target.files || [])].filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  setOcrStatus("正在处理报告图片附件", "pending");
  try {
    const existingImages = normalizeClientImages(state.currentImages);
    const availableSlots = Math.max(0, MAX_IMAGE_PAGES - existingImages.length);
    if (!availableSlots) {
      setOcrStatus(`最多支持 ${MAX_IMAGE_PAGES} 张报告图片，请先清空后重新上传`, "pending");
      return;
    }
    const nextImages = await filesToImagePayload(files, availableSlots);
    state.currentImages = normalizeClientImages([...existingImages, ...nextImages]);
    if (state.currentReport) state.currentReport.sourceImages = state.currentImages;
    syncCurrentQueueItem({
      images: state.currentImages.length,
      imageMeta: state.currentImages.map(toClientImageMeta),
      imageData: state.currentImages,
      report: state.currentReport
    });
    renderImageWorkspace();
    if (state.currentReport) {
      const annotations = $("[data-report-view='annotations']");
      renderReportSection(annotations, () => renderAnnotations(state.currentReport), "点评");
      applyEditMode();
      bindAnnotationLinks();
    }
    renderQueue();
    const limitNote = files.length > nextImages.length ? `，已达到 ${MAX_IMAGE_PAGES} 张上限` : "";
    setOcrStatus(`已添加 ${nextImages.length} 张，共 ${state.currentImages.length} 张报告图片附件${limitNote}`, "success");
  } catch (error) {
    setOcrStatus(error.message || "图片处理失败", "pending");
  } finally {
    event.target.value = "";
  }
}

async function runOcrFromImages() {
  if (!state.currentImages.length) {
    setOcrStatus("请先上传作文图片", "pending");
    return;
  }
  if (!state.backendAvailable) {
    setOcrStatus("后端未连接，请先启动服务", "pending");
    return;
  }
  const button = $("#runOcrButton");
  button.disabled = true;
  button.textContent = "识别中";
  setOcrStatus(`正在逐页识别，共 ${state.currentImages.length} 张`, "pending");
  try {
    state.currentImages = await ensureCloudImagesUploaded(state.currentImages);
    syncCurrentQueueItem({
      images: state.currentImages.length,
      imageMeta: state.currentImages.map(toClientImageMeta),
      imageData: state.currentImages
    }, { immediate: true });
    const result = await apiRequest("/api/ocr", {
      method: "POST",
      body: {
        queueId: state.currentQueueId,
        images: serializeImagesForApi(state.currentImages)
      }
    });
    state.ocrText = result.text || "";
    state.currentReport = null;
    $("#essayInput").value = state.ocrText;
    syncCurrentQueueItem({
      essay: state.ocrText,
      ocrText: state.ocrText,
      ocrPages: result.pageTexts || [],
      ocrStatus: result.ok ? "done" : "manual",
      report: null
    });
    updateCharCount();
    const expectedPages = Number(result.expectedPages || result.pageCount || state.currentImages.length);
    const recognizedPages = Number(result.recognizedPages || (result.pageTexts || []).filter((item) => String(item.text || "").trim()).length);
    const complete = result.ok && expectedPages === state.currentImages.length && recognizedPages === state.currentImages.length;
    const message = result.message || (complete
      ? `图片文字已逐页识别 ${recognizedPages}/${expectedPages} 页并写入识别文本区，请老师校对后批改`
      : `图片文字当前只识别出 ${recognizedPages}/${expectedPages} 页，请在识别文本区检查缺失页后重试或手动补齐`);
    setOcrStatus(message, complete ? "success" : "pending");
  } catch (error) {
    setOcrStatus(error.message || "图片文字读取失败", "pending");
  } finally {
    button.disabled = false;
    button.textContent = "识别图片";
  }
}

function renderImageWorkspace() {
  const images = normalizeClientImages(state.currentImages);
  state.currentImages = images;
  const thumbGrid = $("#ocrThumbGrid");
  if (thumbGrid) {
    thumbGrid.innerHTML = images.map((image, index) => `
      <figure class="thumb-item">
        <img src="${getImagePreviewDataUrl(image)}" alt="作文图片 ${index + 1}" />
        <figcaption>${index + 1}</figcaption>
      </figure>
    `).join("");
  }

  const stage = $("#imageStage");
  if (!stage) return;
  if (!images.length) {
    stage.innerHTML = renderEmptyImageStage();
    return;
  }
  stage.innerHTML = `
    <div class="uploaded-image-stack">
      ${images.map((image, index) => `
        <figure class="uploaded-page">
          <div class="uploaded-page-frame">
            <img src="${image.dataUrl}" alt="作文原文第 ${index + 1} 页" />
            <div class="annotation-overlay" aria-label="原文批注标记">
              ${renderWorkspaceAnnotationMarksForPage(index)}
            </div>
          </div>
          <figcaption>第 ${index + 1} 页 · ${escapeHTML(image.name)}</figcaption>
        </figure>
      `).join("")}
    </div>
  `;
}

function renderWorkspaceAnnotationMarksForPage(pageIndex) {
  const report = state.currentReport;
  if (!report?.annotations?.length) return "";
  return report.annotations.map((item, index) => {
    const point = item.anchor?.point;
    if (!point || point.pageIndex !== pageIndex) return "";
    return `
      <button
        class="annotation-mark ${item.tone === "red" ? "red" : "blue"}"
        type="button"
        data-annotation-index="${index}"
        style="left:${point.x}%;top:${point.y}%"
        aria-label="查看第 ${index + 1} 条${item.type}点评"
        title="拖动可微调位置，方向键可小步调整"
      >
        <span>${index + 1}</span>
      </button>
    `;
  }).join("");
}

function renderEmptyImageStage() {
  return `
    <div class="image-empty-state">
      <strong>暂无原文图片</strong>
      <p>上传或拍照后，这里会显示可联动的批注定位。</p>
    </div>
  `;
}

function setOcrStatus(message, tone) {
  const node = $("#ocrStatus");
  if (!node) return;
  if (!message) {
    node.className = "capture-result compact";
    node.textContent = "";
    return;
  }
  node.className = `capture-result compact show ${tone === "success" ? "success" : "pending"}`;
  node.textContent = message;
}

function setGradingStatus(message, tone) {
  const node = $("#gradingStatus");
  if (!node) return;
  if (!message) {
    node.hidden = true;
    node.textContent = "";
    node.className = "grading-status-chip";
    return;
  }
  node.hidden = false;
  node.textContent = message;
  node.className = `grading-status-chip ${tone === "success" ? "success" : "pending"}`;
}

function syncCurrentQueueItem(fields, options = {}) {
  let item = getCurrentQueueItem();
  if (!item) {
    if (!shouldCreateDraftForFields(fields)) return;
    item = createLocalQueueDraft(fields);
  }
  const updatedAt = new Date().toISOString();
  Object.assign(item, fields, {
    updatedAt,
    expiresAt: new Date(Date.parse(updatedAt) + state.taskRetentionDays * 24 * 60 * 60 * 1000).toISOString()
  });
  if (Object.prototype.hasOwnProperty.call(fields, "imageData")) {
    item.imageData = normalizeClientImages(fields.imageData || []);
    item.imageMeta = item.imageData.map(toClientImageMeta);
    item.images = item.imageData.length;
  }
  if (options.skipAutosave) return;
  scheduleQueueAutosave(item.id, fields, Boolean(options.immediate));
}

function getCurrentQueueItem() {
  return queueItems.find((entry) => entry.id === state.currentQueueId) || null;
}

function shouldCreateDraftForFields(fields = {}) {
  if (!fields || typeof fields !== "object") return false;
  if (String(fields.essay || fields.ocrText || "").trim()) return true;
  if (Array.isArray(fields.imageData) && fields.imageData.length) return true;
  if (fields.report) return true;
  if (fields.customPrompt?.active) return true;
  if (fields.student && fields.student !== "未命名学生") return true;
  return false;
}

function createLocalQueueDraft(fields = {}) {
  const prompt = getCurrentPrompt();
  const images = normalizeClientImages(fields.imageData || state.currentImages || []);
  const id = `${LOCAL_DRAFT_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const essay = String(fields.essay ?? fields.ocrText ?? $("#essayInput")?.value ?? "");
  const item = {
    id,
    teacherId: state.teacherId,
    student: fields.student || getCurrentStudentName(null),
    meta: buildQueueMetaFromPrompt(prompt),
    promptId: prompt.id || "",
    grade: prompt.grade || $("#gradeSelect")?.value || "",
    book: prompt.book || $("#bookSelect")?.value || "",
    unit: prompt.unit || $("#unitSelect")?.value || "",
    essay,
    ocrText: String(fields.ocrText ?? essay),
    ocrPages: Array.isArray(fields.ocrPages) ? fields.ocrPages : [],
    ocrStatus: fields.ocrStatus || "pending",
    images: images.length,
    imageMeta: images.map(toClientImageMeta),
    imageData: images,
    gradingHint: String(fields.gradingHint || state.gradingHint || getSavedDefaultGradingHint()),
    gradingError: String(fields.gradingError || ""),
    customPrompt: normalizeCustomPrompt(fields.customPrompt || state.customPrompt),
    report: fields.report || state.currentReport || null,
    status: fields.status || "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + state.taskRetentionDays * 24 * 60 * 60 * 1000).toISOString()
  };
  queueItems.unshift(item);
  state.currentQueueId = id;
  renderQueue();
  return item;
}

function buildQueueMetaFromPrompt(prompt) {
  if (!prompt) return "未设置任务";
  return `${prompt.grade || ""}${prompt.book || ""} ${prompt.unit || ""} ${prompt.title || ""}`.trim() || "未设置任务";
}

function syncPromptSelectionToCurrentQueueItem() {
  const item = getCurrentQueueItem();
  if (!item && !$("#essayInput")?.value?.trim() && !state.currentImages.length) return;
  const prompt = getCurrentPrompt();
  syncCurrentQueueItem({
    meta: buildQueueMetaFromPrompt(prompt),
    promptId: prompt.id || "",
    grade: prompt.grade || "",
    book: prompt.book || "",
    unit: prompt.unit || "",
    customPrompt: normalizeCustomPrompt(state.customPrompt)
  });
  renderQueue();
}

function scheduleQueueAutosave(itemId, fields = {}, immediate = false) {
  if (!state.backendAvailable || !itemId) return;
  state.autosaveItems[itemId] = {
    ...(state.autosaveItems[itemId] || {}),
    ...fields
  };
  if (state.autosaveTimer) {
    window.clearTimeout(state.autosaveTimer);
    state.autosaveTimer = 0;
  }
  if (immediate) {
    flushQueueAutosaves();
    return;
  }
  state.autosaveTimer = window.setTimeout(flushQueueAutosaves, AUTOSAVE_DEBOUNCE_MS);
}

async function flushQueueAutosaves() {
  if (!state.backendAvailable || state.autosaveInFlight) return;
  const entries = Object.entries(state.autosaveItems);
  if (!entries.length) return;
  state.autosaveItems = {};
  if (state.autosaveTimer) {
    window.clearTimeout(state.autosaveTimer);
    state.autosaveTimer = 0;
  }
  state.autosaveInFlight = true;
  try {
    for (const [itemId, originalFields] of entries) {
      let fields = originalFields;
      const item = queueItems.find((entry) => entry.id === itemId);
      if (!item) continue;
      if (itemId.startsWith(LOCAL_DRAFT_ID_PREFIX) || Object.prototype.hasOwnProperty.call(fields, "imageData")) {
        const uploadedImages = await ensureCloudImagesUploaded(fields.imageData || item.imageData || []);
        item.imageData = uploadedImages;
        item.imageMeta = uploadedImages.map(toClientImageMeta);
        item.images = uploadedImages.length;
        fields = { ...fields, imageData: uploadedImages };
        if (state.currentQueueId === itemId) state.currentImages = uploadedImages;
      }
      if (itemId.startsWith(LOCAL_DRAFT_ID_PREFIX)) {
        const saved = await apiRequest("/api/submissions", {
          method: "POST",
          body: buildSubmissionPayload(item)
        });
        const localReport = item.report || null;
        Object.assign(item, saved);
        if (localReport && !item.report) item.report = localReport;
        if (state.currentQueueId === itemId) {
          state.currentQueueId = item.id;
          state.currentImages = normalizeClientImages(item.imageData || []);
          renderImageWorkspace();
        }
        renderQueue();
      } else {
        const saved = await apiRequest(`/api/submissions/${encodeURIComponent(itemId)}`, {
          method: "PATCH",
          body: normalizeAutosaveFields(fields)
        });
        const localReport = item.report || null;
        Object.assign(item, saved);
        if (localReport && !item.report) item.report = localReport;
        if (state.currentQueueId === itemId && Object.prototype.hasOwnProperty.call(fields, "imageData")) {
          state.currentImages = normalizeClientImages(item.imageData || []);
          renderImageWorkspace();
        }
      }
    }
  } catch (error) {
    entries.forEach(([itemId, fields]) => {
      const currentItem = queueItems.find((item) => item.id === itemId);
      const retryFields = Object.prototype.hasOwnProperty.call(fields, "imageData") && currentItem
        ? { ...fields, imageData: currentItem.imageData || fields.imageData }
        : fields;
      state.autosaveItems[itemId] = {
        ...(state.autosaveItems[itemId] || {}),
        ...retryFields
      };
    });
    setGradingStatus("自动保存失败，稍后会继续尝试", "pending");
  } finally {
    state.autosaveInFlight = false;
    if (Object.keys(state.autosaveItems).length) {
      state.autosaveTimer = window.setTimeout(flushQueueAutosaves, AUTOSAVE_DEBOUNCE_MS * 2);
    }
  }
}

function normalizeAutosaveFields(fields = {}) {
  const payload = { ...fields };
  if (Object.prototype.hasOwnProperty.call(payload, "imageData")) {
    payload.imageData = serializeImagesForApi(payload.imageData || []);
    payload.imageMeta = payload.imageData.map(toClientImageMeta);
    payload.images = payload.imageData.length;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "customPrompt")) {
    payload.customPrompt = normalizeCustomPrompt(payload.customPrompt);
  }
  return payload;
}

function buildSubmissionPayload(item) {
  const imageData = normalizeClientImages(item.imageData || []);
  return {
    teacherId: state.teacherId,
    student: item.student || "未命名学生",
    task: item.meta || "未设置任务",
    meta: item.meta || "未设置任务",
    promptId: item.promptId || "",
    grade: item.grade || "",
    book: item.book || "",
    unit: item.unit || "",
    essay: item.essay || "",
    ocrText: item.ocrText || item.essay || "",
    ocrPages: Array.isArray(item.ocrPages) ? item.ocrPages : [],
    ocrStatus: item.ocrStatus || "pending",
    images: imageData.length,
    imageData: serializeImagesForApi(imageData),
    gradingHint: String(item.gradingHint || state.gradingHint || getSavedDefaultGradingHint()),
    gradingError: String(item.gradingError || ""),
    customPrompt: normalizeCustomPrompt(item.customPrompt || state.customPrompt),
    report: item.report || null,
    status: item.status || "draft"
  };
}

function persistCurrentQueueItemOnPageHide() {
  const item = getCurrentQueueItem();
  if (!state.backendAvailable || !item || item.id.startsWith(LOCAL_DRAFT_ID_PREFIX)) return;
  const payload = JSON.stringify(buildSubmissionPayload(item));
  const authorization = readApiAuthorization();
  window.fetch(buildApiUrl(`/api/submissions/${encodeURIComponent(item.id)}/autosave`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
      ...(state.teacherId ? { "X-Teacher-Id": state.teacherId } : {})
    },
    body: payload,
    keepalive: true
  }).catch(() => {});
}

async function filesToImagePayload(fileList, limit = MAX_IMAGE_PAGES) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/")).slice(0, limit);
  return Promise.all(files.map((file, index) => fileToCompressedImage(file, index)));
}

async function fileToCompressedImage(file, index) {
  const dataUrl = await readFileAsDataUrl(file);
  const recognition = await prepareRecognitionImageDataUrl(dataUrl, file.type);
  const preview = await createPreviewImageDataUrl(dataUrl, file.type);
  return {
    id: `img-${Date.now()}-${index + 1}`,
    name: file.name || `作文图片${index + 1}.jpg`,
    type: recognition.type,
    size: recognition.size || file.size,
    originalSize: file.size,
    dataUrl: recognition.dataUrl,
    previewDataUrl: preview.dataUrl,
    previewSize: preview.size
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function prepareRecognitionImageDataUrl(dataUrl, sourceType) {
  return new Promise((resolve) => {
    const normalizedType = String(sourceType || "").toLowerCase();
    const originalSize = estimateDataUrlSize(dataUrl);
    if (MODEL_SUPPORTED_IMAGE_TYPES.has(normalizedType) && originalSize <= OCR_IMAGE_KEEP_ORIGINAL_MAX_BYTES) {
      resolve({
        type: sourceType || "image/jpeg",
        size: originalSize,
        dataUrl
      });
      return;
    }
    renderImageVariant(dataUrl, {
      maxEdge: OCR_IMAGE_MAX_EDGE,
      quality: OCR_IMAGE_JPEG_QUALITY,
      fallbackType: sourceType || "image/jpeg"
    }).then(resolve);
  });
}

function createPreviewImageDataUrl(dataUrl, sourceType) {
  return renderImageVariant(dataUrl, {
    maxEdge: PREVIEW_IMAGE_MAX_EDGE,
    quality: PREVIEW_IMAGE_JPEG_QUALITY,
    fallbackType: sourceType || "image/jpeg",
    allowOriginalWhenSmaller: true
  });
}

function renderImageVariant(dataUrl, options = {}) {
  return new Promise((resolve) => {
    const originalSize = estimateDataUrlSize(dataUrl);
    const maxEdge = Number(options.maxEdge || OCR_IMAGE_MAX_EDGE);
    const quality = Number(options.quality || OCR_IMAGE_JPEG_QUALITY);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const output = canvas.toDataURL("image/jpeg", quality);
      const outputSize = estimateDataUrlSize(output);
      if (options.allowOriginalWhenSmaller && outputSize >= originalSize) {
        resolve({
          type: options.fallbackType || "image/jpeg",
          size: originalSize,
          dataUrl
        });
        return;
      }
      resolve({
        type: "image/jpeg",
        size: outputSize,
        dataUrl: output
      });
    };
    image.onerror = () => {
      resolve({
        type: options.fallbackType || "image/jpeg",
        size: estimateDataUrlSize(dataUrl),
        dataUrl
      });
    };
    image.src = dataUrl;
  });
}

function estimateDataUrlSize(dataUrl) {
  const base64 = String(dataUrl).split(",")[1] || "";
  return Math.round((base64.length * 3) / 4);
}

function normalizeClientImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .filter((image) => image && (isImageSource(image.dataUrl) || image.storageKey))
    .slice(0, MAX_IMAGE_PAGES)
    .map((image, index) => ({
      id: image.id || `img-${index + 1}`,
      name: image.name || `作文图片${index + 1}.jpg`,
      type: image.type || "image/jpeg",
      size: Number(image.size || 0),
      originalSize: Number(image.originalSize || image.size || 0),
      dataUrl: String(image.dataUrl || ""),
      previewDataUrl: isImageSource(image.previewDataUrl) ? image.previewDataUrl : String(image.dataUrl || ""),
      previewSize: Number(image.previewSize || 0),
      storageKey: String(image.storageKey || ""),
      previewStorageKey: String(image.previewStorageKey || "")
    }));
}

function toClientImageMeta(image) {
  return {
    id: image.id,
    name: image.name,
    type: image.type,
    size: image.size,
    originalSize: image.originalSize,
    previewSize: image.previewSize,
    storageKey: image.storageKey || "",
    previewStorageKey: image.previewStorageKey || ""
  };
}

function isImageDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

function isImageSource(value) {
  return isImageDataUrl(value) || (typeof value === "string" && /^https:\/\//i.test(value));
}

function getImagePreviewDataUrl(image) {
  return isImageSource(image?.previewDataUrl) ? image.previewDataUrl : image?.dataUrl || "";
}

function renderLibraryTable() {
  const body = $("#libraryTableBody");
  if (!body) return;
  const sortedPrompts = sortedPromptLibrary();
  const countStatus = $("#libraryCountStatus");
  const fallback = isFallbackPromptLibrary();
  countStatus.textContent = !sortedPrompts.length ? "未加载" : (fallback ? `${sortedPrompts.length} 条 · 演示` : `${sortedPrompts.length} 条`);
  countStatus.className = `status-chip ${fallback ? "pending" : "success"}`;
  const summary = countPromptsByGradeBook(sortedPrompts);
  $("#librarySummary").innerHTML = summary.length
    ? summary.map((item) => `<span>${item.label}<strong>${item.count}</strong></span>`).join("")
    : "<span>等待后端题库加载<strong>0</strong></span>";
  if (!sortedPrompts.length) {
    body.innerHTML = `
      <tr>
        <td colspan="6">题库未加载，请确认本地服务正在运行后刷新页面。</td>
      </tr>
    `;
    return;
  }
  body.innerHTML = sortedPrompts.map((item) => `
    <tr>
      <td>${item.grade}</td>
      <td>${item.book}</td>
      <td>${item.unit}</td>
      <td>${item.title}</td>
      <td>${item.type}</td>
      <td><span class="quality-pill">${item.status}</span></td>
    </tr>
  `).join("");
}

function sortedPromptLibrary() {
  const gradeOrder = new Map(["三年级", "四年级", "五年级", "六年级", "七年级"].map((grade, index) => [grade, index]));
  const bookOrder = new Map(["上册", "下册"].map((book, index) => [book, index]));
  return [...promptLibrary].sort((left, right) => (
    (gradeOrder.get(left.grade) ?? 99) - (gradeOrder.get(right.grade) ?? 99) ||
    (bookOrder.get(left.book) ?? 99) - (bookOrder.get(right.book) ?? 99) ||
    unitNumber(left.unit) - unitNumber(right.unit)
  ));
}

function countPromptsByGradeBook(prompts) {
  const counts = new Map();
  sortedPromptLibraryKeys().forEach((key) => counts.set(key, 0));
  prompts.forEach((prompt) => {
    const key = `${prompt.grade}${prompt.book}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts].map(([label, count]) => ({ label, count })).filter((item) => item.count > 0);
}

function sortedPromptLibraryKeys() {
  const keys = [];
  ["三年级", "四年级", "五年级", "六年级", "七年级"].forEach((grade) => {
    ["上册", "下册"].forEach((book) => keys.push(`${grade}${book}`));
  });
  return keys;
}

function unitNumber(unit) {
  const map = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8
  };
  const match = String(unit).match(/第([一二三四五六七八0-9]+)单元/);
  if (!match) return 99;
  return Number(match[1]) || map[match[1]] || 99;
}

async function initCapturePage() {
  await loadBackendBootstrap();
  await loadNetworkInfo();
  populateCaptureTaskOptions();
  const photoInput = $("#capturePhotoInput");
  const albumInput = $("#captureAlbumInput");
  const thumbGrid = $("#captureThumbGrid");
  const result = $("#captureResult");
  const submitButton = $("#submitCaptureButton");
  let captureImages = [];
  if (!photoInput) return;
  let captureDraftEnabled = true;
  const getDraftPayload = () => ({
    student: $("#captureStudent")?.value || "",
    taskId: $("#captureTask")?.value || "",
    images: captureImages
  });
  const saveDraftNow = () => {
    if (!captureDraftEnabled) return Promise.resolve();
    return saveCaptureDraft(getDraftPayload());
  };
  const saveDraft = debounce(() => {
    saveDraftNow();
  }, 350);
  const restoredDraft = await loadCaptureDraft();
  if (restoredDraft) {
    $("#captureStudent").value = restoredDraft.student || "";
    if (restoredDraft.taskId) $("#captureTask").value = restoredDraft.taskId;
    captureImages = normalizeClientImages(restoredDraft.images || []);
    renderThumbGrid(thumbGrid, captureImages);
    if (restoredDraft.student || restoredDraft.taskId || captureImages.length) {
      result.className = "capture-result show success";
      result.textContent = captureImages.length
        ? `已恢复上次未提交草稿，共 ${captureImages.length} 张图片`
        : "已恢复上次未提交草稿";
    }
  }
  $("#captureStudent")?.addEventListener("input", saveDraft);
  $("#captureTask")?.addEventListener("change", saveDraft);
  window.addEventListener("pagehide", saveDraftNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveDraftNow();
  });
  const handleCaptureFiles = async (input) => {
    const files = [...(input.files || [])].filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    result.className = "capture-result show pending";
    result.textContent = "正在处理图片";
    const availableSlots = Math.max(0, MAX_IMAGE_PAGES - captureImages.length);
    if (!availableSlots) {
      result.className = "capture-result show pending";
      result.textContent = `最多支持 ${MAX_IMAGE_PAGES} 张作文图片，请先提交或刷新后重新选择`;
      input.value = "";
      return;
    }
    try {
      const nextImages = await filesToImagePayload(files, availableSlots);
      captureImages = [...captureImages, ...nextImages].slice(0, MAX_IMAGE_PAGES);
      renderThumbGrid(thumbGrid, captureImages);
      saveDraftNow();
      result.className = "capture-result show success";
      const limitNote = files.length > nextImages.length ? `，已达到 ${MAX_IMAGE_PAGES} 张上限` : "";
      result.textContent = `本次新增 ${nextImages.length} 张，共 ${captureImages.length} 张图片已就绪${limitNote}`;
    } catch (error) {
      result.className = "capture-result show pending";
      result.textContent = error.message || "图片处理失败，请重新拍照或从相册选择";
    } finally {
      input.value = "";
    }
  };
  photoInput.addEventListener("change", () => handleCaptureFiles(photoInput));
  albumInput?.addEventListener("change", () => handleCaptureFiles(albumInput));
  submitButton.addEventListener("click", async () => {
    const student = $("#captureStudent").value.trim() || "未命名学生";
    const prompt = getCapturePrompt();
    if (!prompt) {
      result.className = "capture-result show pending";
      result.textContent = "请先选择作文任务";
      return;
    }
    const task = formatPromptTask(prompt);
    const count = captureImages.length;
    if (!count) {
      result.className = "capture-result show pending";
      result.textContent = "请先拍照或选择作文图片";
      return;
    }
    submitButton.disabled = true;
    submitButton.textContent = "提交中";
    let saved = null;
    let submitError = "";
    try {
      captureImages = await ensureCloudImagesUploaded(captureImages);
      saved = await apiRequest("/api/submissions", {
        method: "POST",
        body: {
          student,
          task,
          meta: task,
          promptId: prompt.id,
          grade: prompt.grade,
          book: prompt.book,
          unit: prompt.unit,
          images: count,
          imageData: serializeImagesForApi(captureImages)
        }
      });
    } catch (error) {
      saved = null;
      submitError = error.message || "提交失败";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "提交到 Web";
    }
    if (saved) {
      result.className = "capture-result show success";
      result.innerHTML = `<strong>已提交到 Web 待处理队列</strong><br />${escapeHTML(student)} · ${escapeHTML(task)} · ${count} 张图片`;
      captureDraftEnabled = false;
      captureImages = [];
      renderThumbGrid(thumbGrid, captureImages);
      $("#captureStudent").value = "";
      $("#captureTask").value = "";
      await clearCaptureDraft();
    } else {
      result.className = "capture-result show pending";
      result.innerHTML = `<strong>提交失败，照片已保留</strong><br />${escapeHTML(submitError)}<br />请确认手机和电脑在同一个 Wi-Fi，并且启动窗口没有关闭。`;
      await saveDraftNow();
    }
  });
}

function populateCaptureTaskOptions() {
  const select = $("#captureTask");
  if (!select) return;
  const prompts = sortedPromptLibrary();
  if (!prompts.length) {
    select.innerHTML = "<option value=\"\">题库未加载</option>";
    return;
  }
  select.innerHTML = [
    "<option value=\"\">请选择作文任务</option>",
    ...prompts.map((prompt) => `
      <option value="${prompt.id || `${prompt.grade}-${prompt.book}-${prompt.unit}`}">${formatPromptTask(prompt)}</option>
    `)
  ].join("");
  select.value = "";
}

function getCapturePrompt() {
  const selected = $("#captureTask")?.value;
  if (!selected) return null;
  return promptLibrary.find((prompt) => (prompt.id || `${prompt.grade}-${prompt.book}-${prompt.unit}`) === selected) || null;
}

function debounce(fn, delay = 300) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

async function openCaptureDraftDb() {
  if (!("indexedDB" in window)) throw new Error("当前浏览器不支持本地草稿存储");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CAPTURE_DRAFT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CAPTURE_DRAFT_STORE)) {
        db.createObjectStore(CAPTURE_DRAFT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("手机草稿数据库打开失败"));
  });
}

function runCaptureDraftStore(mode, operation) {
  return openCaptureDraftDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(CAPTURE_DRAFT_STORE, mode);
    const store = tx.objectStore(CAPTURE_DRAFT_STORE);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("手机草稿读写失败"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("手机草稿事务失败"));
    };
  }));
}

async function saveCaptureDraft(draft) {
  const normalized = {
    id: CAPTURE_DRAFT_ID,
    student: String(draft.student || ""),
    taskId: String(draft.taskId || ""),
    images: normalizeClientImages(draft.images || []),
    updatedAt: new Date().toISOString()
  };
  if (!normalized.student && !normalized.taskId && !normalized.images.length) {
    await clearCaptureDraft();
    return;
  }
  try {
    window.localStorage.setItem(CAPTURE_DRAFT_META_KEY, JSON.stringify({
      student: normalized.student,
      taskId: normalized.taskId,
      imageCount: normalized.images.length,
      updatedAt: normalized.updatedAt
    }));
  } catch (error) {
    // Ignore metadata quota errors; IndexedDB is the source of truth for image drafts.
  }
  try {
    await runCaptureDraftStore("readwrite", (store) => store.put(normalized));
  } catch (error) {
    const node = $("#captureResult");
    if (node) {
      node.className = "capture-result show pending";
      node.textContent = "手机本地草稿保存失败，可能是浏览器存储空间不足；请尽快提交到 Web。";
    }
  }
}

async function loadCaptureDraft() {
  try {
    const draft = await runCaptureDraftStore("readonly", (store) => store.get(CAPTURE_DRAFT_ID));
    if (draft) return {
      ...draft,
      images: normalizeClientImages(draft.images || [])
    };
  } catch (error) {
    try {
      const meta = JSON.parse(window.localStorage.getItem(CAPTURE_DRAFT_META_KEY) || "null");
      if (meta) return { ...meta, images: [] };
    } catch (storageError) {
      return null;
    }
  }
  return null;
}

async function clearCaptureDraft() {
  try {
    window.localStorage.removeItem(CAPTURE_DRAFT_META_KEY);
  } catch (error) {
    // Nothing to do.
  }
  try {
    await runCaptureDraftStore("readwrite", (store) => store.delete(CAPTURE_DRAFT_ID));
  } catch (error) {
    // Nothing to do.
  }
}

function formatPromptTask(prompt) {
  if (!prompt) return "未设置任务";
  return `${prompt.grade}${prompt.book} ${prompt.unit} ${prompt.title}`;
}

function renderThumbGrid(container, images) {
  if (!container) return;
  container.innerHTML = images.map((image, index) => `
    <figure class="thumb-item">
      <img src="${getImagePreviewDataUrl(image)}" alt="作文照片 ${index + 1}" />
      <figcaption>${index + 1}</figcaption>
    </figure>
  `).join("");
}

function inferTopic(prompt, essay) {
  const titleLine = essay.split(/\n+/).map((line) => line.trim()).find(Boolean) || "";
  const adventureTitle = titleLine.match(/^(.{3,12}?探险(?:之旅)?)/);
  if (adventureTitle) return adventureTitle[1].trim();
  const mixedTitle = titleLine.match(/^([\u4e00-\u9fa5A-Za-z0-9《》“”]{3,12}?)(?=我|我们|跟着|来到|走进|那天|有一天)/);
  if (mixedTitle && /探险|乐园|心爱|推荐|漫画|故事|尝试|实验|游戏|发现|朋友|家人|变形|心愿/.test(mixedTitle[1])) {
    return mixedTitle[1].trim();
  }
  const learned = titleLine.match(/^我学会了(.{1,10})/);
  if (learned) return learned[1].trim();
  if (/乐园/.test(prompt.title)) return "我的乐园";
  if (/心爱之物/.test(prompt.title)) return "心爱之物";
  if (/推荐一本书/.test(prompt.title)) return "推荐一本书";
  if (/真情/.test(prompt.title)) return "真情自然流露";
  if (titleLine && titleLine.length <= 16) return titleLine.replace(/^我学会了/, "") || titleLine;
  return prompt.title.replace("____", "这件事");
}

function extractSentences(essay) {
  return essay
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .flatMap((line) => line.split(/[。！？!?；;]/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 3);
}

function findTypoFindings(essay) {
  return typoRules.filter((rule) => essay.includes(rule.wrong));
}

function applyTypoFixes(text) {
  return typoRules.reduce((value, rule) => value.split(rule.wrong).join(rule.right), text);
}

function markUsed(used, sentence) {
  if (sentence) used.add(sentence);
}

function pickVividSentence(sentences, analysis) {
  let best = "";
  let bestScore = 0;
  sentences.forEach((sentence) => {
    if (isLikelyTitle(sentence, analysis)) return;
    let score = 0;
    score += matchCount(sentence, ["像", "仿佛", "好像", "似的", "扑面", "穿过"]) * 2;
    score += matchCount(sentence, ["呼呼", "咯吱", "闷热", "黏腻", "潮湿", "阳光", "风", "声音", "水声", "泥土", "树木", "眼前"]) * 2;
    score += sentence.length >= 18 ? 1 : 0;
    if (score > bestScore) {
      best = sentence;
      bestScore = score;
    }
  });
  return best || pickUnusedSentence(sentences, analysis, new Set());
}

function pickDetailSentence(sentences, analysis, used) {
  return sentences.find((sentence) => !used.has(sentence) && isTitleOpeningMixed(sentence, analysis)) ||
    sentences.find((sentence) => !used.has(sentence) && hasTypo(sentence)) ||
    sentences.find((sentence) => !used.has(sentence) && !isLikelyTitle(sentence, analysis) && /于是|然后|接着|到了|跟着|踏上|寻找|来到|走进|开始|去/.test(sentence) && sentence.length < 55) ||
    sentences.find((sentence) => !used.has(sentence) && !isLikelyTitle(sentence, analysis) && sentence.length < 32) ||
    pickUnusedSentence(sentences, analysis, used);
}

function pickEmotionSentence(sentences, analysis, used) {
  return sentences.find((sentence) => !used.has(sentence) && !isLikelyTitle(sentence, analysis) && /又累又饿|累|饿|渴|害怕|紧张|着急|担心|放弃|开心|高兴|自豪|心里|心想|终于/.test(sentence));
}

function pickUnusedSentence(sentences, analysis, used) {
  return sentences.find((sentence) => !used.has(sentence) && !isLikelyTitle(sentence, analysis)) || sentences.find((sentence) => !used.has(sentence)) || "";
}

function isLikelyTitle(sentence, analysis) {
  const compact = sentence.replace(/\s/g, "");
  const topic = String(analysis.topic || "").replace(/\s/g, "");
  return compact === topic || (sentence.length <= 12 && !/[，,：:]/.test(sentence) && !/我|我们|他|她|来到|走进|跟着|开始|于是|到了/.test(sentence));
}

function isTitleOpeningMixed(sentence, analysis) {
  if (!sentence) return false;
  const topic = String(analysis.topic || "").trim();
  return topic.length >= 3 && sentence.replace(/\s/g, "").startsWith(topic.replace(/\s/g, "")) && sentence.replace(/\s/g, "").length > topic.replace(/\s/g, "").length + 6;
}

function hasTypo(sentence) {
  return typoRules.some((rule) => sentence.includes(rule.wrong));
}

function buildVividSuggestion(sentence, analysis) {
  if (!sentence) return `可以补一句和“${analysis.topic}”有关的画面、声音或触觉描写。`;
  return `保留这类具体描写，并在后面接人物动作或心情变化，让环境描写继续服务于“${analysis.topic}”。`;
}

function buildDetailComment(sentence, analysis) {
  if (!sentence) return "原文里还缺少可以展开的关键句。";
  if (isTitleOpeningMixed(sentence, analysis)) return "这里像是题目和开头连在了一起，建议先分清题目、人物和地点。";
  if (hasTypo(sentence)) return "这句有疑似错别字或表达不顺，同时还可以补充当时的具体动作。";
  return "这句话能推进事情，但动作、地点或过程还可以写得更具体。";
}

function buildDetailSuggestion(sentence, analysis) {
  if (!sentence) return "可以先补一句“谁、在什么地方、做了什么”，再继续写看到或听到的细节。";
  if (isTitleOpeningMixed(sentence, analysis)) return buildOpeningExample(sentence, analysis);
  if (/响午/.test(sentence)) return "可以先把“响午”改为“中午”，再补充身体感受和寻找水源的动作。";
  if (/雨林|探险/.test(sentence)) {
    const companion = extractCompanion(sentence) || "同伴";
    return `可以改成“我跟着${companion}走进热带雨林，脚下的泥土又软又滑，树叶上的水珠不时落下来，我们只好放慢脚步向前走。”`;
  }
  if (/寻找|水源|又累又饿/.test(sentence)) {
    return "可以改成“到了中午，我们又累又饿，嗓子干得发疼，只好一边听着远处的水声，一边沿着潮湿的石头去寻找水源。”";
  }
  return "可以围绕这句补出“先做什么、遇到什么、又怎么做”，让过程更连贯。";
}

function buildEmotionComment(sentence) {
  if (!sentence) return "原文中心理活动偏少，可以补充当时的真实想法。";
  if (hasTypo(sentence)) return "先修改错别字，再把身体感受和心理活动写出来，情节会更真实。";
  if (/心里|心想|害怕|紧张|着急|担心|放弃|开心|高兴|自豪|终于/.test(sentence)) return "这句已经有心情变化，可以继续写出心里具体想了什么。";
  return "这里有事情变化，但人物心里怎么想还不够明显。";
}

function buildEmotionSuggestion(sentence, analysis) {
  if (!sentence) return `可以补一句“我心里想：这次${analysis.topic}虽然不容易，但我一定要坚持下去。”`;
  if (/又累又饿|水源|中午|响午/.test(sentence)) {
    return "可以补成“到了中午，我们又累又饿，心里也有些发慌：要是找不到水怎么办？想到大家还在坚持，我又咬牙跟了上去。”";
  }
  if (/终于|成功|完成/.test(sentence)) {
    return "可以补一句成功后的动作或神态，比如“我长长地松了一口气，忍不住回头看了看刚才走过的路”。";
  }
  return "可以在这句后面补一小句心理活动，写清“我为什么这样想、接下来决定怎么做”。";
}

function buildOpeningExample(sentence, analysis) {
  if (/雨林|探险/.test(sentence || analysis.topic)) {
    const companion = extractCompanion(sentence) || "同伴";
    return `可以写成：\n${analysis.topic}\n\n我跟着${companion}走进热带雨林。潮湿的空气扑面而来，脚下的泥土又软又滑，我们的探险就这样开始了。`;
  }
  return `可以写成：\n${analysis.topic}\n\n那一次经历刚开始并不起眼，可当我真正走近它时，才发现过程比想象中更有挑战。`;
}

function buildMiddleExample(sentence, analysis) {
  if (/又累又饿|水源|中午|响午/.test(sentence || "")) {
    return "到了中午，我们又累又饿，嗓子干得发疼。我一边听着远处若有若无的水声，一边提醒自己：再坚持一会儿，也许水源就在前面。";
  }
  if (/雨林|探险/.test(sentence || analysis.topic)) {
    return "我们放慢脚步往前走，脚下的泥土湿滑难行。我扶着旁边的树干，一边观察四周，一边和同伴商量下一步该往哪里走。";
  }
  return `遇到困难时，我没有马上放弃，而是先停下来观察，再试着换一种办法。这个过程让“${analysis.topic}”变得更具体。`;
}

function buildEndingExample(analysis) {
  if (/雨林|探险/.test(analysis.topic)) {
    return `这次${analysis.topic}让我明白，真正的勇敢不是一点也不害怕，而是在困难面前还能冷静观察、继续想办法。`;
  }
  return `这次${analysis.topic}让我明白，事情做好不只靠一时兴趣，更要靠认真观察和坚持尝试。`;
}

function pickFirstBodySentence(analysis) {
  return analysis.sentences.find((sentence) => !isLikelyTitle(sentence, analysis)) || "";
}

function splitTitleAndBody(prompt, essay, analysis) {
  const paragraphs = essay.split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
  let title = "";
  if (paragraphs[0]) {
    const first = paragraphs[0];
    if (isLikelyTitle(first, analysis)) {
      title = first;
      paragraphs.shift();
    } else if (isTitleOpeningMixed(first, analysis)) {
      title = analysis.topic;
      paragraphs[0] = removeTopicPrefix(first, analysis.topic);
    }
  }
  if (!title) title = prompt.title.includes("____") ? prompt.title.replace("____", analysis.topic) : analysis.topic || prompt.title;
  return { title, bodyParagraphs: paragraphs.filter(Boolean) };
}

function removeTopicPrefix(text, topic) {
  if (!text || !topic) return text;
  const trimmed = text.trim();
  if (!trimmed.replace(/\s/g, "").startsWith(topic.replace(/\s/g, ""))) return trimmed;
  return trimmed.slice(topic.length).replace(/^[\s　：:，,。-]+/, "").trim();
}

function polishParagraph(paragraph, analysis, index, total) {
  let text = applyTypoFixes(paragraph).replace(/\s+/g, " ").trim();
  if (!text) return "";
  text = removeTopicPrefix(text, analysis.topic);
  if (/热带雨林|雨林/.test(text) && /踏上|走进|来到/.test(text) && !/闷热|黏腻|潮湿|脚下/.test(text)) {
    text = text.replace(/(踏上了热带雨林|走进了?热带雨林|来到热带雨林)/, "$1，脚下的泥土又软又滑，四周的树叶绿得发亮");
  }
  text = text.replace(/到了中午，我们又累又饿，于是去寻找水源/g, "到了中午，我们又累又饿，嗓子也干得发疼。我们一边听着远处隐约的水声，一边沿着潮湿的石头去寻找水源");
  text = text.replace(/到了晌午，我们又累又饿，于是去寻找水源/g, "到了中午，我们又累又饿，嗓子也干得发疼。我们一边听着远处隐约的水声，一边沿着潮湿的石头去寻找水源");
  text = ensureEndingPunctuation(text);
  if (index === total - 1 && !/懂得|明白|收获|让我知道|体会|道理|成长/.test(text.replace(/\s/g, ""))) {
    text += buildShortInsight(analysis);
  }
  return text;
}

function buildShortInsight(analysis) {
  if (/雨林|探险/.test(analysis.topic)) return `这次${analysis.topic}也让我明白，遇到困难时要冷静观察，和同伴一起想办法。`;
  return `这次${analysis.topic}也让我明白，遇到困难时多观察、多尝试，事情就会一点点变好。`;
}

function ensureEndingPunctuation(text) {
  return /[。！？!?]$/.test(text) ? text : `${text}。`;
}

function extractCompanion(text = "") {
  const match = text.match(/跟着([^，,。！？\s]{2,8})/);
  return match ? match[1] : "";
}

function shortText(text, limit = 28) {
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function matchCount(text, words) {
  return words.reduce((count, word) => count + (text.includes(word) ? 1 : 0), 0);
}

function valueToLevel(value) {
  if (value >= 5) return "优秀";
  if (value >= 4) return "良好";
  if (value >= 3) return "中等";
  if (value >= 2) return "合格";
  return "需完善";
}

function starString(value) {
  return "★★★★★".slice(0, value) + "☆☆☆☆☆".slice(0, 5 - value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function unique(values) {
  return [...new Set(values)];
}

function setSelectValue(selector, value) {
  const element = $(selector);
  if ([...element.options].some((option) => option.value === value)) {
    element.value = value;
  }
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHTML(value).replace(/`/g, "&#096;");
}

document.addEventListener("DOMContentLoaded", init);
