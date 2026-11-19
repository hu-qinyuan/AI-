// v3 临时自测：归属设置持久化、语音降级链路、隐私脱敏
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const mp = path.join(root, 'miniprogram')
const storage = {}

global.wx = {
  getStorageSync(k) { return storage[k] },
  setStorageSync(k, v) { storage[k] = v },
  removeStorageSync(k) { delete storage[k] },
  showToast() {},
  cloud: { init() {}, callFunction() { return Promise.reject(new Error('no cloud')) } }
}
const appObj = {
  globalData: { profile: null, mode: 'demo', openid: '' },
  isCloud() { return false },
  getOpenid() { return 'demo_test' }
}
global.getApp = function () { return appObj }
let captured = null
global.App = function (o) { captured = o }

const profileStore = require(path.join(mp, 'utils/profile.js'))
const api = require(path.join(mp, 'utils/api.js'))
require(path.join(mp, 'app.js'))

function assert(ok, label, extra) {
  console.log((ok ? '✓ ' : '✗ ') + label + (extra ? ' → ' + extra : ''))
  if (!ok) process.exitCode = 1
}

;(async function () {
  console.log('=== 1. 楼栋 / 房间号本机长久保存 ===')
  profileStore.write({ building: 'C 栋', room: '312' })
  assert(!!storage['aiszj_profile'], '写入 storage')
  assert(appObj.globalData.profile.building === 'C 栋' && appObj.globalData.profile.room === '312', '同步到 globalData')
  const reread = profileStore.read()
  assert(reread.building === 'C 栋' && reread.room === '312', '重新读取保持', JSON.stringify({ b: reread.building, room: reread.room }))

  // 模拟重启：清空内存 profile，重新执行 app.initIdentity
  appObj.globalData.profile = null
  captured.initIdentity.call(appObj)
  assert(appObj.globalData.profile.building === 'C 栋' && appObj.globalData.profile.room === '312',
    '重启后从 storage 恢复', JSON.stringify({ b: appObj.globalData.profile.building, room: appObj.globalData.profile.room }))

  profileStore.write({ room: '' })
  assert(profileStore.read().room === '', '房间号可清空（不被 || 覆盖）')

  console.log('=== 2. 云端档案合并（跨设备） ===')
  const merged = profileStore.merge({ nickname: '宿宝同学', building: 'D 栋', room: '508' })
  assert(merged.building === 'D 栋' && merged.room === '508' && profileStore.read().building === 'D 栋', '云端有值以云端为准')
  const merged2 = profileStore.merge({ nickname: '宿宝同学', building: '', room: '' })
  assert(merged2.room === '' && merged2.building === 'D 栋', '云端空房间号可覆盖、楼栋回落本机', JSON.stringify({ b: merged2.building, room: merged2.room }))

  console.log('=== 3. 语音链路（演示模式降级到本地引擎，契约一致） ===')
  const res = await api.aiSpeech({ raw_text: '明天谁去二食堂，求带个肉包，重谢', now: new Date().toISOString() })
  assert(res.code === 0, 'aiSpeech 返回 code=0')
  const r = res.data.result
  assert(r.cleaned_text === '明天谁去二食堂，求带个肉包，重谢', '带回 ASR 原文 cleaned_text')
  assert(r._speech === true && r.type === '代买' && r.location === '二食堂', '与打字同一套互助卡契约',
    JSON.stringify({ type: r.type, location: r.location, date: r.time_start }))
  assert(res.data.source === 'local' && res.data.degraded === false, '演示模式标记为本地引擎（非异常降级）', res.data.source)

  console.log('=== 4. 归属设置自动用于发布 ===')
  const cur = api.currentProfile()
  assert(cur.building === 'D 栋', 'currentProfile 读回设置', cur.building)
  profileStore.write({ building: 'B 栋', room: '207' })
  const loc = 'B 栋 · 207'
  assert(loc.indexOf('207') > 0, '发布位置自动带房间号', loc)

  console.log('=== 5. 隐私脱敏 publicPost ===')
  const mockCloud = {
    DYNAMIC_CURRENT_ENV: 'test', init() {},
    database() { return { command: { gt() {}, inc() {} }, collection() { return { where() { return { count() {}, get() {} } }, doc() { return { update() {} } }, add() {} } } } },
    getWXContext() { return { OPENID: 'self' } }
  }
  const m = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(mp, 'cloudfunctions/aiPost/common.js'), 'utf8'), {
    require: (id) => id === 'wx-server-sdk' ? mockCloud : require(id),
    module: m, exports: m.exports, process, console, Buffer, URL, Date, Math, JSON, Promise,
    String, Number, Array, Object, RegExp, Error, setTimeout, clearTimeout,
    __dirname: path.join(mp, 'cloudfunctions/aiPost'), __filename: 'common.js'
  }, { filename: 'common.js' })
  const post = { _id: 'p1', ownerOpenid: 'u1', building: 'A 栋', location: 'A 栋 · 312', room: '312', title: '台灯' }
  const ownerView = m.exports.publicPost(post, 'u1')
  const otherView = m.exports.publicPost(post, 'u2')
  assert(ownerView.ownerLocation === 'A 栋 · 312' && !ownerView.location && !ownerView.room, '本人可见完整位置但不暴露原始字段')
  assert(!otherView.ownerLocation && !otherView.location && !otherView.room, '他人完全脱敏')
  console.log('    ' + JSON.stringify(otherView))

  console.log(process.exitCode ? '\n❌ 存在失败项' : '\n✅ v3 自测全部通过')
})().catch(function (e) { console.error('自测异常：', e); process.exit(1) })
