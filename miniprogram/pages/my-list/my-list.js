const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

const META = {
  posts: { title: '我的发布', heroEmoji: '📦', emptyEmoji: '📷', emptyTitle: '还没发过闲置', emptyButton: '去拍一张 ✨' },
  mutual: { title: '我的互助', heroEmoji: '🤝', emptyEmoji: '🫧', emptyTitle: '还没发起或接过互助', emptyButton: '去说一句 💬' },
  favorites: { title: '改造收藏夹', heroEmoji: '⭐', emptyEmoji: '🧙', emptyTitle: '收藏夹还是空的', emptyButton: '去求套方案 🪄' }
}

Page({
  data: {
    type: 'posts',
    title: '我的发布',
    heroEmoji: '📦',
    emptyEmoji: '📷',
    emptyTitle: '还没发过闲置',
    emptyButton: '去拍一张 ✨',
    list: [],
    count: 0
  },

  onLoad(options) {
    const type = META[options.type] ? options.type : 'posts'
    const meta = META[type]
    this.setData({ type: type, title: meta.title, heroEmoji: meta.heroEmoji, emptyEmoji: meta.emptyEmoji, emptyTitle: meta.emptyTitle, emptyButton: meta.emptyButton })
    wx.setNavigationBarTitle({ title: meta.title })
    this.load()
  },
  onShow() { this.load() },

  async load() {
    const res = await api.getProfile()
    if (res.code !== 0) return
    const d = res.data
    let list = []
    if (this.data.type === 'posts') list = d.posts
    else if (this.data.type === 'mutual') list = d.mutual
    else {
      list = d.favorites.map((f) => Object.assign({}, f, {
        timeText: util.timeAgo(f.createdAt),
        done: d.upcycles.some((u) => u.item === f.item && u.doneScheme >= 0)
      }))
    }
    this.setData({ list: list, count: list.length })
  },

  async postAction(e) {
    const res = await api.updatePostStatus(e.currentTarget.dataset.id, e.currentTarget.dataset.action)
    if (res.code !== 0) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }
    wx.showToast({ title: e.currentTarget.dataset.action === 'granted' ? '已送出，成就 +2.0kg 🎉' : '状态已更新', icon: 'none' })
    this.load()
  },

  async mutualAction(e) {
    const action = e.currentTarget.dataset.action
    const fn = action === 'finish' ? api.finishMutual : api.cancelMutual
    const res = await fn(e.currentTarget.dataset.id)
    if (res.code !== 0) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }
    wx.showToast({ title: action === 'finish' ? '完成 🌱' : '已取消', icon: 'none' })
    this.load()
  },

  goCreate() {
    const url = this.data.type === 'posts' ? '/pages/post/post'
      : (this.data.type === 'mutual' ? '/pages/mutual/mutual' : '/pages/upcycle/upcycle')
    wx.switchTab({ url: url })
  },
  goUpcycle() { wx.switchTab({ url: '/pages/upcycle/upcycle' }) }
})
