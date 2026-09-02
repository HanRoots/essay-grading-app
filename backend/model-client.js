const http = require("http");
const https = require("https");
const { URL } = require("url");

const VISION_PAGE_TIMEOUT_MS = 120000;
const VISION_PAGE_CONCURRENCY = 1;
const VISION_PAGE_EMPTY_RETRIES = 1;
const VISION_PAGE_MIN_MEANINGFUL_CHARS = 35;
const MODEL_CONCURRENCY_RETRIES = 3;
const MODEL_CONCURRENCY_RETRY_DELAY_MS = 1200;
const TEXT_JUDGE_TIMEOUT_MS = 90000;
const GRADING_TIMEOUT_MS = 90000;
const JSON_REPAIR_TIMEOUT_MS = 60000;
const GRADING_MAX_TOKENS = 8192;
const REQUIREMENT_RECOVERY_TIMEOUT_MS = 90000;
const REQUIREMENT_RECOVERY_MAX_TOKENS = 4500;
const SCORE_RECOVERY_TIMEOUT_MS = 90000;
const SCORE_RECOVERY_MAX_TOKENS = 3500;
const GUIDE_RECOVERY_TIMEOUT_MS = 90000;
const GUIDE_RECOVERY_MAX_TOKENS = 6000;
const GUIDE_POLISH_TIMEOUT_MS = 90000;
const GUIDE_POLISH_MAX_TOKENS = 8192;
const GUIDE_POLISH_MAX_ATTEMPTS = 2;
const ESSAY_SCORING_RUBRIC = [
  "【作文评分标准】",
  "总分采用 100 分制，必须基于作文原文和本次习作要求，不按书写好坏、拍照质量或识别难度评分。",
  "总分由四项综合估算：内容与审题 35 分，结构与详略 25 分，语言表达 25 分，行文规范 15 分。",
  "",
  "一、内容与审题（35 分，对应 scores.items 中“内容”的 1-5 档）",
  "5 档：32-35 分。完全切题，核心内容清楚具体，能围绕习作要求展开，有真实经历或明确观察，重点内容充分。",
  "4 档：27-31 分。基本切题，主要内容完整，有一定细节，但个别要求展开不足或重点还可以更具体。",
  "3 档：21-26 分。部分切题，能看出主题，但内容偏笼统，关键经过、特点、原因或感受缺少展开。",
  "2 档：14-20 分。勉强围绕题目写，内容单薄，重要要求缺失较多，读者难以清楚了解事情或对象。",
  "1 档：0-13 分。明显跑题、严重缺内容，或只有零散句子，基本不能完成习作任务。",
  "",
  "二、结构与详略（25 分，对应 scores.items 中“结构”的 1-5 档）",
  "5 档：23-25 分。开头、中间、结尾完整，顺序清楚，重点部分详写，过渡自然，结尾能扣回主题。",
  "4 档：19-22 分。结构基本完整，顺序较清楚，但详略安排、过渡或结尾收束仍有小问题。",
  "3 档：15-18 分。有基本顺序，但段落层次不够清楚，重点和次重点区分不明显，部分内容衔接弱。",
  "2 档：10-14 分。结构松散，经过跳跃，开头或结尾明显缺失，重点内容没有形成完整过程。",
  "1 档：0-9 分。没有清楚结构，内容排列混乱，难以判断开头、中间和结尾。",
  "",
  "三、语言表达（25 分，对应 scores.items 中“表达”的 1-5 档）",
  "5 档：23-25 分。语句通顺，有较好的动作、语言、心理、感官或外貌描写，表达自然，有一两处亮点。",
  "4 档：19-22 分。大多数句子通顺，有一些具体描写，但画面感、心理变化或细节还可以加强。",
  "3 档：15-18 分。意思基本能读懂，但表达较平，重复句式较多，具体描写不足。",
  "2 档：10-14 分。语句不够通顺，表达断裂或重复较多，影响理解。",
  "1 档：0-9 分。大量句子无法理解，表达严重影响阅读。",
  "",
  "四、行文规范（15 分，对应 scores.items 中“行文规范”的 1-5 档）",
  "5 档：14-15 分。标点、错别字、分段和格式基本规范。",
  "4 档：12-13 分。少量错别字、标点或格式问题，不明显影响阅读。",
  "3 档：9-11 分。有多处规范问题，但整体还能读懂。",
  "2 档：6-8 分。错别字、标点、分段问题较多，明显影响阅读。",
  "1 档：0-5 分。规范问题严重，影响整体理解。",
  "",
  "封顶规则：",
  "1. 如果明显跑题或没有完成核心习作任务，总分通常不超过 60 分。",
  "2. 如果作文过短，无法支撑题目要求，总分通常不超过 70 分；若题目明确要求字数而明显不足，要在内容或结构中说明。",
  "3. 如果只有一个片段、没有完整开头/中间/结尾，总分通常不超过 75 分。",
  "4. 如果内容较完整但错别字或标点很多，不要让行文规范超过 3 档。",
  "5. 三四年级侧重写清楚和语句通顺；五六年级要更重视详略、结构、真实感受和具体描写。",
  "6. scores.items 的 value 必须是 1-5 的整数；note 必须写明评分依据，并尽量说明折算分，例如“约 28/35”。",
  "7. total 必须与四项档次一致，不能四项都偏低但总分很高，也不能四项都较好但总分过低。"
].join("\n");
const SCORE_DIMENSIONS = [
  { name: "内容", max: 35 },
  { name: "表达", max: 25 },
  { name: "结构", max: 25 },
  { name: "行文规范", max: 15 }
];
const modelRequestQueues = new Map();

function testCompatibleModelConnection(config) {
  const startedAt = Date.now();
  const baseUrl = String(config.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) {
    return Promise.reject(new Error("Base URL 不能为空"));
  }
  if (!config.apiKey) {
    return Promise.reject(new Error("API Key 不能为空"));
  }

  const endpoint = buildChatCompletionsEndpoint(baseUrl);
  const payload = JSON.stringify(applyProviderRequestDefaults(config, {
    model: config.model,
    messages: [
      {
        role: "system",
        content: "你是一个接口连通性测试助手，只回复 OK。"
      },
      {
        role: "user",
        content: "请回复 OK。"
      }
    ],
    temperature: resolveTemperature(config),
    max_tokens: 8
  }));

  return withModelRequestSlot(config, () => runWithConcurrencyRetry(() => new Promise((resolve, reject) => {
    const transport = endpoint.protocol === "http:" ? http : https;
    const req = transport.request(
      endpoint,
      buildRequestOptions(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        },
        rejectUnauthorized: !config.allowInsecureTls,
        timeout: 15000
      }),
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let body = {};
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch (error) {
            reject(new Error("模型服务返回了非 JSON 响应"));
            return;
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(normalizeProviderError(
              body.error?.message || `模型服务返回 HTTP ${res.statusCode}`,
              parseRetryAfterMs(res.headers["retry-after"])
            ));
            return;
          }

          resolve({
            ok: true,
            latencyMs: Date.now() - startedAt,
            model: config.model,
            reply: body.choices?.[0]?.message?.content || ""
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("模型服务连接超时"));
    });
    req.on("error", (error) => {
      reject(normalizeConnectionError(error));
    });
    req.write(payload);
    req.end();
  })));
}

function recognizeEssayText(config) {
  const startedAt = Date.now();
  const baseUrl = String(config.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) {
    return Promise.reject(new Error("Base URL 不能为空"));
  }
  if (!config.apiKey) {
    return Promise.reject(new Error("API Key 不能为空，请先在模型设置里保存服务端 API Key"));
  }
  if (!providerSupportsVision(config.provider, config.model)) {
    return Promise.reject(new Error(`${config.providerName || config.provider} 当前模型不支持图片输入，请切换到视觉模型，或在识别文本区手动粘贴/修正文本`));
  }
  return recognizeEssayTextByPage(config, startedAt, baseUrl);
}

async function recognizeEssayTextByPage(config, startedAt, baseUrl) {
  const pageTexts = await mapWithConcurrency(config.images, VISION_PAGE_CONCURRENCY, async (image, index) => {
    const text = await recognizeSingleEssayPage(
      {
        ...config,
        baseUrl
      },
      image,
      index,
      config.images.length
    );
    return {
      page: index + 1,
      text
    };
  });
  const recognizedPages = pageTexts.filter((item) => cleanOcrPageText(item.text)).length;
  const expectedPages = config.images.length;
  const rawText = mergeEssayPageTexts(pageTexts.map((item) => item.text));
  if (recognizedPages !== expectedPages) {
    const emptyPages = pageTexts
      .filter((item) => !cleanOcrPageText(item.text))
      .map((item) => item.page)
      .join("、");
    const error = new Error(`图片文字只识别出 ${recognizedPages}/${expectedPages} 页，第 ${emptyPages} 页结果为空。请确认图片清晰、未被遮挡后重试。`);
    error.partialResult = {
      ok: false,
      latencyMs: Date.now() - startedAt,
      model: config.model,
      text: rawText,
      rawText,
      pageTexts,
      expectedPages,
      recognizedPages
    };
    throw error;
  }
  const judgeResult = await refineOcrTextWithJudge(config, pageTexts, rawText);
  return {
    ok: true,
    latencyMs: Date.now() - startedAt,
    model: config.model,
    text: judgeResult.text || rawText,
    rawText,
    pageTexts,
    expectedPages,
    recognizedPages,
    refinedBy: judgeResult.refinedBy || null,
    uncertainties: judgeResult.uncertainties || [],
    judgeWarning: judgeResult.warning || ""
  };
}

async function recognizeSingleEssayPage(config, image, index, total) {
  let text = "";
  for (let attempt = 0; attempt <= VISION_PAGE_EMPTY_RETRIES; attempt += 1) {
    const payload = {
      model: config.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildSinglePageOcrPrompt(index, total, attempt)
            },
            {
              type: "image_url",
              image_url: {
                url: image.dataUrl
              }
            }
          ]
        }
      ],
      temperature: resolveTemperature(config),
      max_tokens: 3000
    };
    const result = await postChatCompletionContent(config, payload, VISION_PAGE_TIMEOUT_MS, "图片文字读取", {
      allowEmpty: true,
      emptyRetryInstruction: "上一次图片文字读取响应为空。请重新仔细查看图片，只输出本页看得见的作文正文；看不清的字用 □ 占位，不要空响应。"
    });
    text = cleanOcrPageText(result.content || "");
    if (text && (!isSuspiciouslyShortOcrText(text) || attempt >= VISION_PAGE_EMPTY_RETRIES)) return text;
  }
  return text;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

function buildSinglePageOcrPrompt(index, total, attempt = 0) {
  const retryInstruction = attempt > 0
    ? "\n重要：上一次本页结果为空或明显只识别了局部。请重新仔细查看整张图片，当前主作文格里只要有任何手写正文，就必须从顶部到尾部逐行输出；看不清的字用 □ 占位，不要只输出结尾片段。"
    : "";
  return [
    `请识别这篇小学作文的第 ${index + 1}/${total} 张图片。`,
    "要求：",
    "1. 只输出本页图片中看得见的作文正文，不要输出解释、页码、标题说明或 Markdown。",
    "2. 必须从本页图片最上方第一行作文正文开始，逐行抄写到最下方最后一行；一行图片文字对应一行输出，尽量不要把多行合并成一段。",
    "3. 如果本页开头或结尾是上一页/下一页的连续内容，也必须按本页可见文字原样识别，不要自行补写，也不要跳过。",
    "4. 忽略页眉、修正栏、日期栏、格子编号、书社字样和页面边缘露出的其他页文字，只保留当前主作文格内正文。",
    "5. 保留题目和自然段；如果题目在本页可见，就输出题目。",
    "6. 忠实抄录学生原文，不要主动纠正学生可能真实写错的字词；只有明显不是手写内容的识别噪音才可去除。无法确定的字用 □ 占位，不要整行省略。",
    retryInstruction
  ].join("\n");
}

function isSuspiciouslyShortOcrText(text) {
  return countMeaningfulChineseText(text) < VISION_PAGE_MIN_MEANINGFUL_CHARS;
}

async function refineOcrTextWithJudge(config, pageTexts, rawText) {
  if (config.mode === "fast" || !config.judge?.enabled) {
    return { text: rawText };
  }
  const judge = {
    provider: config.judge.provider,
    providerName: config.judge.providerName,
    model: config.judge.model,
    baseUrl: String(config.judge.baseUrl || "").replace(/\/+$/, ""),
    apiKey: config.judge.apiKey || "",
    allowInsecureTls: Boolean(config.judge.allowInsecureTls)
  };
  if (!judge.baseUrl || !judge.model) {
    return { text: rawText, warning: "校对模型配置不完整" };
  }
  if (!judge.apiKey) {
    return { text: rawText, warning: "校对模型 API Key 未配置" };
  }
  const payload = {
    model: judge.model,
    messages: [
      {
        role: "system",
        content: buildOcrJudgeSystemPrompt()
      },
      {
        role: "user",
        content: buildOcrJudgeUserPrompt(pageTexts, rawText)
      }
    ],
    temperature: resolveTemperature(judge),
    max_tokens: 6000
  };
  try {
    const result = await postChatCompletionContent(judge, payload, TEXT_JUDGE_TIMEOUT_MS, "图片文字校对", {
      emptyRetryInstruction: "上一次图片文字校对响应为空。请严格输出 JSON 对象，包含 text 和 uncertainties，不要空响应。"
    });
    const content = result.content || "";
    const parsed = parseModelJson(content);
    const text = cleanOcrPageText(parsed.text || rawText);
    return {
      text: text || rawText,
      uncertainties: Array.isArray(parsed.uncertainties) ? parsed.uncertainties.slice(0, 80) : [],
      refinedBy: {
        provider: judge.provider,
        providerName: judge.providerName,
        model: judge.model
      }
    };
  } catch (error) {
    return {
      text: rawText,
      warning: error.message || "校对模型调用失败"
    };
  }
}

function buildOcrJudgeSystemPrompt() {
  return [
    "你是小学作文图片文字读取的保守校对助手。",
    "你只负责根据识别文本进行合并、去重、断句和明显识别噪音修正，不能润色作文，不能替学生改作文，不能新增图片或识别文本中没有的情节。",
    "语病、错别字、幼稚表达如果可能来自学生原文，必须保留，不要改成更通顺的作文。",
    "人名、地名、题目等专有名词要前后一致；如果后文出现明显由识别造成的同音或形近错字，且前文已有清晰写法，可以保守修正为前文写法。",
    "只有在上下文强烈表明是图片文字识别错误、页间重复、断行粘连、标点噪音时才修正。",
    "对不确定内容保持原样，并写入 uncertainties。",
    "只输出 JSON，不要输出 Markdown、代码块或解释。"
  ].join("\n");
}

function buildOcrJudgeUserPrompt(pageTexts, rawText) {
  const schema = {
    text: "最终合并后的作文正文，保留题目和自然段",
    uncertainties: [
      {
        page: 1,
        fragment: "不确定的原识别片段",
        reason: "为什么不确定",
        candidates: ["候选1", "候选2"]
      }
    ]
  };
  return [
    "请对下面的小学生手写作文图片文字读取结果做保守校对。",
    "",
    "【逐页识别结果】",
    pageTexts.map((item) => `第 ${item.page} 页：\n${cleanOcrPageText(item.text) || "（空）"}`).join("\n\n"),
    "",
    "【当前自动合并文本】",
    rawText || "",
    "",
    "【校对规则】",
    "1. 重点处理页与页之间的重复、缺少换行、明显断句错误、明显识别噪音。",
    "2. 不要把学生作文改得更优美，不要补写细节，不要扩写。",
    "3. 不要主动纠正可能是学生真实写错的字词；这类问题应留给后续作文批改指出。",
    "4. 如果某个字词无法确定，正文中保留最可能原样，并在 uncertainties 中列出。",
    "5. 输出 text 必须是一篇完整作文，不要附加说明。",
    "",
    "【JSON schema】",
    JSON.stringify(schema, null, 2)
  ].join("\n");
}

async function postChatCompletion(config, payloadObject, timeout, label) {
  try {
    return await postChatCompletionOnce(config, payloadObject, timeout, label);
  } catch (error) {
    if (payloadObject?.response_format && shouldRetryWithoutJsonResponseFormat(error)) {
      const fallbackPayload = { ...payloadObject };
      delete fallbackPayload.response_format;
      return await postChatCompletionOnce(config, fallbackPayload, timeout, label);
    }
    throw error;
  }
}

function postChatCompletionOnce(config, payloadObject, timeout, label) {
  const endpoint = buildChatCompletionsEndpoint(config.baseUrl);
  const payload = JSON.stringify(applyProviderRequestDefaults(config, payloadObject));
  return withModelRequestSlot(config, () => runWithConcurrencyRetry(() => new Promise((resolve, reject) => {
    const transport = endpoint.protocol === "http:" ? http : https;
    const req = transport.request(
      endpoint,
      buildRequestOptions(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        },
        rejectUnauthorized: !config.allowInsecureTls,
        timeout
      }),
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let body = {};
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch (error) {
            reject(new Error(`${label} 服务返回了非 JSON 响应`));
            return;
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(normalizeProviderError(
              body.error?.message || `${label} 服务返回 HTTP ${res.statusCode}`,
              parseRetryAfterMs(res.headers["retry-after"])
            ));
            return;
          }

          resolve(body);
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`${label} 处理超过 ${Math.round(timeout / 1000)} 秒：真实作文图片可能较大或网络较慢，请稍后重试，或减少单次页数后再读图。`));
    });
    req.on("error", (error) => {
      reject(normalizeConnectionError(error));
    });
    req.write(payload);
    req.end();
  })));
}

async function withModelRequestSlot(config, task) {
  const queueKey = getModelRequestQueueKey(config);
  const previous = modelRequestQueues.get(queueKey) || Promise.resolve();
  let release = () => {};
  const current = new Promise((resolve) => {
    release = resolve;
  });
  modelRequestQueues.set(queueKey, current);
  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
    if (modelRequestQueues.get(queueKey) === current) {
      modelRequestQueues.delete(queueKey);
    }
  }
}

function getModelRequestQueueKey(config) {
  return [
    String(config?.provider || "compatible"),
    String(config?.apiKey || "anonymous")
  ].join("\u0000");
}

async function runWithConcurrencyRetry(task) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (!isModelConcurrencyLimitError(error) || attempt >= MODEL_CONCURRENCY_RETRIES) {
        throw error;
      }
      await delay(resolveConcurrencyRetryDelay(error, attempt));
    }
  }
}

function isModelConcurrencyLimitError(error) {
  const message = `${error?.message || ""} ${error?.providerMessage || ""}`;
  return error?.code === "MODEL_CONCURRENCY_LIMIT"
    || /max(?:imum)?\s+(?:organization\s+)?concurrenc|concurrenc(?:y|ies).*limit|request reached.*concurrenc|并发.*(?:上限|限制)/i.test(message);
}

function resolveConcurrencyRetryDelay(error, attempt) {
  const providerDelay = Number(error?.retryAfterMs || 0);
  const fallbackDelay = MODEL_CONCURRENCY_RETRY_DELAY_MS * (attempt + 1);
  return Math.max(providerDelay, fallbackDelay);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function applyProviderRequestDefaults(config, payloadObject) {
  const payload = { ...payloadObject };
  if (shouldDisableDeepSeekThinking(config, payload)) {
    payload.thinking = { type: "disabled" };
    delete payload.reasoning_effort;
  }
  return payload;
}

function shouldDisableDeepSeekThinking(config, payload) {
  const model = String(payload?.model || config?.model || "");
  const baseUrl = String(config?.baseUrl || "");
  const isDeepSeek = config?.provider === "deepseek" || /api\.deepseek\.com/i.test(baseUrl) || /^deepseek-v4-/i.test(model);
  if (!isDeepSeek || !/^deepseek-v4-/i.test(model)) return false;
  if (payload.thinking || payload.reasoning_effort) return false;
  return true;
}

async function postChatCompletionContent(config, payloadObject, timeout, label, options = {}) {
  const attempts = [payloadObject];
  if (payloadObject?.response_format) {
    const withoutJsonMode = { ...payloadObject };
    delete withoutJsonMode.response_format;
    attempts.push(withoutJsonMode);
  }
  attempts.push(buildEmptyResponseRetryPayload(payloadObject, options.emptyRetryInstruction));

  let lastBody = null;
  for (const payload of attempts) {
    const body = await postChatCompletion(config, payload, timeout, label);
    lastBody = body;
    const content = extractAssistantContent(body);
    if (content) {
      return { body, content };
    }
  }

  if (options.allowEmpty) {
    return { body: lastBody || {}, content: "" };
  }

  throw new Error(buildEmptyModelContentError(label, lastBody));
}

function buildEmptyResponseRetryPayload(payloadObject, instruction) {
  const payload = { ...payloadObject };
  delete payload.response_format;
  const messages = Array.isArray(payload.messages) ? [...payload.messages] : [];
  messages.push({
    role: "user",
    content: instruction || "上一次模型响应为空。请严格输出本次任务要求的完整内容，不要输出空响应。"
  });
  payload.messages = messages;
  payload.max_tokens = Math.max(Number(payload.max_tokens || 0), 2048);
  return payload;
}

function extractAssistantContent(body) {
  const choice = Array.isArray(body?.choices) ? body.choices[0] : null;
  const message = choice?.message || {};
  const content = message.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const text = content.map((part) => {
      if (typeof part === "string") return part;
      if (typeof part?.text === "string") return part.text;
      if (typeof part?.content === "string") return part.content;
      return "";
    }).join("\n").trim();
    if (text) return text;
  }
  const alternatives = [
    message.reasoning_content,
    message.reasoning,
    choice?.text,
    body?.output_text
  ];
  for (const value of alternatives) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function buildEmptyModelContentError(label, body) {
  const choice = Array.isArray(body?.choices) ? body.choices[0] : null;
  const finishReason = choice?.finish_reason || choice?.finishReason || "";
  const detail = finishReason ? `，finish_reason=${finishReason}` : "";
  if (/length/i.test(finishReason)) {
    return `${label} 返回空响应${detail}：模型输出可能被长度限制截断，请重试或减少单次作文内容。`;
  }
  if (/content_filter|safety/i.test(finishReason)) {
    return `${label} 返回空响应${detail}：模型服务可能触发内容过滤，请检查作文内容或更换模型。`;
  }
  return `${label} 返回空响应${detail}：已自动重试并关闭 JSON 模式，但模型仍未返回可用文本，请重试或切换模型。`;
}

function shouldRetryWithoutJsonResponseFormat(error) {
  const message = String(error?.message || "");
  return /response_format|json_object|json schema|unsupported|not support|不支持|无效参数|invalid parameter/i.test(message);
}

function cleanOcrPageText(text) {
  return String(text || "")
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .replace(/^第\s*[一二三四五六七八九十\d]+\s*页[：:\s]*/i, "")
    .trim();
}

function mergeEssayPageTexts(pageTexts) {
  return pageTexts
    .map(cleanOcrPageText)
    .filter(Boolean)
    .reduce((merged, pageText) => mergePageText(merged, pageText), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mergePageText(left, right) {
  const cleanLeft = String(left || "").trim();
  const cleanRight = String(right || "").trim();
  if (!cleanLeft) return cleanRight;
  if (!cleanRight) return cleanLeft;
  const leftComparable = normalizeOcrMergeText(cleanLeft);
  const rightComparable = normalizeOcrMergeText(cleanRight);
  if (rightComparable && leftComparable.includes(rightComparable)) return cleanLeft;
  const overlap = findMergeOverlap(leftComparable, rightComparable);
  const rightWithoutOverlap = dropComparablePrefix(cleanRight, overlap);
  if (!rightWithoutOverlap) return cleanLeft;
  const separator = /[。！？!?]$/.test(cleanLeft) ? "\n" : "";
  return `${cleanLeft}${separator}${rightWithoutOverlap}`;
}

function findMergeOverlap(leftComparable, rightComparable) {
  const max = Math.min(120, leftComparable.length, rightComparable.length);
  for (let length = max; length >= 8; length -= 1) {
    if (leftComparable.endsWith(rightComparable.slice(0, length))) {
      return length;
    }
  }
  return 0;
}

function dropComparablePrefix(text, comparableCount) {
  if (!comparableCount) return String(text || "").trimStart();
  let seen = 0;
  const source = String(text || "");
  for (let index = 0; index < source.length; index += 1) {
    if (normalizeOcrMergeText(source[index])) {
      seen += 1;
    }
    if (seen >= comparableCount) {
      return source.slice(index + 1).replace(/^[\s，,。！？!?；;：:、]+/, "");
    }
  }
  return "";
}

function normalizeOcrMergeText(text) {
  return String(text || "").replace(/\s/g, "").replace(/[，,。！？!?；;：:“”"‘’、（）()《》【】\[\]]/g, "");
}

async function gradeEssayReport(config) {
  const startedAt = Date.now();
  const baseUrl = String(config.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) {
    return Promise.reject(new Error("Base URL 不能为空"));
  }
  if (!config.apiKey) {
    return Promise.reject(new Error("API Key 不能为空，请先在模型设置里保存服务端 API Key"));
  }

  const requestConfig = {
    ...config,
    baseUrl
  };

  let content = "";
  let report = null;
  let repairRaw = "";
  let repaired = false;
  let compactRetried = false;
  try {
    const parsed = await requestAndParseEssayGradingReport(requestConfig, config, { compact: false });
    content = parsed.content;
    report = parsed.report;
    repairRaw = parsed.repairRaw;
    repaired = parsed.repaired;
  } catch (error) {
    if (!shouldRetryCompactGrading(error)) {
      throw error;
    }
    compactRetried = true;
    const parsed = await requestAndParseEssayGradingReport(requestConfig, config, {
      compact: true,
      previousIssue: error.message
    });
    content = parsed.content;
    report = parsed.report;
    repairRaw = parsed.repairRaw;
    repaired = parsed.repaired;
  }

  const requirementRecovery = await ensureRequirementEvaluations(requestConfig, config, report);
  const scoreRecovery = await ensureScoreDetails(requestConfig, config, report);
  const guideRecovery = await ensureStructureGuide(requestConfig, config, report);
  const guidePolish = await polishEssayWithGuide(requestConfig, config, report);
  report.polished = guidePolish.polished;
  report.polishedItems = guidePolish.polishedItems;
  report.polishChain = guidePolish.chain;
  if (requirementRecovery.recovered) {
    report.polishChain.requirementRecovered = true;
    report.polishChain.requirementRecoveryReason = requirementRecovery.reason;
  }
  if (scoreRecovery.recovered) {
    report.polishChain.scoreRecovered = true;
    report.polishChain.scoreRecoveryReason = scoreRecovery.reason;
  }
  if (guideRecovery.recovered) {
    report.polishChain.guideRecovered = true;
    report.polishChain.guideRecoveryReason = guideRecovery.reason;
  }
  if (compactRetried) {
    report.polishChain.compactGradingRetried = true;
  }

  return {
    ok: true,
    latencyMs: Date.now() - startedAt,
    model: config.model,
    report,
    raw: content,
    repairRaw,
    repaired,
    compactRetried,
    guidePolished: true,
    requirementRecovered: requirementRecovery.recovered,
    scoreRecovered: scoreRecovery.recovered,
    guideRecovered: guideRecovery.recovered
  };
}

async function requestAndParseEssayGradingReport(requestConfig, sourceConfig, options = {}) {
  const payload = buildEssayGradingPayload(requestConfig, sourceConfig, options);
  const label = options.compact ? "批改模型精简重试" : "批改模型";
  const result = await postChatCompletionContent(requestConfig, payload, GRADING_TIMEOUT_MS, label, {
    emptyRetryInstruction: buildEssayGradingEmptyRetryInstruction(options)
  });
  const content = result.content;
  let report = null;
  let repairRaw = "";
  let repaired = false;
  try {
    report = parseModelJson(content);
  } catch (parseError) {
    try {
      repairRaw = await repairModelJsonResponse(requestConfig, content, parseError.message);
      report = parseModelJson(repairRaw);
      repaired = true;
    } catch (repairError) {
      const normalizedError = new Error(`批改模型返回的结构化内容格式异常，已自动修复一次但仍失败：${repairError.message || parseError.message}`);
      if (isLikelyTruncatedJsonContent(content, parseError) || isLikelyTruncatedJsonContent(repairRaw, repairError)) {
        normalizedError.code = "MODEL_JSON_TRUNCATED";
      }
      throw normalizedError;
    }
  }
  return {
    content,
    report,
    repairRaw,
    repaired
  };
}

function buildEssayGradingPayload(requestConfig, sourceConfig, options = {}) {
  return {
    model: requestConfig.model,
    messages: [
      {
        role: "system",
        content: buildEssayGradingSystemPrompt(options)
      },
      {
        role: "user",
        content: buildEssayGradingUserPrompt(sourceConfig, options)
      }
    ],
    temperature: resolveTemperature(requestConfig),
    response_format: { type: "json_object" },
    max_tokens: GRADING_MAX_TOKENS
  };
}

function buildEssayGradingEmptyRetryInstruction(options = {}) {
  if (options.compact) {
    return [
      "上一次批改模型精简重试响应为空。",
      "请严格输出一个完整 JSON 对象，包含 teacherComment、requirements、scores、annotations、guide、polished、polishedItems。",
      "为了避免再次被长度截断，请控制每条文字长度，annotations 保留最关键的可定位点评，不要输出空响应。"
    ].join("\n");
  }
  return [
    "上一次批改模型响应为空。",
    "请严格输出一个完整 JSON 对象，包含 teacherComment、requirements、scores、annotations、guide、polished、polishedItems。",
    "如果内容较长，优先保证 JSON 完整和必填字段齐全，annotations 选择最关键的可定位点评，不要空响应。"
  ].join("\n");
}

function shouldRetryCompactGrading(error) {
  const message = String(error?.message || "");
  return error?.code === "MODEL_JSON_TRUNCATED"
    || /finish_reason=length|长度限制|被长度限制截断|输出过长|截断|maximum.*token|max_tokens|context length/i.test(message);
}

function isLikelyTruncatedJsonContent(content, error) {
  const text = String(content || "").trim();
  const message = String(error?.message || "");
  if (!text) return false;
  return text.length > 800
    && !/[}\]]\s*$/.test(text)
    && /Unexpected end|unterminated|end of JSON|after property value|after array element|JSON/i.test(message);
}

async function ensureRequirementEvaluations(requestConfig, sourceConfig, report) {
  const expectedRequirements = getPromptRequirements(sourceConfig.prompt);
  const existingRequirements = normalizeRawRequirementEvaluations(report?.requirements, sourceConfig.prompt);
  if (existingRequirements.length >= expectedRequirements.length) {
    report.requirements = existingRequirements;
    return {
      recovered: false,
      reason: ""
    };
  }

  const reason = getRequirementRecoveryReason(report?.requirements, existingRequirements, expectedRequirements);
  const requirements = await recoverRequirementEvaluationsFromModel(requestConfig, sourceConfig, report, reason);
  report.requirements = requirements;
  return {
    recovered: true,
    reason
  };
}

async function recoverRequirementEvaluationsFromModel(requestConfig, sourceConfig, report, reason) {
  const payload = {
    model: requestConfig.model,
    messages: [
      {
        role: "system",
        content: buildRequirementRecoverySystemPrompt()
      },
      {
        role: "user",
        content: buildRequirementRecoveryUserPrompt(sourceConfig, report, reason)
      }
    ],
    temperature: resolveTemperature(requestConfig),
    response_format: { type: "json_object" },
    max_tokens: REQUIREMENT_RECOVERY_MAX_TOKENS
  };
  const result = await postChatCompletionContent(requestConfig, payload, REQUIREMENT_RECOVERY_TIMEOUT_MS, "习作要求评价补生成模型", {
    emptyRetryInstruction: "上一次习作要求评价补生成响应为空。请严格输出 JSON 对象，requirements 必须逐条对应习作要求，不要空响应。"
  });
  const content = result.content;
  let parsed = null;
  try {
    parsed = parseModelJson(content);
  } catch (parseError) {
    const repaired = await repairModelJsonResponse(requestConfig, content, parseError.message);
    parsed = parseModelJson(repaired);
  }
  const items = Array.isArray(parsed)
    ? parsed
    : parsed?.requirements || parsed?.requirementEvaluations || parsed?.taskRequirements || parsed?.criteria || parsed;
  const requirements = normalizeRawRequirementEvaluations(items, sourceConfig.prompt);
  const expectedRequirements = getPromptRequirements(sourceConfig.prompt);
  if (requirements.length < expectedRequirements.length) {
    throw new Error("批改模型漏掉习作要求评价，系统已尝试单独补生成，但模型仍未返回逐条对应习作要求的 requirements");
  }
  return requirements;
}

function normalizeRawRequirementEvaluations(items, prompt) {
  const expectedRequirements = getPromptRequirements(prompt);
  const sourceItems = collectRawRequirementItems(items);
  const normalized = sourceItems.map((item, index) => {
    const entry = typeof item === "object" && item !== null ? item : { note: item };
    const text = String(
      entry.text
        || entry.requirement
        || entry.name
        || entry.title
        || entry.criterion
        || entry.standard
        || expectedRequirements[index]
        || ""
    ).trim();
    const note = String(
      entry.note
        || entry.reason
        || entry.comment
        || entry.analysis
        || entry.evidence
        || entry.result
        || entry.status
        || ""
    ).trim();
    const value = normalizeRequirementValue(
      entry.value ?? entry.level ?? entry.rating ?? entry.grade ?? entry.score,
      entry,
      note
    );
    return {
      text,
      level: String(entry.level || entry.status || entry.result || requirementLevelFromValue(value)).trim(),
      value,
      note
    };
  }).filter((item) => item.text && item.note);

  const byText = new Map();
  normalized.forEach((item) => {
    const key = normalizeRequirementComparableText(item.text);
    if (key && !byText.has(key)) byText.set(key, item);
  });

  return expectedRequirements
    .map((requirement, index) => {
      const key = normalizeRequirementComparableText(requirement);
      const direct = normalized[index];
      const matched = byText.get(key);
      const item = matched || direct;
      if (!item) return null;
      return {
        ...item,
        text: requirement || item.text
      };
    })
    .filter((item) => item && item.text && item.note);
}

function collectRawRequirementItems(items) {
  if (Array.isArray(items)) return items;
  if (!items || typeof items !== "object") return [];
  const candidates = [
    items.items,
    items.requirements,
    items.requirementEvaluations,
    items.requirement_evaluations,
    items.taskRequirements,
    items.criteria,
    items.checklist,
    items.details,
    items.results
  ];
  const arrayCandidate = candidates.find(Array.isArray);
  if (arrayCandidate) return arrayCandidate;
  return Object.entries(items)
    .filter(([key, value]) => !["total", "score", "summary"].includes(key) && value)
    .map(([key, value]) => {
      if (typeof value === "object") {
        return { text: key, ...value };
      }
      return { text: key, note: value };
    });
}

function getPromptRequirements(prompt) {
  const requirements = Array.isArray(prompt?.requirements)
    ? prompt.requirements.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (requirements.length) return requirements;
  return ["围绕本次习作题目完成作文，内容清楚具体。"];
}

function normalizeRequirementComparableText(text) {
  return String(text || "").replace(/\s/g, "").replace(/[，,。！？!?；;：:“”"‘’、（）()《》【】\[\]]/g, "");
}

function normalizeRequirementValue(value, item, note = "") {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric >= 1 && numeric <= 5) return clampInteger(numeric, 1, 5);
    if (numeric >= 0 && numeric <= 100) {
      return clampInteger(Math.ceil((numeric / 100) * 5), 1, 5);
    }
  }
  const text = `${value || ""} ${item?.level || ""} ${item?.rating || ""} ${item?.grade || ""} ${note || ""}`.trim();
  if (/优秀|完全达成|很好|充分|5档|五档/.test(text)) return 5;
  if (/良好|较好|基本达成|比较完整|4档|四档/.test(text)) return 4;
  if (/中等|一般|部分达成|还可以|3档|三档/.test(text)) return 3;
  if (/合格|及格|勉强|达成较少|2档|二档/.test(text)) return 2;
  if (/需完善|未达成|不足|缺少|偏离|1档|一档/.test(text)) return 1;
  return 3;
}

function requirementLevelFromValue(value) {
  if (value >= 5) return "优秀";
  if (value >= 4) return "良好";
  if (value >= 3) return "中等";
  if (value >= 2) return "合格";
  return "需完善";
}

function getRequirementRecoveryReason(items, normalized, expectedRequirements) {
  if (!items) return "第一阶段没有返回 requirements 数组";
  if (!collectRawRequirementItems(items).length) return "第一阶段返回了 requirements，但不是可识别的数组或对象";
  return `第一阶段习作要求评价不完整，预期 ${expectedRequirements.length} 条，实际可用 ${normalized.length} 条`;
}

async function ensureScoreDetails(requestConfig, sourceConfig, report) {
  const existingScores = normalizeRawScoreDetails(report?.scores);
  if (existingScores.items.length === SCORE_DIMENSIONS.length) {
    report.scores = existingScores;
    return {
      recovered: false,
      reason: ""
    };
  }

  const reason = getScoreRecoveryReason(report?.scores, existingScores);
  const scores = await recoverScoreDetailsFromModel(requestConfig, sourceConfig, report, reason);
  report.scores = scores;
  return {
    recovered: true,
    reason
  };
}

async function recoverScoreDetailsFromModel(requestConfig, sourceConfig, report, reason) {
  const payload = {
    model: requestConfig.model,
    messages: [
      {
        role: "system",
        content: buildScoreRecoverySystemPrompt()
      },
      {
        role: "user",
        content: buildScoreRecoveryUserPrompt(sourceConfig, report, reason)
      }
    ],
    temperature: resolveTemperature(requestConfig),
    response_format: { type: "json_object" },
    max_tokens: SCORE_RECOVERY_MAX_TOKENS
  };
  const result = await postChatCompletionContent(requestConfig, payload, SCORE_RECOVERY_TIMEOUT_MS, "评分详情补生成模型", {
    emptyRetryInstruction: "上一次评分详情补生成响应为空。请严格输出 JSON 对象，包含 scores.total 和 scores.items 四项评分，不要空响应。"
  });
  const content = result.content;
  let parsed = null;
  try {
    parsed = parseModelJson(content);
  } catch (parseError) {
    const repaired = await repairModelJsonResponse(requestConfig, content, parseError.message);
    parsed = parseModelJson(repaired);
  }
  const scores = normalizeRawScoreDetails(parsed?.scores || parsed);
  if (scores.items.length !== SCORE_DIMENSIONS.length) {
    throw new Error("批改模型漏掉评分详情，系统已尝试单独补生成，但模型仍未返回内容、表达、结构、行文规范四项评分");
  }
  return scores;
}

function normalizeRawScoreDetails(scores) {
  const rawItems = collectRawScoreItems(scores);
  const byName = new Map();
  rawItems.forEach((item) => {
    const normalizedName = normalizeScoreName(item?.name || item?.dimension || item?.title || item?.label || item?.type);
    if (!normalizedName || byName.has(normalizedName)) return;
    const rawValue = item?.value ?? item?.level ?? item?.rating ?? item?.grade ?? item?.score;
    const value = normalizeScoreValue(rawValue, normalizedName, item);
    const note = String(item?.note || item?.reason || item?.comment || item?.analysis || item?.evidence || "").trim();
    if (value && note) {
      byName.set(normalizedName, {
        name: normalizedName,
        value,
        note
      });
    }
  });

  const objectItems = collectScoreItemsFromObject(scores);
  objectItems.forEach((item) => {
    if (!item.name || byName.has(item.name)) return;
    if (item.value && item.note) {
      byName.set(item.name, item);
    }
  });

  const items = SCORE_DIMENSIONS
    .map((dimension) => byName.get(dimension.name))
    .filter(Boolean);
  const total = normalizeScoreTotal(scores, items);
  return {
    total,
    items
  };
}

function collectRawScoreItems(scores) {
  if (Array.isArray(scores)) return scores;
  if (!scores || typeof scores !== "object") return [];
  const candidates = [
    scores.items,
    scores.details,
    scores.criteria,
    scores.dimensions,
    scores.rubric,
    scores.scoreItems
  ];
  return candidates.find(Array.isArray) || [];
}

function collectScoreItemsFromObject(scores) {
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) return [];
  return SCORE_DIMENSIONS.map((dimension) => {
    const entry = scores[dimension.name]
      || scores[`${dimension.name}与审题`]
      || scores[`${dimension.name}与详略`]
      || scores[dimension.name === "表达" ? "语言表达" : ""]
      || scores[dimension.name === "行文规范" ? "规范" : ""];
    if (!entry) return null;
    const value = typeof entry === "object"
      ? normalizeScoreValue(entry.value ?? entry.level ?? entry.rating ?? entry.grade ?? entry.score, dimension.name, entry)
      : normalizeScoreValue(entry, dimension.name, {});
    const note = typeof entry === "object"
      ? String(entry.note || entry.reason || entry.comment || entry.analysis || entry.evidence || "").trim()
      : "";
    return value && note ? { name: dimension.name, value, note } : null;
  }).filter(Boolean);
}

function normalizeScoreName(name) {
  const text = String(name || "").trim();
  if (/内容|审题|中心|选材/.test(text)) return "内容";
  if (/表达|语言|描写|句子|语句/.test(text)) return "表达";
  if (/结构|详略|段落|层次|顺序/.test(text)) return "结构";
  if (/规范|错别字|标点|书写|格式|行文/.test(text)) return "行文规范";
  return "";
}

function normalizeScoreValue(value, dimensionName, item) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric >= 1 && numeric <= 5) return clampInteger(numeric, 1, 5);
    const dimension = SCORE_DIMENSIONS.find((entry) => entry.name === dimensionName);
    const max = Number(item?.max || item?.fullScore || dimension?.max || 100);
    if (numeric >= 0 && numeric <= max) {
      return clampInteger(Math.ceil((numeric / Math.max(max, 1)) * 5), 1, 5);
    }
    if (numeric >= 0 && numeric <= 100) {
      return clampInteger(Math.ceil((numeric / 100) * 5), 1, 5);
    }
  }
  const text = String(value || item?.level || "").trim();
  if (/优秀|很好|5档|五档/.test(text)) return 5;
  if (/良好|较好|4档|四档/.test(text)) return 4;
  if (/中等|一般|3档|三档/.test(text)) return 3;
  if (/合格|及格|2档|二档/.test(text)) return 2;
  if (/需完善|较弱|薄弱|1档|一档/.test(text)) return 1;
  return 0;
}

function normalizeScoreTotal(scores, items) {
  const explicitTotal = Number(scores?.total ?? scores?.score ?? scores?.totalScore);
  if (Number.isFinite(explicitTotal)) {
    return clampInteger(explicitTotal, 0, 100);
  }
  if (items.length) {
    const weighted = items.reduce((sum, item) => {
      const dimension = SCORE_DIMENSIONS.find((entry) => entry.name === item.name);
      return sum + (Number(item.value || 0) / 5) * (dimension?.max || 0);
    }, 0);
    return clampInteger(Math.round(weighted), 0, 100);
  }
  return 0;
}

function clampInteger(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function getScoreRecoveryReason(scores, normalized) {
  if (!scores || typeof scores !== "object") return "第一阶段没有返回 scores 对象";
  if (!collectRawScoreItems(scores).length && !normalized.items.length) return "第一阶段没有返回 scores.items 评分明细";
  return "第一阶段评分明细字段不完整，缺少内容、表达、结构、行文规范四项中的一项或多项";
}

async function ensureStructureGuide(requestConfig, sourceConfig, report) {
  const existingGuide = normalizeRawStructureGuide(report?.guide);
  if (existingGuide.length) {
    report.guide = existingGuide;
    return {
      recovered: false,
      reason: ""
    };
  }

  const reason = getStructureGuideRecoveryReason(report?.guide);
  const guide = await recoverStructureGuideFromModel(requestConfig, sourceConfig, report, reason);
  report.guide = guide;
  return {
    recovered: true,
    reason
  };
}

async function recoverStructureGuideFromModel(requestConfig, sourceConfig, report, reason) {
  const payload = {
    model: requestConfig.model,
    messages: [
      {
        role: "system",
        content: buildStructureGuideRecoverySystemPrompt()
      },
      {
        role: "user",
        content: buildStructureGuideRecoveryUserPrompt(sourceConfig, report, reason)
      }
    ],
    temperature: resolveTemperature(requestConfig),
    response_format: { type: "json_object" },
    max_tokens: GUIDE_RECOVERY_MAX_TOKENS
  };
  const result = await postChatCompletionContent(requestConfig, payload, GUIDE_RECOVERY_TIMEOUT_MS, "结构升格补生成模型", {
    emptyRetryInstruction: "上一次结构升格补生成响应为空。请严格输出 JSON 对象，且 guide 必须是非空数组，不要空响应。"
  });
  const content = result.content;
  let parsed = null;
  try {
    parsed = parseModelJson(content);
  } catch (parseError) {
    const repaired = await repairModelJsonResponse(requestConfig, content, parseError.message);
    parsed = parseModelJson(repaired);
  }
  const items = Array.isArray(parsed) ? parsed : parsed?.guide;
  const guide = normalizeRawStructureGuide(items);
  if (!guide.length) {
    throw new Error("批改模型漏掉结构升格指导，系统已尝试单独补生成，但模型仍未返回可用的 guide");
  }
  return guide;
}

function normalizeRawStructureGuide(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const section = String(item?.section || item?.part || item?.position || "").trim();
    const title = String(item?.title || item?.problem || item?.focus || "").trim();
    const advice = String(item?.advice || item?.comment || item?.analysis || item?.suggestion || "").trim();
    const example = String(item?.example || item?.action || item?.adjustment || item?.rewrite || "").trim();
    return {
      section,
      title,
      advice,
      example
    };
  }).filter((item) => (
    item.section &&
    item.title &&
    item.advice &&
    item.example &&
    isLikelyStructureGuideItem(item)
  ));
}

function isLikelyStructureGuideItem(item) {
  const text = `${item.section} ${item.title} ${item.advice} ${item.example}`;
  return /开头|中间|结尾|结构|段落|详略|字数|比例|篇幅|过渡|铺垫|重点|转折|结果|顺序|层次/.test(text);
}

function getStructureGuideRecoveryReason(items) {
  if (!Array.isArray(items)) return "第一阶段没有返回 guide 数组";
  if (!items.length) return "第一阶段返回了空 guide 数组";
  return "第一阶段 guide 缺少 section/title/advice/example，或内容不是结构升格指导";
}

async function polishEssayWithGuide(requestConfig, sourceConfig, report) {
  const guide = normalizeRawStructureGuide(report?.guide);
  if (!guide.length) {
    throw new Error("批改模型没有返回结构升格指导，无法按升格方向润色全文");
  }
  report.guide = guide;
  let lastValidation = null;
  let lastPolished = "";
  for (let attempt = 0; attempt < GUIDE_POLISH_MAX_ATTEMPTS; attempt += 1) {
    const payload = {
      model: requestConfig.model,
      messages: [
        {
          role: "system",
          content: buildGuidePolishSystemPrompt()
        },
        {
          role: "user",
          content: buildGuidePolishUserPrompt(sourceConfig, report, {
            attempt,
            previousPolished: lastPolished,
            previousIssue: lastValidation?.message || ""
          })
        }
      ],
      temperature: resolveTemperature(requestConfig),
      response_format: { type: "json_object" },
      max_tokens: GUIDE_POLISH_MAX_TOKENS
    };
    const result = await postChatCompletionContent(requestConfig, payload, GUIDE_POLISH_TIMEOUT_MS, "升格润色模型", {
      emptyRetryInstruction: "上一次升格润色响应为空。请严格输出 JSON 对象，包含完整 polished 全文、polishedItems 和 appliedGuide，不要空响应。"
    });
    const content = result.content;
    let parsed = null;
    try {
      parsed = parseModelJson(content);
    } catch (parseError) {
      const repaired = await repairModelJsonResponse(requestConfig, content, parseError.message);
      parsed = parseModelJson(repaired);
    }
    const polished = String(parsed.polished || "").trim();
    if (!polished) {
      lastValidation = { ok: false, message: "升格润色模型没有返回 polished 全文" };
      continue;
    }
    lastPolished = polished;
    const validation = validateGuidePolishedEssay(sourceConfig.essay, polished);
    if (!validation.ok) {
      lastValidation = validation;
      continue;
    }
    const polishedItems = Array.isArray(parsed.polishedItems) ? parsed.polishedItems : [];
    const appliedGuide = Array.isArray(parsed.appliedGuide) ? parsed.appliedGuide : [];
    return {
      polished,
      polishedItems,
      chain: {
        source: "guide_driven",
        guideCount: guide.length,
        appliedGuideCount: appliedGuide.length,
        retryCount: attempt,
        appliedAt: new Date().toISOString()
      }
    };
  }
  throw new Error(`升格润色模型返回的是片段，不是完整作文：${lastValidation?.message || "润色全文不完整"}`);
}

async function repairModelJsonResponse(config, brokenContent, parseMessage) {
  const content = String(brokenContent || "").trim();
  if (!content) {
    throw new Error("模型返回空响应");
  }
  const payload = {
    model: config.model,
    messages: [
      {
        role: "system",
        content: buildJsonRepairSystemPrompt()
      },
      {
        role: "user",
        content: buildJsonRepairUserPrompt(content, parseMessage)
      }
    ],
    temperature: resolveTemperature(config),
    response_format: { type: "json_object" },
    max_tokens: GRADING_MAX_TOKENS
  };
  const result = await postChatCompletionContent(config, payload, JSON_REPAIR_TIMEOUT_MS, "JSON 修复模型", {
    emptyRetryInstruction: "上一次 JSON 修复响应为空。请只输出修复后的合法 JSON 对象，不要空响应。"
  });
  const repaired = result.content;
  return repaired;
}

function buildEssayGradingSystemPrompt(options = {}) {
  const lines = [
    "你是一名有小学语文作文批改经验的老师，正在为 3-6 年级学生生成作文批改报告。",
    "你的评价必须完全基于用户提供的作文原文和习作要求，不能套用模板，不能引用原文中不存在的情节、人物、动作或物品。",
    "每条评价都要有客观依据：能指出原文证据、问题位置、修改理由和具体改法。",
    "点评数量和升格指导数量不按固定模板数量，按文章实际需要生成；优先保证完整 JSON，避免为了凑数或过度展开导致输出被截断。",
    "如果原文有多处问题，要尽可能详细批改，覆盖审题、内容完整、情节推进、细节描写、心理描写、语言表达、错别字、标点、分段、结尾感悟等方面。",
    "所有 annotations.original 必须逐字摘录作文原文中的一句或一段，不能改写原句。",
    "annotations 请按作文原文从开头到结尾的出现顺序排列；original 优先使用完整句子，便于在原文首字上定位。",
    "requirements 是必填数组，必须逐条对应用户提供的习作要求，不能省略，不能返回空数组。",
    "guide 只做文章结构升格诊断，聚焦开头、中间、结尾、段落顺序、详略安排和字数比例；不要在 guide 中写错字、词句润色、修辞、语言表达或心理描写的单点建议。",
    "guide 是必填数组，不能省略，不能返回空数组；即使文章结构较好，也要客观指出开头、中间、结尾和详略比例中最值得保持或微调的方向。",
    "本阶段只生成评价、评分、原文点评和 guide 结构升格建议；不要在本阶段展开全文润色。",
    "全文润色会在第二阶段严格依据 guide 另行生成。",
    "只输出 JSON，不要输出 Markdown、代码块或解释。"
  ];
  if (options.compact) {
    lines.push(
      "本次是长度截断后的精简重试：必须压缩输出，只保留最关键、最可执行、能定位到原文的点评，先保证 JSON 完整可解析。",
      "精简重试时 annotations 通常控制在 8-16 条，最长不超过 20 条；guide 通常控制在 4-8 条；每条 comment 和 suggestion 要短而具体。"
    );
  }
  return lines.join("\n");
}

function buildEssayGradingUserPrompt(config, options = {}) {
  const prompt = config.prompt || {};
  const requirements = Array.isArray(prompt.requirements) ? prompt.requirements : [];
  const customInstructions = String(config.customInstructions || "").trim();
  const schema = {
    teacherComment: "一段客观总评，必须引用全文表现，例如篇幅、结构、主要优点和主要问题",
    requirements: [
      {
        text: "习作要求原文",
        value: 1,
        level: "优秀/良好/中等/合格/需完善",
        note: "基于作文证据的达成情况说明"
      }
    ],
    scores: {
      total: 85,
      items: [
        { name: "内容", value: 4, note: "约 28/35：客观评分依据" },
        { name: "表达", value: 4, note: "约 20/25：客观评分依据" },
        { name: "结构", value: 4, note: "约 20/25：客观评分依据" },
        { name: "行文规范", value: 4, note: "约 12/15：客观评分依据" }
      ]
    },
    annotations: [
      {
        type: "佳句/润色/错字/结构/内容",
        tone: "red 或 blue；佳句用 red，其余用 blue",
        original: "必须从作文原文逐字摘录",
        comment: "客观点评，指出好在哪里或问题在哪里",
        suggestion: "详细修改建议或可替换表达"
      }
    ],
    guide: [
      {
        section: "开头/中间-铺垫/中间-重点/中间-转折/中间-结果/详略安排/字数比例/结尾",
        title: "结构诊断标题",
        advice: "只评价文章结构：这一部分是否服务主题、是否该详写或略写、与前后文是否衔接、篇幅比例是否合适",
        example: "结构调整示例，例如这一段应该先写什么、再写什么、哪些内容合并或展开"
      }
    ],
    polished: "第一阶段请返回空字符串，系统会在第二阶段根据 guide 单独生成全文润色",
    polishedItems: []
  };
  return [
    "请根据下面信息生成一份结构化作文批改报告。",
    "",
    "【学生年级与册次】",
    `${prompt.grade || ""}${prompt.book || ""} ${prompt.unit || ""}`.trim() || "未提供",
    "",
    "【习作题目】",
    prompt.title || "未提供",
    "",
    "【习作要求】",
    requirements.length ? requirements.map((item, index) => `${index + 1}. ${item}`).join("\n") : "未提供",
    "",
    "【老师本次批改提示】",
    customInstructions || "使用默认批改标准：基于原文客观评价，保留孩子原有想法和语言水平。",
    "",
    "【作文原文】",
    config.essay || "",
    "",
    ESSAY_SCORING_RUBRIC,
    "",
    "【输出要求】",
    "1. 必须输出符合下方 schema 的 JSON 对象。",
    "2. requirements 数组必须逐条对应上面的习作要求，不能为空；每条必须包含 text、value、level、note，note 要引用作文证据说明达成情况。",
    "3. annotations 数量按实际需要生成，至少覆盖所有明显优点和主要问题；每条 original 必须来自作文原文。",
    "4. annotations 必须按原文出现顺序排列，original 尽量摘录完整句子；前端会在该句第一个字上显示编号点。",
    "5. guide 只关注文章结构，不做词句润色、错字订正、修辞赏析或语言表达建议；至少包含“开头”“结尾”“详略安排/字数比例”，中间部分要根据文章内容尽可能拆成多条分析。",
    "6. scores.items 必须且只能包含“内容、表达、结构、行文规范”四项，每项 value 为 1-5 的整数，note 要说明证据和折算分。",
    "7. total 为 0-100 的整数，必须按照上面的评分标准综合估算，不要随意给高分或低分。",
    "8. 第一阶段不要生成完整润色文章：polished 返回空字符串，polishedItems 返回空数组；系统会在第二阶段严格根据 guide 生成润色全文。",
    "9. guide 必须按文章顺序组织：先开头，再中间各段或各情节，再详略/字数比例，最后结尾；每条 advice 要说明原文当前比例或结构问题，以及怎么调整。",
    "10. guide 不能为空，且每一项都必须包含 section、title、advice、example 四个字段。",
    options.compact ? "11. 本次是长度截断后的精简重试：teacherComment 控制在 120 字以内，requirements/scores 每条 note 控制在 80 字以内，annotations 优先保留最关键的 8-16 条，必须保证 JSON 完整。" : "",
    options.previousIssue ? `【上一次失败原因】${options.previousIssue}` : "",
    "",
    "【JSON schema 示例】",
    JSON.stringify(schema, null, 2)
  ].join("\n");
}

function buildRequirementRecoverySystemPrompt() {
  return [
    "你是一名小学语文作文审题与习作要求评价老师。",
    "你只补生成 requirements 数组，不重新评分，不重新写原文点评，不生成升格指导和润色全文。",
    "requirements 必须逐条对应本次习作要求，评价要完全基于作文原文。",
    "每条评价都要说明学生是否达成该要求，并引用原文内容作为依据。",
    "只输出 JSON，不要输出 Markdown、代码块或解释。"
  ].join("\n");
}

function buildRequirementRecoveryUserPrompt(config, report, reason) {
  const prompt = config.prompt || {};
  const requirements = getPromptRequirements(prompt);
  const annotations = Array.isArray(report?.annotations) ? report.annotations : [];
  const schema = {
    requirements: [
      {
        text: "习作要求原文",
        value: 4,
        level: "优秀/良好/中等/合格/需完善",
        note: "基于作文证据的达成情况说明"
      }
    ]
  };
  return [
    "第一阶段批改结果缺少可用的习作要求评价，请只补生成 requirements。",
    "",
    "【缺失原因】",
    reason || "requirements 缺失",
    "",
    "【学生年级与册次】",
    `${prompt.grade || ""}${prompt.book || ""} ${prompt.unit || ""}`.trim() || "未提供",
    "",
    "【习作题目】",
    prompt.title || "未提供",
    "",
    "【必须逐条评价的习作要求】",
    requirements.map((item, index) => `${index + 1}. ${item}`).join("\n"),
    "",
    "【作文原文】",
    config.essay || "",
    "",
    "【已有总评】",
    String(report?.teacherComment || "").trim() || "无",
    "",
    "【已有局部点评，可作为判断证据】",
    annotations.length
      ? annotations.slice(0, 80).map((item, index) => `${index + 1}. ${item.type || "点评"}｜原句：${item.original || ""}｜点评：${item.comment || ""}`).join("\n")
      : "无",
    "",
    "【requirements 生成规则】",
    "1. 只输出 requirements，不要输出其他报告字段。",
    "2. requirements 条数必须与“必须逐条评价的习作要求”一致，顺序也一致。",
    "3. text 必须原样使用习作要求；value 必须是 1-5 的整数；level 从“优秀、良好、中等、合格、需完善”中选择。",
    "4. note 必须具体客观，说明原文哪里完成了、哪里不足，不要写模板话。",
    "5. 如果作文没有体现某条要求，也要明确说明缺失依据，不能跳过该条。",
    "",
    "【JSON schema 示例】",
    JSON.stringify(schema, null, 2)
  ].join("\n");
}

function buildScoreRecoverySystemPrompt() {
  return [
    "你是一名小学语文作文评分老师。",
    "你只补生成 scores 对象，不重新写总评，不重新写原文点评，不生成升格指导和润色全文。",
    "评分必须完全基于作文原文、习作要求和评分标准，不能因为书写、拍照或识别难度给分。",
    "scores.items 必须且只能包含四项：内容、表达、结构、行文规范。",
    "每项 value 必须是 1-5 的整数，note 必须说明客观证据和折算分。",
    "只输出 JSON，不要输出 Markdown、代码块或解释。"
  ].join("\n");
}

function buildScoreRecoveryUserPrompt(config, report, reason) {
  const prompt = config.prompt || {};
  const requirements = Array.isArray(prompt.requirements) ? prompt.requirements : [];
  const schema = {
    scores: {
      total: 85,
      items: [
        { name: "内容", value: 4, note: "约 28/35：结合审题、中心和内容展开说明依据" },
        { name: "表达", value: 4, note: "约 20/25：结合语句通顺、描写和语言表现说明依据" },
        { name: "结构", value: 4, note: "约 20/25：结合开头、中间、结尾、详略和段落说明依据" },
        { name: "行文规范", value: 4, note: "约 12/15：结合错别字、标点、分段和格式说明依据" }
      ]
    }
  };
  return [
    "第一阶段批改结果缺少可用的评分详情，请只补生成 scores。",
    "",
    "【缺失原因】",
    reason || "scores.items 缺失",
    "",
    "【学生年级与册次】",
    `${prompt.grade || ""}${prompt.book || ""} ${prompt.unit || ""}`.trim() || "未提供",
    "",
    "【习作题目】",
    prompt.title || "未提供",
    "",
    "【习作要求】",
    requirements.length ? requirements.map((item, index) => `${index + 1}. ${item}`).join("\n") : "未提供",
    "",
    "【作文原文】",
    config.essay || "",
    "",
    "【已有总评】",
    String(report?.teacherComment || "").trim() || "无",
    "",
    "【已有要求评价】",
    Array.isArray(report?.requirements) && report.requirements.length
      ? report.requirements.map((item, index) => `${index + 1}. ${item.text || ""}｜${item.note || ""}`).join("\n")
      : "无",
    "",
    "【已有局部点评】",
    Array.isArray(report?.annotations) && report.annotations.length
      ? report.annotations.slice(0, 80).map((item, index) => `${index + 1}. ${item.type || "点评"}｜原句：${item.original || ""}｜点评：${item.comment || ""}`).join("\n")
      : "无",
    "",
    ESSAY_SCORING_RUBRIC,
    "",
    "【scores 生成规则】",
    "1. 只输出 scores 对象，不要输出其他报告字段。",
    "2. scores.items 必须且只能有四项，顺序为：内容、表达、结构、行文规范。",
    "3. value 必须是 1-5 的整数。",
    "4. note 必须写清楚证据和折算分，例如“约 28/35：……”。",
    "5. total 必须是 0-100 整数，并与四项评分一致。",
    "",
    "【JSON schema 示例】",
    JSON.stringify(schema, null, 2)
  ].join("\n");
}

function buildStructureGuideRecoverySystemPrompt() {
  return [
    "你是一名小学语文作文结构升格诊断老师。",
    "你只补生成 guide 数组，不重新评分，不重新写原文点评，不生成全文润色。",
    "guide 必须只关注文章结构：开头、中间、结尾、段落顺序、详略安排、字数比例、过渡和重点情节展开。",
    "不要在 guide 中写错别字、标点、词句润色、修辞赏析或单句表达建议。",
    "每条建议都必须基于作文原文，不能编造原文没有的人物、事件或思想。",
    "只输出 JSON，不要输出 Markdown、代码块或解释。"
  ].join("\n");
}

function buildStructureGuideRecoveryUserPrompt(config, report, reason) {
  const prompt = config.prompt || {};
  const requirements = Array.isArray(prompt.requirements) ? prompt.requirements : [];
  const annotations = Array.isArray(report?.annotations) ? report.annotations : [];
  const schema = {
    guide: [
      {
        section: "开头/中间-铺垫/中间-重点/中间-转折/中间-结果/详略安排/字数比例/结尾",
        title: "结构诊断标题",
        advice: "只评价结构：这一部分是否服务主题、是否该详写或略写、衔接是否自然、篇幅比例是否合适",
        example: "结构调整示例：这一段可以先写什么、再写什么、哪里合并、哪里展开或如何收束"
      }
    ]
  };
  return [
    "第一阶段批改结果缺少可用的结构升格指导，请只补生成 guide。",
    "",
    "【缺失原因】",
    reason || "guide 缺失",
    "",
    "【学生年级与册次】",
    `${prompt.grade || ""}${prompt.book || ""} ${prompt.unit || ""}`.trim() || "未提供",
    "",
    "【习作题目】",
    prompt.title || "未提供",
    "",
    "【习作要求】",
    requirements.length ? requirements.map((item, index) => `${index + 1}. ${item}`).join("\n") : "未提供",
    "",
    "【作文原文】",
    config.essay || "",
    "",
    "【已有总评】",
    String(report?.teacherComment || "").trim() || "无",
    "",
    "【已有局部点评，仅用于理解原文问题，不要照抄为 guide】",
    annotations.length ? annotations.slice(0, 80).map((item, index) => `${index + 1}. ${item.type || "点评"}｜原句：${item.original || ""}｜点评：${item.comment || ""}｜建议：${item.suggestion || ""}`).join("\n") : "无",
    "",
    "【guide 生成规则】",
    "1. guide 必须是非空数组。",
    "2. 至少包含“开头”“中间重点/详略安排”“结尾”三类；如果中间内容较复杂，要拆成多条。",
    "3. 每条必须包含 section、title、advice、example 四个字段。",
    "4. advice 要客观分析原文当前结构和篇幅比例，说明为什么需要保持、压缩、补过渡或详写。",
    "5. example 写结构调整方向，不要写成完整润色文章，也不要只改一个词。",
    "6. 按文章顺序排列：开头在前，中间各部分居中，结尾在后。",
    "",
    "【JSON schema 示例】",
    JSON.stringify(schema, null, 2)
  ].join("\n");
}

function buildGuidePolishSystemPrompt() {
  return [
    "你是一名小学语文作文升格润色老师。",
    "你现在只负责根据已经生成的“结构升格建议”改写全文，不能重新评分，不能重新写点评。",
    "润色全文必须优先落实结构升格建议：开头怎么调整、中间哪里详写或略写、哪里补过渡、结尾怎么收束，都要体现在 polished 全文里。",
    "如果升格建议指出“详略不当”“重点不突出”“关键过程太少”，polished 必须实际调整篇幅比例：围绕原文已有的关键事件补充孩子能写出的动作、心理、困难、尝试或结果，不能只改几个词。",
    "如果升格建议指出“开头太突兀”“结尾不足”“段落衔接弱”，polished 必须实际改开头、结尾或过渡句。",
    "不要过度拔高孩子思想，不要写成人散文，不要加入原文没有的新人物、新事件、复杂哲理或宏大主题。",
    "可以基于原文已有线索补清必要细节，但要像学生自己修改后的作文。",
    "只输出 JSON，不要输出 Markdown、代码块或解释。"
  ].join("\n");
}

function validateGuidePolishedEssay(originalEssay, polishedEssay) {
  const original = String(originalEssay || "").trim();
  const polished = String(polishedEssay || "").trim();
  const originalLength = countMeaningfulChineseText(original);
  const polishedLength = countMeaningfulChineseText(polished);
  const originalSentences = countEssaySentences(original);
  const polishedSentences = countEssaySentences(polished);
  if (!polishedLength) {
    return { ok: false, message: "润色稿为空" };
  }
  if (originalLength >= 120 && polishedLength < Math.max(90, Math.floor(originalLength * 0.65))) {
    return {
      ok: false,
      message: `润色稿明显短于原文，疑似只返回片段：原文约 ${originalLength} 字，润色稿约 ${polishedLength} 字`
    };
  }
  if (originalSentences >= 6 && polishedSentences < 4) {
    return {
      ok: false,
      message: `润色稿句子数量过少，疑似没有覆盖全文：原文约 ${originalSentences} 句，润色稿约 ${polishedSentences} 句`
    };
  }
  if (originalLength >= 260 && !/[\n。！？!?][\s\S]{40,}[\n。！？!?]/.test(polished)) {
    return {
      ok: false,
      message: "润色稿缺少完整开头、中间和结尾，疑似只改写了一个段落"
    };
  }
  return { ok: true, message: "" };
}

function countMeaningfulChineseText(text) {
  return String(text || "").replace(/\s/g, "").replace(/[，,。！？!?；;：:“”"‘’、（）()《》【】\[\]—….\-]/g, "").length;
}

function countEssaySentences(text) {
  return String(text || "")
    .split(/[。！？!?；;\n]+/)
    .map((item) => item.trim())
    .filter((item) => countMeaningfulChineseText(item) >= 4)
    .length;
}

function buildGuidePolishUserPrompt(config, report, retry = {}) {
  const prompt = config.prompt || {};
  const requirements = Array.isArray(prompt.requirements) ? prompt.requirements : [];
  const guide = Array.isArray(report?.guide) ? report.guide : [];
  const annotations = Array.isArray(report?.annotations) ? report.annotations : [];
  const isRetry = Number(retry.attempt || 0) > 0;
  const schema = {
    polished: "按结构升格建议重写后的完整作文全文，必须实际落实详略、开头、中间、结尾等结构调整",
    polishedItems: [
      {
        original: "作文原文中被润色的一句或一小段，必须逐字摘录",
        polished: "润色后的句子或段落片段，必须逐字出现在 polished 全文中",
        reason: "简短说明对应哪条结构升格或语言修改；前端不展示，但用于标红定位"
      }
    ],
    appliedGuide: [
      {
        section: "对应 guide.section",
        action: "本次润色实际怎么落实，例如扩写关键过程、压缩铺垫、补过渡、重写结尾",
        evidence: "polished 全文中落实该建议的片段"
      }
    ]
  };
  return [
    "请根据下面的一次作文批改结果，重新生成“全文润色”。",
    "",
    "【学生年级与册次】",
    `${prompt.grade || ""}${prompt.book || ""} ${prompt.unit || ""}`.trim() || "未提供",
    "",
    "【习作题目】",
    prompt.title || "未提供",
    "",
    "【习作要求】",
    requirements.length ? requirements.map((item, index) => `${index + 1}. ${item}`).join("\n") : "未提供",
    "",
    "【作文原文】",
    config.essay || "",
    "",
    "【必须落实的结构升格建议】",
    guide.length ? guide.map((item, index) => [
      `${index + 1}. ${item.section || "结构"}：${item.title || ""}`,
      `建议：${item.advice || ""}`,
      `示例方向：${item.example || ""}`
    ].join("\n")).join("\n\n") : "无",
    "",
    "【原文局部点评，可作为词句修正参考】",
    annotations.length ? annotations.slice(0, 80).map((item, index) => `${index + 1}. ${item.type || "点评"}｜原句：${item.original || ""}｜建议：${item.suggestion || ""}`).join("\n") : "无",
    "",
    "【润色规则】",
    "1. polished 必须是一篇完整作文，不是提纲，不是逐条建议。",
    "2. 必须先执行 guide：如果 guide 说详写，就在 polished 中实际增加对应重点部分的篇幅；如果 guide 说略写，就实际压缩不重要内容。",
    "3. 详写只能围绕原文已有线索展开，优先补动作、困难、心理、尝试、结果和必要环境，不要凭空新编大情节。",
    "4. 保留孩子原本的主题、经历、人物关系和儿童化表达。",
    "5. polishedItems 只列主要修改处，polished 字段必须逐字出现在 polished 全文中，便于前端标红。",
    "6. appliedGuide 必须逐条说明每条结构升格建议在 polished 中如何落地；这是后台校验链路，不在报告中展示。",
    "7. polished 必须覆盖原文从题目/开头到结尾的全部内容，不能只返回其中一段，不能只改写某条升格建议。",
    "8. 如果原文是一篇完整作文，polished 也必须是一篇完整作文；除非 guide 明确要求压缩，否则润色稿字数不能明显少于原文。",
    "9. 尽量保留题目，并按自然段输出；如果补详写，优先展开原文的重点事件，而不是删掉前后内容。",
    isRetry ? "" : "",
    isRetry ? "【上一次润色被系统判定为不完整】" : "",
    isRetry ? retry.previousIssue || "上一次只返回了片段，没有覆盖全文。" : "",
    isRetry && retry.previousPolished ? "【上一次不合格的润色稿】" : "",
    isRetry && retry.previousPolished ? retry.previousPolished : "",
    isRetry ? "请重新输出完整 polished，必须覆盖原文开头、中间、结尾，并逐条落实 guide。" : "",
    "",
    "【JSON schema 示例】",
    JSON.stringify(schema, null, 2)
  ].join("\n");
}

function buildJsonRepairSystemPrompt() {
  return [
    "你是一个严格的 JSON 修复器。",
    "你只修复语法错误，例如缺少逗号、引号、括号、非法换行、尾随逗号或 Markdown 包裹。",
    "你不能新增、删除或改写作文评价内容，不能重新批改，不能补充新观点。",
    "只输出一个可以被 JSON.parse 直接解析的 JSON 对象，不要输出 Markdown、解释或代码块。"
  ].join("\n");
}

function buildJsonRepairUserPrompt(content, parseMessage) {
  return [
    "下面是一次作文批改模型返回的结构化 JSON，但它存在语法错误。",
    "请在不改变字段含义和评价内容的前提下修复为合法 JSON。",
    "",
    "【解析错误】",
    parseMessage || "未知解析错误",
    "",
    "【待修复内容】",
    content
  ].join("\n");
}

function parseModelJson(content) {
  const clean = stripJsonFence(String(content || "").replace(/^\uFEFF/, "").trim());
  if (!clean) throw new Error("空响应");
  const baseCandidates = [
    clean,
    extractBalancedJsonObjectCandidate(clean),
    extractJsonObjectCandidate(clean),
  ].filter(Boolean);
  const candidates = [];
  for (const candidate of baseCandidates) {
    const repaired = repairCommonJsonSyntax(candidate);
    const closed = closeUnbalancedJson(repaired);
    candidates.push(
      candidate,
      removeTrailingJsonCommas(candidate),
      repaired,
      removeTrailingJsonCommas(repaired),
      closed,
      removeTrailingJsonCommas(closed)
    );
  }
  let lastError = null;
  for (const candidate of [...new Set(candidates)]) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("无法解析 JSON");
}

function stripJsonFence(text) {
  const clean = String(text || "").trim();
  const fenced = clean.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const fencedAnywhere = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fencedAnywhere ? fencedAnywhere[1].trim() : clean;
}

function extractBalancedJsonObjectCandidate(text) {
  const clean = String(text || "").trim();
  for (let start = clean.indexOf("{"); start >= 0; start = clean.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < clean.length; index += 1) {
      const char = clean[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }
      if (char === "\"") {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return clean.slice(start, index + 1).trim();
        }
      }
    }
  }
  return "";
}

function extractJsonObjectCandidate(text) {
  const clean = String(text || "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return clean.slice(start, end + 1).trim();
  }
  return "";
}

function removeTrailingJsonCommas(text) {
  return String(text || "").replace(/,\s*([}\]])/g, "$1");
}

function repairCommonJsonSyntax(text) {
  return insertMissingCommasBetweenJsonValues(
    removeTrailingJsonCommas(
      sanitizeJsonStringControls(
        String(text || "")
          .replace(/^\uFEFF/, "")
          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      )
    )
  );
}

function sanitizeJsonStringControls(text) {
  let output = "";
  let inString = false;
  let escaped = false;
  const source = String(text || "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        output += char;
        escaped = false;
        continue;
      }
      if (char === "\\") {
        output += char;
        escaped = true;
        continue;
      }
      if (char === "\"") {
        output += char;
        inString = false;
        continue;
      }
      if (char === "\r") {
        if (source[index + 1] === "\n") index += 1;
        output += "\\n";
        continue;
      }
      if (char === "\n") {
        output += "\\n";
        continue;
      }
      if (char === "\t") {
        output += "\\t";
        continue;
      }
      output += char;
      continue;
    }
    output += char;
    if (char === "\"") {
      inString = true;
    }
  }
  return output;
}

function insertMissingCommasBetweenJsonValues(text) {
  return String(text || "")
    .replace(/(\}|\]|"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|true|false|null)\s*(\n+)\s*("(?:[^"\\]|\\.)+"\s*:)/g, "$1,\n$3")
    .replace(/(\}|\])\s*(\n+)\s*(\{|\[)/g, "$1,\n$3");
}

function closeUnbalancedJson(text) {
  const source = String(text || "");
  const stack = [];
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    output += char;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
    } else if (char === "{" || char === "[") {
      stack.push(char);
    } else if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      if (stack[stack.length - 1] === expected) {
        stack.pop();
      }
    }
  }
  if (inString) {
    output += "\"";
  }
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    output += stack[index] === "{" ? "}" : "]";
  }
  return output;
}

function providerSupportsVision(provider, model) {
  if (provider === "deepseek") return /deepseek-v4-flash-vision-exp/i.test(model);
  return /gpt-4o|gpt-4\.1|qwen-vl|glm-4v|moonshot-v1-.+-vision-preview|vision|vl/i.test(model);
}

function buildChatCompletionsEndpoint(baseUrl) {
  const cleanBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(cleanBaseUrl)) {
    return new URL(cleanBaseUrl);
  }
  return new URL(`${cleanBaseUrl}/chat/completions`);
}

function buildRequestOptions(endpoint, options) {
  const hostname = endpoint.hostname || "";
  const isIpV6 = hostname.includes(":");
  return {
    ...options,
    family: isIpV6 ? undefined : 4
  };
}

function resolveTemperature(config) {
  if (config.provider === "kimi" || /^(kimi-|moonshot-)/i.test(config.model || "")) {
    return 1;
  }
  return 0;
}

function normalizeProviderError(message, retryAfterMs = 0) {
  const providerMessage = String(message || "");
  if (/invalid temperature/i.test(providerMessage)) {
    return new Error("模型不接受当前 temperature 参数。Kimi/Moonshot 模型会自动使用 temperature=1，请重试连接。");
  }
  if (/max(?:imum)?\s+(?:organization\s+)?concurrenc|concurrenc(?:y|ies).*limit|request reached.*concurrenc|并发.*(?:上限|限制)/i.test(providerMessage)) {
    const error = new Error("模型账号当前只允许 1 个请求同时处理，系统已自动排队并重试；如果仍繁忙，请等待几秒后再试。");
    error.code = "MODEL_CONCURRENCY_LIMIT";
    error.providerMessage = providerMessage;
    error.retryAfterMs = Math.max(Number(retryAfterMs || 0), parseSuggestedRetryDelayMs(providerMessage));
    return error;
  }
  return new Error(providerMessage);
}

function parseRetryAfterMs(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const seconds = Number(text);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds * 1000));
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0;
}

function parseSuggestedRetryDelayMs(message) {
  const match = String(message || "").match(/(?:try again|retry)\s+after\s+([\d.]+)\s*(milliseconds?|ms|seconds?|secs?|s)\b/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  return /^(?:milliseconds?|ms)$/i.test(match[2])
    ? Math.max(0, Math.ceil(amount))
    : Math.max(0, Math.ceil(amount * 1000));
}

function normalizeConnectionError(error) {
  if (["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"].includes(error.code)) {
    return new Error("TLS 证书校验失败：当前网络可能使用了自签名证书。原型调试可勾选“忽略 TLS 证书校验”，生产环境请导入可信根证书。");
  }
  if (error.code === "ECONNRESET" || /Client network socket disconnected before secure TLS connection was established/i.test(error.message)) {
    return new Error("网络连接在 TLS 握手前被断开：请确认 Base URL 使用 https://api.deepseek.com，并检查代理/VPN/防火墙；如果浏览器能访问但后端不能访问，通常是 Node 服务没有走系统代理。");
  }
  if (["ENOTFOUND", "EAI_AGAIN"].includes(error.code)) {
    return new Error("模型服务域名解析失败：请检查网络、DNS 或代理设置。");
  }
  if (["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(error.code)) {
    return new Error("模型服务连接超时：请检查网络可用性，或稍后重试。");
  }
  return error;
}

module.exports = {
  gradeEssayReport,
  recognizeEssayText,
  testCompatibleModelConnection
};
