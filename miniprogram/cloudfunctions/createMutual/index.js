// 落库互助卡：保留口语原文用于回归测试；24h 相似需求去重
const { db, _, ok, fail, wrap, ctxOpenid, now, trim, freqGuard } = require('./common')

const BAD_WORDS = ['加微信', '扫码领', '代刷', '刷单', '返利', '贷款']

exports.main = wrap(async (event) => {
  if (!event.title) return fail('互助卡还缺一个标题', 400)
  if (!event.demand) return fail('说说具体需要什么吧', 400)
  const text = String(event.rawText || '') + String(event.demand || '')
  if (BAD_WORDS.some((w) => text.indexOf(w) >= 0)) return fail('内容疑似广告，请修改后再发布', 403)
  if (await freqGuard('mutual_tasks', 10, 3)) return fail('10 分钟内最多发 3 条，歇会儿再来～', 429)

  const openid = ctxOpenid()
  const since = now() - 86400000
  const recent = await db.collection('mutual_tasks').where({
    ownerOpenid: openid,
    createdAt: _.gt(since),
    status: _.neq('cancelled')
  }).get()
  const head = text.slice(0, 6)
  const dup = head && recent.data.some((t) => String(t.rawText || '').slice(0, 6) === head)
  if (dup) return fail('你 24 小时内发布过类似需求啦', 409)

  const ts = now()
  const doc = {
    ownerOpenid: openid,
    takerOpenid: '',
    rawText: trim(event.rawText || event.demand, 100),
    type: event.type || '其他',
    title: trim(event.title, 20),
    demand: trim(event.demand, 100),
    timeText: event.timeText || '',
    timeStart: event.timeStart || '',
    location: event.location || '',
    reward: event.reward || '',
    urgency: event.urgency || '普通',
    scope: event.scope || '本楼栋',
    building: event.building || '',
    room: trim(event.room, 10),
    college: event.college || '泓江书院',
    status: 'open',
    createdAt: ts,
    updatedAt: ts
  }
  const r = await db.collection('mutual_tasks').add({ data: doc })
  return ok({ taskId: r._id })
})
