// AI宿造局 · AI 契约层 v2
// ------------------------------------------------------------------
// 云模式（真实模型）：云函数 aiPost / aiMutual / aiUpcycle 直连视觉/文本大模型，
//                    返回同契约 JSON，图片真正参与识别。
// 本地兜底（无密钥）：规则引擎产出「严格同契约」JSON，但**不再随机编造物品**——
//                    无法判断时给出候选让用户点选，并明确标注 need_manual。
// 两条路径都经过 schema 校验 + 重试 + 手填兜底（文书 5.6）。
const config = require('../config.js')
const util = require('./util.js')

const CATEGORIES = config.CAMPUS.categories
const CONDITIONS = config.CAMPUS.conditions
const TYPES = config.CAMPUS.mutualTypes
const SCOPES = config.CAMPUS.scopes
const DEAL_MODES = config.CAMPUS.dealModes

/* ==================================================================
 * 一、物品知识库（本地兜底用；真实识别以云函数视觉模型为准）
 * 字段：名称/emoji/类别/成色/建议价/别名/标签/可见特征/使用场景
 * ================================================================== */
const RAW_ITEMS = [
  ['小台灯', '💡', '生活', '七成新', 0, '台灯,灯,阅读灯,护眼灯,小夜灯', '台灯,宿舍神器,深夜赶due', '暖光,灯罩,可调角度', '深夜赶 due 的桌面'],
  ['教材旧书', '📚', '书籍', '七成新', 5, '书,教材,课本,笔记,单词书,考研,习题册,小说', '教材,考研,清仓', '书脊,折角,笔记', '考完试的书架'],
  ['耳机', '🎧', '数码', '九成新', 30, '耳机,耳麦,音响,音箱,蓝牙耳机', '耳机,听歌,自习', '耳罩,线材,收纳盒', '图书馆自习'],
  ['卫衣外套', '🧥', '衣物', '九成新', 20, '衣服,卫衣,外套,T恤,t恤,裤子,裙子,羽绒服,毛衣', '穿搭,换季,宿舍自提', '尺码,颜色,吊牌', '换季清衣柜'],
  ['保温杯', '🥤', '生活', '九成新', 8, '杯子,水杯,保温杯,马克杯,水壶', '水杯,桌面,随手带', '杯盖,杯身,保温', '早八路上的水'],
  ['机械键盘', '⌨️', '数码', '九成新', 45, '键盘,鼠标,充电器,数据线,充电宝,排插,U盘,硬盘', '数码,桌搭,实用', '键帽,接口,线长', '宿舍桌搭'],
  ['球拍', '🏸', '运动', '七成新', 25, '球拍,羽毛球拍,篮球,足球,瑜伽垫,哑铃,跳绳,护腕,滑板', '运动,约球,闲置', '握把,拍面,磨损', '约球失败的周末'],
  ['快递纸箱', '📦', '生活', '能用就行', 0, '纸箱,快递盒,纸盒,瓶子,空瓶,旧物,包装盒', '纸箱,零成本,可改造', '折痕,胶带,尺寸', '堆在门口的快递'],
  ['小盆栽', '🪴', '生活', '全新', 0, '盆栽,多肉,绿植,花盆,仙人掌,绿萝', '绿植,桌面,治愈', '叶片,陶盆,泥土', '窗台上的阳光'],
  ['帆布包', '🎒', '衣物', '九成新', 15, '背包,帆布包,书包,双肩包,挎包,托特包', '帆布包,通勤,百搭', '肩带,内袋,印花', '上课装书的日常'],
  ['折叠桌', '🪑', '生活', '七成新', 25, '折叠桌,小桌子,床上桌,椅子,凳子,收纳架,置物架', '桌搭,收纳,宿舍', '折痕,桌面,螺丝', '床上追剧的角落'],
  ['电风扇', '🌀', '生活', '七成新', 20, '风扇,电风扇,小风扇,usb风扇,暖风机', '夏天,宿舍,清凉', '扇叶,网罩,档位', '没空调的夏天'],
  ['插线板', '🔌', '数码', '九成新', 12, '插线板,排插,插座,延长线,转换器', '宿舍,用电,实用', '插孔,线长,开关', '床头那一排设备'],
  ['笔记本电脑', '💻', '数码', '七成新', 800, '笔记本,电脑,笔记本支架,散热器,平板,ipad', '数码,学习,装备', '外壳,屏幕,键盘', '写论文的深夜'],
  ['相机', '📷', '数码', '九成新', 300, '相机,单反,微单,拍立得,三脚架,镜头', '摄影,记录,出片', '镜头,机身,背带', '拍过校园的镜头'],
  ['手表', '⌚', '数码', '九成新', 80, '手表,手环,智能手表,运动手环', '穿搭,计时,运动', '表带,表盘,划痕', '早八掐点的日子'],
  ['台历本子', '📒', '书籍', '九成新', 5, '本子,笔记本,手账,台历,日历,便签,草稿本', '文具,手账,清仓', '封面,内页,装订', '写满计划的一学期'],
  ['文具套装', '✏️', '书籍', '九成新', 6, '笔,中性笔,荧光笔,尺子,文具,笔袋,订书机', '文具,开学,实用', '笔杆,笔袋,颜色', '考试周的桌面'],
  ['化妆镜', '🪞', '生活', '九成新', 10, '镜子,化妆镜,梳妆镜,收纳盒,首饰盒', '桌面,收纳,日常', '镜面,边框,支架', '出门前的五分钟'],
  ['雨伞', '☂️', '生活', '七成新', 5, '雨伞,伞,遮阳伞,雨衣', '下雨,通勤,随手', '伞骨,伞面,伞柄', '突如其来的暴雨'],
  ['收纳箱', '🧰', '生活', '七成新', 15, '收纳箱,整理箱,塑料箱,行李箱,拉杆箱,储物盒', '收纳,搬家,毕业', '卡扣,盖子,容量', '毕业收拾行李'],
  ['吹风机', '💨', '生活', '九成新', 25, '吹风机,风筒,卷发棒,直发夹', '洗护,宿舍,日常', '风嘴,线材,档位', '洗完头的晚上'],
  ['电煮锅', '🍲', '生活', '七成新', 30, '电煮锅,小锅,电饭煲,热水壶,烧水壶', '宿舍,做饭,实用', '锅体,内胆,电源线', '偷偷加餐的深夜'],
  ['毛绒玩偶', '🧸', '生活', '九成新', 10, '玩偶,公仔,抱枕,娃娃,毛绒,靠垫', '治愈,桌面,礼物', '绒毛,标签,尺寸', '陪睡了三年的床角'],
  ['吉他', '🎸', '运动', '七成新', 120, '吉他,尤克里里,口琴,笛子,电子琴', '音乐,社团,才艺', '琴弦,琴颈,琴包', '社团排练的傍晚'],
  ['自行车', '🚲', '运动', '七成新', 100, '自行车,单车,滑板车,平衡车,头盔', '通勤,校园,代步', '车架,车胎,刹车', '从宿舍到教学楼'],
  ['鼠标垫', '🖱️', '数码', '九成新', 8, '鼠标垫,桌垫,键盘托,腕托', '桌搭,办公,实用', '尺寸,包边,图案', '桌面前那一块'],
  ['台灯灯泡', '🔦', '生活', '全新', 3, '灯泡,手电筒,灯管,led,电池', '备用,实用,零钱', '包装,接口,亮度', '突然坏掉的那一刻'],
  ['衣架', '🧷', '生活', '能用就行', 0, '衣架,夹子,晾衣绳,挂钩,收纳袋', '晾晒,零成本,宿舍', '数量,颜色,材质', '阳台永远不够用'],
  ['水桶脸盆', '🪣', '生活', '七成新', 6, '水桶,脸盆,盆,洗衣盆,垃圾桶', '洗漱,宿舍,实用', '容量,提手,颜色', '公共水房的日子'],
  ['药品收纳盒', '💊', '生活', '九成新', 5, '药盒,医药箱,收纳盒,急救包', '常备,整理,实用', '分格,盖子,标签', '换季总感冒'],
  ['桌游卡牌', '🃏', '生活', '九成新', 15, '桌游,卡牌,扑克,狼人杀,拼图,乐高,积木', '聚会,周末,团建', '牌面,盒子,缺件', '宿舍断电后的夜聊'],
  ['考研资料', '📖', '书籍', '七成新', 12, '考研资料,真题,讲义,复习资料,四六级,雅思,托福', '考研,上岸,资料', '装订,批注,页数', '上岸之后'],
  ['显示器', '🖥️', '数码', '九成新', 200, '显示器,屏幕,显示屏,支架,投影仪', '桌搭,双屏,效率', '尺寸,接口,支架', '写代码的双屏'],
  ['香水香薰', '🕯️', '生活', '九成新', 30, '香水,香薰,蜡烛,扩香,空气清新剂', '氛围,礼物,治愈', '瓶身,余量,香味', '周日打扫完的房间'],
  ['运动鞋', '👟', '衣物', '七成新', 40, '运动鞋,球鞋,鞋子,拖鞋,靴子,板鞋', '穿搭,跑步,闲置', '鞋码,鞋底,鞋面', '跑过操场的早晨'],
  ['帽子围巾', '🧣', '衣物', '九成新', 10, '帽子,围巾,手套,袜子,腰带', '冬天,穿搭,保暖', '颜色,材质,尺码', '降温那几天'],
  ['U型枕', '💤', '生活', '九成新', 8, 'u型枕,抱枕,枕头,眼罩,耳塞,午睡毯', '午睡,通勤,治愈', '面料,填充,搭扣', '课间趴桌十分钟'],
  ['充电器线材', '🔋', '数码', '能用就行', 5, '充电线,数据线,充电头,适配器,type-c,lightning', '数码,备用,零钱', '接口,线长,外皮', '抽屉里那一团线'],
  ['画具', '🎨', '生活', '七成新', 20, '画板,颜料,画笔,素描本,马克笔,水彩', '画画,社团,兴趣', '笔尖,颜料盒,纸张', '选修课的作品'],
  ['保温饭盒', '🍱', '生活', '九成新', 12, '饭盒,保温桶,便当盒,餐具,筷子勺子', '带饭,食堂,实用', '分格,密封圈,提袋', '食堂排队的午休'],
  ['旧手机', '📱', '数码', '七成新', 150, '手机,旧手机,备用机,手机壳,手机支架,钢化膜', '数码,备用,配件', '屏幕,边框,电池', '换机后抽屉深处'],
  ['蓝牙音箱', '🔊', '数码', '九成新', 50, '音箱,音响,蓝牙,喇叭,收音机', '音乐,宿舍,氛围', '网罩,按键,续航', '周末打扫时的 BGM'],
  ['行李袋', '🧳', '生活', '七成新', 15, '行李袋,编织袋,收纳袋,真空袋,搬家袋', '搬家,毕业,收纳', '拉链,提手,容量', '放假回家的行李'],
  ['台扇配件', '🧩', '其他', '能用就行', 0, '零件,配件,螺丝,工具,扳手,胶带,剪刀', '零碎,工具,随手', '数量,规格,成色', '不知道哪天攒下的']
]

const ITEMS = RAW_ITEMS.map(function (r) {
  return {
    name: r[0], emoji: r[1], category: r[2], condition: r[3], price: r[4],
    keys: r[5].split(','), tags: r[6].split(','), traits: r[7].split(','), scene: r[8]
  }
})

/* ==================================================================
 * 二、确定性伪随机（同一 seed 可复现，换 seed 必换文案）
 * ================================================================== */
function hash(str) {
  let h = 2166136261
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function pick(arr, seed, salt) {
  if (!arr || !arr.length) return ''
  return arr[hash(String(seed) + '|' + salt + '|' + arr.length) % arr.length]
}

/* ==================================================================
 * 三、文案引擎：每种风格多套标题 × 四段式骨架，随机组合
 * ================================================================== */
const COPY = {
  funny: {
    emoji: ['🤪', '😂', '✨', '🏃💨', '🙃', '🔥', '👀', '🎁', '🫡', '😌'],
    titles: [
      '别问，{item}要跑路了', '{item}：本人已提交离职',
      '在线给{item}找下家', '{item}的翻身仗开始了',
      '救救孩子，{item}占地方了', '这只{item}，急招新主人',
      '{item}：我还能再战三年'
    ],
    open: [
      '本人与{item}和平分手{e}，它没坏，是我懒。',
      '宣布一件大事：{item}正式从我桌上退役{e}。',
      '收拾桌子翻出{item}，它看我，我看它，气氛有点尴尬{e}。',
      '{item}在角落吃灰三个月了，今天决定放它自由{e}。',
      '不是冲动，是{item}自己说想出去看看{e}。'
    ],
    mid: [
      '成色{trait}，功能全正常，不用供着{e}。',
      '当年为了{scene}买的，现在它比我勤快{e}。',
      '外观{trait}，实拍就是图里这样，不修图{e}。',
      '没有隐藏剧情，唯一缺点是我不配拥有它{e}。'
    ],
    hand: [
      '领养附赠「不追问为什么闲置」服务一份{e}。',
      '校内当面交接，顺手带走就行{e}。',
      '不议价、不闲聊、不写小作文，合适就拿走{e}。',
      '本楼栋自提，电梯口都能交接{e}。'
    ],
    end: [
      '手慢无，先到先得{e}', '楼下同学优先，别让隔壁楼捡漏{e}',
      '给它个机会，也给你的桌面腾个位置{e}', '评论区不许笑我囤货{e}'
    ]
  },
  nostalgia: {
    emoji: ['🌙', '🍃', '📖', '🕯️'],
    titles: [
      '陪过我的{item}，找下一位', '{item}，交给下一段日子',
      '毕业前，把{item}好好送走', '关于{item}的一点小回忆'
    ],
    open: [
      '收拾行李才又翻出它，忽然有点走神。',
      '大一那会儿它就在了，一晃好几年。',
      '擦干净的时候，想起很多个普通的晚上。',
      '本来想留着，又觉得它该继续被用下去。'
    ],
    mid: [
      '{scene}，它一直在旁边，没出过什么风头。',
      '成色{trait}，有些痕迹是时间留下的，不打算遮。',
      '功能都还好的，只是我用得越来越少。',
      '照片里什么样，拿到手就是什么样。'
    ],
    hand: [
      '校内当面给你，不用特意道谢。',
      '放在本楼栋，方便的时候来拿就好。',
      '不用回礼，好好用下去就算交代了。'
    ],
    end: [
      '希望它在新桌上继续亮着 🌙', '谢谢你替我把它接过去 🍃',
      '愿它下一段日子也被温柔对待 📖'
    ]
  },
  minimal: {
    emoji: ['', '', '·'],
    titles: [
      '{item}，自取', '{item} 转让', '{item} 一件，免费/低价',
      '出{item}，校内面交', '{item}，功能正常'
    ],
    open: [
      '{item}一件，{trait}。',
      '闲置{item}，{trait}。',
      '{item}，{trait}，功能正常。'
    ],
    mid: [
      '实拍即成色，无暗病。',
      '用过一段时间，干净、可用。',
      '{scene}用的，现用不上。'
    ],
    hand: [
      '本楼栋自提，当面交付。',
      '校内面交，位置见下方。',
      '不邮寄，顺手带走即可。'
    ],
    end: [
      '合适就拿走。', '不议价。', '先到先得。', '有意直接联系。'
    ]
  }
}

function fill(tpl, item, seed, salt, style) {
  const s = COPY[style] ? style : 'minimal'
  const trait = item ? pick(item.traits, seed, 'trait') : '成色如图'
  const scene = item ? item.scene : '宿舍日常'
  const name = item ? item.name : '这件闲置'
  const e = pick(COPY[s].emoji, seed, salt + 'e')
  return String(tpl)
    .split('{item}').join(name)
    .split('{trait}').join(trait)
    .split('{scene}').join(scene)
    .split('{e}').join(e || '')
}

function buildCopy(item, style, hint, seed, salt) {
  const s = COPY[style] ? style : 'minimal'
  const c = COPY[s]
  const sd = seed || 1
  const sf = salt || ''
  const tplTitle = pick(c.titles, sd, sf + 't')
  const parts = [
    pick(c.open, sd, sf + 'o'),
    pick(c.mid, sd, sf + 'm'),
    pick(c.hand, sd, sf + 'h'),
    pick(c.end, sd, sf + 'e')
  ]
  const title = fill(tplTitle, item, sd, sf + 't', s)
  let desc = parts.map(function (p, i) { return fill(p, item, sd, sf + 'p' + i, s) }).join('')
  const extra = hint ? String(hint).slice(0, 24) : ''
  if (extra) desc += (s === 'minimal' ? ' 补充：' + extra : '（补一句：' + extra + '）')
  // 风格 Emoji 密度硬约束
  if (s === 'minimal') desc = desc.replace(/[🤪😂✨🙃🔥👀🎁🫡😌🌙🍃📖🕯️🏃💨]/g, '')
  return { title: util.truncate(title, 20), desc: util.truncate(desc, 200) }
}

/* ==================================================================
 * 四、物品识别：只从「用户补充/用户点选」推断，绝不随机编造
 * ================================================================== */
function detectItem(text) {
  const t = String(text || '')
  const hits = []
  ITEMS.forEach(function (item) {
    let score = 0
    let matched = ''
    item.keys.forEach(function (k) {
      if (k && t.indexOf(k) >= 0 && k.length > matched.length) { matched = k; score = k.length * 10 + 3 }
    })
    if (score > 0) hits.push({ item: item, score: score, matched: matched })
  })
  hits.sort(function (a, b) { return b.score - a.score })
  const candidates = hits.slice(0, 3).map(function (h, i) {
    return { name: h.item.name, confidence: Math.max(0.2, Math.round((0.9 - i * 0.25) * 100) / 100) }
  })
  if (hits.length) {
    return {
      item: hits[0].item,
      confidence: Math.min(0.88, 0.68 + hits[0].score / 100),
      candidates: candidates,
      guessed: false
    }
  }
  // 无命中：给确定性候选，不编造物品名
  const pool = [ITEMS[0], ITEMS[7], ITEMS[1], ITEMS[2], ITEMS[9], ITEMS[3]]
  const base = hash(t || 'empty') % pool.length
  return {
    item: null,
    confidence: 0.25,
    candidates: [0, 1, 2].map(function (i) {
      return { name: pool[(base + i) % pool.length].name, confidence: 0.3 - i * 0.08 }
    }),
    guessed: true
  }
}

function findItemByName(name) {
  if (!name) return null
  const n = String(name)
  for (let i = 0; i < ITEMS.length; i++) if (ITEMS[i].name === n) return ITEMS[i]
  for (let i = 0; i < ITEMS.length; i++) {
    for (let j = 0; j < ITEMS[i].keys.length; j++) {
      if (n.indexOf(ITEMS[i].keys[j]) >= 0 || ITEMS[i].keys[j].indexOf(n) >= 0) return ITEMS[i]
    }
  }
  return null
}

function generatePost(input) {
  const data = input || {}
  const style = data.style || 'minimal'
  const seed = Number(data.seed) || 1
  const salt = String(data.salt || '')
  const hint = data.user_hint || data.hint || ''
  // 用户从候选中点选的物品优先
  let detected = null
  if (data.item_name) {
    const chosen = findItemByName(data.item_name)
    detected = {
      item: chosen,
      confidence: chosen ? 0.95 : 0.6,
      candidates: [{ name: String(data.item_name), confidence: 0.95 }],
      guessed: false
    }
    if (!chosen) detected.item = { name: String(data.item_name).slice(0, 10), emoji: '📦', category: '其他', condition: '能用就行', price: 0, keys: [], tags: [String(data.item_name).slice(0, 8)], traits: ['成色如图'], scene: '宿舍日常' }
  } else {
    detected = detectItem(hint)
  }
  const item = detected.item
  const copy = buildCopy(item, style, hint, seed, salt)
  const tags = item ? item.tags.slice(0, 5) : ['闲置', '校内自提']
  return {
    item_name: item ? item.name : '',
    item_features: item ? item.traits.slice(0, 3) : [],
    candidates: detected.candidates,
    title: copy.title,
    desc: copy.desc,
    category: item ? item.category : '其他',
    condition: item ? item.condition : '能用就行',
    price_suggestion: item ? item.price : 0,
    deal_mode: item && item.price > 0 ? '低价转让' : '赠送',
    tags: tags,
    confidence: detected.confidence,
    need_manual: !item || detected.confidence < 0.6,
    _engine: 'local-rules',
    _image_recognized: false
  }
}

/* ==================================================================
 * 五、时间与地点 NLU（文书 5.3）
 * 修复：日期词优先级（下周三下午不再被判成今天）、钟点/时段、具体日期、
 *       地点别名、起终点、demand 核心动作抽取。
 * ================================================================== */
const WEEK_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 }
const CN_NUM = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 }

function cn2num(s) {
  const t = String(s || '')
  if (/^\d+$/.test(t)) return Number(t)
  if (t.indexOf('十') >= 0) {
    const a = t.split('十')
    return (a[0] ? CN_NUM[a[0]] || 0 : 1) * 10 + (a[1] ? CN_NUM[a[1]] || 0 : 0)
  }
  return CN_NUM[t] !== undefined ? CN_NUM[t] : NaN
}

const PLACE_ALIASES = [
  ['一食堂', ['一食堂', '一饭', '1食堂', '第一食堂', '一餐']],
  ['二食堂', ['二食堂', '二饭', '2食堂', '第二食堂', '二餐']],
  ['三食堂', ['三食堂', '三饭', '3食堂']],
  ['快递驿站', ['快递驿站', '驿站', '菜鸟', '菜鸟驿站', '快递点', '取件点', '快递柜']],
  ['图书馆', ['图书馆', '图图', '馆里', '阅览室']],
  ['教学楼', ['教学楼', '教室', '课室', '阶梯教室']],
  ['宿舍楼下', ['宿舍楼下', '楼下', '楼底下', '寝室楼下']],
  ['校门口', ['校门口', '大门', '校门', '南门', '北门']],
  ['超市', ['超市', '便利店', '小卖部', '商店']],
  ['操场', ['操场', '田径场', '篮球场', '体育馆']],
  ['食堂', ['食堂', '饭堂']],
  ['快递站门口', ['驿站门口', '快递门口']]
]

function normalizeBuilding(raw) {
  const s = String(raw || '')
  const m = s.match(/([A-Ea-e])\s?栋|([一二三四五1-5])\s?(?:号楼|栋|号楼下)/)
  if (!m) return null
  if (m[1]) return m[1].toUpperCase() + ' 栋'
  const map = { '一': 'A', '二': 'B', '三': 'C', '四': 'D', '五': 'E', '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E' }
  return (map[m[2]] || 'A') + ' 栋'
}

function parseTime(text, now) {
  const base = util.toDate(now || Date.now())
  const day = base.getDay()
  const t = String(text || '')
  let offset = null
  let exact = null
  let dateWord = null
  let dateInferred = false

  // ① 具体日期：X月X日 / X号
  let m = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/)
  if (m) {
    const mo = Number(m[1]) - 1
    const dd = Number(m[2])
    const y = base.getFullYear()
    let d = new Date(y, mo, dd)
    if (d.getTime() < new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime()) d = new Date(y + 1, mo, dd)
    exact = d
    dateWord = m[0]
  }
  if (!exact && !dateWord) m = t.match(/(\d{1,2})\s*[号日](?!前)/)
  if (!exact && !dateWord && m) {
    const dd = Number(m[1])
    let d = new Date(base.getFullYear(), base.getMonth(), dd)
    if (d.getTime() < new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime()) d = new Date(base.getFullYear(), base.getMonth() + 1, dd)
    exact = d
    dateWord = m[0]
  }
  // ② N 天后
  if (!exact && !dateWord) m = t.match(/(\d{1,2})\s*天[后以]后?/)
  if (!exact && !dateWord && m) { offset = Number(m[1]); dateWord = m[0] }

  // ③ 相对天 / 周几（严格按优先级，避免「下周三下午」被「下午」抢走）
  const rules = [
    { re: /大后天|大大后天/, n: 3 },
    { re: /后天/, n: 2 },
    { re: /明天|明日|明早|明晚|明儿|次日/, n: 1 },
    { re: /今天|今晚|今早|今儿|当日/, n: 0 },
    { re: /现在|马上|立刻|这会儿|立刻要/, n: 0 },
    { re: /下下周\s*(?:周|星期)?\s*([一二三四五六日天])/, week: 2 },
    { re: /下周\s*(?:周|星期)?\s*([一二三四五六日天])/, week: 1 },
    { re: /(?:本周|这周|本星期|这星期)\s*(?:周|星期)?\s*([一二三四五六日天])/, week: 0, thisWeek: true },
    { re: /下下周(?!\s*[一二三四五六日天])/, n: 14 },
    { re: /(?:下周|下星期)(?!\s*[一二三四五六日天])/, n: 7 },
    { re: /(?:(?:这|本)?周末)/, weekend: true },
    { re: /(?:周|星期)([一二三四五六日天])/, plainWeek: true }
  ]
  if (!exact && !dateWord) {
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i]
      const mm = t.match(r.re)
      if (!mm) continue
      dateWord = mm[0]
      if (r.n !== undefined) { offset = r.n; break }
      if (r.week !== undefined || r.thisWeek || r.plainWeek) {
        const target = WEEK_MAP[mm[1]]
        if (target === undefined) continue
        if (r.thisWeek) {
          const mondayOffset = (day === 0 ? -6 : 1 - day)
          let diff = mondayOffset + (target === 0 ? 6 : target - 1)
          if (diff < 0) diff += 7
          offset = diff
        } else if (r.week !== undefined) {
          const mondayOffset = (day === 0 ? -6 : 1 - day) + 7 * r.week
          offset = mondayOffset + (target === 0 ? 6 : target - 1)
        } else {
          offset = (target - day + 7) % 7
        }
        break
      }
      if (r.weekend) {
        offset = (6 - day + 7) % 7
        break
      }
    }
  }

  // ④ 时段与钟点
  const periodWords = ['凌晨', '一大早', '早上', '早晨', '上午', '中午', '午休', '下午', '傍晚', '晚上', '夜里', '深夜', '饭点', '下课后', '放学后', '上课前', '睡前', '半小时内', '几分钟后']
  let slotWord = null
  const slotWords = []
  let period = ''
  for (let i = 0; i < periodWords.length; i++) {
    if (t.indexOf(periodWords[i]) >= 0) {
      period = periodWords[i]
      slotWord = periodWords[i]
      slotWords.push(periodWords[i])
      break
    }
  }
  let clockCore = ''
  const cm = t.match(/(\d{1,2}|[零一二两三四五六七八九十]{1,3})\s*[点:：时]\s*(半|\d{1,2}\s*分?)?/)
  if (cm) {
    const h = cn2num(cm[1])
    if (!isNaN(h) && h >= 0 && h <= 24) {
      clockCore = h + '点'
      if (cm[2]) clockCore += (cm[2].indexOf('半') >= 0 ? '半' : String(cm[2]).replace(/[\s分]/g, ''))
      const tail = t.slice(cm.index + cm[0].length, cm.index + cm[0].length + 4)
      if (/前|之前|以前/.test(tail)) clockCore += '前'
      else if (/后|之后|左右/.test(tail)) clockCore += '后'
      slotWords.push(cm[0])
      slotWord = slotWords.join(' ')
    }
  }
  let timeSlot = ''
  if (period && clockCore) timeSlot = period + clockCore
  else if (clockCore) {
    const hm = clockCore.match(/^(\d{1,2})/)
    const h = hm ? Number(hm[1]) : 12
    timeSlot = (h < 6 ? '凌晨' : h < 11 ? '上午' : h < 13 ? '中午' : h < 18 ? '下午' : '晚上') + clockCore
  } else if (period) timeSlot = period

  // ⑤ 无日期词但有时段 → 按「今天」推断，并显式标注
  if (!exact && offset === null && timeSlot) {
    offset = 0
    dateInferred = true
    dateWord = null
  }

  let timeStart = null
  if (exact) timeStart = util.dateStr(exact)
  else if (offset !== null) timeStart = util.dateStr(util.addDays(base, offset))

  let timeLabel = ''
  if (timeStart) {
    const md = timeStart.slice(5)
    timeLabel = (dateWord || (dateInferred ? '按今天推断' : '今天')) + '(' + md + ')' + (timeSlot ? ' ' + timeSlot : '')
  } else if (timeSlot) timeLabel = timeSlot

  return {
    timeText: dateWord,
    timeStart: timeStart,
    timeSlot: timeSlot || null,
    timeLabel: timeLabel,
    detectedDate: dateWord,
    detectedSlot: slotWord,
    slotWords: slotWords,
    dateInferred: dateInferred
  }
}

function parseLocation(text) {
  const t = String(text || '')
  const found = []
  PLACE_ALIASES.forEach(function (p) {
    p[1].forEach(function (alias) {
      const idx = t.indexOf(alias)
      if (idx >= 0) found.push({ name: p[0], raw: alias, index: idx })
    })
  })
  config.CAMPUS.buildings.forEach(function (b) {
    const bare = b.replace(/\s/g, '')
    const idx = t.indexOf(bare)
    if (idx >= 0) found.push({ name: b, raw: bare, index: idx })
  })
  const bm = t.match(/[A-Ea-e]\s?栋|[一二三四五1-5]\s?(?:号楼|栋)/)
  if (bm) {
    const b = normalizeBuilding(bm[0])
    if (b) found.push({ name: b, raw: bm[0], index: bm.index })
  }
  found.sort(function (a, b) { return a.index - b.index })
  // 去重（同一标准化地点只留第一个）
  const uniq = []
  found.forEach(function (f) {
    if (!uniq.some(function (u) { return u.name === f.name })) uniq.push(f)
  })

  let fromPlace = null
  let toPlace = null
  if (uniq.length >= 2 && /(从|由).{0,20}(到|去|送到|拿到|带回|送回|至)/.test(t)) {
    fromPlace = uniq[0].name
    toPlace = uniq[1].name
  }
  const location = uniq.length ? uniq[0].name : null
  const dm = t.match(/(?:楼下|门口|旁边|附近|楼上|大厅|前台|电梯口|[A-Ea-e]\s?栋\s?\d{3,4}|\d{3,4}\s?室?)/)
  const locationDetail = dm ? dm[0] : null
  return {
    location: location,
    fromPlace: fromPlace,
    toPlace: toPlace,
    locationDetail: locationDetail,
    detectedPlace: uniq.map(function (u) { return u.name }).join('、'),
    placeWords: uniq.map(function (u) { return u.raw })
  }
}

function detectType(raw) {
  const t = String(raw || '')
  if (/快递|取件|驿站|菜鸟|代取|包裹|拿.*(?:快递|箱子|包裹)|取.*(?:快递|包裹)/.test(t)) return '代取'
  if (/拼单|拼个|凑单|一起买|团购|AA|拼车/.test(t)) return '拼单'
  if (/借|借用|求借|借一下/.test(t)) return '借用'
  if (/带饭|带个|带一份|带份|带杯|带瓶|带碗|带点|求带|代买|捎|帮我买|顺路买|带.*(?:饭|包|奶茶|炒饭)/.test(t)) return '代买'
  if (/教|修|剪辑|辅导|装|做.*(?:PPT|ppt|海报)|写代码|拍照|帮.*(?:改|写|做)/.test(t)) return '技能帮忙'
  return '其他'
}

function detectReward(raw) {
  // 只认明确的「答谢」表达；「买奶茶」「AA」是需求本身，不算酬劳
  const m = String(raw || '').match(/(?:请喝|请吃|请你|送你)[^，。！？,.!?\s]{0,8}|重谢|当面道谢|红包|有偿|[0-9]+\s?元|￥[0-9]+|小费|请客|带我一份/)
  return m ? m[0] : null
}

function detectUrgency(raw) {
  const t = String(raw || '')
  if (/很急|急!|急！|十万火急|在线等|马上要|立刻要|救急|急用|马上|立刻/.test(t)) return '很急'
  if (/急|尽快|着急|今天之内|赶时间|赶紧/.test(t)) return '有点急'
  return '普通'
}

function extractDemand(raw, ctx) {
  let s = String(raw || '')
  const removals = []
  if (ctx.dateWord) removals.push(ctx.dateWord)
  ;(ctx.slotWords || []).forEach(function (w) { removals.push(w) })
  ;(ctx.placeWords || []).forEach(function (w) { removals.push(w) })
  if (ctx.rewardWord) removals.push(ctx.rewardWord)
  if (ctx.detailWord) removals.push(ctx.detailWord)
  removals.sort(function (a, b) { return String(b).length - String(a).length })
  removals.forEach(function (w) { if (w) s = s.split(w).join('') })
  s = s.replace(/谁|有没有人|有没有|哪位|有木有|求|帮个忙|可以吗|行吗|谢谢|感谢|麻烦|请问|在线等|有人吗|有人|能不能|可否|麻烦你|能不能帮|会|吗|呢|AA|aa/g, '')
  s = s.replace(/很急|着急|急|赶紧|马上|立刻/g, '')
  s = s.replace(/[，。！？、,.!?~～\s：:；;]/g, ' ')
  // 「从 A 到 B」结构词清掉，只留核心动作（不删「在」，避免误伤「现在」）
  s = s.replace(/[从到去给把]/g, ' ')
  s = s.replace(/帮我|给我|替我|我/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/^(前|后|左右|之前|之后|的|了|吧|啊|呀|哦|一下|一个|在|帮|想|要|需要|有)[\s]*/, '').trim()
  s = s.replace(/的(?=[\u4e00-\u9fa5])/g, '')
  s = s.replace(/\s+/g, '')
  if (s.length > 30) s = s.slice(0, 30)
  return s || null
}

function buildMutualTitle(type, loc, demand, seed) {
  const core = String(demand || '帮个忙').replace(/^(帮我|给我|替我)/, '').slice(0, 10)
  const l = loc ? loc : ''
  const tpls = l
    ? [
        '求' + core + '（' + l + '）',
        l + ' · ' + core,
        '求' + l + core,
        '有人能' + core + '吗'
      ]
    : ['有人能' + core + '吗', '求' + core, core + '，求帮忙']
  return util.truncate(pick(tpls, seed || 1, 'mt'), 20)
}

function generateMutual(input) {
  const data = input || {}
  const raw = String(data.raw_text || data.rawText || '').slice(0, 100)
  // 用设备本地日期做基准，避免 ISO 字符串在小程序引擎里解析成 Invalid Date
  const now = data.today || util.dateStr(new Date())
  const seed = Number(data.seed) || 1
  const time = parseTime(raw, now)
  const loc = parseLocation(raw)
  const reward = detectReward(raw)
  const type = detectType(raw)
  const urgency = detectUrgency(raw)
  const demand = extractDemand(raw, {
    dateWord: time.detectedDate,
    slotWords: time.slotWords,
    placeWords: loc.placeWords,
    detailWord: loc.locationDetail,
    rewardWord: reward
  })
  const title = buildMutualTitle(type, loc.location, demand, seed)
  const missing = []
  if (!loc.location) missing.push('location')
  if (!time.timeStart) missing.push('time_start')
  if (!demand) missing.push('demand')
  const filled = [loc.location, time.timeStart, time.timeSlot, demand, reward].filter(Boolean).length
  return {
    type: type,
    title: title,
    time_text: time.timeText,
    time_start: time.timeStart,
    time_slot: time.timeSlot,
    time_label: time.timeLabel,
    location: loc.location,
    from_place: loc.fromPlace,
    to_place: loc.toPlace,
    location_detail: loc.locationDetail,
    demand: demand,
    reward: reward,
    urgency: urgency,
    scope: '本楼栋',
    missing_fields: missing,
    detected: {
      date: time.detectedDate,
      slot: time.detectedSlot,
      place: loc.detectedPlace,
      dateInferred: time.dateInferred
    },
    confidence: Math.min(0.95, 0.35 + filled * 0.12),
    _engine: 'local-rules'
  }
}

/* ==================================================================
 * 六、旧物改造（3 套思路不重复，文案随物品/场景变化）
 * ================================================================== */
const UPCYCLE_NAMES = [
  ['桌面{scene}小格', '会发光的装饰角', '顺手就能用的实用件'],
  ['免胶折叠收纳盒', '旧物拼贴画', '桌面理线小帮手'],
  ['一格一物的分格盘', '窗台氛围小景', '可拆装的临时置物架']
]

function generateUpcycle(input) {
  const data = input || {}
  const item = String(data.item || '旧物').slice(0, 20)
  const scene = String(data.scene || '收纳')
  const seed = Number(data.seed) || 1
  const names = pick(UPCYCLE_NAMES, seed, 'un').map(function (n) { return util.truncate(n.split('{scene}').join(scene), 12) })
  const material = item + ' 1 个'
  const safeTip = '使用剪刀时放慢动作，别对着人，用完立刻收好 ✂️'
  const schemes = [
    {
      name: names[0], difficulty: '简单', minutes: 20,
      materials: [material, '旧包装纸 / 旧报纸', '双面胶或胶带', '手撕即可，无需工具'],
      steps: [
        '把' + item + '拆开、压平，擦掉灰尘',
        '按桌面大小手撕成几块长方形',
        '边缘向内折 2cm，折出立起来的小边',
        '用胶带把四角粘住，做成敞口小格',
        '两三个小格并排摆好，笔和发圈各住一格',
        '外侧包一层旧包装纸，顺手画个笑脸'
      ],
      effect_image: '',
      green_note: '少买一个' + scene + '盒，约减碳 1.0kg'
    },
    {
      name: names[1], difficulty: '中等', minutes: 35,
      materials: [material, '旧杂志彩页', '手机小夜灯或串灯（宿舍现有）', '胶带'],
      steps: [
        '把' + item + '裁出三块同样大小的板',
        '三块板折成三角立牌，胶带固定',
        '旧杂志彩页撕成小片，贴满外表面',
        '在立牌上戳几个小孔（用笔尖，不用刀具）',
        '把小夜灯塞进里面，晚上开灯就是氛围角',
        safeTip
      ],
      effect_image: '',
      green_note: '旧物变装饰，不新增购买约减碳 1.0kg'
    },
    {
      name: names[2], difficulty: '有点挑战', minutes: 45,
      materials: [material, '旧 T 恤边角布', '胶带', '纸笔（画标记）'],
      steps: [
        '想清楚要解决的问题：线乱 / 桌乱 / 找东西慢',
        '把' + item + '按需求折成 L 形或夹层',
        '旧 T 恤布条缠一圈当防滑垫',
        '关键受力处多贴两层胶带加固',
        '贴上标签写清楚放什么，养成归位习惯',
        '试放一天，不好用就拆开重折，零成本试错',
        safeTip
      ],
      effect_image: '',
      green_note: '延长旧物寿命一次，约减碳 1.0kg'
    }
  ]
  return { item: item, schemes: schemes }
}

/* ==================================================================
 * 七、schema 校验：越界回退、字数硬约束、缺字段不编造
 * ================================================================== */
function validatePost(obj) {
  if (!obj || typeof obj !== 'object') return null
  const o = {}
  o.title = util.truncate(obj.title || '', 20)
  o.desc = util.truncate(obj.desc || '', 200)
  o.category = CATEGORIES.indexOf(obj.category) >= 0 ? obj.category : '其他'
  o.condition = CONDITIONS.indexOf(obj.condition) >= 0 ? obj.condition : '能用就行'
  const p = Number(obj.price_suggestion)
  o.price_suggestion = isNaN(p) || p < 0 ? 0 : Math.round(p)
  o.deal_mode = DEAL_MODES.indexOf(obj.deal_mode) >= 0 ? obj.deal_mode : '赠送'
  o.tags = Array.isArray(obj.tags) ? obj.tags.slice(0, 5).map(String) : []
  o.item_name = util.truncate(obj.item_name || '', 20)
  o.item_features = Array.isArray(obj.item_features) ? obj.item_features.slice(0, 3).map(String) : []
  o.candidates = Array.isArray(obj.candidates)
    ? obj.candidates.slice(0, 3).map(function (c) {
      return { name: util.truncate((c && c.name) || '', 12), confidence: Number(c && c.confidence) || 0 }
    }).filter(function (c) { return c.name })
    : []
  o.confidence = typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0.6
  o.need_manual = obj.need_manual === true || o.confidence < 0.6 || !o.title || !o.item_name
  o._engine = obj._engine || 'model'
  o._image_recognized = obj._image_recognized !== false
  if (!o.title) return null
  return o
}

function validateMutual(obj) {
  if (!obj || typeof obj !== 'object') return null
  const o = {}
  o.type = TYPES.indexOf(obj.type) >= 0 ? obj.type : '其他'
  o.title = util.truncate(obj.title || '', 20)
  o.time_text = obj.time_text || null
  o.time_start = /^\d{4}-\d{2}-\d{2}$/.test(obj.time_start || '') ? obj.time_start : null
  o.time_slot = obj.time_slot ? util.truncate(String(obj.time_slot), 20) : null
  o.time_label = obj.time_label ? util.truncate(String(obj.time_label), 40) : (o.time_start || '')
  o.location = obj.location ? util.truncate(String(obj.location), 30) : null
  o.from_place = obj.from_place ? util.truncate(String(obj.from_place), 30) : null
  o.to_place = obj.to_place ? util.truncate(String(obj.to_place), 30) : null
  o.location_detail = obj.location_detail ? util.truncate(String(obj.location_detail), 20) : null
  o.demand = obj.demand ? util.truncate(String(obj.demand), 40) : null
  o.reward = obj.reward ? util.truncate(String(obj.reward), 20) : null
  o.urgency = config.CAMPUS.urgencies.indexOf(obj.urgency) >= 0 ? obj.urgency : '普通'
  o.scope = SCOPES.indexOf(obj.scope) >= 0 ? obj.scope : '本楼栋'
  o.detected = (obj.detected && typeof obj.detected === 'object') ? obj.detected : {}
  o.confidence = typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0.5
  o._engine = obj._engine || 'model'
  const declared = Array.isArray(obj.missing_fields) ? obj.missing_fields.map(String) : []
  const real = []
  if (!o.location) real.push('location')
  if (!o.time_start) real.push('time_start')
  if (!o.demand) real.push('demand')
  o.missing_fields = Array.from(new Set(declared.concat(real)))
  if (!o.title) return null
  return o
}

function validateUpcycle(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.schemes)) return null
  const schemes = obj.schemes.slice(0, 3).map(function (s) {
    return {
      name: util.truncate((s && s.name) || '改造小方案', 12),
      difficulty: ['简单', '中等', '有点挑战'].indexOf(s && s.difficulty) >= 0 ? s.difficulty : '简单',
      minutes: Number(s && s.minutes) > 0 ? Math.round(Number(s.minutes)) : 20,
      materials: Array.isArray(s && s.materials) ? s.materials.map(String) : [],
      steps: Array.isArray(s && s.steps) ? s.steps.slice(0, 8).map(String) : [],
      effect_image: (s && typeof s.effect_image === 'string') ? s.effect_image : '',
      green_note: (s && s.green_note) || '旧物再用一次，约减碳 1.0kg'
    }
  })
  while (schemes.length < 3) {
    schemes.push(generateUpcycle({ item: obj.item || '旧物', scene: '收纳' }).schemes[schemes.length])
  }
  return { item: obj.item || '旧物', schemes: schemes }
}

// 容错解析：去掉模型常见的 ```json 包裹与解释性文字
function safeParse(text) {
  if (!text) return null
  if (typeof text === 'object') return text
  let s = String(text).trim()
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(s.slice(start, end + 1))
  } catch (err) {
    return null
  }
}

async function local(kind, input) {
  await util.sleep(450) // 模拟工作流耗时，用于展示骨架屏
  if (kind === 'post') return generatePost(input)
  if (kind === 'mutual' || kind === 'speech') {
    const r = generateMutual(input)
    if (kind === 'speech') r.cleaned_text = String(input.raw_text || input.rawText || '')
    return r
  }
  return generateUpcycle(input)
}

module.exports = {
  generatePost, generateMutual, generateUpcycle,
  validatePost, validateMutual, validateUpcycle,
  safeParse, local, ITEMS,
  detectItem, buildCopy, parseTime, parseLocation
}
