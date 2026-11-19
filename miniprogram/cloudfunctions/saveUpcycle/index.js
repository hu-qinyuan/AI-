// 保存一次改造方案快照（3 套方案），完成状态后续由 markUpcycleDone 更新
const { db, ok, fail, wrap, ctxOpenid, now } = require('./common')

exports.main = wrap(async (event) => {
  if (!event.item) return fail('缺少旧物名字', 400)
  const doc = {
    ownerOpenid: ctxOpenid(),
    item: String(event.item).slice(0, 20),
    scene: event.scene || '',
    schemes: Array.isArray(event.schemes) ? event.schemes.slice(0, 3) : [],
    doneScheme: -1,
    finishedAt: null,
    createdAt: now()
  }
  const r = await db.collection('upcycle_records').add({ data: doc })
  return ok({ recordId: r._id })
})
