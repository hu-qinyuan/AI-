// 我的归属设置：楼栋 + 房间号
// ------------------------------------------------------------------
// 本地 storage 立即生效（重启、切页面都不丢）；云开发模式下另外同步到
// users 集合，换设备登录同一微信号也能恢复。房间号只写云端与本机，
// 对外信息流仍然脱敏（见云函数 publicPost）。
const config = require('../config.js')

const KEY = 'aiszj_profile'

function defaults() {
  return { building: config.CAMPUS.buildings[0], room: '', updatedAt: 0 }
}

function read() {
  try {
    const saved = wx.getStorageSync(KEY) || {}
    return Object.assign(defaults(), saved)
  } catch (err) {
    return defaults()
  }
}

// 写本地 + 同步到内存 profile（房间号允许清空，所以不能用 || 兜底）
function write(patch) {
  const cur = read()
  if (patch && patch.building !== undefined) cur.building = String(patch.building || '')
  if (patch && patch.room !== undefined) cur.room = String(patch.room || '')
  cur.updatedAt = Date.now()
  try { wx.setStorageSync(KEY, cur) } catch (err) { /* 存储不可用时内存仍生效 */ }
  const app = getApp()
  if (app && app.globalData) {
    if (!app.globalData.profile) app.globalData.profile = {}
    app.globalData.profile.building = cur.building || config.CAMPUS.buildings[0]
    app.globalData.profile.room = cur.room
  }
  return cur
}

// 合并云端档案：云端有值以云端为准（跨设备），否则用本机设置
function merge(remote) {
  const local = read()
  const r = remote || {}
  const building = r.building || local.building || config.CAMPUS.buildings[0]
  const room = r.room !== undefined ? String(r.room || '') : (local.room || '')
  const merged = Object.assign({}, r, { building: building, room: room })
  write({ building: building, room: room })
  return merged
}

function current() {
  const saved = read()
  const app = getApp()
  const base = (app && app.globalData.profile) || {}
  return Object.assign({}, base, { building: saved.building, room: saved.room })
}

module.exports = { KEY, defaults, read, write, merge, current }
