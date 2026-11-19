// 把 tools/ai-env.json 同步成各 AI 云函数随包部署的 ai.secret.json
// 用法：node tools/sync-ai-env.js
// 说明：cloudfunctions 目录已在 project.config.json → packOptions.ignore 中排除，
//       密钥文件只存在于云端函数包内，不会进入小程序前端代码包。
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const src = path.join(__dirname, 'ai-env.json')
const fnRoot = path.join(root, 'miniprogram', 'cloudfunctions')
const targets = ['aiPost', 'aiMutual', 'aiUpcycle', 'aiSpeech']

if (!fs.existsSync(src)) {
  console.error('✗ 缺少 tools/ai-env.json，请先按 README 第 12 章填写 TokenHub API Key')
  process.exit(1)
}
let cfg
try { cfg = JSON.parse(fs.readFileSync(src, 'utf8')) } catch (e) {
  console.error('✗ tools/ai-env.json 不是合法 JSON：' + e.message)
  process.exit(1)
}
const env = {}
Object.keys(cfg).forEach(function (k) {
  if (k.charAt(0) === '_') return
  if (cfg[k] === '' || cfg[k] === null || cfg[k] === undefined) return
  env[k] = String(cfg[k])
})
if (!env.AI_API_KEY) {
  console.error('✗ AI_API_KEY 未填写')
  process.exit(1)
}

targets.forEach(function (name) {
  const dir = path.join(fnRoot, name)
  if (!fs.existsSync(dir)) { console.error('✗ 找不到云函数目录 ' + dir); process.exit(1) }
  fs.writeFileSync(path.join(dir, 'ai.secret.json'), JSON.stringify(env, null, 2) + '\n')
  console.log('✓ ' + name + '/ai.secret.json ← ' + Object.keys(env).length + ' 项配置（密钥已隐藏）')
})

// 清理非 AI 云函数目录里可能残留的旧密钥文件，遵循最小密钥扩散原则
fs.readdirSync(fnRoot).forEach(function (d) {
  if (targets.indexOf(d) >= 0) return
  const p = path.join(fnRoot, d, 'ai.secret.json')
  if (fs.existsSync(p)) { fs.unlinkSync(p); console.log('· 已清理 ' + d + '/ai.secret.json') }
})
console.log('完成：' + env.AI_PROVIDER + ' · 视觉 ' + env.AI_VISION_MODEL + ' · 文本 ' + env.AI_TEXT_MODEL + ' · 深度思考 ' + env.AI_THINKING)
