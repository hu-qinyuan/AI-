function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function toDate(value) {
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') return new Date(value.replace(/-/g, '/'))
  return new Date()
}

function dateStr(d) {
  d = toDate(d)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function addDays(d, n) {
  const date = toDate(d)
  date.setDate(date.getDate() + n)
  return date
}

function timeAgo(ts) {
  const diff = Date.now() - Number(ts || 0)
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
  if (diff < 172800000) return '昨天'
  const d = new Date(Number(ts))
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function truncate(s, n) {
  const str = String(s || '')
  return str.length > n ? str.slice(0, n) : str
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms) })
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

module.exports = { pad, toDate, dateStr, addDays, timeAgo, truncate, sleep, clone, uid }
