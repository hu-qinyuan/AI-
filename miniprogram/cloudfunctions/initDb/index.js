// 一次性初始化：创建集合 + 少量冷启动种子内容（文书 K5）
// 用法：上传部署后，在云开发控制台「云函数 → initDb → 云端测试」点一次即可
const { db, ok, wrap, now } = require('./common')

const COLLECTIONS = ['users', 'posts', 'mutual_tasks', 'upcycle_records', 'favorites', 'carbon_stats', 'reports']

exports.main = wrap(async () => {
  const created = []
  const exists = []
  for (let i = 0; i < COLLECTIONS.length; i++) {
    const name = COLLECTIONS[i]
    try {
      await db.createCollection(name)
      created.push(name)
    } catch (err) {
      exists.push(name)
    }
  }

  const ts = now()
  const seedPosts = [
    { title: '考研数学全套笔记', desc: '字丑但全是重点📖 送有缘人，考上记得请我喝奶茶～', category: '书籍', condition: '七成新', price: 0, dealMode: '赠送', tags: ['考研', '笔记'], building: 'A 栋', status: 'on_shelf' },
    { title: '会发光的小台灯', desc: '陪我熬过三个期末，灯罩微微发黄，光还是暖的🌙', category: '生活', condition: '七成新', price: 0, dealMode: '赠送', tags: ['台灯', '宿舍神器'], building: 'B 栋', status: 'on_shelf' },
    { title: '羽毛球拍一对', desc: '拍线刚换过，缺一个能接住我扣杀的搭子🏸', category: '运动', condition: '九成新', price: 0, dealMode: '赠送', tags: ['球拍', '约球'], building: 'A 栋', status: 'on_shelf' }
  ]
  const seedMutual = [
    { rawText: '明天谁去二食堂，求带个肉包，重谢', type: '代买', title: '求带二食堂肉包', demand: '带一个肉包', timeText: '明天', location: '二食堂', reward: '重谢', urgency: '普通', scope: '本楼栋', building: 'A 栋', status: 'open' },
    { rawText: '有没有同学借一下螺丝刀，装个书架', type: '借用', title: '借螺丝刀装书架', demand: '借一把螺丝刀', timeText: '今天', location: 'A 栋', reward: '当面道谢', urgency: '有点急', scope: '本楼栋', building: 'A 栋', status: 'open' },
    { rawText: '下午有人拼奶茶吗，凑够三杯免配送费', type: '拼单', title: '拼奶茶凑免配送', demand: '凑三杯奶茶', timeText: '今天', location: '宿舍楼下', reward: 'AA', urgency: '普通', scope: '本楼栋', building: 'B 栋', status: 'open' }
  ]

  for (let i = 0; i < seedPosts.length; i++) {
    await db.collection('posts').add({
      data: Object.assign({}, seedPosts[i], {
        ownerOpenid: 'seed_bot', images: ['emoji:📦'], coverEmoji: '📦',
        college: '泓江书院', location: seedPosts[i].building,
        aiMeta: { workflow: 'seed', degraded: false },
        createdAt: ts - i * 3600000, updatedAt: ts - i * 3600000
      })
    })
  }
  for (let i = 0; i < seedMutual.length; i++) {
    await db.collection('mutual_tasks').add({
      data: Object.assign({}, seedMutual[i], {
        ownerOpenid: 'seed_bot', takerOpenid: '', timeStart: '',
        college: '泓江书院', createdAt: ts - i * 3600000, updatedAt: ts - i * 3600000
      })
    })
  }

  return ok({
    created: created,
    alreadyExists: exists,
    seedPosts: seedPosts.length,
    seedMutual: seedMutual.length,
    next: '请在云开发控制台设置集合权限：posts/mutual_tasks=所有用户可读、仅创建者可写；users/favorites/upcycle_records/carbon_stats/reports=仅创建者可读写。'
  })
})
