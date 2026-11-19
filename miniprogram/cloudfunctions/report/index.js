// 一键举报（文书 K3 风控）：记录目标与原因，不做自动处置
const { db, ok, fail, wrap, ctxOpenid, now } = require('./common')

exports.main = wrap(async (event) => {
  if (!event.targetId) return fail('缺少举报目标', 400)
  await db.collection('reports').add({
    data: {
      targetId: String(event.targetId),
      reason: String(event.reason || '未说明').slice(0, 100),
      reporterOpenid: ctxOpenid(),
      createdAt: now()
    }
  })
  return ok({ reported: true })
})
