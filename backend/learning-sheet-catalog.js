const os = require("os");
const path = require("path");
const { promptCatalog } = require("./prompt-catalog");

const DEFAULT_LEARNING_SHEET_PREFIX = "essay-grading/learning-sheets";
const DEFAULT_SOURCE_FOLDER_NAME = "三至六年级单元习作学习单_分册版";
const LEARNING_SHEET_FORMATS = Object.freeze(["pdf", "docx"]);

// These titles were checked against the corresponding system prompt IDs.
// Entries with a material title conflict stay out of this list until reviewed.
const VERIFIED_SOURCE_TITLES = Object.freeze({
  "g3a-u1": "猜猜他是谁",
  "g3a-u2": "写日记",
  "g3a-u3": "续写故事",
  "g3a-u4": "我来编童话",
  "g3a-u5": "我们眼中的缤纷世界",
  "g3a-u6": "这儿真美",
  "g3a-u7": "我有一个想法",
  "g3a-u8": "那次经历真难忘",
  "g3b-u1": "我的植物朋友",
  "g3b-u2": "放风筝",
  "g3b-u3": "我做了一项小实验",
  "g3b-u4": "中华传统节日",
  "g3b-u5": "奇妙的想象",
  "g3b-u6": "身边那些有特点的人",
  "g3b-u7": "国宝大熊猫",
  "g3b-u8": "这样想象真有趣",
  "g4a-u1": "推荐一个好地方",
  "g4a-u2": "我的家人",
  "g4a-u3": "写观察日记",
  "g4a-u4": "我和谁过一天",
  "g4a-u5": "生活万花筒",
  "g4a-u6": "中国的世界文化遗产",
  "g4a-u7": "我的心儿怦怦跳",
  "g4a-u8": "写信",
  "g4b-u1": "我的乐园",
  "g4b-u2": "我的奇思妙想",
  "g4b-u4": "我的动物朋友",
  "g4b-u5": "游什么",
  "g4b-u6": "我学会了什么",
  "g4b-u7": "我的自画像",
  "g4b-u8": "故事新编",
  "g5a-u1": "我的心爱之物",
  "g5a-u2": "漫画老师",
  "g5a-u3": "故事新编",
  "g5a-u4": "二十年后的家乡",
  "g5a-u5": "介绍一种事物",
  "g5a-u6": "我想对您说",
  "g5a-u8": "推荐一本书",
  "g5b-u1": "那一刻我长大了",
  "g5b-u2": "写读后感",
  "g5b-u3": "遨游汉字王国",
  "g5b-u4": "他怎么了",
  "g5b-u5": "形形色色的人",
  "g5b-u6": "神奇的探险之旅",
  "g5b-u7": "中国的世界文化遗产",
  "g5b-u8": "漫画的启示",
  "g6a-u1": "变形记",
  "g6a-u2": "多彩的活动",
  "g6a-u3": "什么让生活更美好",
  "g6a-u4": "笔尖流出的故事",
  "g6a-u5": "围绕中心意思写",
  "g6a-u6": "学写倡议书",
  "g6a-u7": "插上科学的翅膀飞",
  "g6a-u8": "传承好家风",
  "g6b-u1": "家乡的风俗",
  "g6b-u2": "写作品梗概",
  "g6b-u3": "让真情自然流露",
  "g6b-u4": "心愿",
  "g6b-u5": "插上科学的翅膀飞"
});

const REVIEW_REQUIRED_SOURCE_TITLES = Object.freeze({
  "g5a-u7": "什么即景"
});

const promptById = new Map(promptCatalog.map((prompt) => [prompt.id, prompt]));
const learningSheetCatalog = new Map(Object.entries(VERIFIED_SOURCE_TITLES).map(([promptId, sourceTitle]) => {
  const prompt = promptById.get(promptId);
  if (!prompt) throw new Error(`学习单对应的题目不存在：${promptId}`);
  return [promptId, buildLearningSheetEntry(prompt, sourceTitle)];
}));

function buildLearningSheetEntry(prompt, sourceTitle) {
  const unitMatch = String(prompt.id).match(/-u(\d+)$/);
  if (!unitMatch) throw new Error(`题目 ID 缺少单元编号：${prompt.id}`);
  const unitNumber = String(Number(unitMatch[1])).padStart(2, "0");
  const baseName = `${prompt.grade}${prompt.book}第${unitNumber}单元_${sourceTitle}_习作学习单_阅星人黑白版`;
  return Object.freeze({
    promptId: prompt.id,
    sourceTitle,
    formats: Object.freeze(Object.fromEntries(LEARNING_SHEET_FORMATS.map((format) => [format, Object.freeze({
      promptId: prompt.id,
      format,
      fileName: `${baseName}.${format}`,
      relativePath: path.join(prompt.grade, prompt.book, `${baseName}.${format}`),
      objectKey: `${getLearningSheetPrefix()}/${prompt.id}.${format}`,
      contentType: format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    })])))
  });
}

function getLearningSheetPrefix() {
  return String(process.env.OSS_LEARNING_SHEET_PREFIX || DEFAULT_LEARNING_SHEET_PREFIX)
    .replace(/^\/+|\/+$/g, "");
}

function getLearningSheetSourceRoot() {
  return path.resolve(String(
    process.env.LEARNING_SHEET_SOURCE_DIR
    || path.join(os.homedir(), "Desktop", DEFAULT_SOURCE_FOLDER_NAME)
  ));
}

function getLearningSheetAsset(promptId, format = "pdf") {
  const normalizedFormat = String(format || "").toLowerCase();
  return learningSheetCatalog.get(String(promptId || ""))?.formats?.[normalizedFormat] || null;
}

function getVerifiedLearningSheetAssets() {
  return [...learningSheetCatalog.values()].flatMap((entry) => (
    LEARNING_SHEET_FORMATS.map((format) => entry.formats[format])
  ));
}

function resolveLocalLearningSheetPath(asset, sourceRoot = getLearningSheetSourceRoot()) {
  if (!asset?.relativePath) return "";
  const root = path.resolve(sourceRoot);
  const filePath = path.resolve(root, asset.relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("学习单文件路径不合法");
  }
  return filePath;
}

function withLearningSheetAvailability(prompts) {
  return (prompts || []).map((prompt) => {
    const available = learningSheetCatalog.has(prompt.id);
    return {
      ...prompt,
      learningSheet: {
        available,
        formats: available ? [...LEARNING_SHEET_FORMATS] : []
      }
    };
  });
}

function buildAttachmentDisposition(fileName, fallbackName = "learning-sheet") {
  const fallback = String(fallbackName || "learning-sheet")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "learning-sheet";
  const encoded = encodeURIComponent(String(fileName || fallback))
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

module.exports = {
  LEARNING_SHEET_FORMATS,
  REVIEW_REQUIRED_SOURCE_TITLES,
  VERIFIED_SOURCE_TITLES,
  buildAttachmentDisposition,
  getLearningSheetAsset,
  getLearningSheetSourceRoot,
  getVerifiedLearningSheetAssets,
  resolveLocalLearningSheetPath,
  withLearningSheetAvailability
};
