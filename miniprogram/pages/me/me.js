const config = require('../../config.js')
const api = require('../../utils/api.js')
const store = require('../../utils/store.js')
const profileStore = require('../../utils/profile.js')

Page({
  data: {
    profile: { nickname: '宿宝同学', college: '泓江书院', building: 'A 栋' },
    carbon: { carbonKg: 0, grantedCount: 0, mutualCount: 0, upcycleCount: 0 },
    level: { name: '纸箱萌新', emoji: '🌱' },
    nextLevel: null,
    percent: 0,
    stats: { posted: 0, granted: 0, mutualDone: 0, favorites: 0 },
    mutualCount: 0,
    buildings: config.CAMPUS.buildings,
    buildingIndex: 0,
    room: '',
    modeText: '演示模式'
  },

  onLoad() {
    this.setData({ modeText: api.isCloud() ? '云开发' : '演示模式' })
    this.load()
  },
  onShow() { this.load() },

  async load() {
    const res = await api.getProfile()
    const app = getApp()
    if (res.code !== 0) return
    const d = res.data
    const profile = d.profile || app.globalData.profile
    if (this.lastLevelName && this.lastLevelName !== d.level.name) {
      wx.showToast({ title: '升级啦！' + d.level.emoji + ' ' + d.level.name, icon: 'none' })
    }
    this.lastLevelName = d.level.name
    this.setData({
      profile: profile,
      carbon: d.carbon,
      level: d.level,
      nextLevel: d.nextLevel,
      percent: d.percent,
      stats: d.stats,
      mutualCount: d.mutual.length,
      buildingIndex: Math.max(0, this.data.buildings.indexOf(profile.building)),
      room: profile.room || '',
      modeText: api.isCloud() ? '云开发' : '演示模式'
    })
  },

  changeBuilding(e) {
    const i = Number(e.detail.value)
    const building = this.data.buildings[i]
    // 本机 + 云端双写，重启 / 换设备都不丢
    api.saveProfile({ building: building })
    this.setData({ buildingIndex: i, 'profile.building': building })
    wx.showToast({ title: '已记住 ' + building, icon: 'none' })
  },

  onRoomInput(e) {
    const room = e.detail.value
    // 输入即时写本机，云端同步做防抖，避免每敲一个字调用一次云函数
    profileStore.write({ room: room })
    this.setData({ room: room })
    clearTimeout(this._roomTimer)
    this._roomTimer = setTimeout(function () { api.saveProfile({ room: room }) }, 500)
  },

  goList(e) {
    wx.navigateTo({ url: '/pages/my-list/my-list?type=' + e.currentTarget.dataset.type })
  },

  goPost() { wx.switchTab({ url: '/pages/post/post' }) },

  resetDemo() {
    wx.showModal({
      title: '重置演示数据？',
      content: '会清空本机的发布、互助与收藏，恢复到初始种子内容。云开发模式下请在云控制台操作。',
      success: (r) => {
        if (!r.confirm) return
        try { wx.removeStorageSync(store.KEY) } catch (err) { /* 忽略 */ }
        store.ensureSeed()
        this.load()
        wx.showToast({ title: '已恢复初始状态 🔄', icon: 'none' })
      }
    })
  },

  onShareAppMessage() {
    return { title: '我在 AI宿造局攒下了 ' + this.data.carbon.carbonKg + 'kg 减碳 🌱', path: '/pages/me/me' }
  }
})
