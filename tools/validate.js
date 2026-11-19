/* AI宿造局工程静态校验：严格 JSON、页面/图标路径、WXML 约束、JS 语法 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ROOT = path.join(__dirname, '..', 'miniprogram')
const errors = []
const warnings = []
const stats = { json: 0, js: 0, wxml: 0, wxss: 0, cloud: 0 }

function walk(dir, cb) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.workbuddy') continue
    const p = path.join(dir, name)
    const s = fs.statSync(p)
    if (s.isDirectory()) walk(p, cb)
    else cb(p)
  }
}

walk(ROOT, (file) => {
  const ext = path.extname(file)
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  if (ext === '.json') {
    stats.json++
    try {
      const obj = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (rel === 'app.json') {
        if (!obj.lazyCodeLoading) errors.push('app.json 缺少 lazyCodeLoading')
        ;(obj.pages || []).forEach((page) => {
          const base = path.join(ROOT, page)
          if (!fs.existsSync(base + '.wxml')) errors.push('缺页面 WXML: ' + page)
          if (!fs.existsSync(base + '.js')) errors.push('缺页面 JS: ' + page)
        })
        const pageSet = new Set(obj.pages || [])
        ;((obj.tabBar || {}).list || []).forEach((item) => {
          if (!pageSet.has(item.pagePath)) errors.push('tabBar.pagePath 未在 pages 声明: ' + item.pagePath)
          ;['iconPath', 'selectedIconPath'].forEach((k) => {
            if (!item[k] || !fs.existsSync(path.join(ROOT, item[k]))) errors.push('tabBar 图标不存在: ' + item[k])
          })
        })
      }
      if (rel.endsWith('.json') && rel.startsWith('pages/')) {
        const comps = obj.usingComponents || {}
        Object.keys(comps).forEach((k) => {
          const target = comps[k]
          if (target && !target.startsWith('plugin://') && !fs.existsSync(path.join(path.dirname(file), target + '.wxml'))) {
            warnings.push('组件引用待确认: ' + rel + ' → ' + target)
          }
        })
      }
    } catch (e) {
      errors.push('JSON 解析失败: ' + rel + ' → ' + e.message)
    }
  }

  if (ext === '.js') {
    stats.js++
    try {
      new vm.Script(fs.readFileSync(file, 'utf8'), { filename: rel })
    } catch (e) {
      errors.push('JS 语法错误: ' + rel + ' → ' + e.message)
    }
  }

  if (ext === '.wxml') {
    stats.wxml++
    const src = fs.readFileSync(file, 'utf8')
    if (/\?\./.test(src) || /\?\?/.test(src)) errors.push('WXML 含 ?./??: ' + rel)
    if (/=>/.test(src)) errors.push('WXML 含箭头函数: ' + rel)
    const exprs = src.match(/\{\{[^}]*\}\}/g) || []
    exprs.forEach((expr) => {
      if (/\b[A-Za-z_$][\w$]*\s*\(/.test(expr)) errors.push('WXML 表达式疑似函数调用: ' + rel + ' → ' + expr.trim())
    })
    ;(src.match(/<(?:image|include|import)[^>]*src="([^"]+)"/g) || []).forEach((tag) => {
      const m = tag.match(/src="([^"]+)"/)
      if (m && !m[1].startsWith('{{') && !m[1].startsWith('http') && !m[1].startsWith('cloud://') && !fs.existsSync(path.join(path.dirname(file), m[1]))) {
        warnings.push('静态资源待确认: ' + rel + ' → ' + m[1])
      }
    })
  }

  if (ext === '.wxss') {
    stats.wxss++
    const src = fs.readFileSync(file, 'utf8')
    if (/background-image\s*:\s*url\(/.test(src)) warnings.push('WXSS 使用本地 background-image: ' + rel)
    ;(src.match(/@import\s+["']([^"']+)["']/g) || []).forEach((line) => {
      const m = line.match(/["']([^"']+)["']/)
      if (m && !fs.existsSync(path.join(path.dirname(file), m[1]))) errors.push('WXSS @import 不存在: ' + rel + ' → ' + m[1])
    })
  }
})

const cloudRoot = path.join(ROOT, 'cloudfunctions')
for (const name of fs.readdirSync(cloudRoot)) {
  const dir = path.join(cloudRoot, name)
  if (!fs.statSync(dir).isDirectory()) continue
  stats.cloud++
  for (const f of ['index.js', 'common.js', 'package.json', 'config.json']) {
    if (!fs.existsSync(path.join(dir, f))) errors.push('云函数缺文件: ' + name + '/' + f)
  }
}

console.log('校验统计:', JSON.stringify(stats))
if (warnings.length) console.log('\n提示 (' + warnings.length + '):\n' + warnings.join('\n'))
if (errors.length) {
  console.log('\n错误 (' + errors.length + '):\n' + errors.join('\n'))
  process.exit(1)
} else {
  console.log('\n✅ 静态校验通过：JSON / 页面 / 图标 / WXML / JS / 云函数结构均无问题')
}
