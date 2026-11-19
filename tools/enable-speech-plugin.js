// 微信同声传译插件开关
// 背景：app.json 里静态声明插件，但小程序后台未授权时，微信开发者工具会在「启动模拟器」阶段
//       直接报 Error: provider:wx069ba97219f66d99, version:0.3.6, 插件未授权使用 user uin can not visit app，
//       导致整个小程序打不开。所以默认不声明；等后台授权完成后再用本脚本打开。
//
// 用法：
//   node tools/enable-speech-plugin.js status   查看当前状态（默认）
//   node tools/enable-speech-plugin.js on      写入插件声明（需先在小程序后台添加插件）
//   node tools/enable-speech-plugin.js off     移除插件声明（恢复默认，模拟器一定可启动）
const fs = require('fs')
const path = require('path')

const file = path.resolve(__dirname, '../miniprogram/app.json')
const PLUGIN = { version: '0.3.6', provider: 'wx069ba97219f66d99' }
const action = (process.argv[2] || 'status').toLowerCase()

function read() {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}
function write(cfg) {
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n')
}
function hasPlugin(cfg) {
  return !!(cfg.plugins && cfg.plugins.WechatSI)
}

const cfg = read()
if (action === 'status') {
  console.log('插件声明：' + (hasPlugin(cfg) ? '已开启 (' + cfg.plugins.WechatSI.version + ')' : '未开启（默认，模拟器可正常启动）'))
  console.log('语音转文字：' + (hasPlugin(cfg) ? '微信同声传译插件（实时）优先' : '云端 ASR（aiSpeech → TokenHub sync_transcribe）'))
  process.exit(0)
}

if (action === 'on') {
  if (hasPlugin(cfg)) {
    console.log('✓ app.json 已声明 WechatSI 插件，无需重复开启')
  } else {
    cfg.plugins = Object.assign({}, cfg.plugins, { WechatSI: PLUGIN })
    write(cfg)
    console.log('✓ 已写入 app.json → plugins.WechatSI (' + PLUGIN.version + ')')
  }
  console.log('\n开启前必须完成（否则模拟器仍报「插件未授权使用」）：')
  console.log('  微信公众平台 → 小程序 → 设置 → 第三方设置 → 插件管理 → 添加插件')
  console.log('  搜索「微信同声传译」→ 添加（provider wx069ba97219f66d99）')
  console.log('  若后台显示的版本号不是 0.3.6，请同步修改 app.json 里的 version')
  console.log('  在「用户隐私保护指引」中声明录音权限')
  console.log('\n完成后在微信开发者工具重新编译，并用真机预览（模拟器不支持插件录音）。')
  console.log('想恢复默认：node tools/enable-speech-plugin.js off')
  process.exit(0)
}

if (action === 'off') {
  if (cfg.plugins) {
    delete cfg.plugins.WechatSI
    if (!Object.keys(cfg.plugins).length) delete cfg.plugins
    write(cfg)
    console.log('✓ 已移除插件声明，模拟器恢复可启动；语音自动走云端 ASR')
  } else {
    console.log('✓ 当前未声明插件，无需操作')
  }
  process.exit(0)
}

console.error('未知操作：' + action + '（可用 status / on / off）')
process.exit(1)
