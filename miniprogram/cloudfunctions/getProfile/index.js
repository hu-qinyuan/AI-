// 个人中心聚合：三组列表 + 碳减排成就（所有查询都带 openid 身份约束）
const { db, ok, wrap, ctxOpenid, ensureCarbon, publicPost } = require('./common')

const LEVELS = [
  { max: 10, name: '纸箱萌新', emoji: '🌱' },
  { max: 30, name: '流转小能手', emoji: '🍀' },
  { max: 60, name: '低碳达人', emoji: '🌳' },
  { max: Infinity, name: '书院守护者', emoji: '🏆' }
]

exports.main = wrap(async () => {
  const openid = ctxOpenid()
  const posts = await db.collection('posts').where({ ownerOpenid: openid }).orderBy('createdAt', 'desc').get()
  const mine = await db.collection('mutual_tasks').where({ ownerOpenid: openid }).get()
  const taken = await db.collection('mutual_tasks').where({ takerOpenid: openid }).get()
  const favorites = await db.collection('favorites').where({ ownerOpenid: openid }).get()
  const upcycles = await db.collection('upcycle_records').where({ ownerOpenid: openid }).get()
  const carbon = await ensureCarbon(openid)
  // 归属设置（楼栋 / 房间号）来自 users 集合，换设备也能恢复
  const users = await db.collection('users').where({ ownerOpenid: openid }).limit(1).get()
  const settings = (users.data && users.data[0]) || {}

  const mutualMap = {}
  mine.data.concat(taken.data).forEach((t) => { mutualMap[t._id] = t })
  const mutual = Object.keys(mutualMap).map((k) => mutualMap[k])
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))

  let index = 0
  for (let i = 0; i < LEVELS.length; i++) {
    if (carbon.carbonKg < LEVELS[i].max) { index = i; break }
    index = i
  }
  const prevMax = index > 0 ? LEVELS[index - 1].max : 0
  const level = LEVELS[index]
  const nextLevel = LEVELS[index + 1] || null
  const percent = nextLevel ? Math.min(100, Math.round((carbon.carbonKg - prevMax) / (level.max - prevMax) * 100)) : 100

  return ok({
    profile: {
      nickname: '宿宝同学', avatarText: '宿', college: '泓江书院',
      building: settings.building || '', room: settings.room || ''
    },
    carbon: carbon,
    level: level,
    nextLevel: nextLevel,
    percent: percent,
    posts: posts.data.map((p) => publicPost(p, openid)),
    mutual: mutual,
    favorites: favorites.data,
    upcycles: upcycles.data,
    stats: {
      posted: posts.data.length,
      granted: posts.data.filter((p) => p.status === 'granted').length,
      mutualDone: mutual.filter((t) => t.status === 'done').length,
      favorites: favorites.data.length
    }
  })
})
