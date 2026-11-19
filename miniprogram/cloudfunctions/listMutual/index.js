// 互助信息流：可见范围优先 → 待接单置顶 → 发布时间倒序
const { db, ok, wrap } = require('./common')

exports.main = wrap(async (event) => {
  let q = db.collection('mutual_tasks').orderBy('createdAt', 'desc')
  if (event.scope === '本楼栋' && event.building) {
    q = db.collection('mutual_tasks').where({ building: event.building }).orderBy('createdAt', 'desc')
  }
  const r = await q.limit(50).get()
  let list = r.data
  if (event.status) list = list.filter((x) => x.status === event.status)
  list.sort((a, b) => {
    const aw = a.status === 'open' ? 1 : 0
    const bw = b.status === 'open' ? 1 : 0
    if (aw !== bw) return bw - aw
    return Number(b.createdAt) - Number(a.createdAt)
  })
  return ok({ list: list, total: list.length })
})
