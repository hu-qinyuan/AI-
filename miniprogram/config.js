// AI宿造局 · 运行配置（所有需要你填写的信息都集中在这一份文件里）
// ------------------------------------------------------------------
// 微信云开发不需要单独下载客户端：能力内置在微信开发者工具与小程序基础库中。
// 拿到「云环境 ID」后，把 CLOUD.env 填进来、CLOUD.enabled 改为 true，
// 小程序会自动从「本地演示模式」切换到「微信云开发模式」。

const CLOUD = {
  enabled: true,
  env: 'cloud1-d6get99l6f8cb27d7', // AppID wx4123c75f472af62d 的云开发环境
  traceUser: true
}

const AI = {
  // 真实识图 / 文本模型由云函数环境变量直连，前端不保存任何令牌
  // 配置项见 miniprogram/README.md「AI 接口接入指南」
  timeoutMs: 15000,
  maxRetry: 2,
  imageMaxKB: 700, // 传给视觉模型的 base64 上限，超出则改用云存储临时链接
  statusLabels: {
    model: '真实模型',
    workflow: '外部工作流',
    local: '本地规则引擎',
    none: '工作流未接入'
  }
}

// 互助广场的示例输入，点一下就能看到时间/地点/需求怎么被拆开
const MUTUAL_SAMPLES = [
  '明天谁去二食堂，求带个肉包，重谢',
  '本周五晚上7点前有没有人帮我带份一饭的炒饭，请喝可乐',
  '下周三下午五点前谁从快递驿站帮我拿两个箱子到A栋楼下，急！请喝奶茶',
  '后天中午12点前借我一下螺丝刀，A栋312',
  '现在马上帮我取个快递，很急',
  '有人会修台灯吗'
]

const CAMPUS = {
  college: '泓江书院',
  buildings: ['A 栋', 'B 栋', 'C 栋', 'D 栋', 'E 栋'],
  places: ['一食堂', '二食堂', '快递驿站', '图书馆', '教学楼', '宿舍楼下', '校门口', '其他地方'],
  categories: ['数码', '书籍', '衣物', '生活', '运动', '其他'],
  conditions: ['全新', '九成新', '七成新', '能用就行'],
  dealModes: ['赠送', '低价转让', '交换'],
  mutualTypes: ['代买', '借用', '拼单', '代取', '技能帮忙', '其他'],
  urgencies: ['普通', '有点急', '很急'],
  scopes: ['本楼栋', '本书院']
}

// 碳减排折算口径（文书 4.4）：估算值，仅用于激励展示
const CARBON = {
  granted: 2.0,
  upcycle: 1.0,
  mutual: 0.2,
  levels: [
    { max: 10, name: '纸箱萌新', emoji: '🌱' },
    { max: 30, name: '流转小能手', emoji: '🍀' },
    { max: 60, name: '低碳达人', emoji: '🌳' },
    { max: Infinity, name: '书院守护者', emoji: '🏆' }
  ]
}

const STYLES = [
  { key: 'funny', name: '搞笑沙雕', emoji: '🤪', hint: '梗多、emoji 密度≥4' },
  { key: 'nostalgia', name: '毕业伤感', emoji: '🎓', hint: '温柔回忆、emoji 1~2 个' },
  { key: 'minimal', name: '极简断舍离', emoji: '🧊', hint: '短句、几乎不用 emoji' }
]

module.exports = { CLOUD, AI, CAMPUS, CARBON, STYLES, MUTUAL_SAMPLES }
