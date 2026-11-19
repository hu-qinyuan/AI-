const config = require('./config.js')
const store = require('./utils/store.js')
const profileStore = require('./utils/profile.js')

App({
  globalData: {
    appName: 'AI宿造局',
    mascot: '📦',
    mode: 'demo', // demo = 本地演示；cloud = 微信云开发
    openid: '',
    profile: null
  },

  onLaunch() {
    this.initCloud()
    this.initIdentity()
    store.ensureSeed()
  },

  initCloud() {
    const c = config.CLOUD
    if (!c.enabled || !c.env) {
      this.globalData.mode = 'demo'
      return
    }
    if (!wx.cloud) {
      this.globalData.mode = 'demo'
      wx.showToast({ title: '基础库版本过低，已用演示模式', icon: 'none' })
      return
    }
    try {
      wx.cloud.init({ env: c.env, traceUser: c.traceUser })
      this.globalData.mode = 'cloud'
    } catch (err) {
      this.globalData.mode = 'demo'
      wx.showToast({ title: '云环境未就绪，已用演示模式', icon: 'none' })
    }
  },

  initIdentity() {
    // 演示模式用本机稳定标识；云模式由云函数从 OPENID 上下文识别用户，前端不传 openid
    let id = ''
    try {
      id = wx.getStorageSync('aiszj_demo_openid') || ''
      if (!id) {
        id = 'demo_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
        wx.setStorageSync('aiszj_demo_openid', id)
      }
    } catch (err) {
      id = 'demo_guest'
    }
    this.globalData.openid = id
    // 楼栋 / 房间号从本机长期设置恢复，不再每次启动退回默认 A 栋
    // 注意：这里不能传默认 building，否则会盖掉用户保存的值
    this.globalData.profile = profileStore.merge({
      nickname: '宿宝同学',
      avatarText: '宿',
      college: config.CAMPUS.college
    })
  },

  isCloud() {
    return this.globalData.mode === 'cloud'
  },

  getOpenid() {
    return this.globalData.openid
  }
})
