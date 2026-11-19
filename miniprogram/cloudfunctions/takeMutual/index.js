// 状态机：待接单 → 已接单
const { db, ok, fail, wrap, ctxOpenid, now } = require('./common')

exports.main = wrap(async (event) => {
  if (!event.taskId) return fail('缺少 taskId', 400)
  const openid = ctxOpenid()
  const col = db.collection('mutual_tasks')
  const r = await col.doc(event.taskId).get()
  const task = r.data
  if (!task) return fail('没有找到这张互助卡', 404)
  if (task.status !== 'open') return fail('这张卡已经被人接走啦', 400)
  if (task.ownerOpenid === openid) return fail('不能接自己发的单哦', 400)
  await col.doc(event.taskId).update({ data: { status: 'taken', takerOpenid: openid, updatedAt: now() } })
  return ok({ status: 'taken' })
})
