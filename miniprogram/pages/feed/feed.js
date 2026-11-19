const config = require('../../config.js')
const api = require('../../utils/api.js')

Page({
  data: {
    keyword: '',
    categories: ['全部'].concat(config.CAMPUS.categories),
    categoryIndex: 0,
    scopeIndex: 0,
    list: [],
    total: 0,
    page: 1,
    pageSize: 8,
    loading: true,
    showDetail: false,
    detailItem: null
  },

  onLoad() { this.load() },
  onShow() { this.load() },

  onKeywordInput(e) { this.setData({ keyword: e.detail.value }) },

  selectCategory(e) {
    this.setData({ categoryIndex: Number(e.currentTarget.dataset.index), page: 1 }, () => this.load())
  },

  switchScope(e) {
    this.setData({ scopeIndex: Number(e.currentTarget.dataset.index), page: 1 }, () => this.load())
  },

  async load() {
    this.setData({ loading: true })
    const profile = getApp().globalData.profile || {}
    const res = await api.listFeed({
      building: this.data.scopeIndex === 0 ? (profile.building || config.CAMPUS.buildings[0]) : '',
      scope: this.data.scopeIndex === 0 ? 'building' : 'college',
      category: this.data.categories[this.data.categoryIndex],
      keyword: this.data.keyword,
      page: 1,
      pageSize: this.data.pageSize
    })
    this.setData({
      loading: false,
      list: res.code === 0 ? res.data.list : [],
      total: res.code === 0 ? res.data.total : 0,
      page: 1
    })
  },

  async loadMore() {
    const next = this.data.page + 1
    const profile = getApp().globalData.profile || {}
    const res = await api.listFeed({
      building: this.data.scopeIndex === 0 ? (profile.building || config.CAMPUS.buildings[0]) : '',
      scope: this.data.scopeIndex === 0 ? 'building' : 'college',
      category: this.data.categories[this.data.categoryIndex],
      keyword: this.data.keyword,
      page: next,
      pageSize: this.data.pageSize
    })
    if (res.code === 0 && res.data.list.length) {
      this.setData({ list: this.data.list.concat(res.data.list), page: next })
    } else {
      wx.showToast({ title: '没有更多啦', icon: 'none' })
    }
  },

  openDetail(e) {
    const i = Number(e.currentTarget.dataset.index)
    this.setData({ detailItem: this.data.list[i], showDetail: true })
  },
  closeDetail() { this.setData({ showDetail: false }) },
  noop() {},

  wantIt() {
    this.setData({ showDetail: false })
    wx.showModal({
      title: '当面交付，顺手带走 🤝',
      content: '不做在线支付与物流，请在楼栋下约时间当面取。',
      showCancel: false,
      confirmText: '知道啦'
    })
  },

  async reportIt() {
    const item = this.data.detailItem
    if (!item) return
    const res = await api.report(item._id, '用户举报：闲置信息')
    this.setData({ showDetail: false })
    wx.showToast({ title: res.code === 0 ? '已收到，我们会看看' : res.msg, icon: 'none' })
  },

  goPost() { wx.switchTab({ url: '/pages/post/post' }) },

  onShareAppMessage() {
    return { title: 'AI宿造局 · 楼上楼下好物在传', path: '/pages/feed/feed' }
  }
})
