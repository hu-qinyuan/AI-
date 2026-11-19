// 广场信息流：按可见范围 → 发布时间倒序；对外脱敏房间号
const { db, ok, wrap, ctxOpenid, publicPost } = require('./common')

exports.main = wrap(async (event) => {
  const openid = ctxOpenid()
  const page = Number(event.page) > 0 ? Number(event.page) : 1
  const size = Math.min(Number(event.pageSize) > 0 ? Number(event.pageSize) : 20, 20)
  const where = { status: 'on_shelf' }
  if (event.building && event.scope !== 'college') where.building = event.building
  if (event.category && event.category !== '全部') where.category = event.category

  const base = db.collection('posts').where(where).orderBy('createdAt', 'desc')
  const count = await base.count()
  let r = await base.skip((page - 1) * size).limit(size).get()
  let list = r.data.map((p) => publicPost(p, openid))
  if (event.keyword) {
    const k = String(event.keyword).toLowerCase()
    list = list.filter((p) => (String(p.title) + String(p.desc) + (p.tags || []).join('')).toLowerCase().indexOf(k) >= 0)
  }
  return ok({ list: list, total: count.total })
})
