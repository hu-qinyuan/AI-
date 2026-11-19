const api = require('../../utils/api.js')

const EMOJIS = ['📦', '✨', '🛠️']

Page({
  data: {
    scheme: null,
    index: 0,
    item: '',
    scene: '',
    effectEmoji: '✨',
    favorited: false,
    done: false
  },

  onLoad(options) {
    const index = Number(options.index || 0)
    let bundle = null
    try { bundle = wx.getStorageSync('aiszj_schemes') } catch (err) { bundle = null }
    if (!bundle || !bundle.schemes || !bundle.schemes[index]) return
    const s = Object.assign({}, bundle.schemes[index], {
      stepCount: (bundle.schemes[index].steps || []).length
    })
    this.setData({
      scheme: s,
      index: index,
      item: bundle.item || '旧物',
      scene: bundle.scene || '收纳',
      effectEmoji: EMOJIS[index % 3]
    })
    this.checkState()
  },

  async checkState() {
    const res = await api.getProfile()
    if (res.code !== 0) return
    const fav = res.data.favorites.some((x) => x.schemeName === this.data.scheme.name)
    const done = res.data.upcycles.some((x) => x.item === this.data.item && x.doneScheme === this.data.index)
    this.setData({ favorited: fav, done: done })
  },

  async toggleFav() {
    const res = await api.toggleFavorite({
      item: this.data.item,
      scene: this.data.scene,
      schemeIndex: this.data.index,
      schemeName: this.data.scheme.name
    })
    if (res.code !== 0) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }
    this.setData({ favorited: res.data.favorited })
    wx.showToast({ title: res.data.favorited ? '收好啦 ⭐' : '已取消收藏', icon: 'none' })
  },

  async markDone() {
    if (this.data.done) return
    const res = await api.markUpcycleDone(this.data.item, this.data.index)
    if (res.code !== 0) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }
    this.setData({ done: true })
    wx.showModal({
      title: '太棒啦！🌱',
      content: '这件旧物成功续命，已为你记上约 1.0kg 的减碳估算值。',
      showCancel: false,
      confirmText: '继续逛逛'
    })
  },

  goBack() { wx.navigateBack({ delta: 1 }) },

  onShareAppMessage() {
    return { title: '我把' + this.data.item + '改造成了' + this.data.scheme.name + ' ✨', path: '/pages/upcycle/upcycle' }
  }
})
