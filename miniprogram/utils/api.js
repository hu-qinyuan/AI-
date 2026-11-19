// 统一数据访问层：页面只认这一层，不直接碰 wx.cloud / 本地存储
// 云模式 → 云函数（文书第 7 章契约）；云端不可用 → 自动降级本地演示（文书 5.6）
const config = require('../config.js')
const store = require('./store.js')
const aiEngine = require('./ai.js')
const util = require('./util.js')
const profileStore = require('./profile.js')

function ok(data) { return { code: 0, data: data, msg: 'ok' } }
function fail(msg, code) { return { code: code || 1, data: null, msg: msg } }
function app() { return getApp() }
function isCloud() { return app() && app().isCloud() }
function mine() { return app() ? app().getOpenid() : 'demo_guest' }

async function callCloud(name, params) {
  if (!isCloud()) return null
  try {
    const res = await wx.cloud.callFunction({ name: name, data: params || {} })
    const body = res && res.result ? res.result : null
    if (!body || body.code !== 0) throw new Error((body && body.msg) || '云端开小差了')
    return body.data
  } catch (err) {
    app().globalData.mode = 'demo'
    wx.showToast({ title: '云端未连通，已切到本地演示', icon: 'none' })
    return null
  }
}

/* ---------- AI：WF-A / WF-B / WF-C ---------- */
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

// 每次调用都带上「设备本地日期」，避免 UTC 时间导致相对日期归一化错一天
function aiContext() {
  const d = new Date()
  return {
    now: d.toISOString(),
    today: util.dateStr(d),
    weekday: '周' + WEEK_CN[d.getDay()]
  }
}

// WF-S 额外带回「纠错后的通顺原话」，供页面确认语音识别结果
function withSpeech(kind, checked, raw) {
  if (kind !== 'speech' || !checked) return checked
  checked.cleaned_text = util.truncate(String((raw && raw.cleaned_text) || ''), 100)
  checked._speech = true
  return checked
}

async function runAI(kind, input) {
  const fnMap = { post: 'aiPost', mutual: 'aiMutual', upcycle: 'aiUpcycle', speech: 'aiSpeech' }
  const validate = kind === 'post' ? aiEngine.validatePost
    : (kind === 'mutual' || kind === 'speech') ? aiEngine.validateMutual : aiEngine.validateUpcycle
  const payload = Object.assign({}, input, aiContext())
  const localOnly = !!(input && input.local_only)
  let lastError = ''

  // ① 云模式：直连真实模型 / 外部工作流
  if (isCloud() && !localOnly) {
    for (let attempt = 0; attempt < config.AI.maxRetry; attempt++) {
      try {
        const res = await wx.cloud.callFunction({ name: fnMap[kind], data: payload })
        const body = res && res.result ? res.result : null
        if (!body || body.code !== 0) {
          const msg = (body && body.msg) || '工作流返回异常'
          lastError = msg
          // 模型明确报错 / 未接入 / 额度或超时问题时不再重试，避免重复扣模型额度
          if (/AI 接口调用失败|工作流未接入|未配置|额度|超时/.test(msg)) break
          throw new Error(msg)
        }
        const raw = body.data || {}
        const meta = raw._meta || {}
        const checked = withSpeech(kind, validate(aiEngine.safeParse(raw)), raw)
        if (checked) {
          checked._engine = meta.source === 'workflow' ? 'workflow' : 'model'
          return ok({
            result: checked,
            degraded: false,
            source: meta.source || 'model',
            provider: meta.provider || '',
            model: meta.model || '',
            workflow: meta.workflow || fnMap[kind]
          })
        }
        lastError = 'JSON 结构不合法'
      } catch (err) {
        lastError = (err && err.message) || '工作流超时'
        // 云端函数超时（默认 3 秒时会频繁出现）不再重试：模型端可能已经计费
        if (/超时|timeout|time out/i.test(lastError)) break
      }
    }
  }

  // ② 降级：本地规则引擎产出同契约 JSON（不再随机编造物品）
  try {
    const localRaw = await aiEngine.local(kind, payload)
    const checked = withSpeech(kind, validate(aiEngine.safeParse(localRaw)), localRaw)
    if (checked) {
      return ok({
        result: checked,
        degraded: isCloud() && !localOnly,
        source: 'local',
        provider: '本地规则引擎',
        model: '',
        reason: lastError,
        localOnly: localOnly
      })
    }
  } catch (err) {
    // 继续走手填兜底
  }
  return fail('AI 开小差了，你可以自己写～', 2)
}

// ③ 接入状态探针：只调用一次，不消耗模型额度，也不会把整站切到演示模式
async function aiStatus() {
  if (!isCloud()) {
    return ok({
      mode: 'demo', allConnected: false, connectedCount: 0, total: 3,
      channels: {},
      hint: '当前为本地演示模式，未连接云端 AI 工作流。'
    })
  }
  try {
    const res = await wx.cloud.callFunction({ name: 'aiPost', data: { probe: true } })
    const body = res && res.result
    if (body && body.code === 0) return ok(Object.assign({ mode: 'cloud' }, body.data))
  } catch (err) {
    // 云函数未部署新版或网络异常，按未接入处理
  }
  return ok({
    mode: 'cloud', allConnected: false, connectedCount: 0, total: 3,
    channels: {},
    hint: 'AI 未接入或云函数仍是旧版：请运行 tools/deploy-ai.sh 重新部署 aiPost / aiMutual / aiUpcycle，并在云开发控制台把这三个函数的超时调到 30 秒。'
  })
}

// 语音识别：直接调 aiSpeech，保留云端真实错误（额度不足 / 未部署 / 超时）。
// 不走 runAI 的本地降级，避免「没识别出文字」被伪装成一张空互助卡。
async function speechRecognize(input) {
  if (!isCloud()) return fail('语音识别需要云开发模式，请直接打字', 2)
  try {
    const res = await wx.cloud.callFunction({ name: 'aiSpeech', data: Object.assign({}, input, aiContext()) })
    const body = res && res.result
    if (!body) return fail('云函数无响应，请确认 aiSpeech 已部署', 2)
    if (body.code !== 0) return fail(body.msg || '语音识别失败', body.code || 2)
    const raw = body.data || {}
    const meta = raw._meta || {}
    const checked = withSpeech('speech', aiEngine.validateMutual(aiEngine.safeParse(raw)), raw)
    return ok({
      result: checked,
      recognized_text: util.truncate(String(raw.recognized_text || raw.cleaned_text || ''), 100),
      textOnly: !!raw._asr_only || !checked,
      source: meta.source || 'model',
      provider: meta.provider || '',
      model: meta.model || '',
      workflow: meta.workflow || 'WF-S'
    })
  } catch (err) {
    return fail((err && err.message) || '云端未连通', 2)
  }
}

const aiSpeech = (input) => runAI('speech', input)
const aiPost = (input) => runAI('post', input)
const aiMutual = (input) => runAI('mutual', input)
const aiUpcycle = (input) => runAI('upcycle', input)
// 语音走 WF-S：先由云函数对 ASR 文本纠错，再出与打字一致的互助卡

/* ---------- 图片 ---------- */
async function uploadImage(localPath) {
  if (!isCloud()) return ok({ fileID: localPath, local: true })
  try {
    const ext = (localPath.match(/\.(\w+)$/) || ['', 'png'])[1]
    const cloudPath = 'posts/' + mine() + '/' + Date.now() + '.' + ext
    const r = await wx.cloud.uploadFile({ cloudPath: cloudPath, filePath: localPath })
    return ok({ fileID: r.fileID, local: false })
  } catch (err) {
    return ok({ fileID: localPath, local: true, degraded: true })
  }
}

/* ---------- 闲置 posts ---------- */
function decoratePost(p) {
  const o = util.clone(p)
  const first = (p.images && p.images[0]) || ''
  if (first.indexOf('emoji:') === 0) {
    o.imagePath = ''
    o.coverEmoji = first.slice(6) || (p.coverEmoji || '📦')
  } else {
    o.imagePath = first
    o.coverEmoji = p.coverEmoji || '📦'
  }
  o.hasImage = !!o.imagePath
  o.timeText = util.timeAgo(p.createdAt)
  o.priceText = Number(p.price) === 0 ? '免费送' : '¥' + Number(p.price)
  o.statusText = p.status === 'on_shelf' ? '在架' : (p.status === 'granted' ? '已送出' : '已下架')
  o.statusClass = p.status === 'on_shelf' ? '' : (p.status === 'granted' ? 'badge--green' : 'badge--gray')
  o.publicLocation = String(p.building || '泓江书院')
  // 云函数 listFeed 只对发布者本人回传完整取件位置（含房间号）
  o.ownerLocation = String(p.ownerLocation || '')
  o.canTake = p.status === 'on_shelf' && p.ownerOpenid !== mine()
  return o
}

async function listFeed(params) {
  const p = params || {}
  const cloud = await callCloud('listFeed', p)
  if (cloud && Array.isArray(cloud.list)) {
    return ok({ list: cloud.list.map(decoratePost), total: cloud.total || cloud.list.length })
  }
  const db = store.read()
  let list = db.posts.slice()
  if (p.building) list = list.filter((x) => !x.building || x.building === p.building || p.scope === 'college')
  if (p.status) list = list.filter((x) => x.status === p.status)
  if (p.category && p.category !== '全部') list = list.filter((x) => x.category === p.category)
  if (p.keyword) {
    const k = String(p.keyword).toLowerCase()
    list = list.filter((x) => (x.title + x.desc + x.tags.join('')).toLowerCase().indexOf(k) >= 0)
  }
  list.sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
  const total = list.length
  const page = Number(p.page) > 0 ? Number(p.page) : 1
  const size = Number(p.pageSize) > 0 ? Number(p.pageSize) : 20
  list = list.slice((page - 1) * size, page * size).map(decoratePost)
  return ok({ list: list, total: total })
}

async function createPost(form) {
  const f = form || {}
  const missing = []
  if (!f.images || !f.images.length) missing.push('图片')
  if (!f.title) missing.push('标题')
  if (!f.category) missing.push('类别')
  if (!f.location) missing.push('取件位置')
  if (missing.length) return fail('还差：' + missing.join('、'), 400)

  const payload = {
    images: f.images,
    coverEmoji: f.coverEmoji || '📦',
    title: util.truncate(f.title, 20),
    desc: util.truncate(f.desc, 200),
    category: f.category,
    condition: f.condition || '能用就行',
    price: Number(f.price) || 0,
    dealMode: f.dealMode || '赠送',
    tags: (f.tags || []).slice(0, 5),
    building: f.building || config.CAMPUS.buildings[0],
    college: config.CAMPUS.college,
    location: f.location,
    room: f.room || profileStore.read().room,
    status: 'on_shelf',
    aiMeta: f.aiMeta || { workflow: 'manual', confidence: 1, degraded: false }
  }

  const cloud = await callCloud('createPost', payload)
  if (cloud && cloud.postId) return ok({ postId: cloud.postId })

  const id = store.update((db) => {
    const postId = util.uid('post')
    db.posts.unshift(Object.assign({ _id: postId, ownerOpenid: mine(), createdAt: Date.now(), updatedAt: Date.now() }, payload))
    return postId
  })
  return ok({ postId: id })
}

async function updatePostStatus(postId, status) {
  const cloud = await callCloud('updatePostStatus', { postId: postId, status: status })
  if (cloud) return ok(cloud)
  const found = store.update((db) => {
    const p = db.posts.find((x) => x._id === postId)
    if (!p) return false
    p.status = status
    p.updatedAt = Date.now()
    if (status === 'granted') recordCarbonLocal('granted', 1)
    return true
  })
  return found ? ok({ status: status }) : fail('没有找到这条发布', 404)
}

/* ---------- 互助 mutual_tasks ---------- */
function decorateMutual(m) {
  const o = util.clone(m)
  // 发布时间与「约定时间」分开，避免把「明天」显示成「3 分钟前」
  o.createdText = util.timeAgo(m.createdAt)
  o.timeText = m.timeText || ''
  o.timeLabel = m.timeLabel || m.timeStart || ''
  o.fromPlace = m.fromPlace || ''
  o.toPlace = m.toPlace || ''
  o.statusText = m.status === 'open' ? '待接单' : (m.status === 'taken' ? '已接单' : (m.status === 'done' ? '已完成' : '已取消'))
  o.statusClass = m.status === 'open' ? '' : (m.status === 'taken' ? 'badge--blue' : (m.status === 'done' ? 'badge--green' : 'badge--gray'))
  o.isMine = m.ownerOpenid === mine()
  o.isTaker = m.takerOpenid === mine()
  o.canTake = m.status === 'open' && !o.isMine
  o.canFinish = m.status === 'taken' && (o.isMine || o.isTaker)
  o.canCancel = (m.status === 'open' && o.isMine) || (m.status === 'taken' && (o.isMine || o.isTaker))
  o.expired = m.timeStart ? (new Date(m.timeStart).getTime() + 26 * 3600000 < Date.now()) : false
  return o
}

async function listMutual(params) {
  const p = params || {}
  const cloud = await callCloud('listMutual', p)
  if (cloud && Array.isArray(cloud.list)) {
    return ok({ list: cloud.list.map(decorateMutual), total: cloud.total || cloud.list.length })
  }
  const db = store.read()
  let list = db.mutual_tasks.slice()
  if (p.scope === '本楼栋') {
    const myBuilding = (app().globalData.profile || {}).building
    list = list.filter((x) => x.building === myBuilding || x.scope === '本书院')
  }
  if (p.status) list = list.filter((x) => x.status === p.status)
  list.sort((a, b) => {
    const aw = a.status === 'open' ? 1 : 0
    const bw = b.status === 'open' ? 1 : 0
    if (aw !== bw) return bw - aw
    return Number(b.createdAt) - Number(a.createdAt)
  })
  return ok({ list: list.map(decorateMutual), total: list.length })
}

async function createMutual(form) {
  const f = form || {}
  if (!f.title) return fail('互助卡还缺一个标题', 400)
  if (!f.demand) return fail('说说具体需要什么吧', 400)

  // 文书 AC3：24 小时内重复发布相似需求给出提示
  const db = store.read()
  const since = Date.now() - 86400000
  const dup = db.mutual_tasks.some((x) => {
    if (x.ownerOpenid !== mine() || Number(x.createdAt) < since || x.status === 'cancelled') return false
    const a = String(x.rawText || x.demand || '')
    const b = String(f.rawText || f.demand || '')
    return a && b && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0 || (a.length > 6 && a.slice(0, 6) === b.slice(0, 6)))
  })
  if (dup) return fail('你 24 小时内发布过类似需求啦，先去广场看看吧', 409)

  const payload = {
    rawText: util.truncate(f.rawText || f.demand, 100),
    type: f.type || '其他',
    title: util.truncate(f.title, 20),
    demand: f.demand,
    timeText: f.timeText || '',
    timeStart: f.timeStart || '',
    timeSlot: f.timeSlot || '',
    timeLabel: f.timeLabel || '',
    location: f.location || '',
    fromPlace: f.fromPlace || '',
    toPlace: f.toPlace || '',
    locationDetail: f.locationDetail || '',
    detected: f.detected || {},
    confidence: Number(f.confidence) || 0,
    reward: f.reward || '',
    urgency: f.urgency || '普通',
    scope: f.scope || '本楼栋',
    building: f.building || (app().globalData.profile || {}).building || config.CAMPUS.buildings[0],
    room: f.room || profileStore.read().room,
    college: config.CAMPUS.college,
    status: 'open'
  }
  const cloud = await callCloud('createMutual', payload)
  if (cloud && cloud.taskId) return ok({ taskId: cloud.taskId })

  const id = store.update((d) => {
    const taskId = util.uid('mutual')
    d.mutual_tasks.unshift(Object.assign({ _id: taskId, ownerOpenid: mine(), takerOpenid: '', createdAt: Date.now(), updatedAt: Date.now() }, payload))
    return taskId
  })
  return ok({ taskId: id })
}

async function changeMutual(action, taskId) {
  const fnMap = { take: 'takeMutual', finish: 'finishMutual', cancel: 'cancelMutual' }
  const cloud = await callCloud(fnMap[action], { taskId: taskId })
  if (cloud) return ok(cloud)

  const result = store.update((db) => {
    const t = db.mutual_tasks.find((x) => x._id === taskId)
    if (!t) return { error: '没有找到这张互助卡' }
    const me = mine()
    if (action === 'take') {
      if (t.status !== 'open') return { error: '这张卡已经被人接走啦' }
      if (t.ownerOpenid === me) return { error: '不能接自己发的单哦' }
      t.status = 'taken'
      t.takerOpenid = me
    } else if (action === 'finish') {
      if (t.status !== 'taken') return { error: '当前状态不能标记完成' }
      t.status = 'done'
      recordCarbonLocal('mutual', 1)
    } else {
      if (t.status !== 'open' && t.status !== 'taken') return { error: '当前状态不能取消' }
      if (t.ownerOpenid !== me && t.takerOpenid !== me) return { error: '只能取消自己的互助' }
      t.status = 'cancelled'
    }
    t.updatedAt = Date.now()
    return { status: t.status }
  })
  if (result.error) return fail(result.error, 400)
  return ok(result)
}

/* ---------- 改造工坊 ---------- */
async function saveUpcycle(record) {
  const cloud = await callCloud('saveUpcycle', record)
  if (cloud) return ok(cloud)
  const id = store.update((db) => {
    const rid = util.uid('up')
    db.upcycle_records.unshift(Object.assign({ _id: rid, ownerOpenid: mine(), doneScheme: -1, finishedAt: null, createdAt: Date.now() }, record))
    return rid
  })
  return ok({ recordId: id })
}

async function toggleFavorite(payload) {
  const cloud = await callCloud('toggleFavorite', payload)
  if (cloud) return ok(cloud)
  const result = store.update((db) => {
    const idx = db.favorites.findIndex((x) => x.schemeName === payload.schemeName && x.item === payload.item)
    if (idx >= 0) {
      db.favorites.splice(idx, 1)
      return { favorited: false }
    }
    db.favorites.unshift({
      _id: util.uid('fav'), ownerOpenid: mine(), item: payload.item, scene: payload.scene || '',
      schemeIndex: payload.schemeIndex || 0, schemeName: payload.schemeName, createdAt: Date.now()
    })
    return { favorited: true }
  })
  return ok(result)
}

async function markUpcycleDone(item, schemeIndex) {
  const cloud = await callCloud('markUpcycleDone', { item: item, schemeIndex: schemeIndex })
  if (cloud) return ok(cloud)
  store.update((db) => {
    const rec = db.upcycle_records.find((x) => x.item === item)
    if (rec) {
      rec.doneScheme = schemeIndex
      rec.finishedAt = Date.now()
    } else {
      db.upcycle_records.unshift({
        _id: util.uid('up'), ownerOpenid: mine(), item: item, scene: '', schemes: [],
        doneScheme: schemeIndex, finishedAt: Date.now(), createdAt: Date.now()
      })
    }
  })
  recordCarbonLocal('upcycle', 1)
  return ok({ done: true })
}

/* ---------- 碳减排 ---------- */
function recordCarbonLocal(type, delta) {
  const keyMap = { granted: ['grantedCount', config.CARBON.granted], upcycle: ['upcycleCount', config.CARBON.upcycle], mutual: ['mutualCount', config.CARBON.mutual] }
  const conf = keyMap[type]
  if (!conf) return null
  store.update((db) => {
    const me = mine()
    if (!db.carbon_stats[me]) db.carbon_stats[me] = { ownerOpenid: me, grantedCount: 0, mutualCount: 0, upcycleCount: 0, carbonKg: 0 }
    const c = db.carbon_stats[me]
    c[conf[0]] += delta
    c.carbonKg = Math.round((c.carbonKg + conf[1] * delta) * 10) / 10
  })
  return true
}

/* ---------- 归属设置：楼栋 / 房间号（本机长久保存 + 云端同步） ---------- */
function currentProfile() {
  return profileStore.current()
}

async function saveProfile(patch) {
  const saved = profileStore.write(patch)
  if (isCloud()) {
    // 不用 callCloud：云端同步失败时不应把整站降级为演示模式
    try {
      await wx.cloud.callFunction({
        name: 'saveProfile',
        data: { building: saved.building, room: saved.room }
      })
    } catch (err) {
      // 本机已保存，下次打开「我的局子」会再次同步
    }
  }
  return ok({ building: saved.building, room: saved.room })
}

async function getProfile() {
  const cloud = await callCloud('getProfile', {})
  if (cloud && cloud.carbon) {
    const d = cloud
    d.posts = (d.posts || []).map(decoratePost)
    d.mutual = (d.mutual || []).map(decorateMutual)
    d.favorites = (d.favorites || []).map((f) => Object.assign({}, f, { timeText: util.timeAgo(f.createdAt) }))
    d.upcycles = d.upcycles || []
    d.stats = d.stats || { posted: d.posts.length, granted: 0, mutualDone: 0, favorites: d.favorites.length }
    // 云端 users 集合的归属设置回写本机，实现跨设备长久保存
    d.profile = profileStore.merge(d.profile)
    return ok(d)
  }

  const db = store.read()
  const me = mine()
  const carbon = db.carbon_stats[me] || { ownerOpenid: me, grantedCount: 0, mutualCount: 0, upcycleCount: 0, carbonKg: 0 }
  const posts = db.posts.filter((x) => x.ownerOpenid === me).map(decoratePost)
  const mutual = db.mutual_tasks.filter((x) => x.ownerOpenid === me || x.takerOpenid === me).map(decorateMutual)
  const favorites = db.favorites.filter((x) => x.ownerOpenid === me)
  const upcycles = db.upcycle_records.filter((x) => x.ownerOpenid === me)
  let level = config.CARBON.levels[0]
  let next = config.CARBON.levels[1]
  for (let i = 0; i < config.CARBON.levels.length; i++) {
    if (carbon.carbonKg < config.CARBON.levels[i].max) {
      level = config.CARBON.levels[i]
      next = config.CARBON.levels[i + 1] || null
      break
    }
  }
  const prevMax = config.CARBON.levels[config.CARBON.levels.indexOf(level) - 1]
    ? config.CARBON.levels[config.CARBON.levels.indexOf(level) - 1].max : 0
  const percent = next ? Math.min(100, Math.round((carbon.carbonKg - prevMax) / (level.max - prevMax) * 100)) : 100

  return ok({
    profile: profileStore.current(),
    carbon: carbon,
    level: level,
    nextLevel: next,
    percent: percent,
    posts: posts,
    mutual: mutual,
    favorites: favorites,
    upcycles: upcycles,
    stats: {
      posted: posts.length,
      granted: posts.filter((x) => x.status === 'granted').length,
      mutualDone: mutual.filter((x) => x.status === 'done').length,
      favorites: favorites.length
    }
  })
}

async function report(targetId, reason) {
  const cloud = await callCloud('report', { targetId: targetId, reason: reason })
  if (cloud) return ok(cloud)
  store.update((db) => { db.reports.push({ targetId: targetId, reason: reason, createdAt: Date.now() }) })
  return ok({ reported: true })
}

module.exports = {
  ok, fail, isCloud, mine,
  aiPost, aiMutual, aiUpcycle, aiSpeech, speechRecognize, aiStatus, uploadImage,
  currentProfile, saveProfile,
  listFeed, createPost, updatePostStatus,
  listMutual, createMutual,
  takeMutual: (id) => changeMutual('take', id),
  finishMutual: (id) => changeMutual('finish', id),
  cancelMutual: (id) => changeMutual('cancel', id),
  saveUpcycle, toggleFavorite, markUpcycleDone,
  getProfile, recordCarbonLocal, report
}
