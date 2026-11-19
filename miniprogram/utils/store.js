// 本地演示数据层：形状与文书 6.3 的云数据库集合保持一致
// 云环境未配置时使用；配置云环境后由 utils/api.js 自动切到 wx.cloud
const util = require('./util.js')

const KEY = 'aiszj_db_v1'
const HOUR = 3600000
const DAY = 86400000

function seedPosts(mine) {
  const t = Date.now()
  const raw = [
    ['📚', '考研数学全套笔记', '字丑但全是重点，翻烂了也不舍得扔📖 送有缘人，考上记得请我喝奶茶～', '书籍', '七成新', 0, '赠送', ['考研', '笔记', '免费'], 'A 栋', 'on_shelf', 'A 栋 · 3 楼'],
    ['💡', '会发光的小台灯', '陪我熬过三个期末，灯罩微微发黄，光还是暖的🌙 谁来继续照亮深夜赶 due 吧', '生活', '七成新', 0, '赠送', ['台灯', '宿舍神器'], 'B 栋', 'on_shelf', 'B 栋 · 1 楼'],
    ['🎧', '头戴式耳机（右耳有点哑）', '左边依旧天籁，右边偶尔罢工，适合只听播客的佛系同学🎵', '数码', '能用就行', 15, '低价转让', ['耳机', '捡漏'], 'A 栋', 'on_shelf', 'A 栋 · 2 楼'],
    ['🧥', '加绒卫衣 L 码', '洗过两次，没起球，冬天扛得住图书馆空调❄️ 换一件同码外套也行', '衣物', '九成新', 25, '交换', ['卫衣', '冬季'], 'C 栋', 'on_shelf', 'C 栋 · 4 楼'],
    ['🏸', '羽毛球拍一对', '拍线刚换过，缺一个能接住我扣杀的搭子🏸 拍子送你，约球也算', '运动', '九成新', 0, '赠送', ['球拍', '约球'], 'D 栋', 'on_shelf', 'D 栋 · 2 楼'],
    ['🪴', '多肉小盆栽', '养了一年没养死，堪称奇迹🌱 毕业带不走，求个不弃养的新主人', '生活', '全新', 0, '赠送', ['绿植', '桌面'], 'B 栋', 'on_shelf', 'B 栋 · 5 楼'],
    ['⌨️', '机械键盘（青轴）', '手感清脆，室友说像在敲算盘，故转让给独居或胆大的同学⌨️', '数码', '九成新', 60, '低价转让', ['键盘', '青轴'], 'E 栋', 'on_shelf', 'E 栋 · 3 楼'],
    ['🧊', '迷你小冰箱', '制冷依旧给力，只是和新室友的冰箱撞了位❄️ 自提优先，楼下车位能停', '生活', '七成新', 120, '低价转让', ['小冰箱', '宿舍'], 'C 栋', 'on_shelf', 'C 栋 · 1 楼'],
    ['📖', '四级词汇书（几乎没翻）', '买时雄心万丈，翻开第一页就睡着了😴 全新，免费送，别让它继续积灰', '书籍', '全新', 0, '赠送', ['四级', '单词书'], 'A 栋', 'granted', 'A 栋 · 3 楼'],
    ['🎒', '帆布托特包', '装得下电脑和午饭，装不下拖延症🎒 肩带结实，换任意小物件', '衣物', '九成新', 0, '交换', ['帆布包', '交换'], 'D 栋', 'off_shelf', 'D 栋 · 4 楼']
  ]
  return raw.map(function (r, i) {
    return {
      _id: 'seed_post_' + (i + 1),
      ownerOpenid: i === 8 ? mine : 'seed_user_' + (i % 4 + 1),
      images: [],
      coverEmoji: r[0],
      title: r[1],
      desc: r[2],
      category: r[3],
      condition: r[4],
      price: r[5],
      dealMode: r[6],
      tags: r[7],
      building: r[8],
      college: '泓江书院',
      location: r[10],
      status: r[9],
      aiMeta: { workflow: 'seed', confidence: 0.9, degraded: false },
      createdAt: t - (i + 1) * 2 * HOUR,
      updatedAt: t - (i + 1) * 2 * HOUR
    }
  })
}

function seedMutual(mine) {
  const t = Date.now()
  const raw = [
    ['明天谁去二食堂，求带个肉包，重谢', '代买', '求带二食堂肉包', '带一个肉包', '二食堂', '重谢', '明天', '普通', 'open', 'A 栋'],
    ['有没有同学借一下螺丝刀，装个书架，十分钟后还', '借用', '借螺丝刀装书架', '借一把螺丝刀', 'A 栋', '当面道谢', '今天', '有点急', 'open', 'A 栋'],
    ['下午有人拼奶茶吗，凑够三杯免配送费', '拼单', '拼奶茶凑免配送', '凑三杯奶茶', '宿舍楼下', 'AA', '今天', '普通', 'open', 'B 栋'],
    ['快递驿站的包裹谁顺路帮我带回来呀，箱子不大', '代取', '顺路代取快递', '代取一个小包裹', '快递驿站', '请你喝瓶水', '今天', '普通', 'taken', 'A 栋'],
    ['周六上午教我剪个 vlog 呗，我请你吃食堂', '技能帮忙', '求教 vlog 剪辑', '教基础剪辑一小时', '图书馆', '请吃食堂', '周六', '普通', 'open', 'C 栋'],
    ['谁有多余的插线板，借一晚上，明早还', '借用', '借插线板一晚', '借一个插线板', 'B 栋', '明早归还', '今天', '有点急', 'done', 'B 栋'],
    ['有没有人一起去校门口拿外卖，我一个人不敢走夜路😭', '其他', '结伴拿外卖', '一起走一趟', '校门口', '陪你聊天', '今晚', '普通', 'open', 'A 栋'],
    ['求一个会修台灯的大佬，接触不良，有偿', '技能帮忙', '求修台灯接触不良', '帮忙看一眼接触不良', 'C 栋', '有偿（面议）', '本周', '普通', 'cancelled', 'C 栋']
  ]
  return raw.map(function (r, i) {
    return {
      _id: 'seed_mutual_' + (i + 1),
      ownerOpenid: i === 5 ? mine : 'seed_user_' + (i % 4 + 1),
      takerOpenid: i === 5 ? mine : (r[8] === 'taken' ? 'seed_user_2' : ''),
      rawText: r[0],
      type: r[1],
      title: r[2],
      demand: r[3],
      timeText: r[6],
      timeStart: util.dateStr(util.addDays(new Date(), i === 0 ? 1 : 0)),
      location: r[4],
      reward: r[5],
      urgency: r[7],
      scope: '本楼栋',
      status: r[8],
      building: r[9],
      college: '泓江书院',
      createdAt: t - (i + 1) * HOUR,
      updatedAt: t - (i + 1) * HOUR
    }
  })
}

function defaultDB() {
  const mine = (getApp() && getApp().getOpenid) ? getApp().getOpenid() : 'demo_guest'
  return {
    users: {},
    posts: seedPosts(mine),
    mutual_tasks: seedMutual(mine),
    upcycle_records: [
      {
        _id: 'seed_up_1', ownerOpenid: mine, item: '空快递纸箱', scene: '收纳',
        schemes: [], doneScheme: 0, finishedAt: Date.now() - 3 * DAY, createdAt: Date.now() - 3 * DAY
      }
    ],
    favorites: [
      { _id: 'seed_fav_1', ownerOpenid: mine, item: '旧 T 恤', scene: '收纳', schemeIndex: 0, schemeName: '抽屉分隔收纳袋', createdAt: Date.now() - DAY }
    ],
    carbon_stats: {
      [mine]: { ownerOpenid: mine, grantedCount: 1, mutualCount: 1, upcycleCount: 1, carbonKg: 3.2 }
    },
    reports: []
  }
}

function read() {
  try {
    const d = wx.getStorageSync(KEY)
    if (d && d.posts && d.mutual_tasks) return d
  } catch (err) {
    // 存储异常时返回内存态，不阻断流程
  }
  return defaultDB()
}

function write(d) {
  try {
    wx.setStorageSync(KEY, d)
  } catch (err) {
    wx.showToast({ title: '本地空间不足', icon: 'none' })
  }
  return d
}

function ensureSeed() {
  try {
    const d = wx.getStorageSync(KEY)
    if (!d || !d.posts) write(defaultDB())
  } catch (err) {
    write(defaultDB())
  }
}

function update(fn) {
  const db = read()
  const result = fn(db)
  write(db)
  return result
}

module.exports = { KEY, read, write, ensureSeed, update, defaultDB }
