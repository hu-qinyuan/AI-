// 我的发布：在架 / 已送出 / 已下架；标记已送出时计 2.0kg
const { db, ok, fail, wrap, ctxOpenid, now, addCarbon } = require('./common')

exports.main = wrap(async (event) => {
  const allowed = ['on_shelf', 'granted', 'off_shelf']
  if (!event.postId || allowed.indexOf(event.status) < 0) return fail('参数不合法', 400)
  const col = db.collection('posts')
  const r = await col.doc(event.postId).get()
  const post = r.data
  if (!post) return fail('没有找到这条发布', 404)
  if (post.ownerOpenid !== ctxOpenid()) return fail('只能改自己的发布', 403)
  await col.doc(event.postId).update({ data: { status: event.status, updatedAt: now() } })
  if (event.status === 'granted' && post.status !== 'granted') {
    try { await addCarbon(ctxOpenid(), 'granted', 1) } catch (err) { /* 计分失败不影响状态 */ }
  }
  return ok({ status: event.status })
})
