const assert = require("assert");
const { normalizeModelReport } = require("../backend/report-engine");

const prompt = {
  id: "test-prompt",
  grade: "三年级",
  book: "上册",
  unit: "第二单元",
  title: "写日记",
  requirements: ["写清楚当天发生的事情"]
};
const essay = [
  "9月6日 星期日 晴",
  "今天的天气真好，我和妈妈一起去了公园。",
  "我们看见湖边开着许多漂亮的花，我开心极了。"
].join("\n");
const baseModelReport = {
  teacherComment: "文章记录了一次公园游玩经历，内容清楚。",
  requirements: [
    { text: "写清楚当天发生的事情", value: 4, level: "良好", note: "写了和妈妈去公园的经历。" }
  ],
  scores: {
    total: 82,
    items: [
      { name: "内容", value: 4, note: "约29/35：事情清楚。" },
      { name: "表达", value: 4, note: "约20/25：语句通顺。" },
      { name: "结构", value: 4, note: "约20/25：顺序清楚。" },
      { name: "行文规范", value: 4, note: "约13/15：格式基本正确。" }
    ]
  },
  guide: [
    { section: "开头", title: "交代时间", advice: "开头交代清楚。", example: "先写日期和天气。" }
  ],
  polished: essay,
  polishedItems: []
};

function normalize(annotations) {
  return normalizeModelReport({
    id: "report-1",
    student: "测试学生",
    prompt,
    essay,
    modelConfig: { provider: "deepseek", model: "deepseek-v4-flash", apiMode: "server" },
    modelProviders: [{ id: "deepseek", name: "DeepSeek" }],
    modelReport: { ...baseModelReport, annotations }
  });
}

const recoveredAlias = normalize({
  items: [
    {
      类型: "佳句",
      原句: "原句：“今天，天气真好，我和妈妈一起去了公园。”",
      点评: "交代了天气和人物。",
      修改建议: "可以保留这句话。"
    }
  ]
});
assert.strictEqual(recoveredAlias.essay, essay);
assert.strictEqual(recoveredAlias.annotations.length, 1);
assert.strictEqual(recoveredAlias.annotations[0].original, "今天的天气真好，我和妈妈一起去了公园。");

const fallback = normalize([]);
assert.strictEqual(fallback.essay, essay);
assert.ok(fallback.annotations.length >= 1);
fallback.annotations.forEach((item) => {
  assert.ok(item.original);
  assert.ok(essay.includes(item.original) || essay.replace(/[，。！？\s]/g, "").includes(item.original.replace(/[，。！？\s]/g, "")));
});

console.log("report engine annotation recovery test passed");
