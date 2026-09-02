const { promptCatalog } = require("./prompt-catalog");

const promptLibrary = [
  {
    id: "g3a-u1",
    grade: "三年级",
    book: "上册",
    unit: "第一单元",
    title: "猜猜他是谁",
    type: "写人",
    status: "待审核",
    requirements: ["选择一位熟悉的同学或朋友来写", "抓住人物外貌、性格或爱好的特点", "用一两件小事表现人物特点", "不直接写出名字，让读者能猜出来"]
  },
  {
    id: "g3a-u3",
    grade: "三年级",
    book: "上册",
    unit: "第三单元",
    title: "我来编童话",
    type: "想象",
    status: "待审核",
    requirements: ["故事角色要清楚", "展开合理想象", "写清故事的起因、经过和结果", "语句通顺，能分自然段"]
  },
  {
    id: "g3b-u1",
    grade: "三年级",
    book: "下册",
    unit: "第一单元",
    title: "我的植物朋友",
    type: "状物",
    status: "待审核",
    requirements: ["写一种熟悉或喜欢的植物", "写清植物的样子、颜色、气味等特点", "加入观察时的感受", "语句通顺，表达自己的喜爱"]
  },
  {
    id: "g4a-u1",
    grade: "四年级",
    book: "上册",
    unit: "第一单元",
    title: "推荐一个好地方",
    type: "写景",
    status: "待审核",
    requirements: ["写清楚推荐的地方在哪里", "按一定顺序介绍这个地方", "写出这个地方吸引人的特点", "表达自己的推荐理由"]
  },
  {
    id: "g4a-u6",
    grade: "四年级",
    book: "上册",
    unit: "第六单元",
    title: "记一次游戏",
    type: "记事",
    status: "待审核",
    requirements: ["写清游戏名称和游戏规则", "按顺序写游戏过程", "写出游戏中印象深刻的场面", "写出自己的心情变化"]
  },
  {
    id: "g4b-u1",
    grade: "四年级",
    book: "下册",
    unit: "第一单元",
    title: "我的乐园",
    type: "写景记事",
    status: "待审核",
    requirements: ["写清乐园在哪里", "介绍乐园的样子和特点", "写出自己在乐园里的活动", "表达乐园带来的快乐"]
  },
  {
    id: "g4b-u6",
    grade: "四年级",
    book: "下册",
    unit: "第六单元",
    title: "我学会了____",
    type: "记事",
    status: "待审核",
    requirements: ["补全题目，写一件自己学会了的事情", "按顺序把怎么学会的过程写清楚", "写出遇到的困难和解决的办法", "写清学习过程中的心情变化", "语句通顺，正确使用标点符号"]
  },
  {
    id: "g5a-u1",
    grade: "五年级",
    book: "上册",
    unit: "第一单元",
    title: "我的心爱之物",
    type: "状物",
    status: "待审核",
    requirements: ["介绍心爱之物的样子和来历", "写出它为什么让自己喜欢", "选择具体事例表达情感", "做到内容具体、感情真实"]
  },
  {
    id: "g5a-u8",
    grade: "五年级",
    book: "上册",
    unit: "第八单元",
    title: "推荐一本书",
    type: "应用表达",
    status: "待审核",
    requirements: ["写清书名、作者或主要内容", "说明推荐这本书的理由", "结合具体情节或人物来介绍", "表达自己阅读后的收获"]
  },
  {
    id: "g5b-u4",
    grade: "五年级",
    book: "下册",
    unit: "第四单元",
    title: "他____了",
    type: "写人记事",
    status: "待审核",
    requirements: ["补全题目，写清人物当时的状态", "选择一件具体事情来写", "抓住动作、语言、神态写具体", "写出事情发展中的情感变化"]
  },
  {
    id: "g6a-u2",
    grade: "六年级",
    book: "上册",
    unit: "第二单元",
    title: "多彩的活动",
    type: "记事",
    status: "待审核",
    requirements: ["写一次印象深刻的活动", "把活动过程写清楚", "点面结合写出活动场面", "写出活动中的体会"]
  },
  {
    id: "g6a-u3",
    grade: "六年级",
    book: "上册",
    unit: "第三单元",
    title: "____让生活更美好",
    type: "记事抒情",
    status: "待审核",
    requirements: ["补全题目，明确是什么让生活更美好", "选择具体事例说明理由", "写出真实感受", "围绕中心把重点部分写具体"]
  },
  {
    id: "g6b-u3",
    grade: "六年级",
    book: "下册",
    unit: "第三单元",
    title: "让真情自然流露",
    type: "抒情记事",
    status: "待审核",
    requirements: ["选择印象深刻的事情来写", "把事情经过写清楚", "通过具体描写表达真情实感", "情感表达自然，不空泛"]
  },
  {
    id: "g6b-u4",
    grade: "六年级",
    book: "下册",
    unit: "第四单元",
    title: "心愿",
    type: "表达观点",
    status: "待审核",
    requirements: ["写清自己的心愿是什么", "说明产生心愿的原因", "选择合适的表达方式", "表达真情实感并写出行动想法"]
  }
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

const queueItems = [];

const modelConfig = {
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
  routes: {
    ocr: "moonshot-v1-128k-vision-preview",
    grading: "deepseek-v4-flash",
    polish: "deepseek-v4-flash"
  },
  version: 1,
  updatedAt: "2026-06-05T06:30:00.000Z"
};

function createSeedData() {
  return {
    promptLibrary: promptCatalog,
    modelProviders,
    queueItems,
    modelConfig,
    reports: [],
    submissions: [],
    nextIds: {
      submission: 1,
      report: 1
    }
  };
}

module.exports = {
  createSeedData,
  modelProviders,
  promptLibrary: promptCatalog
};
