const levels = ["优秀", "良好", "中等", "合格", "需完善"];
const typoRules = [
  { wrong: "偷悦", right: "愉悦" },
  { wrong: "拉来我", right: "拉住我" },
  { wrong: "看到见状", right: "见状" },
  { wrong: "响午", right: "中午" }
];

function generateReport(input) {
  const prompt = input.prompt;
  const essay = String(input.essay || "").trim();
  const analysis = analyzeEssay(essay, prompt);
  const model = getReportModelInfo(input.modelConfig, input.modelProviders);
  return {
    id: input.id,
    student: input.student || "未命名学生",
    school: input.school || "",
    teacher: input.teacher || "",
    prompt,
    model,
    essay,
    analysis,
    requirements: prompt.requirements.map((req) => evaluateRequirement(req, essay, analysis)),
    scores: buildScores(analysis),
    annotations: buildAnnotations(prompt, analysis),
    guide: buildUpgradeGuide(prompt, analysis),
    polished: buildPolishedEssay(prompt, essay, analysis),
    polishedItems: [],
    generatedAt: new Date().toISOString()
  };
}

function normalizeModelReport(input) {
  const prompt = input.prompt;
  const essay = String(input.essay || "").trim();
  const analysis = analyzeEssay(essay, prompt);
  const model = {
    ...getReportModelInfo(input.modelConfig, input.modelProviders),
    source: "llm",
    latencyMs: input.latencyMs || 0
  };
  const modelReport = input.modelReport || {};
  const requirements = normalizeModelRequirements(modelReport.requirements, prompt.requirements);
  const scores = normalizeModelScores(modelReport.scores);
  const modelAnnotations = normalizeModelAnnotations(modelReport.annotations, essay);
  const annotations = modelAnnotations.length
    ? modelAnnotations
    : buildAnnotations(prompt, analysis).filter((item) => item.original && item.comment && item.suggestion);
  const guide = normalizeModelGuide(modelReport.guide);
  const polished = String(modelReport.polished || "").trim();
  const polishedItems = normalizeModelPolishedItems(modelReport.polishedItems, essay);
  const resolvedPolishedItems = polishedItems.length ? polishedItems : buildPolishedItemsFromAnnotations(annotations);
  const teacherComment = String(modelReport.teacherComment || "").trim();

  if (!teacherComment) {
    throw new Error("批改模型没有返回 teacherComment");
  }
  if (!requirements.length) {
    throw new Error("批改模型没有返回习作要求评价");
  }
  if (!scores.items.length) {
    throw new Error("批改模型没有返回评分详情");
  }
  if (!annotations.length) {
    throw new Error("批改模型没有返回可定位到原文的点评");
  }
  if (!guide.length) {
    throw new Error("批改模型没有返回结构升格指导");
  }
  if (!polished) {
    throw new Error("批改模型没有返回全文润色");
  }

  return {
    id: input.id,
    student: input.student || "未命名学生",
    school: input.school || "",
    teacher: input.teacher || "",
    prompt,
    model,
    essay,
    analysis,
    teacherComment,
    requirements,
    scores,
    annotations,
    guide,
    polished,
    polishedItems: resolvedPolishedItems,
    polishChain: modelReport.polishChain || null,
    generatedAt: new Date().toISOString()
  };
}

function getReportModelInfo(modelConfig, modelProviders) {
  const provider = modelProviders.find((item) => item.id === modelConfig.provider) || modelProviders[0];
  return {
    provider: provider.name,
    model: modelConfig.routes?.grading || modelConfig.model,
    mode: modelConfig.apiMode,
    configVersion: modelConfig.version || 1
  };
}

function normalizeModelRequirements(items, promptRequirements) {
  const sourceItems = collectModelRequirementItems(items);
  const expectedRequirements = Array.isArray(promptRequirements)
    ? promptRequirements.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const normalized = sourceItems.map((item, index) => {
    const entry = typeof item === "object" && item !== null ? item : { note: item };
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
      text: String(
        entry.text
          || entry.requirement
          || entry.name
          || entry.title
          || entry.criterion
          || entry.standard
          || expectedRequirements[index]
          || ""
      ).trim(),
      level: String(entry.level || entry.status || entry.result || valueToLevel(value)).trim(),
      value,
      note
    };
  }).filter((item) => item.text && item.note);

  if (!expectedRequirements.length) return normalized;
  const byText = new Map();
  normalized.forEach((item) => {
    const key = normalizeRequirementComparableText(item.text);
    if (key && !byText.has(key)) byText.set(key, item);
  });
  return expectedRequirements
    .map((requirement, index) => {
      const key = normalizeRequirementComparableText(requirement);
      const item = byText.get(key) || normalized[index];
      return item ? { ...item, text: requirement || item.text } : null;
    })
    .filter((item) => item && item.text && item.note);
}

function collectModelRequirementItems(items) {
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

function normalizeRequirementComparableText(text) {
  return String(text || "").replace(/\s/g, "").replace(/[，,。！？!?；;：:“”"‘’、（）()《》【】\[\]]/g, "");
}

function normalizeRequirementValue(value, item, note = "") {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric >= 1 && numeric <= 5) return clamp(Math.round(numeric), 1, 5);
    if (numeric >= 0 && numeric <= 100) {
      return clamp(Math.ceil((numeric / 100) * 5), 1, 5);
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

function normalizeModelScores(scores) {
  const items = Array.isArray(scores?.items) ? scores.items : [];
  const normalizedItems = items.map((item) => ({
    name: String(item.name || "").trim(),
    value: clamp(Number(item.value || 0), 1, 5),
    note: String(item.note || "").trim()
  })).filter((item) => item.name && item.note);
  const total = Number.isFinite(Number(scores?.total))
    ? clamp(Math.round(Number(scores.total)), 0, 100)
    : clamp(Math.round(normalizedItems.reduce((sum, item) => sum + item.value, 0) / Math.max(normalizedItems.length, 1) * 20), 0, 100);
  return {
    total,
    items: normalizedItems
  };
}

function normalizeModelAnnotations(items, essay) {
  const sourceItems = collectModelAnnotationItems(items);
  return sourceItems.map((item) => {
    const entry = typeof item === "object" && item !== null ? item : {};
    const original = resolveAnnotationOriginal(
      entry.original
        || entry.quote
        || entry.source
        || entry.sourceText
        || entry.sentence
        || entry.evidence
        || entry["原句"]
        || entry["原文"],
      essay
    );
    const type = String(entry.type || entry.category || entry["类型"] || "润色").trim();
    return {
      type,
      tone: /佳句/.test(type) || entry.tone === "red" ? "red" : "blue",
      original,
      comment: String(
        entry.comment
          || entry.problem
          || entry.analysis
          || entry.reason
          || entry.note
          || entry["点评"]
          || entry["问题"]
          || ""
      ).trim(),
      suggestion: String(
        entry.suggestion
          || entry.advice
          || entry.revision
          || entry.recommendation
          || entry.fix
          || entry["建议"]
          || entry["修改建议"]
          || ""
      ).trim()
    };
  }).filter((item) => item.original && item.comment && item.suggestion);
}

function collectModelAnnotationItems(items) {
  if (Array.isArray(items)) return items;
  if (!items || typeof items !== "object") return [];
  const candidates = [items.items, items.annotations, items.comments, items.details, items.results];
  return candidates.find(Array.isArray) || [];
}

function resolveAnnotationOriginal(value, essay) {
  const original = cleanAnnotationOriginal(value);
  if (!original) return "";
  if (essay.includes(original)) return original;

  const comparableOriginal = normalizeComparableText(original);
  if (comparableOriginal.length < 4) return "";
  const comparableMatch = findComparableSourceFragment(essay, comparableOriginal);
  if (comparableMatch) return comparableMatch;

  const fragments = extractEssayFragments(essay);
  let best = null;
  fragments.forEach((fragment) => {
    const comparableFragment = normalizeComparableText(fragment);
    if (comparableFragment.length < 4) return;
    const lengthRatio = Math.min(comparableOriginal.length, comparableFragment.length)
      / Math.max(comparableOriginal.length, comparableFragment.length);
    if (lengthRatio < 0.55) return;
    const similarity = calculateTextSimilarity(comparableOriginal, comparableFragment);
    if (!best || similarity > best.similarity) best = { fragment, similarity };
  });
  if (!best) return "";
  const minLength = Math.min(comparableOriginal.length, normalizeComparableText(best.fragment).length);
  const threshold = minLength >= 8 ? 0.72 : 0.84;
  return best.similarity >= threshold ? best.fragment : "";
}

function cleanAnnotationOriginal(value) {
  return String(value || "")
    .trim()
    .replace(/^(?:原句|原文|摘录|引用)\s*[：:]\s*/u, "")
    .replace(/^[“”"'‘’]+|[“”"'‘’]+$/gu, "")
    .trim();
}

function findComparableSourceFragment(essay, comparableTarget) {
  const source = String(essay || "");
  let comparable = "";
  const sourceIndexes = [];
  for (let index = 0; index < source.length; index += 1) {
    const normalized = normalizeComparableText(source[index]);
    if (!normalized) continue;
    comparable += normalized;
    sourceIndexes.push(index);
  }
  const start = comparable.indexOf(comparableTarget);
  if (start < 0) return "";
  const sourceStart = sourceIndexes[start];
  const sourceEnd = sourceIndexes[start + comparableTarget.length - 1];
  return source.slice(sourceStart, sourceEnd + 1).trim();
}

function extractEssayFragments(essay) {
  const source = String(essay || "");
  const fragments = source.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) || [];
  return fragments.map((item) => item.trim()).filter((item) => normalizeComparableText(item).length >= 4);
}

function calculateTextSimilarity(left, right) {
  const maxLength = Math.max(left.length, right.length);
  if (!maxLength) return 1;
  return 1 - levenshteinDistance(left, right) / maxLength;
}

function levenshteinDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        substitution
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function normalizeModelGuide(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    section: String(item.section || "").trim(),
    title: String(item.title || "").trim(),
    advice: String(item.advice || "").trim(),
    example: String(item.example || "").trim()
  })).filter((item) => (
    item.section &&
    item.title &&
    item.advice &&
    item.example &&
    isStructureGuideItem(item)
  ));
}

function isStructureGuideItem(item) {
  const text = `${item.section} ${item.title} ${item.advice}`;
  return /开头|中间|结尾|结构|段落|详略|字数|比例|篇幅|过渡|铺垫|重点|转折|结果|顺序|层次/.test(text);
}

function normalizeModelPolishedItems(items, essay) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const original = String(item.original || "").trim();
    return {
      original,
      polished: String(item.polished || "").trim(),
      reason: String(item.reason || "").trim()
    };
  }).filter((item) => (
    item.original &&
    item.polished &&
    item.reason &&
    originalExistsInEssay(item.original, essay)
  ));
}

function buildPolishedItemsFromAnnotations(annotations) {
  return annotations
    .filter((item) => !/佳句/.test(item.type) && item.suggestion)
    .map((item) => ({
      original: item.original,
      polished: cleanPolishedSuggestion(item.suggestion),
      reason: item.comment
    }))
    .filter((item) => item.original && item.polished && item.reason);
}

function cleanPolishedSuggestion(text) {
  const value = String(text || "").trim();
  const quoted = value.match(/[“"]([^“”"]{4,})[”"]/);
  if (quoted) return quoted[1].trim();
  return value.replace(/^(可以|建议)?(改成|改为|修改为|润色为|建议改为)[:：]?/u, "").trim();
}

function originalExistsInEssay(original, essay) {
  if (essay.includes(original)) return true;
  const compactEssay = normalizeComparableText(essay);
  const compactOriginal = normalizeComparableText(original);
  return compactOriginal.length >= 4 && compactEssay.includes(compactOriginal);
}

function normalizeComparableText(text) {
  return String(text || "").replace(/\s/g, "").replace(/[，,。！？!?；;：:“”"‘’、（）()《》【】\[\]]/g, "");
}

function analyzeEssay(essay, prompt) {
  const compact = essay.replace(/\s/g, "");
  const paragraphs = essay.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const sentences = extractSentences(essay);
  const emotionWords = matchCount(compact, ["开心", "高兴", "快乐", "紧张", "害怕", "着急", "沮丧", "自豪", "难过", "激动", "兴奋", "放弃", "坚持", "喜欢", "感动", "担心", "害怕", "勇敢"]);
  const actionWords = matchCount(compact, ["跑", "跳", "滑", "扶", "拉", "看", "听", "说", "蹬", "摔", "站", "拿", "走", "拍", "写", "练", "踏", "穿", "找", "寻", "爬", "钻", "跨"]);
  const sensoryWords = matchCount(compact, ["呼呼", "咯吱", "冰凉", "温暖", "香", "甜", "刺", "风", "声音", "颜色", "味道", "脸颊", "眼前", "闷热", "黏腻", "潮湿", "阳光", "树木", "水声", "泥土"]);
  const difficultyWords = matchCount(compact, ["困难", "不会", "失败", "摔", "慌", "怕", "紧张", "不稳", "难", "问题", "控制", "累", "饿", "渴", "危险"]);
  const solutionWords = matchCount(compact, ["办法", "解决", "教练", "老师", "妈妈", "练习", "尝试", "坚持", "指导", "方法", "终于", "寻找", "发现", "跟着", "一起", "同学"]);
  const quoteCount = (essay.match(/[“”"]/g) || []).length;
  const hasTitleLine = Boolean(paragraphs[0] && paragraphs[0].length <= 16);
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
  let note = `全文约${analysis.compactLength}字，${analysis.paragraphs.length}个自然段。`;
  if (/题目|补全/.test(requirement)) {
    value = analysis.hasTitleLine || essay.includes("我学会") || analysis.topic ? 5 : 2;
    note = value >= 4 ? `中心指向“${analysis.topic}”，能与本次习作任务对应。` : "题目或中心不够明确，需要先补全题目并点明写作对象。";
  } else if (/心情|感受|真情|情感/.test(requirement)) {
    value = clamp(2 + Math.min(analysis.emotionWords, 3), 1, 5);
    note = value >= 4 ? `文中出现${analysis.emotionWords}处情绪或心理词，能看到人物感受。` : `文中情绪或心理词约${analysis.emotionWords}处，心理变化还需要结合关键情节补出来。`;
  } else if (/顺序|过程|经过/.test(requirement)) {
    value = clamp(2 + analysis.sequenceCount + Math.min(analysis.paragraphs.length, 3) - 2, 1, 5);
    note = value >= 4 ? `有${analysis.sequenceCount}处顺序提示，事件推进基本清楚。` : `顺序提示约${analysis.sequenceCount}处，建议按“出发、遇险、应对、结果”重新分段。`;
  } else if (/困难|办法|解决/.test(requirement)) {
    value = clamp(2 + Math.min(analysis.difficultyWords, 2) + Math.min(analysis.solutionWords, 2), 1, 5);
    note = value >= 4 ? `困难线索${analysis.difficultyWords}处，解决或行动线索${analysis.solutionWords}处，情节有波折。` : `困难线索${analysis.difficultyWords}处，解决办法线索${analysis.solutionWords}处，需要把“怎么应对”写得更完整。`;
  } else if (/特点|具体|动作|语言|神态|细节|场面/.test(requirement)) {
    value = clamp(2 + Math.min(analysis.actionWords, 2) + Math.min(analysis.sensoryWords, 1) + (analysis.quoteCount > 1 ? 1 : 0), 1, 5);
    note = value >= 4 ? `动作线索${analysis.actionWords}处，感官描写${analysis.sensoryWords}处，局部画面较清楚。` : `动作线索${analysis.actionWords}处，感官描写${analysis.sensoryWords}处，需要增加动作、环境和声音触觉。`;
  } else if (/标点|语句|通顺|自然段/.test(requirement)) {
    value = clamp(5 - analysis.punctuationIssues - analysis.typoHints, 1, 5);
    note = value >= 4 ? `发现疑似错字${analysis.typoHints}处、重复标点${analysis.punctuationIssues}处，整体较规范。` : `发现疑似错字${analysis.typoHints}处、重复标点${analysis.punctuationIssues}处，需要优先订正。`;
  } else {
    value = clamp(Math.round(analysis.compactLength / 120) + 2, 1, 5);
    note = `从篇幅和内容看，当前约${analysis.compactLength}字，已有${analysis.sentences.length}个主要句群。`;
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
      { name: "内容", value: content, note: `约${contentPoints}/35：约${analysis.compactLength}字，困难线索${analysis.difficultyWords}处，解决线索${analysis.solutionWords}处` },
      { name: "表达", value: expression, note: `约${expressionPoints}/25：动作${analysis.actionWords}处，感官${analysis.sensoryWords}处，引号${analysis.quoteCount}个` },
      { name: "结构", value: structure, note: `约${structurePoints}/25：${analysis.paragraphs.length}个自然段，顺序词${analysis.sequenceCount}处` },
      { name: "行文规范", value: norm, note: `约${normPoints}/15：疑似错字${analysis.typoHints}处，重复标点${analysis.punctuationIssues}处` }
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  generateReport,
  normalizeModelReport,
  levels
};
