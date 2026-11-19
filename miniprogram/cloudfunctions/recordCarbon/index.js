// 碳减排计数（文书 4.4 系数）；仅服务端可写，前端不传 openid
const { ok, fail, wrap, ctxOpenid, ensureCarbon, addCarbon } = require('./common')

exports.main = wrap(async (event) => {
  const type = event.type
  const delta = Number(event.delta) || 1
  if (['granted', 'upcycle', 'mutual'].indexOf(type) < 0) return fail('未知的计分类型', 400)
  await addCarbon(ctxOpenid(), type, delta)
  const carbon = await ensureCarbon(ctxOpenid())
  return ok({ carbon: carbon })
})
