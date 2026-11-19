// AI宿造局 · 云函数共享运行时 v2（AI 网关版）
// 变更：新增「真实视觉/文本大模型直连」通道，保留 Coze / WorkBuddy 工作流通道，
//       并提供 aiStatus() 接入状态探针，让前端能明确显示「工作流未接入」及原因。
// 通道优先级：OpenAI 兼容模型直连 > 外部工作流 URL > 前端本地规则引擎兜底
const cloud = require('wx-server-sdk')
const https = require('https')
const fs = require('fs')
const path = require('path')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function ok(data) { return { code: 0, data: data, msg: 'ok' } }
function fail(msg, code) { return { code: code || 1, data: null, msg: msg || '操作失败' } }
function ctxOpenid() { return cloud.getWXContext().OPENID || '' }
function now() { return Date.now() }
function trim(s, n) { const t = String(s || ''); return t.length > n ? t.slice(0, n) : t }

// 配置来源优先级：云函数环境变量 > 随函数包部署的 ai.secret.json
// ai.secret.json 由 tools/sync-ai-env.js 生成，cloudfunctions 目录已在
// project.config.json 的 packOptions.ignore 中排除，不会进入小程序前端包。
let secretCache = null
function secretEnv() {
  if (secretCache) return secretCache
  secretCache = {}
  try {
    const p = path.join(__dirname, 'ai.secret.json')
    if (fs.existsSync(p)) secretCache = JSON.parse(fs.readFileSync(p, 'utf8')) || {}
  } catch (err) { secretCache = {} }
  return secretCache
}
function env(k) {
  const v = String(process.env[k] || '').trim()
  if (v) return v
  const s = secretEnv()[k]
  return s === undefined || s === null ? '' : String(s).trim()
}
function keySource() {
  if (String(process.env.AI_API_KEY || '').trim()) return '云函数环境变量'
  if (secretEnv().AI_API_KEY) return 'ai.secret.json（随函数包部署）'
  return '未配置'
}

// 写操作频率限制：同一用户 N 分钟内最多 limit 条（文书 7.4）
async function freqGuard(collection, minutes, limit) {
  const q = { ownerOpenid: ctxOpenid(), createdAt: _.gt(now() - minutes * 60000) }
  const r = await db.collection(collection).where(q).count()
  return r.total >= limit
}

function postJson(url, body, token, timeoutMs) {
  return new Promise(function (resolve, reject) {
    let u
    try { u = new URL(url) } catch (err) { reject(new Error('接口地址不合法')); return }
    const payload = JSON.stringify(body)
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    if (token) headers.Authorization = 'Bearer ' + token
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: headers
    }, function (res) {
      let raw = ''
      res.on('data', function (c) { raw += c })
      res.on('end', function () {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(raw)
        else reject(new Error('接口 HTTP ' + res.statusCode + ' ' + raw.slice(0, 600)))
      })
    })
    req.setTimeout(timeoutMs || 15000, function () { req.destroy(new Error('接口超时')) })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

// 兼容 Coze / WorkBuddy 常见返回：纯 JSON、{data:"{...}"}、包裹解释文字
function extractJson(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  const s = String(raw).trim()
  try {
    const o = JSON.parse(s)
    if (o && typeof o.data === 'string') {
      try { return JSON.parse(o.data) } catch (err) { return o.data }
    }
    if (o && o.data && typeof o.data === 'object') return o.data
    return o
  } catch (err) {
    const m = s.match(/\{[\s\S]*\}/)
    if (m) {
      try { return JSON.parse(m[0]) } catch (err2) { return m[0] }
    }
    return s
  }
}

/* ==================================================================
 * 一、AI 通道配置
 * 全部走云函数环境变量，密钥绝不落前端、绝不写进代码。
 * ================================================================== */
const AI_PRESETS = {
  // 腾讯云 TokenHub（广州）：一个 Key 通吃视觉 + 文本，已用真实 Key 验证
  // 关闭 thinking 后 hy4-flash 不再产生 reasoning_tokens，WF-C 从 27s/4000tok 降到 5s/780tok
  tokenhub: {
    name: '腾讯云 TokenHub', base: 'https://tokenhub.tencentmaas.com/v1',
    vision: 'hy-vision-2.0-instruct', text: 'hy4-flash',
    thinking: { type: 'disabled' },
    maxTokens: { vision: 2200, text: 1600, upcycle: 3000 },
    // 同步语音识别（官方文档：/v1/wand/asrproxy/sync_transcribe，body 支持 data: base64）
    asr: 'hy-asr-3.0-preview',
    asrBase: 'https://tokenhub.tencentmaas.com',
    asrPath: '/v1/wand/asrproxy/sync_transcribe'
  },
  hunyuan: { name: '腾讯混元', base: 'https://api.hunyuan.cloud.tencent.com/v1', vision: 'hunyuan-vision', text: 'hunyuan-turbos-latest' },
  zhipu: { name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', vision: 'glm-4.6v-flash', text: 'glm-4-flash' },
  qwen: { name: '通义千问', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', vision: 'qwen-vl-max', text: 'qwen-plus' },
  siliconflow: { name: '硅基流动', base: 'https://api.siliconflow.cn/v1', vision: 'Qwen/Qwen2.5-VL-32B-Instruct', text: 'Qwen/Qwen2.5-7B-Instruct' },
  moonshot: { name: '月之暗面', base: 'https://api.moonshot.cn/v1', vision: 'moonshot-v1-8k-vision-preview', text: 'moonshot-v1-8k' },
  deepseek: { name: 'DeepSeek（纯文本，需另配视觉）', base: 'https://api.deepseek.com/v1', vision: '', text: 'deepseek-chat' },
  openai: { name: 'OpenAI', base: 'https://api.openai.com/v1', vision: 'gpt-4o-mini', text: 'gpt-4o-mini' },
  custom: { name: '自定义 OpenAI 兼容服务', base: '', vision: '', text: '' }
}

function aiConfig() {
  const providerKey = env('AI_PROVIDER') || 'tokenhub'
  const preset = AI_PRESETS[providerKey] || AI_PRESETS.custom
  const base = env('AI_BASE_URL') || preset.base
  const key = env('AI_API_KEY')
  const textModel = env('AI_TEXT_MODEL') || preset.text
  const visionModel = env('AI_VISION_MODEL') || preset.vision
  // 允许「文本用 A 家、视觉用 B 家」，例如 DeepSeek + 智谱免费视觉模型
  const visionBase = env('AI_VISION_BASE_URL') || base
  const visionKey = env('AI_VISION_API_KEY') || key
  // 语音识别：TokenHub 专用同步 ASR 端点；其他厂商可用 AI_ASR_URL + AI_ASR_MODEL 自行指向兼容服务
  const asrUrl = env('AI_ASR_URL') || (preset.asrBase && preset.asrPath ? preset.asrBase + preset.asrPath : '')
  const asrKey = env('AI_ASR_API_KEY') || key
  const asrModel = env('AI_ASR_MODEL') || preset.asr || ''
  // 深度思考开关：TokenHub / 混元 / DeepSeek 用 thinking:{type:'disabled'} 可省下大量推理 token
  const th = env('AI_THINKING')
  let thinking = preset.thinking || null
  if (th === 'disabled') thinking = { type: 'disabled' }
  else if (th === 'enabled') thinking = { type: 'enabled' }
  else if (th === 'off' || th === 'none') thinking = null
  const defaults = { vision: 2200, text: 1600, upcycle: 3000 }
  const mt = preset.maxTokens || defaults
  return {
    provider: providerKey,
    providerName: preset.name,
    keySource: keySource(),
    text: { base: base, key: key, model: textModel, configured: !!(base && key && textModel) },
    vision: { base: visionBase, key: visionKey, model: visionModel, configured: !!(visionBase && visionKey && visionModel) },
    asr: { url: asrUrl, key: asrKey, model: asrModel, configured: !!(asrUrl && asrKey && asrModel) },
    thinking: thinking,
    maxTokens: {
      vision: Number(env('AI_MAX_TOKENS_VISION')) || mt.vision || defaults.vision,
      text: Number(env('AI_MAX_TOKENS_TEXT')) || mt.text || defaults.text,
      upcycle: Number(env('AI_MAX_TOKENS_UPCYCLE')) || mt.upcycle || defaults.upcycle
    },
    workflows: { WF_A: env('WF_A_URL'), WF_B: env('WF_B_URL'), WF_C: env('WF_C_URL') },
    wfToken: env('COZE_TOKEN') || env('WF_TOKEN'),
    timeoutMs: Number(env('AI_TIMEOUT_MS')) || 25000
  }
}

// 接入状态探针：只返回「是否已配置」与模型名，绝不返回密钥
function aiStatus() {
  const c = aiConfig()
  const defs = [
    { key: 'WF_A', label: 'WF-A 识图 + 文案', vision: true, url: c.workflows.WF_A },
    { key: 'WF_B', label: 'WF-B 互助卡片', vision: false, url: c.workflows.WF_B },
    { key: 'WF_C', label: 'WF-C 改造方案', vision: false, url: c.workflows.WF_C }
  ]
  const channels = {}
  defs.forEach(function (d) {
    const m = d.vision ? c.vision : c.text
    let via = 'none'
    if (m.configured) via = 'model'
    else if (d.url) via = 'workflow'
    channels[d.key] = {
      label: d.label,
      connected: via !== 'none',
      via: via,
      model: m.configured ? m.model : '',
      workflowUrl: !!d.url,
      reason: via === 'none'
        ? (d.vision
          ? '缺 AI_API_KEY（或 WF_A_URL 工作流地址、AI_VISION_MODEL 视觉模型）'
          : '缺 AI_API_KEY（或 ' + d.key + '_URL 工作流地址、AI_TEXT_MODEL 文本模型）')
        : ''
    }
  })
  const keys = Object.keys(channels)
  const connectedCount = keys.filter(function (k) { return channels[k].connected }).length
  return {
    provider: c.provider,
    providerName: c.providerName,
    allConnected: connectedCount === keys.length,
    connectedCount: connectedCount,
    total: keys.length,
    channels: channels,
    textModel: c.text.configured ? c.text.model : '',
    visionModel: c.vision.configured ? c.vision.model : '',
    asrConfigured: c.asr.configured,
    asrModel: c.asr.configured ? c.asr.model : '',
    keySource: c.keySource,
    baseUrl: c.text.base || c.vision.base || '',
    thinkingOff: !!(c.thinking && c.thinking.type === 'disabled'),
    hint: connectedCount === keys.length
      ? (c.text.configured
        ? 'AI 模型已接入：' + c.providerName + ' · 视觉 ' + (c.vision.configured ? c.vision.model : '未配置') + ' / 文本 ' + c.text.model + '，正在真实识图与生成（密钥来自' + c.keySource + '）。'
        : 'AI 工作流已接入，正在调用外部工作流。')
      : '工作流未接入：请为 aiPost / aiMutual / aiUpcycle 配置 AI_PROVIDER + AI_API_KEY（或 WF_A_URL / WF_B_URL / WF_C_URL），当前使用本地规则引擎兜底。'
  }
}

/* ==================================================================
 * 二、模型调用（OpenAI 兼容 /chat/completions）
 * ================================================================== */
async function callChat(endpoint, messages, timeoutMs, opts) {
  const o = opts || {}
  const c = aiConfig()
  const url = String(endpoint.base).replace(/\/+$/, '') + '/chat/completions'
  const kind = o.kind || 'text'
  const maxTokens = Number(o.maxTokens) || c.maxTokens[kind] || 2000
  const temperature = o.temperature === undefined ? 0.8 : Number(o.temperature)

  async function once(limit) {
    const body = {
      model: endpoint.model, messages: messages,
      temperature: temperature, max_tokens: limit, stream: false
    }
    // TokenHub / 混元 / DeepSeek 的推理模型：关掉深度思考可省下大量 reasoning_tokens
    if (c.thinking && c.thinking.type) body.thinking = c.thinking
    // 部分厂商不支持 response_format，默认关闭；需要时设 AI_JSON_MODE=1
    if (env('AI_JSON_MODE') === '1') body.response_format = { type: 'json_object' }
    const raw = await postJson(url, body, endpoint.key, timeoutMs || c.timeoutMs)
    let outer
    try { outer = JSON.parse(raw) } catch (err) { throw new Error('模型返回不是 JSON') }
    if (outer && outer.error) throw new Error('模型报错：' + String(outer.error.message || outer.error.code || ''))
    const choice = outer && outer.choices && outer.choices[0]
    const content = choice && choice.message && choice.message.content
    const finish = choice && choice.finish_reason
    if (!content || finish === 'length') {
      throw new Error('模型输出被截断或内容为空（max_tokens=' + limit + '，finish=' + (finish || 'empty') + '）')
    }
    const parsed = extractJson(typeof content === 'string' ? content : JSON.stringify(content))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('模型未返回合法 JSON 对象')
    return { ok: true, data: parsed, model: endpoint.model, via: 'model', usage: outer.usage || null, maxTokens: limit }
  }

  try {
    return await once(maxTokens)
  } catch (first) {
    const firstMsg = (first && first.message) || '模型调用失败'
    // 只在「输出被截断 / JSON 不合法」时放大上限重试一次；网络超时等错误不重复扣额度
    if (!/截断|内容为空|JSON/.test(firstMsg)) return { ok: false, reason: firstMsg }
    const retry = Math.min(Math.round(maxTokens * 1.8), 6000)
    if (retry <= maxTokens) return { ok: false, reason: firstMsg }
    try {
      return await once(retry)
    } catch (second) {
      return { ok: false, reason: firstMsg + '；放大上限后仍失败：' + ((second && second.message) || '未知原因') }
    }
  }
}

// 把 cloud:// fileID 换成公网临时链接；base64 直接包成 data URI
async function resolveImage(event) {
  const b64 = String(event.image_base64 || '').replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '')
  if (b64) return 'data:image/jpeg;base64,' + b64
  const u = String(event.image_url || '')
  if (u.indexOf('cloud://') === 0) {
    try {
      const r = await cloud.getTempFileURL({ fileList: [u] })
      const f = r && r.fileList && r.fileList[0]
      if (f && f.tempFileURL) return f.tempFileURL
    } catch (err) { /* 交给调用方降级 */ }
    return ''
  }
  return u
}

async function callVisionModel(imageUri, system, user, opts) {
  const c = aiConfig()
  if (!c.vision.configured) return { ok: false, reason: '视觉模型未配置（' + c.providerName + '）' }
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: imageUri } }] }
  ]
  return callChat(c.vision, messages, c.timeoutMs, Object.assign({ kind: 'vision' }, opts || {}))
}

async function callTextModel(system, user, opts) {
  const c = aiConfig()
  if (!c.text.configured) return { ok: false, reason: '文本模型未配置（' + c.providerName + '）' }
  return callChat(c.text, [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], c.timeoutMs, Object.assign({ kind: 'text' }, opts || {}))
}

// 15 秒超时 + 最多 2 次重试；失败由前端走本地兜底（文书 5.6）
async function callWorkflow(envKey, payload) {
  const url = env(envKey) || ''
  const token = env('COZE_TOKEN') || env('WF_TOKEN') || ''
  if (!url) return { ok: false, reason: '未配置工作流 ' + envKey }
  let last = '未知错误'
  for (let i = 0; i < 2; i++) {
    try {
      const raw = await postJson(url, payload, token, 15000)
      return { ok: true, data: extractJson(raw), via: 'workflow' }
    } catch (err) {
      last = (err && err.message) || '工作流调用失败'
    }
  }
  return { ok: false, reason: last }
}

/* ==================================================================
 * 三、内置 Prompt（文书 5.2 / 5.3 / 5.4 契约）
 * ================================================================== */
const POST_SYSTEM = [
  '你是「AI宿造局」的校园闲置流转助手，服务泓江书院的住宿学生。',
  '你会看到一张用户拍的闲置物品照片。请先真实地看图识别物品，再为它写一条二手流转文案。',
  '硬性要求：只输出一个 JSON 对象，不要 markdown 代码块、不要任何解释文字。',
  '严禁编造：物品名、成色、品牌、价格必须基于图中可见特征；看不出来就给最保守的值并降低 confidence。',
  '严禁出现：价格承诺（如「包邮」「保证最低价」）、品牌贬损、虚假成色、与图片无关的物品。'
].join('\n')

const STYLE_RULES = {
  funny: '搞笑沙雕：网络梗、拟人化、语气夸张，Emoji 密度≥4，读起来像段子，允许自嘲',
  nostalgia: '毕业伤感：第一人称温柔回忆，有具体画面，Emoji 1~2 个，结尾带一点祝福',
  minimal: '极简断舍离：短句、信息密度高、不煽情，Emoji 0~1 个，像一张干净的物品说明卡'
}

function buildPostPrompt(event) {
  const style = String(event.style || 'minimal')
  const hint = String(event.user_hint || '').slice(0, 60)
  const styleRule = STYLE_RULES[style] || STYLE_RULES.minimal
  const user = [
    '请识别照片中的物品，并按下面风格写文案。',
    '',
    '【文案风格】' + style + ' → ' + styleRule,
    '【用户补充】' + (hint || '（无）'),
    '【使用场景】学生宿舍，校内当面交付，流转半径为本楼栋/本书院。',
    '',
    '只输出这个 JSON（字段名不可改、不可增减）：',
    '{',
    '  "item_name": "照片里最主要的物品名，2~10 字，必须是你从图中看到的",',
    '  "item_features": ["图中可见特征，如 白色 / 有划痕 / 带包装 / 折叠款，最多 3 条"],',
    '  "candidates": [{"name":"候选物品1","confidence":0.9},{"name":"候选物品2","confidence":0.4}],',
    '  "title": "≤20 字标题",',
    '  "desc": "≤200 字正文，符合上面风格",',
    '  "category": "数码|书籍|衣物|生活|运动|其他 之一",',
    '  "condition": "全新|九成新|七成新|能用就行 之一，看不出磨损就用 能用就行",',
    '  "price_suggestion": 0,',
    '  "deal_mode": "赠送|低价转让|交换 之一",',
    '  "tags": ["≤5 个关键词"],',
    '  "confidence": 0.0,',
    '  "need_manual": false',
    '}',
    '',
    '规则：',
    '1. confidence 是你对「物品识别正确」的把握（0~1）；低于 0.6 时把 need_manual 设为 true。',
    '2. candidates 给出 2~3 个可能的物品，按把握从高到低排，name 用简短中文。',
    '3. 三种风格必须明显不同，不要套同一套句式；同一物品多写几次也应换表达。',
    '4. price_suggestion 为整数（元），0 表示免费赠送；不要写价格承诺。',
    '',
    '参考示例（图中是一只白色小台灯，风格 minimal）：',
    '{"item_name":"小台灯","item_features":["白色","灯罩略发黄"],"candidates":[{"name":"小台灯","confidence":0.93},{"name":"阅读灯","confidence":0.3}],"title":"白色小台灯，自取","desc":"功能正常，灯罩有点岁月痕迹。宿舍桌面用刚好，校内当面拿。","category":"生活","condition":"七成新","price_suggestion":0,"deal_mode":"赠送","tags":["台灯","桌面","自提"],"confidence":0.93,"need_manual":false}'
  ].join('\n')
  return { system: POST_SYSTEM, user: user }
}

const MUTUAL_SYSTEM = [
  '你是「AI宿造局」的校园互助信息抽取器。把学生一句口语化的求助，拆成结构化互助卡片。',
  '硬性要求：只输出一个 JSON 对象，不要 markdown、不要解释文字。',
  '红线：禁止编造。任何无法从原文确定的字段填 null，并把字段名加入 missing_fields。',
  '相对时间（今天/明天/后天/周X/下周X/X月X日）必须基于给定 now 换算成 YYYY-MM-DD。'
].join('\n')

function buildMutualPrompt(event) {
  const raw = String(event.raw_text || event.rawText || '').slice(0, 100)
  const today = String(event.today || '')
  const weekday = String(event.weekday || '')
  const nowText = String(event.now || '')
  const user = [
    '【当前基准时间】北京时间 ' + (nowText || '（未提供）') + '，今天是 ' + (today || '未知') + ' ' + (weekday || ''),
    '【用户原话】' + raw,
    '',
    '只输出这个 JSON：',
    '{',
    '  "type": "代买|借用|拼单|代取|技能帮忙|其他 之一",',
    '  "title": "≤20 字，口语化，含关键地点/物品",',
    '  "time_text": "原文里的时间说法，没有则 null",',
    '  "time_start": "YYYY-MM-DD 或 null",',
    '  "time_slot": "时段，如 早上 / 中午 / 晚上7点 / 下课前，没有则 null",',
    '  "time_label": "给卡片展示用的完整时间，如 明天(11-19) 晚上7点",',
    '  "location": "主地点，如 二食堂 / A栋 / 快递驿站 / 图书馆",',
    '  "from_place": "起点（有「从X到Y」时才填），否则 null",',
    '  "to_place": "终点（有「从X到Y」时才填），否则 null",',
    '  "location_detail": "门牌/楼层等补充，没有则 null",',
    '  "demand": "只保留核心动作与对象（如 带一个肉包），去掉时间、地点、酬劳、寒暄",',
    '  "reward": "酬劳说法，没有则 null",',
    '  "urgency": "普通|有点急|很急 之一",',
    '  "scope": "本楼栋",',
    '  "missing_fields": ["location","time_start","demand 中确实缺的项"],',
    '  "detected": {"date":"命中的日期词","slot":"命中的时段词","place":"命中的地点词"}',
    '}',
    '',
    '地点归一化：一饭→一食堂，二饭→二食堂，菜鸟/驿站→快递驿站，图图/馆里→图书馆，楼下→宿舍楼下，三号楼/3栋→C 栋。',
    '紧急度：出现「急/马上/立刻/赶紧/在线等」= 很急或有点急；否则普通。',
    'scope 固定填「本楼栋」。',
    '',
    '示例 1：',
    '输入：明天谁去二食堂，求带个肉包，重谢 ｜ today=2026-11-18',
    '输出：{"type":"代买","title":"求带二食堂肉包","time_text":"明天","time_start":"2026-11-19","time_slot":null,"time_label":"明天(11-19)","location":"二食堂","from_place":null,"to_place":null,"location_detail":null,"demand":"带一个肉包","reward":"重谢","urgency":"普通","scope":"本楼栋","missing_fields":[],"detected":{"date":"明天","slot":null,"place":"二食堂"}}',
    '示例 2：',
    '输入：下周三下午五点前谁从快递驿站帮我拿两个箱子到A栋楼下，急！请喝奶茶 ｜ today=2026-11-18(周三)',
    '输出：{"type":"代取","title":"求代取驿站快递到A栋","time_text":"下周三","time_start":"2026-11-25","time_slot":"下午5点前","time_label":"下周三(11-25) 下午5点前","location":"快递驿站","from_place":"快递驿站","to_place":"A 栋宿舍楼下","location_detail":"楼下","demand":"取两个箱子","reward":"请喝奶茶","urgency":"很急","scope":"本楼栋","missing_fields":[],"detected":{"date":"下周三","slot":"下午五点前","place":"快递驿站、A栋楼下"}}',
    '示例 3：',
    '输入：有人会修台灯吗',
    '输出：{"type":"技能帮忙","title":"求帮忙修台灯","time_text":null,"time_start":null,"time_slot":null,"time_label":null,"location":null,"from_place":null,"to_place":null,"location_detail":null,"demand":"修台灯","reward":null,"urgency":"普通","scope":"本楼栋","missing_fields":["location","time_start"],"detected":{"date":null,"slot":null,"place":null}}'
  ].join('\n')
  return { system: MUTUAL_SYSTEM, user: user }
}

/* ------------------------------------------------------------------
 * WF-S 语音互助：微信同声传译插件的 ASR 文本 → 轻量纠错 → 结构化卡片
 * 插件在小程序端做录音识别，云函数负责把「没标点 / 同音错字 / 口头禅」
 * 的口语整理成通顺文本，再按与 WF-B 完全相同的契约输出互助卡。
 * ------------------------------------------------------------------ */
const SPEECH_SYSTEM = [
  '你是「AI宿造局」的语音互助助手。输入是「微信同声传译」插件（ASR）识别出的中文口语，你要先做轻量纠错，再拆成结构化互助卡片。',
  'ASR 常见噪声：没有标点、同音错字（十堂/食堂、快弟/快递、二喽/二楼、台灯/台登、螺蛳/螺丝）、口头禅（嗯、啊、那个、就是、然后）、重复词。',
  '纠错规则：只修明显的同音错字与口头禅并补上标点；不新增原文没有的信息；不确定的词保持原样。cleaned_text 必须能对应回原话。',
  '抽取规则与 WF-B 一致：相对时间基于给定 now 换算成 YYYY-MM-DD；地点别名归一化；demand 只保留核心动作。',
  '硬性要求：只输出一个 JSON 对象，不要 markdown、不要解释文字。',
  '红线：禁止编造。任何无法从原文确定的字段填 null，并把字段名加入 missing_fields。'
].join('\n')

function buildSpeechPrompt(event) {
  const raw = String(event.raw_text || event.rawText || '').slice(0, 100)
  const base = buildMutualPrompt(Object.assign({}, event, { raw_text: raw }))
  const user = base.user
    .split('【用户原话】' + raw).join('【语音识别原文（可能无标点 / 有同音错字）】' + raw)
    .split('只输出这个 JSON：').join('先做轻量纠错（同音字、口头禅、断句），再按纠错后的话抽取。只输出这个 JSON：')
    .split('{\n  "type":').join('{\n  "cleaned_text": "纠错并加好标点后的通顺原话（≤100 字，不新增信息）",\n  "type":')
  return { system: SPEECH_SYSTEM, user: user }
}

const UPCYCLE_SYSTEM = [
  '你是「AI宿造局」的旧物改造设计师，服务学生宿舍。',
  '硬性要求：只输出一个 JSON 对象，不要 markdown、不要解释文字。',
  '材料必须是宿舍现有或零成本可得；禁止电钻、热熔胶枪、明火、专业工具。涉及剪刀/刀具必须写安全提示。'
].join('\n')

function buildUpcyclePrompt(event) {
  const item = String(event.item || '旧物').slice(0, 20)
  const scene = String(event.scene || '收纳')
  const user = [
    '【旧物】' + item + '　【场景】' + scene,
    '给出恰好 3 套思路不重复的改造方案（例如 收纳类 / 装饰类 / 实用类各一）。',
    '',
    '只输出这个 JSON：',
    '{"item":"' + item + '","schemes":[{"name":"≤12 字方案名","difficulty":"简单|中等|有点挑战","minutes":25,"materials":["材料"],"steps":["4~8 步，每步一句"],"effect_image":"","green_note":"一句话减碳意义"}]}',
    '',
    'schemes 必须恰好 3 项；steps 里凡涉及剪刀/刀具，最后一步必须写安全提示。'
  ].join('\n')
  return { system: UPCYCLE_SYSTEM, user: user }
}

/* ==================================================================
 * 四、原有业务辅助
 * ================================================================== */
async function ensureCarbon(openid) {
  const col = db.collection('carbon_stats')
  const r = await col.where({ ownerOpenid: openid }).get()
  if (r.data && r.data.length) return r.data[0]
  const doc = { ownerOpenid: openid, grantedCount: 0, mutualCount: 0, upcycleCount: 0, carbonKg: 0, createdAt: now() }
  const added = await col.add({ data: doc })
  return Object.assign({ _id: added._id }, doc)
}

const CARBON = { granted: ['grantedCount', 2.0], upcycle: ['upcycleCount', 1.0], mutual: ['mutualCount', 0.2] }

async function addCarbon(openid, type, delta) {
  const conf = CARBON[type]
  if (!conf) return false
  const c = await ensureCarbon(openid)
  const patch = { updatedAt: now() }
  patch[conf[0]] = _.inc(delta)
  patch.carbonKg = _.inc(Math.round(conf[1] * delta * 10) / 10)
  await db.collection('carbon_stats').doc(c._id).update({ data: patch })
  return true
}

function publicPost(p, viewerOpenid) {
  const o = Object.assign({}, p)
  // 隐私红线：对外一律脱敏；只有发布者本人能看到完整取件位置（含房间号）
  if (viewerOpenid && p.ownerOpenid === viewerOpenid) {
    o.ownerLocation = String(p.location || p.building || '')
  }
  delete o.location // 对外不返回房间号
  delete o.room
  return o
}

// 统一异常兜底：任何云函数出错都返回 { code, data, msg }，不抛裸异常
function wrap(fn) {
  return async function (event) {
    try {
      return await fn(event || {})
    } catch (err) {
      return fail((err && err.message) || '云端开小差了', 500)
    }
  }
}

/* ==================================================================
 * 二·B、同步语音识别（TokenHub wand/asrproxy，不依赖小程序插件）
 * 端侧只负责录 mp3 → base64，云端转文字后再交给文本模型纠错
 * 官方文档：https://cloud.tencent.com/document/product/1823/135791
 * ================================================================== */
async function callASR(audioBase64, opts) {
  const o = opts || {}
  const c = aiConfig()
  if (!c.asr.configured) {
    return { ok: false, reason: '语音识别未配置：需要 AI_PROVIDER=tokenhub + AI_API_KEY（或 AI_ASR_URL / AI_ASR_MODEL）' }
  }
  const audio = String(audioBase64 || '').replace(/^data:[^,]+,/, '')
  if (!audio) return { ok: false, reason: '录音文件为空，请重录一次' }
  const body = {
    model: c.asr.model,
    data: audio,
    source: o.source || 'zh',
    voice_encode_format: o.format || 'mp3'
  }
  const quotaHint = '语音识别额度未开通：请在 TokenHub 控制台 → 在线推理服务开启后付费或领取免费额度（也可改用微信同声传译插件）'
  try {
    const raw = await postJson(c.asr.url, body, c.asr.key, c.timeoutMs)
    let j = {}
    try { j = JSON.parse(raw) } catch (err) { return { ok: false, reason: '语音识别返回不是 JSON' } }
    if (j && j.error) {
      const zh = String(j.error.message_zh || j.error.message || '')
      if (String(j.error.code) === '401007' || /额度|quota|postpaid/i.test(zh)) return { ok: false, reason: quotaHint }
      return { ok: false, reason: '语音识别接口报错：' + zh.slice(0, 90) }
    }
    const out = (j && j.output) || {}
    const text = String(out.text || '').trim()
    if (!text) return { ok: false, reason: '没听清，再说一次～' }
    return { ok: true, text: text.slice(0, 200), model: c.asr.model, duration_ms: out.duration_ms || 0 }
  } catch (err) {
    const msg = String((err && err.message) || '语音识别失败')
    const m = msg.match(/^接口 HTTP (\d+)\s+([\s\S]*)$/)
    if (m) {
      let zh = ''
      try { const j = JSON.parse(m[2]); zh = String((j.error && (j.error.message_zh || j.error.message)) || '') } catch (e) { zh = m[2] }
      if (Number(m[1]) === 402 || /额度|quota|postpaid/i.test(zh)) return { ok: false, reason: quotaHint }
      return { ok: false, reason: '语音识别接口 HTTP ' + m[1] + (zh ? '：' + zh.slice(0, 90) : '') }
    }
    return { ok: false, reason: msg }
  }
}

module.exports = {
  cloud, db, _, ok, fail, wrap, ctxOpenid, now, trim, freqGuard,
  callWorkflow, callChat, callVisionModel, callTextModel, callASR, resolveImage,
  aiConfig, aiStatus,
  buildPostPrompt, buildMutualPrompt, buildSpeechPrompt, buildUpcyclePrompt,
  ensureCarbon, addCarbon, publicPost
}
