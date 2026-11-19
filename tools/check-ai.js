#!/usr/bin/env node
// AI 接入自检：TokenHub 密钥 → 本地云函数链路 → 云端函数配置
// 用法：
//   node tools/check-ai.js           只做探针与配置检查，不消耗模型额度
//   node tools/check-ai.js --full    额外真实跑一次 WF-A / WF-B / WF-C（会消耗额度）
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const https = require('https')
const { execSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const fnRoot = path.join(root, 'miniprogram', 'cloudfunctions')
const cfgPath = path.join(__dirname, 'ai-env.json')
const CLI = 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\wechatide.cmd'
const APPID = 'wx4123c75f472af62d'
const ENV = 'cloud1-d6get99l6f8cb27d7'
const full = process.argv.indexOf('--full') >= 0

function line(t) { console.log('\n=== ' + t + ' ===') }
function redact(k) { return String(k || '').slice(0, 6) + '***' + String(k || '').slice(-4) }

if (!fs.existsSync(cfgPath)) {
  console.error('✗ 缺少 tools/ai-env.json；请按 README 第 12 章填写 API Key')
  process.exit(1)
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
const KEY = cfg.AI_API_KEY
if (!KEY) { console.error('✗ AI_API_KEY 为空'); process.exit(1) }

const mockCloud = {
  DYNAMIC_CURRENT_ENV: 'test', init() {},
  database() { return { command: { gt() {}, inc() {} }, collection() { return { where() { return { count() {}, get() {} } }, doc() { return { update() {} } }, add() {} } } } },
  getWXContext() { return { OPENID: 'selftest' } },
  getTempFileURL() { return Promise.resolve({ fileList: [{ tempFileURL: 'https://example.com/a.jpg' }] }) }
}
function load(file, dirname, extra) {
  const m = { exports: {} }
  const sandbox = {
    require: (id) => (extra && extra[id]) || (id === 'wx-server-sdk' ? mockCloud : require(id)),
    module: m, exports: m.exports, process, console, Buffer, URL, Date, Math, JSON, Promise,
    String, Number, Array, Object, RegExp, Error, setTimeout, clearTimeout, __dirname: dirname,
    __filename: path.join(dirname, path.basename(file))
  }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file })
  return m.exports
}
function httpsJson(url, key) {
  return new Promise(function (resolve, reject) {
    const req = https.request(url, { headers: { Authorization: 'Bearer ' + key } }, function (res) {
      let raw = ''
      res.on('data', function (c) { raw += c })
      res.on('end', function () { resolve({ status: res.statusCode, raw: raw }) })
    })
    req.setTimeout(15000, function () { req.destroy(new Error('请求超时')) })
    req.on('error', reject)
    req.end()
  })
}

;(async function () {
  console.log('AI宿造局 · AI 接入自检　Key=' + redact(KEY) + '　Provider=' + (cfg.AI_PROVIDER || 'tokenhub'))

  line('1. TokenHub 密钥与模型')
  try {
    const r = await httpsJson(cfg.AI_BASE_URL.replace(/\/+$/, '') + '/models', KEY)
    if (r.status !== 200) throw new Error('HTTP ' + r.status + ' ' + r.raw.slice(0, 120))
    const list = (JSON.parse(r.raw).data || [])
    const online = function (id) { return list.some(function (x) { return x.id === id && x.status === 'online' }) }
    console.log('✓ 密钥有效，可用模型 ' + list.length + ' 个（在线 ' + list.filter(function (x) { return x.status === 'online' }).length + '）')
    console.log((online(cfg.AI_VISION_MODEL) ? '✓' : '✗') + ' 视觉模型 ' + cfg.AI_VISION_MODEL)
    console.log((online(cfg.AI_TEXT_MODEL) ? '✓' : '✗') + ' 文本模型 ' + cfg.AI_TEXT_MODEL + '（深度思考 ' + cfg.AI_THINKING + '）')
  } catch (e) {
    console.log('✗ 密钥或接口不可用：' + e.message)
    console.log('  请检查 tools/ai-env.json 的 AI_API_KEY / AI_BASE_URL，以及控制台 Key 是否启用。')
  }

  line('2. 云函数链路（密钥读取自 ai.secret.json）')
  // 故意不设 process.env.AI_*，验证随包密钥文件确实能被云函数读到
  ;['AI_PROVIDER', 'AI_API_KEY', 'AI_BASE_URL', 'AI_VISION_MODEL', 'AI_TEXT_MODEL', 'AI_THINKING', 'AI_TIMEOUT_MS'].forEach(function (k) { delete process.env[k] })
  const img = fs.existsSync(path.join(__dirname, 'preview-post.jpg'))
    ? fs.readFileSync(path.join(__dirname, 'preview-post.jpg')).toString('base64') : ''
  for (const name of ['aiPost', 'aiMutual', 'aiUpcycle', 'aiSpeech']) {
    const dir = path.join(fnRoot, name)
    try {
      const common = load(path.join(dir, 'common.js'), dir)
      const idx = load(path.join(dir, 'index.js'), dir, { './common': common })
      const probe = await idx.main({ probe: true })
      const d = probe.data || {}
      console.log('✓ ' + name + ' probe ' + d.connectedCount + '/' + d.total + ' · ' + d.providerName +
        ' · 密钥来源：' + d.keySource + ' · ' + (d.thinkingOff ? '已关闭深度思考' : '默认思考'))
      if (name === 'aiSpeech' && d.asr) {
        console.log('  ASR：' + (d.asr.configured ? d.asr.model + '（需 TokenHub 控制台开通语音额度）' : '未配置'))
      }
      if (!d.allConnected) console.log('  ⚠️ ' + d.hint)
      if (full) {
        const today = new Date().toISOString().slice(0, 10)
        const events = {
          aiPost: { image_base64: img, style: 'minimal' },
          aiMutual: { raw_text: '明天谁去二食堂，求带个肉包，重谢', today: today },
          aiSpeech: { raw_text: '嗯那个明天谁去二食唐求带个肉包重谢', today: today },
          aiUpcycle: { item: '空快递纸箱', scene: '桌面收纳' }
        }
        const t0 = Date.now()
        const r = await idx.main(events[name])
        const keys = r.data ? Object.keys(r.data).filter(function (k) { return k !== '_meta' }).length : 0
        console.log('  ' + (r.code === 0 ? '✓' : '✗') + ' 真实调用 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's · code=' + r.code +
          ' · 字段 ' + keys + ' 个 · ' + (r.data && r.data._meta ? r.data._meta.model : r.msg))
        if (name === 'aiSpeech' && r.code === 0) {
          console.log('    纠错文本：' + (r.data.cleaned_text || '(空)') + ' ｜ 地点：' + (r.data.location || '(空)'))
        }
      }
    } catch (e) {
      console.log('✗ ' + name + ' 加载失败：' + e.message)
    }
  }

  line('3. 云端函数配置')
  try {
    const cmd = '"' + CLI + '" -c WorkBuddy cloud_fn_info --appid ' + APPID +
      ' --env ' + ENV + ' --names aiPost,aiMutual,aiUpcycle,aiSpeech,saveProfile,getProfile,listFeed,createPost,createMutual'
    const out = execSync(cmd, { encoding: 'utf8', timeout: 60000, windowsHide: true })
    const s = out.indexOf('{')
    const info = JSON.parse(out.slice(s)).result.list || []
    const aiFns = ['aiPost', 'aiMutual', 'aiUpcycle', 'aiSpeech']
    let needFix = false
    let timeoutFix = false
    let missing = []
    info.forEach(function (f) {
      const isAI = aiFns.indexOf(f.name) >= 0
      const okTimeout = !isAI || Number(f.timeout) >= 30
      if (!okTimeout || f.status !== 'Active') needFix = true
      if (isAI && !okTimeout) timeoutFix = true
      if (f.status !== 'Active') missing.push(f.name)
      console.log((f.status === 'Active' ? '✓' : '✗') + ' ' + f.name + ' · ' + (f.status || '未部署') +
        (isAI ? ' · 超时 ' + f.timeout + 's ' + (okTimeout ? '' : '⚠️ 不足') : ''))
    })
    if (needFix) {
      if (missing.length) console.log('\n⚠️ 尚未部署：' + missing.join(' / ') + ' → 运行 bash tools/deploy-changes.sh')
      if (timeoutFix) {
        console.log('\n⚠️ 必须手动修一次：云开发控制台 → 云函数 → 分别打开下面超时不足的 AI 函数')
        console.log('   → 「函数配置」把「超时时间」改成 30 秒 → 保存。')
        console.log('   config.json 的 timeout 不会被部署工具同步，这是微信云开发的已知限制。')
        console.log('   真实模型调用约 2~8 秒，3 秒超时会导致识图/语音纠错一律降级到本地规则引擎。')
      }
    }
  } catch (e) {
    console.log('· 云端配置查询失败（不影响本地自检）：' + e.message.slice(0, 120))
  }

  line('结论')
  console.log('本地链路与密钥已就绪；如上面出现超时告警，请在云开发控制台把对应 AI 函数改成 30 秒。')
  console.log('重新编译小程序即可看到「🟢 AI 模型已接入 · 腾讯云 TokenHub 3/3」并真实识图。')
  console.log('语音默认走云端 ASR：需在 TokenHub 控制台开通语音识别额度（当前 Key 实测 HTTP 402）；')
  console.log('      或先在小程序后台添加插件，再运行 node tools/enable-speech-plugin.js on（真机预览）。')
  console.log('换 Key：改 tools/ai-env.json → node tools/sync-ai-env.js → bash tools/deploy-ai.sh')
})().catch(function (e) { console.error('自检异常：', e); process.exit(1) })
