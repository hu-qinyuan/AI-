// 保存「我的归属」：楼栋 + 房间号，落到 users 集合，按 OPENID 隔离
// 与本机 storage 一起构成跨设备、跨重启的长久保存
const { db, ok, fail, wrap, ctxOpenid, now, trim } = require('./common')

exports.main = wrap(async (event) => {
  const openid = ctxOpenid()
  if (!openid) return fail('身份异常，请重新进入小程序', 401)

  const building = trim(event.building, 20)
  const room = trim(event.room, 10)
  const col = db.collection('users')
  const found = await col.where({ ownerOpenid: openid }).limit(1).get()
  const data = { building: building, room: room, updatedAt: now() }

  if (found.data && found.data.length) {
    await col.doc(found.data[0]._id).update({ data: data })
  } else {
    await col.add({ data: Object.assign({ ownerOpenid: openid, createdAt: now() }, data) })
  }
  return ok({ building: building, room: room })
})
