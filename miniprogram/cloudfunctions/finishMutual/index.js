// 状态机：已接单 → 已完成，并给双方记象征性减碳分
const { db, ok, fail, wrap, ctxOpenid, now, addCarbon } = require('./common')

exports.main = wrap(async (event) => {
  if (!event.taskId) return fail('缺少 taskId', 400)
  const openid = ctxOpenid()
  const col = db.collection('mutual_tasks')
  const r = await col.doc(event.taskId).get()
  const task = r.data
  if (!task) return fail('没有找到这张互助卡', 404)
  if (task.status !== 'taken') return fail('当前状态不能标记完成', 400)
  if (task.ownerOpenid !== openid && task.takerOpenid !== openid) return fail('只有参与双方能标记完成', 403)
  await col.doc(event.taskId).update({ data: { status: 'done', updatedAt: now() } })
  try {
    await addCarbon(task.ownerOpenid, 'mutual', 1)
    await addCarbon(task.takerOpenid, 'mutual', 1)
  } catch (err) {
    // 计分失败不影响状态流转
  }
  return ok({ status: 'done' })
})
