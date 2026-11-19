// 收藏 / 取消收藏改造方案（按 item + schemeName 去重）
const { db, ok, wrap, ctxOpenid, now } = require('./common')

exports.main = wrap(async (event) => {
  const openid = ctxOpenid()
  const col = db.collection('favorites')
  const r = await col.where({
    ownerOpenid: openid,
    item: event.item || '',
    schemeName: event.schemeName || ''
  }).get()
  if (r.data.length) {
    await col.doc(r.data[0]._id).remove()
    return ok({ favorited: false })
  }
  await col.add({
    data: {
      ownerOpenid: openid,
      item: event.item || '',
      scene: event.scene || '',
      schemeIndex: Number(event.schemeIndex) || 0,
      schemeName: event.schemeName || '改造方案',
      createdAt: now()
    }
  })
  return ok({ favorited: true })
})
