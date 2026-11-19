const api = require('../../utils/api.js')

const CARD_CLASSES = ['card--yellow', 'card--mint', 'card--purple']
const EMOJIS = ['📦', '✨', '🛠️']

function decorate(schemes) {
  return schemes.map(function (s, i) {
    return Object.assign({}, s, {
      cardClass: CARD_CLASSES[i % 3],
      emoji: EMOJIS[i % 3],
      materialCount: (s.materials || []).length,
      stepCount: (s.steps || []).length,
      delay: i * 80,
      favorited: false
    })
  })
}

Page({
  data: {
    item: '',
    scenes: ['宿舍桌面', '收纳', '装饰', '宠物', '其他'],
    sceneIndex: 1,
    schemes: [],
    generating: false,
    notice: '',
    favCount: 0,
    doneCount: 0,
    aiState: null
  },

  onLoad() {
    this.loadCounts()
    this.loadAiState()
  },
  onShow() { this.loadCounts() },

  async loadAiState() {
    const res = await api.aiStatus()
    if (res.code === 0) this.setData({ aiState: res.data })
  },

  onItemInput(e) { this.setData({ item: e.detail.value }) },
  selectScene(e) { this.setData({ sceneIndex: Number(e.currentTarget.dataset.index) }) },
  fillExample() { this.setData({ item: '空快递纸箱', sceneIndex: 1 }) },

  async loadCounts() {
    const res = await api.getProfile()
    if (res.code === 0) {
      this.setData({ favCount: res.data.favorites.length, doneCount: res.data.upcycles.filter((x) => x.doneScheme >= 0).length })
    }
  },

  async generate() {
    if (this.data.generating) return
    const item = String(this.data.item || '').trim()
    if (!item) {
      wx.showToast({ title: '先告诉我是什么旧物', icon: 'none' })
      return
    }
    this.setData({ generating: true, schemes: [], notice: '' })
    const res = await api.aiUpcycle({
      item: item,
      scene: this.data.scenes[this.data.sceneIndex],
      constraints: '零成本、宿舍现有材料、不动明火'
    })
    this.setData({ generating: false })

    if (res.code !== 0) {
      this.setData({ notice: 'AI 开小差了，先把旧物名字换个说法再试一次～' })
      return
    }
    const schemes = decorate(res.data.result.schemes)
    wx.setStorageSync('aiszj_schemes', {
      item: item,
      scene: this.data.scenes[this.data.sceneIndex],
      schemes: schemes
    })
    this.setData({
      schemes: schemes,
      notice: res.data.degraded
        ? '工作流未接入（' + (res.data.reason || '未配置模型/工作流') + '），已用本地规则生成 3 套方案，文字内容完整可用。'
        : ''
    })
    await api.saveUpcycle({ item: item, scene: this.data.scenes[this.data.sceneIndex], schemes: res.data.result.schemes })
    wx.showToast({ title: '3 套方案来啦 ✨', icon: 'none' })
  },

  openScheme(e) {
    const i = Number(e.currentTarget.dataset.index)
    wx.navigateTo({ url: '/pages/scheme/scheme?index=' + i })
  },

  async toggleFav(e) {
    const i = Number(e.currentTarget.dataset.index)
    const s = this.data.schemes[i]
    const payload = {
      item: this.data.item,
      scene: this.data.scenes[this.data.sceneIndex],
      schemeIndex: i,
      schemeName: s.name
    }
    const res = await api.toggleFavorite(payload)
    if (res.code !== 0) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }
    const key = 'schemes[' + i + '].favorited'
    this.setData({ [key]: res.data.favorited })
    this.loadCounts()
    wx.showToast({ title: res.data.favorited ? '收进收藏夹啦 ⭐' : '已取消收藏', icon: 'none' })
  },

  goFavorites() {
    wx.navigateTo({ url: '/pages/my-list/my-list?type=favorites' })
  },

  onShareAppMessage() {
    return { title: '旧物魔法工坊：把快递纸箱变个活法 ✨', path: '/pages/upcycle/upcycle' }
  }
})
