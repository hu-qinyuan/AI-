const config = require('../../config.js')
const api = require('../../utils/api.js')

const DEMO_EMOJIS = ['📦', '📚', '💡', '🎧', '🧥', '🏸', '🪴', '⌨️', '🎒', '🥤']
const TIPS = [
  '闲着也是闲着，不如让它去下一位同学的桌上发光 ✨',
  '写不出来没关系，我替你编（不是瞎编）🤪',
  '今天送出去一件，双十一就少买一件 🌱',
  '楼下的同学可能正好在找这个东西哦 🏃',
  '断舍离的最高境界：让别人替你继续用 😌'
]

// 图片压缩到长边 1080 左右并读成 base64，控制云函数入参体积
function compressImage(path) {
  return new Promise(function (resolve) {
    if (!wx.compressImage) return resolve(path)
    try {
      wx.compressImage({
        src: path,
        quality: 70,
        success(r) { resolve(r.tempFilePath || path) },
        fail() { resolve(path) }
      })
    } catch (err) { resolve(path) }
  })
}

function readBase64(path) {
  return new Promise(function (resolve) {
    try {
      const buf = wx.getFileSystemManager().readFileSync(path)
      const kb = buf.byteLength / 1024
      if (!wx.arrayBufferToBase64) return resolve({ b64: '', kb: kb })
      resolve({ b64: wx.arrayBufferToBase64(buf), kb: kb })
    } catch (err) { resolve({ b64: '', kb: 0 }) }
  })
}

Page({
  data: {
    modeText: '演示模式',
    step: 1,
    imagePath: '',
    cloudFileID: '',
    imageBase64: '',
    imageTooLarge: false,
    demoImage: false,
    coverEmoji: '📦',
    picButtonText: '拍照 / 相册',
    hint: '',
    styles: config.STYLES,
    styleIndex: 2,
    styleHint: config.STYLES[2].hint,
    categories: config.CAMPUS.categories,
    conditions: config.CAMPUS.conditions,
    dealModes: config.CAMPUS.dealModes,
    buildings: config.CAMPUS.buildings,
    categoryIndex: 3,
    conditionIndex: 3,
    dealIndex: 0,
    buildingIndex: 0,
    form: {
      title: '', desc: '', category: '生活', condition: '能用就行', price: '0',
      dealMode: '赠送', building: config.CAMPUS.buildings[0], room: '', tags: []
    },
    tagInput: '',
    generating: false,
    showForm: false,
    publishing: false,
    notice: '',
    aiMeta: null,
    tip: TIPS[0],
    // ↓ AI 接入状态与识图结果
    aiState: null,
    stateExpanded: false,
    recognized: null,
    confidenceText: '',
    sourceText: '',
    featuresText: '',
    chosenItem: '',
    copySeed: 1,
    lastSource: 'local'
  },

  onLoad() {
    this.setData({
      modeText: api.isCloud() ? '云开发' : '演示模式',
      tip: TIPS[Math.floor(Math.random() * TIPS.length)]
    })
    this.applySavedProfile()
    this.loadAiState()
  },

  onShow() {
    this.setData({ modeText: api.isCloud() ? '云开发' : '演示模式' })
    this.applySavedProfile()
    if (!this.data.aiState) this.loadAiState()
  },

  // 「我的局子」里保存的楼栋 / 房间号自动带入，发布闲置无需每次重填
  applySavedProfile() {
    const p = api.currentProfile()
    const patch = {}
    if (!this._buildingEdited) {
      const b = p.building || config.CAMPUS.buildings[0]
      patch['form.building'] = b
      patch.buildingIndex = Math.max(0, this.data.buildings.indexOf(b))
    }
    if (!this._roomEdited) patch['form.room'] = p.room || ''
    this.setData(patch)
  },

  async loadAiState() {
    const res = await api.aiStatus()
    if (res.code !== 0) return
    const d = res.data
    const ch = d.channels || {}
    const defs = [
      { key: 'WF_A', label: 'WF-A 识图 + 文案' },
      { key: 'WF_B', label: 'WF-B 互助卡片' },
      { key: 'WF_C', label: 'WF-C 改造方案' }
    ]
    // WXML 不便于遍历对象，这里预先整理成数组
    d.channelList = defs.map(function (x) {
      const c = ch[x.key] || {}
      return {
        key: x.key,
        label: c.label || x.label,
        icon: c.connected ? '✅' : '⚠️',
        statusText: c.connected
          ? (c.via === 'model' ? '模型直连 · ' + (c.model || '') : '外部工作流')
          : ('未接入 · ' + (c.reason || '缺配置'))
      }
    })
    this.setData({ aiState: d })
  },

  toggleState() {
    this.setData({ stateExpanded: !this.data.stateExpanded })
  },

  async prepareImage(path) {
    const compressed = await compressImage(path)
    const r = await readBase64(compressed)
    const tooLarge = r.kb > config.AI.imageMaxKB
    this.setData({
      imageBase64: tooLarge ? '' : r.b64,
      imageTooLarge: tooLarge
    })
  },

  choosePic() {
    const self = this
    const done = function (path, size) {
      if (size && size > 10 * 1024 * 1024) {
        wx.showToast({ title: '图片太大啦（≤10MB）', icon: 'none' })
        return
      }
      self.setData({
        imagePath: path, demoImage: false, cloudFileID: '',
        imageBase64: '', imageTooLarge: false,
        recognized: null, chosenItem: '', showForm: false, step: 2,
        picButtonText: '重新选图'
      })
      self.prepareImage(path)
    }
    const fallback = function () {
      wx.chooseImage({
        count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
        success(r) { done(r.tempFilePaths[0], 0) },
        fail() { wx.showToast({ title: '没能选到图片，可以点「用示例图」', icon: 'none' }) }
      })
    }
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success(res) {
          const f = res.tempFiles && res.tempFiles[0]
          if (f) done(f.tempFilePath, f.size)
        },
        fail: fallback
      })
    } else {
      fallback()
    }
  },

  useDemoPic() {
    const emoji = DEMO_EMOJIS[Math.floor(Math.random() * DEMO_EMOJIS.length)]
    this.setData({
      coverEmoji: emoji, imagePath: '', imageBase64: '', imageTooLarge: false,
      demoImage: true, cloudFileID: '', picButtonText: '重新选图', step: 2,
      recognized: null, chosenItem: '', showForm: false
    })
    wx.showToast({ title: '已放进一张示例图 🎲', icon: 'none' })
  },

  onHintInput(e) { this.setData({ hint: e.detail.value }) },

  selectStyle(e) {
    const i = Number(e.currentTarget.dataset.index)
    this.setData({ styleIndex: i, styleHint: config.STYLES[i].hint })
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field
    if (field === 'room') this._roomEdited = true
    this.setData({ ['form.' + field]: e.detail.value })
  },

  onCategoryChange(e) {
    const i = Number(e.detail.value)
    this.setData({ categoryIndex: i, 'form.category': this.data.categories[i] })
  },
  onConditionChange(e) {
    const i = Number(e.detail.value)
    this.setData({ conditionIndex: i, 'form.condition': this.data.conditions[i] })
  },
  onDealChange(e) {
    const i = Number(e.detail.value)
    this.setData({ dealIndex: i, 'form.dealMode': this.data.dealModes[i] })
  },
  onBuildingChange(e) {
    const i = Number(e.detail.value)
    this._buildingEdited = true
    this.setData({ buildingIndex: i, 'form.building': this.data.buildings[i] })
  },

  onTagInput(e) { this.setData({ tagInput: e.detail.value }) },
  addTag() {
    const t = String(this.data.tagInput || '').trim()
    if (!t) return
    if (this.data.form.tags.length >= 5) {
      wx.showToast({ title: '最多 5 个标签', icon: 'none' })
      return
    }
    const tags = this.data.form.tags.concat([t])
    this.setData({ 'form.tags': tags, tagInput: '' })
  },

  // opts.regenerate = 换一版文案；opts.itemName = 用户从候选中点选的物品
  async generate(opts) {
    if (this.data.generating) return
    const o = opts || {}
    if (!this.data.imagePath && !this.data.demoImage) {
      wx.showToast({ title: '先选张图，或点「用示例图」', icon: 'none' })
      return
    }
    this.setData({ generating: true, notice: '', showForm: false, step: 2 })

    // 图片仍上传云存储（发布要用 fileID），同时把 base64 交给视觉模型
    let imageUrl = this.data.imagePath || ('emoji:' + this.data.coverEmoji)
    if (this.data.imagePath) {
      const up = await api.uploadImage(this.data.imagePath)
      if (up.code === 0) {
        imageUrl = up.data.fileID
        this.setData({ cloudFileID: up.data.local ? '' : up.data.fileID })
      }
    }

    const seed = o.regenerate ? this.data.copySeed + 1 : 1
    const itemName = o.itemName || (o.regenerate ? this.data.chosenItem : '')
    const useLocal = (!!o.regenerate || !!o.itemName) && this.data.lastSource === 'local'
    const res = await api.aiPost({
      image_url: imageUrl,
      image_base64: this.data.imageBase64,
      style: this.data.styles[this.data.styleIndex].key,
      user_hint: this.data.hint,
      item_name: itemName,
      campus_context: '学生宿舍',
      seed: seed,
      salt: String(Date.now() % 100000),
      local_only: useLocal
    })
    this.setData({ generating: false })

    if (res.code !== 0) {
      this.setData({ showForm: true, step: 3, notice: 'AI 开小差了，下面是手填表单，照常能发布～' })
      return
    }

    const r = res.data.result
    const categories = this.data.categories
    const conditions = this.data.conditions
    const dealModes = this.data.dealModes
    const src = res.data.source
    const sourceText = src === 'local'
      ? '本地规则引擎'
      : (res.data.model ? res.data.provider + ' · ' + res.data.model : (res.data.provider || '外部工作流'))
    const features = r.item_features || []
    const recognized = {
      itemName: r.item_name || '',
      confidence: r.confidence,
      candidates: r.candidates || [],
      features: features,
      imageRecognized: r._image_recognized !== false,
      engine: r._engine || src,
      source: src,
      provider: res.data.provider || '',
      model: res.data.model || '',
      degraded: res.data.degraded
    }

    let notice = ''
    if (res.data.degraded) {
      const reason = res.data.reason || '未配置模型/工作流'
      const timeoutHint = /超时|timeout/i.test(reason)
        ? ' 若反复超时：请在云开发控制台把 aiPost / aiMutual / aiUpcycle 的超时调到 30 秒。'
        : ''
      notice = 'AI 调用未成功（' + reason + '），已用本地规则引擎兜底：它不会看图，请从下方候选点选物品或补一句描述。' + timeoutHint
    } else if (res.data.localOnly) {
      notice = '当前使用本地文案引擎（不会看图）：接入视觉模型后才会自动识别照片里的物品。'
    } else if (r.need_manual) {
      notice = 'AI 不太确定这是什么，请点一下候选物品或手动改标题与成色～'
    }

    this.setData({
      'form.title': r.title,
      'form.desc': r.desc,
      'form.category': r.category,
      'form.condition': r.condition,
      'form.price': String(r.price_suggestion),
      'form.dealMode': r.deal_mode,
      'form.tags': r.tags,
      categoryIndex: Math.max(0, categories.indexOf(r.category)),
      conditionIndex: Math.max(0, conditions.indexOf(r.condition)),
      dealIndex: Math.max(0, dealModes.indexOf(r.deal_mode)),
      showForm: true,
      step: 3,
      recognized: recognized,
      confidenceText: Math.round((r.confidence || 0) * 100) + '%',
      sourceText: sourceText,
      featuresText: features.join(' · '),
      chosenItem: r.item_name || '',
      copySeed: seed,
      lastSource: src,
      notice: notice,
      aiMeta: {
        workflow: 'WF-A', confidence: r.confidence, degraded: res.data.degraded,
        source: src, provider: res.data.provider || '', model: res.data.model || '',
        itemName: r.item_name || '', imageRecognized: recognized.imageRecognized
      }
    })
    wx.showToast({ title: '文案写好啦 ✨', icon: 'none' })
  },

  chooseCandidate(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    this.setData({ chosenItem: name })
    this.generate({ itemName: name })
  },

  regenerateCopy() {
    this.generate({ regenerate: true })
  },

  async publish() {
    if (this.data.publishing) return
    const f = this.data.form
    if (!f.title) {
      wx.showToast({ title: '还差一个标题', icon: 'none' })
      return
    }
    const images = this.data.demoImage
      ? ['emoji:' + this.data.coverEmoji]
      : [this.data.cloudFileID || this.data.imagePath]
    const location = f.building + (f.room ? ' · ' + f.room : '')

    this.setData({ publishing: true })
    const res = await api.createPost({
      images: images,
      coverEmoji: this.data.coverEmoji,
      title: f.title,
      desc: f.desc,
      category: f.category,
      condition: f.condition,
      price: Number(f.price) || 0,
      dealMode: f.dealMode,
      tags: f.tags,
      building: f.building,
      room: f.room,
      location: location,
      aiMeta: this.data.aiMeta || { workflow: 'manual', confidence: 1, degraded: false }
    })
    this.setData({ publishing: false })

    if (res.code !== 0) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }
    wx.showToast({ title: '发布成功，去广场看看 🎉', icon: 'none' })
    setTimeout(() => { wx.navigateTo({ url: '/pages/feed/feed' }) }, 700)
  },

  goFeed() {
    wx.navigateTo({ url: '/pages/feed/feed' })
  },

  onShareAppMessage() {
    return { title: 'AI宿造局：拍一拍，闲置变故事 ✨', path: '/pages/post/post' }
  }
})
