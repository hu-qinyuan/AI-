// 状态机：待接单 / 已接单 → 已取消
const { db, ok, fail, wrap, ctxOpenid, now } = require('./common')

exports.main = wrap(async (event) => {
  if (!event.taskId) return fail('缺少 taskId', 400)
  const openid = ctxOpenid()
  const col = db.collection('mutual_tasks')
  const r = await col.doc(event.taskId).get()
  const task = r.data
  if (!task) return fail('没有找到这张互助卡', 404)
  if (task.status !== 'open' && task.status !== 'taken') return fail('当前状态不能取消', 400)
  if (task.ownerOpenid !== openid && task.takerOpenid !== openid) return fail('只能取消自己的互助', 403)
  await col.doc(event.taskId).update({ data: { status: 'cancelled', updatedAt: now() } })
  return ok({ status: 'cancelled' })
})
