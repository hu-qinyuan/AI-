// 落库闲置：前端不传 openid，服务端从上下文取（文书 7.2）
const { db, ok, fail, wrap, ctxOpenid, now, trim, freqGuard } = require('./common')

const BAD_WORDS = ['加微信', '扫码领', '代刷', '刷单', '返利', '贷款']

exports.main = wrap(async (event) => {
  const miss = []
  if (!event.images || !event.images.length) miss.push('图片')
  if (!event.title) miss.push('标题')
  if (!event.category) miss.push('类别')
  if (!event.location) miss.push('取件位置')
  if (miss.length) return fail('还差：' + miss.join('、'), 400)

  const text = String(event.title || '') + String(event.desc || '')
  if (BAD_WORDS.some((w) => text.indexOf(w) >= 0)) return fail('内容疑似广告，请修改后再发布', 403)
  if (await freqGuard('posts', 10, 3)) return fail('10 分钟内最多发 3 条，歇会儿再来～', 429)

  const openid = ctxOpenid()
  const ts = now()
  const doc = {
    ownerOpenid: openid,
    images: event.images.slice(0, 1),
    coverEmoji: event.coverEmoji || '📦',
    title: trim(event.title, 20),
    desc: trim(event.desc, 200),
    category: event.category,
    condition: event.condition || '能用就行',
    price: Number(event.price) || 0,
    dealMode: event.dealMode || '赠送',
    tags: Array.isArray(event.tags) ? event.tags.slice(0, 5).map(String) : [],
    building: event.building || '',
    college: event.college || '泓江书院',
    location: trim(event.location, 40),
    room: trim(event.room, 10),
    status: 'on_shelf',
    aiMeta: event.aiMeta || { workflow: 'manual', degraded: false },
    createdAt: ts,
    updatedAt: ts
  }
  const r = await db.collection('posts').add({ data: doc })
  return ok({ postId: r._id })
})
