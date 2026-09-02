const sourceArticle = {
  title: "小学语文3-6年级（人教版）单元作文题目与要求汇总",
  note: "依据用户提供的微信文章截图和粘贴文本整理，建议上线前由教研老师逐条复核。"
};

const textbookSources = {
  "三年级|上册": {
    title: "义务教育教科书语文三年级上册",
    url: "https://book.pep.com.cn/1211001301241/",
    catalogUrl: "https://jc.pep.com.cn/?filed=%E5%B0%8F%E5%AD%A6&subject=%E8%AF%AD%E6%96%87"
  },
  "三年级|下册": {
    title: "义务教育教科书 语文 三年级下册",
    url: "https://book.pep.com.cn/1211001302251/",
    catalogUrl: "https://jc.pep.com.cn/?filed=%E5%B0%8F%E5%AD%A6&subject=%E8%AF%AD%E6%96%87"
  },
  "四年级|上册": {
    title: "义务教育教科书语文四年级上册",
    url: "https://book.pep.com.cn/1211001401191/",
    catalogUrl: "https://jc.pep.com.cn/?filed=%E5%B0%8F%E5%AD%A6&subject=%E8%AF%AD%E6%96%87"
  },
  "四年级|下册": {
    title: "义务教育教科书 语文 四年级下册",
    url: "https://book.pep.com.cn/1211001402191/",
    catalogUrl: "https://jc.pep.com.cn/?filed=%E5%B0%8F%E5%AD%A6&subject=%E8%AF%AD%E6%96%87"
  },
  "五年级|上册": {
    title: "义务教育教科书语文五年级上册",
    url: "https://book.pep.com.cn/1211001501191/",
    catalogUrl: "https://jc.pep.com.cn/?filed=%E5%B0%8F%E5%AD%A6&subject=%E8%AF%AD%E6%96%87"
  },
  "五年级|下册": {
    title: "义务教育教科书 语文 五年级下册",
    url: "https://book.pep.com.cn/1211001502191/",
    catalogUrl: "https://jc.pep.com.cn/?filed=%E5%B0%8F%E5%AD%A6&subject=%E8%AF%AD%E6%96%87"
  },
  "六年级|上册": {
    title: "义务教育教科书语文六年级上册",
    url: "https://book.pep.com.cn/1211001601191/",
    catalogUrl: "https://jc.pep.com.cn/?filed=%E5%B0%8F%E5%AD%A6&subject=%E8%AF%AD%E6%96%87"
  },
  "六年级|下册": {
    title: "义务教育教科书 语文 六年级下册",
    url: "https://book.pep.com.cn/1211001602191/",
    catalogUrl: "https://jc.pep.com.cn/?filed=%E5%B0%8F%E5%AD%A6&subject=%E8%AF%AD%E6%96%87"
  }
};

const gradeGuides = {
  "三年级": {
    wordCount: "200-300字",
    expectations: ["句子通顺，标点正确", "能围绕一个意思写清楚", "能按顺序叙述"]
  },
  "四年级": {
    wordCount: "300-400字",
    expectations: ["主题明确，内容具体", "条理清晰，段落分明", "能运用多种描写方法"]
  },
  "五年级": {
    wordCount: "400-500字",
    expectations: ["主题明确，结构完整", "内容充实，有一定深度", "能运用说明方法和读后感表达"]
  },
  "六年级": {
    wordCount: "500-600字",
    expectations: ["立意较深，选材新颖", "能写多种文体", "表达真情实感，技法运用灵活"]
  }
};

const promptCatalogItems = [
  {
    id: "g3a-u1",
    grade: "三年级",
    book: "上册",
    unit: "第一单元",
    title: "猜猜他是谁",
    type: "写人",
    abilityGoal: "写人（抓住特点）",
    status: "资料已整理",
    requirements: ["写同学或伙伴的特点", "用几句话或一段话介绍人物", "文中不出现名字", "让读者能根据特点猜出是谁"]
  },
  {
    id: "g3a-u2",
    grade: "三年级",
    book: "上册",
    unit: "第二单元",
    title: "写日记",
    type: "日记",
    abilityGoal: "应用文（日记格式）",
    status: "资料已整理",
    requirements: ["掌握日记格式，写清日期、星期和天气", "记录真实的生活小事", "写出自己的真实感受", "尝试坚持记录"]
  },
  {
    id: "g3a-u3",
    grade: "三年级",
    book: "上册",
    unit: "第三单元",
    title: "我来编童话",
    type: "童话创作",
    abilityGoal: "想象类（童话创作）",
    status: "资料已整理",
    requirements: ["自选角色编童话", "写清时间、地点和情节", "故事情节合理连贯", "把故事写得生动有趣"]
  },
  {
    id: "g3a-u4",
    grade: "三年级",
    book: "上册",
    unit: "第四单元",
    title: "续写故事",
    type: "续写",
    abilityGoal: "想象类（续写）",
    status: "资料已整理",
    requirements: ["根据图画或提示续编故事", "顺着已有内容展开想象", "情节合理连贯", "写清故事后续发展"]
  },
  {
    id: "g3a-u5",
    grade: "三年级",
    book: "上册",
    unit: "第五单元",
    title: "我眼中的缤纷世界",
    type: "观察",
    abilityGoal: "观察类（写场景）",
    status: "资料已整理",
    requirements: ["写观察到的事物或场景", "突出自己的发现", "围绕观察内容把话写通顺", "表达观察时的感受"]
  },
  {
    id: "g3a-u6",
    grade: "三年级",
    book: "上册",
    unit: "第六单元",
    title: "这儿真美",
    type: "写景",
    abilityGoal: "写景（围绕中心）",
    status: "资料已整理",
    requirements: ["围绕一个意思写景物", "按一定顺序描写", "用上积累的优美词句", "写出景物的美"]
  },
  {
    id: "g3a-u7",
    grade: "三年级",
    book: "上册",
    unit: "第七单元",
    title: "我有一个想法",
    type: "表达观点",
    abilityGoal: "议论类（表达观点）",
    status: "资料已整理",
    requirements: ["发现生活中的问题", "把自己的想法写清楚", "提出合理建议", "让别人读明白自己的意思"]
  },
  {
    id: "g3a-u8",
    grade: "三年级",
    book: "上册",
    unit: "第八单元",
    title: "那次玩得真高兴",
    type: "记事",
    abilityGoal: "记事（写快乐的事）",
    status: "资料已整理",
    requirements: ["写一件玩得高兴的事", "写清玩的过程", "写出高兴的心情", "准确使用动词"]
  },
  {
    id: "g3b-u1",
    grade: "三年级",
    book: "下册",
    unit: "第一单元",
    title: "我的植物朋友",
    type: "植物描写",
    abilityGoal: "观察类（植物描写）",
    status: "资料已整理",
    requirements: ["观察一种植物", "运用看、摸、闻等多种感官", "按顺序描写植物的样子", "写出观察和感受到的内容"]
  },
  {
    id: "g3b-u2",
    grade: "三年级",
    book: "下册",
    unit: "第二单元",
    title: "放风筝",
    type: "活动描写",
    abilityGoal: "记事（活动描写）",
    status: "资料已整理",
    requirements: ["回忆放风筝的情景", "把放风筝的过程写清楚", "描写人物动作、语言和心情", "合理运用修辞让文章更生动"]
  },
  {
    id: "g3b-u3",
    grade: "三年级",
    book: "下册",
    unit: "第三单元",
    title: "中华传统节日",
    type: "节日文化",
    abilityGoal: "记事（节日文化）",
    status: "资料已整理",
    requirements: ["选择一个传统节日", "写一写过节的过程", "可以写印象深刻的节日故事", "写出节日特色和氛围"]
  },
  {
    id: "g3b-u4",
    grade: "三年级",
    book: "下册",
    unit: "第四单元",
    title: "我做了一项小实验",
    type: "实验记录",
    abilityGoal: "记叙（实验记录）",
    status: "资料已整理",
    requirements: ["写清楚实验步骤", "细致描写实验过程中的观察", "写出实验中的感受", "按照先后顺序有条理地叙述"]
  },
  {
    id: "g3b-u5",
    grade: "三年级",
    book: "下册",
    unit: "第五单元",
    title: "奇妙的想象",
    type: "创意写作",
    abilityGoal: "想象类（创意写作）",
    status: "资料已整理",
    requirements: ["大胆想象", "创造属于自己的想象世界", "想象新奇、有趣、富有创意", "把想象内容写清楚"]
  },
  {
    id: "g3b-u6",
    grade: "三年级",
    book: "下册",
    unit: "第六单元",
    title: "身边那些有特点的人",
    type: "写人",
    abilityGoal: "写人（典型事例）",
    status: "资料已整理",
    requirements: ["选择身边一个有特点的人", "通过具体事例表现人物特点", "可以用“小书虫”“智多星”等特点称呼", "运用恰当语言和动作描写突出人物特点"]
  },
  {
    id: "g3b-u7",
    grade: "三年级",
    book: "下册",
    unit: "第七单元",
    title: "国宝大熊猫",
    type: "说明",
    abilityGoal: "说明类（介绍动物）",
    status: "资料已整理",
    requirements: ["围绕大熊猫的外形、生活习性、价值等方面介绍", "合理运用收集到的资料", "表达准确清晰", "语言生动，有吸引力"]
  },
  {
    id: "g3b-u8",
    grade: "三年级",
    book: "下册",
    unit: "第八单元",
    title: "这样想象真有趣",
    type: "故事创编",
    abilityGoal: "想象类（故事创编）",
    status: "资料已整理",
    requirements: ["选一种动物作为主角", "大胆想象主要特征变化后的有趣故事", "按照故事发展的顺序写清楚", "体现想象的神奇和有趣"]
  },
  {
    id: "g4a-u1",
    grade: "四年级",
    book: "上册",
    unit: "第一单元",
    title: "推荐一个好地方",
    type: "推荐介绍",
    abilityGoal: "写景（推荐介绍）",
    status: "资料已整理",
    requirements: ["向同学推荐一个好地方", "抓住地方的特点", "写出自己喜欢的原因", "表达推荐理由"]
  },
  {
    id: "g4a-u2",
    grade: "四年级",
    book: "上册",
    unit: "第二单元",
    title: "小小“动物园”",
    type: "写人",
    abilityGoal: "写人（比喻联想）",
    status: "资料已整理",
    requirements: ["把自己的家想象成一个动物园", "把家人比作动物", "通过事例写出家人的特点", "写出比喻联想的趣味"]
  },
  {
    id: "g4a-u3",
    grade: "四年级",
    book: "上册",
    unit: "第三单元",
    title: "写观察日记",
    type: "观察日记",
    abilityGoal: "应用文（观察日记）",
    status: "资料已整理",
    requirements: ["连续观察一种事物", "记录观察过程", "写出观察中的发现和感受", "注意日记格式"]
  },
  {
    id: "g4a-u4",
    grade: "四年级",
    book: "上册",
    unit: "第四单元",
    title: "我和____过一天",
    type: "想象",
    abilityGoal: "想象类（人物联动）",
    status: "资料已整理",
    requirements: ["选择一个神话或童话人物", "写与他或她共度一天的经历", "展开想象编故事", "把经历写清楚"]
  },
  {
    id: "g4a-u5",
    grade: "四年级",
    book: "上册",
    unit: "第五单元",
    title: "生活万花筒",
    type: "完整叙事",
    abilityGoal: "记事（完整叙事）",
    status: "资料已整理",
    requirements: ["写一件印象深刻的事", "按起因、经过、结果写清楚", "把重点内容写具体", "写出当时的感受"]
  },
  {
    id: "g4a-u6",
    grade: "四年级",
    book: "上册",
    unit: "第六单元",
    title: "记一次游戏",
    type: "游戏描写",
    abilityGoal: "记事（游戏描写）",
    status: "资料已整理",
    requirements: ["写一次参加过的游戏", "写清楚游戏过程", "写出游戏规则或玩法", "写出真实感受"]
  },
  {
    id: "g4a-u7",
    grade: "四年级",
    book: "上册",
    unit: "第七单元",
    title: "写信",
    type: "书信",
    abilityGoal: "应用文（书信格式）",
    status: "资料已整理",
    requirements: ["掌握书信格式", "写清称呼、正文、祝福语、署名和日期", "可以写给亲友或老师", "把想说的话写清楚"]
  },
  {
    id: "g4a-u8",
    grade: "四年级",
    book: "上册",
    unit: "第八单元",
    title: "我的心儿怦怦跳",
    type: "心理描写",
    abilityGoal: "记事（心理描写）",
    status: "资料已整理",
    requirements: ["写一件让自己心跳加速的事", "可以写紧张、惊喜、害怕等经历", "把事情经过写清楚", "把心理活动写具体"]
  },
  {
    id: "g4b-u1",
    grade: "四年级",
    book: "下册",
    unit: "第一单元",
    title: "我的乐园",
    type: "定点描写",
    abilityGoal: "写景（定点描写）",
    status: "资料已整理",
    requirements: ["介绍自己的乐园", "描述乐园的样子", "写清在乐园中所做的事情", "表达对乐园的喜爱之情"]
  },
  {
    id: "g4b-u2",
    grade: "四年级",
    book: "下册",
    unit: "第二单元",
    title: "我的奇思妙想",
    type: "创意设计",
    abilityGoal: "想象类（创意设计）",
    status: "资料已整理",
    requirements: ["发挥想象写出自己的奇思妙想", "说明奇思妙想的功能或特点", "想象尽量丰富奇特又合理", "表达清楚"]
  },
  {
    id: "g4b-u3",
    grade: "四年级",
    book: "下册",
    unit: "第三单元",
    title: "轻叩诗歌的大门",
    type: "诗歌",
    abilityGoal: "诗歌（创作与赏析）",
    status: "资料已整理",
    requirements: ["收集、整理诗歌", "感受诗歌的魅力", "尝试进行诗歌创作", "可以合作编写诗集并注意编排形式"]
  },
  {
    id: "g4b-u4",
    grade: "四年级",
    book: "下册",
    unit: "第四单元",
    title: "我的动物朋友",
    type: "动物描写",
    abilityGoal: "写物（动物描写）",
    status: "资料已整理",
    requirements: ["介绍自己的动物朋友", "描述外形、性格等特点", "通过具体事例体现可爱之处", "表达对动物朋友的喜爱之情"]
  },
  {
    id: "g4b-u5",
    grade: "四年级",
    book: "下册",
    unit: "第五单元",
    title: "游____",
    type: "游记",
    abilityGoal: "写景（游记顺序）",
    status: "资料已整理",
    requirements: ["选择一个去过的地方", "按照游览顺序写下来", "抓住景物特点", "使用恰当过渡句让文章自然连贯"]
  },
  {
    id: "g4b-u6",
    grade: "四年级",
    book: "下册",
    unit: "第六单元",
    title: "我学会了____",
    type: "成长经历",
    abilityGoal: "记事（成长经历）",
    status: "资料已整理",
    requirements: ["写自己学会的一项技能", "把学习过程写清楚", "写出学习中遇到的困难", "写清解决困难的过程和学会后的感受"]
  },
  {
    id: "g4b-u7",
    grade: "四年级",
    book: "下册",
    unit: "第七单元",
    title: "我的“自画像”",
    type: "自我介绍",
    abilityGoal: "写人（自我介绍）",
    status: "资料已整理",
    requirements: ["从外貌、性格、爱好等方面介绍自己", "用具体事例表现自己的特点", "让自己的形象更鲜明", "能给别人留下深刻印象"]
  },
  {
    id: "g4b-u8",
    grade: "四年级",
    book: "下册",
    unit: "第八单元",
    title: "故事新编",
    type: "故事改写",
    abilityGoal: "想象类（故事改写）",
    status: "资料已整理",
    requirements: ["选择一个熟悉的故事进行创编", "改变故事的结局或情节", "赋予故事新的意义", "想象合理，情节有趣，故事完整"]
  },
  {
    id: "g5a-u1",
    grade: "五年级",
    book: "上册",
    unit: "第一单元",
    title: "我的心爱之物",
    type: "借物抒情",
    abilityGoal: "写物（借物抒情）",
    status: "资料已整理",
    requirements: ["写自己心爱的物品", "介绍物品样子和来历", "写清成为心爱之物的原因", "表达喜爱之情"]
  },
  {
    id: "g5a-u2",
    grade: "五年级",
    book: "上册",
    unit: "第二单元",
    title: "“漫画”老师",
    type: "漫画式描写",
    abilityGoal: "写人（漫画式描写）",
    status: "资料已整理",
    requirements: ["抓住老师外貌或性格上的突出特点", "用夸张手法表现人物", "写出一两件能体现特点的事", "表达真实感情"]
  },
  {
    id: "g5a-u3",
    grade: "五年级",
    book: "上册",
    unit: "第三单元",
    title: "缩写故事",
    type: "缩写",
    abilityGoal: "阅读与写作（缩写）",
    status: "资料已整理",
    requirements: ["学习缩写方法", "把长篇故事缩写成梗概", "保留主要情节", "语言简洁，故事完整"]
  },
  {
    id: "g5a-u4",
    grade: "五年级",
    book: "上册",
    unit: "第四单元",
    title: "二十年后的家乡",
    type: "未来畅想",
    abilityGoal: "想象类（未来畅想）",
    status: "资料已整理",
    requirements: ["展开想象写二十年后的家乡", "描写环境和人们生活的变化", "表达美好愿望", "想象合理，有真情实感"]
  },
  {
    id: "g5a-u5",
    grade: "五年级",
    book: "上册",
    unit: "第五单元",
    title: "介绍一种事物",
    type: "说明文",
    abilityGoal: "说明文（方法运用）",
    status: "资料已整理",
    requirements: ["清楚地介绍一种事物", "抓住事物特点", "运用列数字、打比方、作比较等说明方法", "条理清楚，语言准确"]
  },
  {
    id: "g5a-u6",
    grade: "五年级",
    book: "上册",
    unit: "第六单元",
    title: "我想对您说",
    type: "书信抒情",
    abilityGoal: "应用文（书信抒情）",
    status: "资料已整理",
    requirements: ["用书信格式倾诉心里话", "可以写给父母、老师或朋友", "格式正确，语言恰当", "倾吐真情"]
  },
  {
    id: "g5a-u7",
    grade: "五年级",
    book: "上册",
    unit: "第七单元",
    title: "____即景",
    type: "动态描写",
    abilityGoal: "写景（动态描写）",
    status: "资料已整理",
    requirements: ["观察一处自然景象", "写出景物的动态变化过程", "抓住景物特点", "表达自己的独特感受"]
  },
  {
    id: "g5a-u8",
    grade: "五年级",
    book: "上册",
    unit: "第八单元",
    title: "推荐一本书",
    type: "推荐理由",
    abilityGoal: "读后感（推荐理由）",
    status: "资料已整理",
    requirements: ["向同学推荐一本读过的好书", "写清楚推荐理由", "可以结合书中精彩内容", "写出个人阅读感受"]
  },
  {
    id: "g5b-u1",
    grade: "五年级",
    book: "下册",
    unit: "第一单元",
    title: "那一刻，我长大了",
    type: "成长感悟",
    abilityGoal: "记事（成长感悟）",
    status: "资料已整理",
    requirements: ["回忆成长过程中的某一个瞬间", "把这个瞬间的经历写清楚", "写出当时的感受", "表现自己在那一刻的成长和变化"]
  },
  {
    id: "g5b-u2",
    grade: "五年级",
    book: "下册",
    unit: "第二单元",
    title: "写读后感",
    type: "读后感",
    abilityGoal: "读后感（提炼观点）",
    status: "资料已整理",
    requirements: ["选择读过的一篇文章或一本书", "简单介绍文章或书的内容", "重点阐述自己的感想和体会", "观点明确，感受真实"]
  },
  {
    id: "g5b-u3",
    grade: "五年级",
    book: "下册",
    unit: "第三单元",
    title: "遨游汉字王国",
    type: "综合性学习",
    abilityGoal: "综合性学习（研究报告）",
    status: "资料已整理",
    requirements: ["围绕汉字开展综合性学习", "了解汉字的历史和文化", "可以写汉字故事或自己的认识感受", "也可以写简单研究报告"]
  },
  {
    id: "g5b-u4",
    grade: "五年级",
    book: "下册",
    unit: "第四单元",
    title: "他____了",
    type: "神态描写",
    abilityGoal: "写人（神态描写）",
    status: "资料已整理",
    requirements: ["把题目补充完整", "写一个人当时的表现", "运用动作、语言、神态等描写方法", "把人物当时的状态写具体"]
  },
  {
    id: "g5b-u5",
    grade: "五年级",
    book: "下册",
    unit: "第五单元",
    title: "把一个人的特点写具体",
    type: "综合写人",
    abilityGoal: "写人（综合运用）",
    status: "资料已整理",
    requirements: ["选择一个熟悉的人", "抓住人物特点", "通过具体事例表现人物特点", "运用多种描写方法让人物形象更生动"]
  },
  {
    id: "g5b-u6",
    grade: "五年级",
    book: "下册",
    unit: "第六单元",
    title: "神奇的探险之旅",
    type: "探险故事",
    abilityGoal: "想象类（探险故事）",
    status: "资料已整理",
    requirements: ["展开丰富合理的想象", "编一个惊险刺激的探险故事", "写清楚探险的人物、场景、装备等", "把遇到的困境和解决办法写具体"]
  },
  {
    id: "g5b-u7",
    grade: "五年级",
    book: "下册",
    unit: "第七单元",
    title: "中国的世界文化遗产",
    type: "资料整理",
    abilityGoal: "说明类（资料整理）",
    status: "资料已整理",
    requirements: ["选择一处中国的世界文化遗产进行介绍", "搜集并筛选资料", "写清文化遗产的基本信息和特点", "可以加入自己的感受和想法"]
  },
  {
    id: "g5b-u8",
    grade: "五年级",
    book: "下册",
    unit: "第八单元",
    title: "漫画的启示",
    type: "漫画评析",
    abilityGoal: "议论文（漫画评析）",
    status: "资料已整理",
    requirements: ["仔细观察漫画", "理解漫画的内容和含义", "联系生活实际", "写出从漫画中得到的启示"]
  },
  {
    id: "g6a-u1",
    grade: "六年级",
    book: "上册",
    unit: "第一单元",
    title: "变形记",
    type: "角色换位",
    abilityGoal: "想象类（角色换位）",
    status: "资料已整理",
    requirements: ["把自己想象成某种事物", "写变形后的经历和所见所闻", "从新的视角观察世界", "表达真实情感"]
  },
  {
    id: "g6a-u2",
    grade: "六年级",
    book: "上册",
    unit: "第二单元",
    title: "多彩的活动",
    type: "场面描写",
    abilityGoal: "记事（场面描写）",
    status: "资料已整理",
    requirements: ["写一次校内外活动", "点面结合描写场面", "写出活动过程", "写出自己的感受"]
  },
  {
    id: "g6a-u3",
    grade: "六年级",
    book: "上册",
    unit: "第三单元",
    title: "____让生活更美好",
    type: "说明观点",
    abilityGoal: "议论类（说明观点）",
    status: "资料已整理",
    requirements: ["选择一种事物或品质补全题目", "通过具体事例说明它如何让生活更美好", "观点明确", "表达自己的认识和感受"]
  },
  {
    id: "g6a-u4",
    grade: "六年级",
    book: "上册",
    unit: "第四单元",
    title: "笔尖流出的故事",
    type: "故事创编",
    abilityGoal: "想象类（故事创编）",
    status: "资料已整理",
    requirements: ["根据提供的环境和人物编故事", "情节完整", "人物形象鲜明", "故事有吸引力"]
  },
  {
    id: "g6a-u5",
    grade: "六年级",
    book: "上册",
    unit: "第五单元",
    title: "围绕中心意思写",
    type: "扣题写作",
    abilityGoal: "议论文（扣题写作）",
    status: "资料已整理",
    requirements: ["选择一个汉字作为中心意思", "围绕中心意思选择材料", "用具体事例写出感悟", "中心突出，详略得当"]
  },
  {
    id: "g6a-u6",
    grade: "六年级",
    book: "上册",
    unit: "第六单元",
    title: "学写倡议书",
    type: "倡议书",
    abilityGoal: "应用文（倡议书）",
    status: "资料已整理",
    requirements: ["就生活中的某一现象写倡议书", "格式规范，包含标题、称呼、正文、署名和日期", "说明倡议原因", "提出具体可行的建议"]
  },
  {
    id: "g6a-u7",
    grade: "六年级",
    book: "上册",
    unit: "第七单元",
    title: "我的拿手好戏",
    type: "展示特长",
    abilityGoal: "记事（展示特长）",
    status: "资料已整理",
    requirements: ["写自己的一项特长或本领", "写清楚学习过程", "写出展示的情景", "突出重点，详略得当"]
  },
  {
    id: "g6a-u8",
    grade: "六年级",
    book: "上册",
    unit: "第八单元",
    title: "有你，真好",
    type: "情感表达",
    abilityGoal: "写人（情感表达）",
    status: "资料已整理",
    requirements: ["写一个对自己有重要影响的人", "通过具体事例表达感激之情", "抒发真实情感", "写出这个人对自己的意义"]
  },
  {
    id: "g6b-u1",
    grade: "六年级",
    book: "下册",
    unit: "第一单元",
    title: "家乡的风俗",
    type: "民俗文化",
    abilityGoal: "记叙/说明（民俗文化）",
    status: "资料已整理",
    requirements: ["介绍家乡的一种风俗", "写清楚风俗的表现形式", "写出风俗的文化内涵", "融入自己的感受和体验"]
  },
  {
    id: "g6b-u2",
    grade: "六年级",
    book: "下册",
    unit: "第二单元",
    title: "写作品梗概",
    type: "概括",
    abilityGoal: "阅读与写作（概括）",
    status: "资料已整理",
    requirements: ["选择一本书或一篇文章", "概括主要内容", "保留主干，去除枝叶", "语言通顺，衔接自然"]
  },
  {
    id: "g6b-u3",
    grade: "六年级",
    book: "下册",
    unit: "第三单元",
    title: "让真情自然流露",
    type: "情感表达",
    abilityGoal: "记叙（情感表达）",
    status: "资料已整理",
    requirements: ["选择一种感受深刻的情感体验", "通过具体事例把情感真实自然地表达出来", "可以运用心理、动作、语言等描写方法", "写清情感变化"]
  },
  {
    id: "g6b-u4",
    grade: "六年级",
    book: "下册",
    unit: "第四单元",
    title: "心愿",
    type: "立意表达",
    abilityGoal: "记叙/议论（立意表达）",
    status: "资料已整理",
    requirements: ["选择一个自己最想实现的心愿", "写清心愿产生的原因", "写清实现心愿的过程或期待", "表达对心愿的渴望和期待"]
  },
  {
    id: "g6b-u5",
    grade: "六年级",
    book: "下册",
    unit: "第五单元",
    title: "插上科学的翅膀飞",
    type: "科幻故事",
    abilityGoal: "想象类（科幻故事）",
    status: "资料已整理",
    requirements: ["展开想象写一个科幻故事", "想象要基于科学知识", "故事情节、环境等要具体", "想象合理、故事完整"]
  },
  {
    id: "g6b-u6",
    grade: "六年级",
    book: "下册",
    unit: "第六单元",
    title: "难忘的小学生活",
    type: "总结回顾",
    abilityGoal: "记叙（总结回顾）",
    status: "资料已整理",
    requirements: ["回忆小学生活中难忘的人或事", "选择典型事例表达真情实感", "可以运用多种表达方式", "表达对母校、老师、同学的感激和留恋"]
  }
];

const promptCatalog = promptCatalogItems.map((item) => ({
  ...item,
  wordCountGuide: gradeGuides[item.grade].wordCount,
  gradeExpectations: gradeGuides[item.grade].expectations,
  source: {
    ...sourceArticle,
    textbook: textbookSources[`${item.grade}|${item.book}`]
  }
}));

module.exports = {
  gradeGuides,
  promptCatalog,
  sourceArticle,
  textbookSources
};
