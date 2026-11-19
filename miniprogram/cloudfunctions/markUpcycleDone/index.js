// 标记「已改造」并计 1.0kg；同一旧物只记一次
const { db, ok, fail, wrap, ctxOpenid, now, addCarbon } = require('./common')

exports.main = wrap(async (event) => {
  if (!event.item) return fail('缺少旧物名字', 400)
  const openid = ctxOpenid()
  const col = db.collection('upcycle_records')
  const r = await col.where({ ownerOpenid: openid, item: event.item }).get()
  const idx = Number(event.schemeIndex) || 0
  if (r.data.length) {
    const rec = r.data[0]
    if (rec.doneScheme >= 0) return ok({ done: true, counted: false })
    await col.doc(rec._id).update({ data: { doneScheme: idx, finishedAt: now() } })
  } else {
    await col.add({
      data: {
        ownerOpenid: openid, item: event.item, scene: '', schemes: [],
        doneScheme: idx, finishedAt: now(), createdAt: now()
      }
    })
  }
  try { await addCarbon(openid, 'upcycle', 1) } catch (err) { /* 计分失败不影响状态 */ }
  return ok({ done: true, counted: true })
})
