const config = require('../../config.js')
const api = require('../../utils/api.js')

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const chars = String(text || '').split('')
  const lines = []
  let line = ''
  chars.forEach(function (ch) {
    if (line && ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line)
      line = ch
    } else {
      line += ch
    }
  })
  if (line) lines.push(line)
  const show = lines.slice(0, maxLines || 3)
  show.forEach(function (l, i) { ctx.fillText(l, x, y + i * lineHeight) })
  return show.length
}

Page({
  data: {
    rawText: '',
    rawTextLength: 0,
    recording: false,
    speechReady: false,
    speechMode: 'off',
    speechBusy: false,
    speechTip: '',
    liveText: '',
    generating: false,
    showCard: false,
    notice: '',
    missingText: '',
    detectedText: '',
    routeText: '',
    sourceText: '',
    confidenceText: '',
    lastSource: 'local',
    samples: config.MUTUAL_SAMPLES,
    aiState: null,
    stateExpanded: false,
    types: config.CAMPUS.mutualTypes,
    scopes: config.CAMPUS.scopes,
    urgencies: config.CAMPUS.urgencies,
    typeIndex: 0,
    card: {
      type: '其他', title: '', demand: '', timeText: '', timeStart: '',
      timeSlot: '', timeLabel: '', location: '', fromPlace: '', toPlace: '',
      locationDetail: '', reward: '', urgency: '普通', scope: '本楼栋',
      detected: {}, confidence: 0, missing_fields: []
    },
    filters: ['全部', '待接单', '我参与的'],
    filterIndex: 0,
    list: []
  },

  onLoad() {
    this.initRecorder()
    this.loadList()
    this.loadAiState()
  },
  onShow() {
    this.loadList()
    if (!this.data.aiState) this.loadAiState()
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

  // 语音双通道：
  // A 微信同声传译插件（需后台授权 + app.json 声明，实时识别；未声明时 requirePlugin 仅在本页抛错）
  // B 原生录音 + 云端 ASR（默认，不需要任何插件授权，模拟器也能编译启动）
  initRecorder() {
    try {
      const plugin = requirePlugin('WechatSI')
      const manager = plugin && plugin.getRecordRecognitionManager ? plugin.getRecordRecognitionManager() : null
      if (!manager) throw new Error('WechatSI 未声明')
      const self = this

      manager.onStart = function () {
        self.setData({ recording: true, liveText: '' })
      }
      manager.onRecognize = function (res) {
        if (res && res.result) self.setData({ liveText: String(res.result).slice(0, 100) })
      }
      manager.onStop = function (res) {
        self.setData({ recording: false, liveText: '' })
        const text = String((res && res.result) || '').trim()
        if (!text) {
          wx.showToast({ title: '没听清，再说一次～', icon: 'none' })
          return
        }
        const raw = text.slice(0, 100)
        self.setData({ rawText: raw, rawTextLength: raw.length, notice: '' })
        self.generate({ speech: true })
      }
      manager.onError = function (res) {
        self.setData({ recording: false, liveText: '' })
        const msg = String((res && res.msg) || '')
        if (/auth|permission|权限/i.test(msg) || (res && res.retcode === -40001)) {
          wx.showModal({
            title: '需要麦克风权限',
            content: '请在设置里允许录音，才能长按说话。',
            confirmText: '去设置',
            success: function (r) { if (r.confirm) wx.openSetting() }
          })
        } else {
          wx.showToast({ title: '没录上，请真机重试或直接打字', icon: 'none' })
        }
      }

      this.siManager = manager
      this.setData({ speechMode: 'plugin', speechReady: true, speechTip: '长按说话，松手自动转文字' })
      return
    } catch (err) {
      this.siManager = null
    }

    if (wx.getRecorderManager) {
      try {
        const recorder = wx.getRecorderManager()
        const self = this
        recorder.onStart(function () { self.setData({ recording: true, liveText: '' }) })
        recorder.onStop(function (res) {
          self.setData({ recording: false, liveText: '' })
          const p = res && (res.tempFilePath || res.apFilePath)
          if (p) self.recognizeCloudAudio(p)
          else wx.showToast({ title: '录音没保存成功，请重试', icon: 'none' })
        })
        recorder.onError(function () {
          self.setData({ recording: false, liveText: '' })
          wx.showToast({ title: '录音失败，请真机重试或直接打字', icon: 'none' })
        })
        this.recorder = recorder
        this.setData({ speechMode: 'cloud', speechReady: true, speechTip: '长按说话，松手后云端转文字' })
        return
      } catch (err) {
        this.recorder = null
      }
    }
    this.setData({ speechMode: 'off', speechReady: false, speechTip: '当前环境不支持录音，直接打字也能生成卡片' })
  },

  ensureMic(begin) {
    wx.getSetting({
      success: function (res) {
        const auth = res.authSetting || {}
        if (auth['scope.record'] === false) {
          wx.showModal({
            title: '需要麦克风权限', content: '请在设置里允许录音。', confirmText: '去设置',
            success: function (r) { if (r.confirm) wx.openSetting() }
          })
          return
        }
        if (!auth['scope.record']) {
          wx.authorize({
            scope: 'scope.record',
            success: begin,
            fail: function () { wx.showToast({ title: '需要麦克风权限才能说话', icon: 'none' }) }
          })
        } else begin()
      },
      fail: begin
    })
  },

  startRecord() {
    const mode = this.data.speechMode
    if (mode === 'off') {
      wx.showToast({ title: '语音未启用，请打字', icon: 'none' })
      return
    }
    if (this.data.recording || this.data.speechBusy) return
    this._stopPending = false
    const self = this
    const begin = function () {
      // 授权异步期间用户已松手：不再启动录音
      if (self._stopPending) { self._stopPending = false; return }
      try {
        if (mode === 'plugin') self.siManager.start({ lang: 'zh_CN', duration: 30000 })
        else self.recorder.start({ format: 'mp3', duration: 20000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000 })
      } catch (e) {
        self.setData({ recording: false })
        wx.showToast({ title: '录音启动失败，请真机重试', icon: 'none' })
      }
    }
    this.ensureMic(begin)
  },

  stopRecord() {
    if (!this.data.recording) { this._stopPending = true; return }
    try {
      if (this.data.speechMode === 'plugin') this.siManager.stop()
      else this.recorder.stop()
    } catch (e) { this.setData({ recording: false, liveText: '' }) }
  },

  // 通道 B：录音 → base64 → aiSpeech（云端 ASR + 纠错 + 互助卡）
  recognizeCloudAudio(tempFilePath) {
    const self = this
    this.setData({ speechBusy: true, notice: '' })
    wx.showLoading({ title: '正在转文字…', mask: true })
    wx.getFileSystemManager().readFile({
      filePath: tempFilePath,
      encoding: 'base64',
      success: async function (f) {
        const res = await api.speechRecognize({ audio_base64: f.data, audio_format: 'mp3' })
        wx.hideLoading()
        self.setData({ speechBusy: false })
        if (res.code !== 0) {
          self.setData({
            speechReady: false,
            speechTip: '语音转文字暂不可用，直接打字也能生成卡片',
            notice: '🎙️ ' + (res.msg || '语音识别失败') + '。'
          })
          wx.showToast({ title: '语音未转成文字', icon: 'none' })
          return
        }
        const text = String(res.data.recognized_text || '').slice(0, 100)
        if (!text) {
          self.setData({ notice: '没听清，再说一次～；也可以直接打字。' })
          return
        }
        self.setData({ rawText: text, rawTextLength: text.length })
        if (res.data.textOnly) { self.generate({ speech: true }); return }
        self.applyCard(res, text, true)
      },
      fail: function () {
        wx.hideLoading()
        self.setData({ speechBusy: false, notice: '读取录音失败，请直接打字。' })
      }
    })
  },

  onRawInput(e) {
    this.setData({ rawText: e.detail.value, rawTextLength: String(e.detail.value || '').length })
  },

  useSample(e) {
    const text = e.currentTarget.dataset.text
    if (!text) return
    this.setData({ rawText: text, rawTextLength: text.length })
    this.generate()
  },

  async generate(opts) {
    if (this.data.generating) return
    const speech = !!(opts && opts.speech)
    const raw = String(this.data.rawText || '').trim()
    if (!raw) {
      wx.showToast({ title: '先说一句需求吧', icon: 'none' })
      return
    }
    this.setData({ generating: true, showCard: false, notice: '' })
    const payload = { raw_text: raw, now: new Date().toISOString() }
    const res = speech ? await api.aiSpeech(payload) : await api.aiMutual(payload)
    this.setData({ generating: false })
    if (res.code !== 0) {
      this.setData({ notice: 'AI 开小差了，可以自己把需求写清楚再发～' })
      return
    }
    this.applyCard(res, raw, speech)
  },

  // 打字、插件语音、云端 ASR 三条入口共用同一套卡片渲染
  applyCard(res, raw, speech) {
    const r = res.data.result
    const card = {
      type: r.type,
      title: r.title,
      demand: r.demand || raw,
      timeText: r.time_text || '',
      timeStart: r.time_start || '',
      timeSlot: r.time_slot || '',
      timeLabel: r.time_label || '',
      location: r.location || '',
      fromPlace: r.from_place || '',
      toPlace: r.to_place || '',
      locationDetail: r.location_detail || '',
      reward: r.reward || '',
      urgency: r.urgency,
      scope: r.scope,
      detected: r.detected || {},
      confidence: r.confidence || 0,
      missing_fields: r.missing_fields
    }
    const names = { location: '地点', time_start: '具体日期', demand: '需求内容' }
    const missingText = (r.missing_fields || []).map((x) => names[x] || x).join('、')
    const d = r.detected || {}
    const bits = []
    if (d.date) bits.push('日期「' + d.date + '」')
    if (d.slot) bits.push('时段「' + d.slot + '」')
    if (d.place) bits.push('地点「' + d.place + '」')
    if (d.dateInferred) bits.push('日期按今天推断')
    const src = res.data.source
    const srcLabel = src === 'local' ? '本地规则引擎' : (res.data.model ? res.data.provider + ' · ' + res.data.model : (res.data.provider || '外部工作流'))
    let notice = res.data.degraded
      ? 'AI 调用未成功（' + (res.data.reason || '未配置模型/工作流') + '），已用本地规则提取；时间、地点、需求都可改。'
      : ''
    if (!notice && speech && r.cleaned_text && r.cleaned_text !== raw) {
      notice = '🎙️ 已按语音纠错：' + r.cleaned_text
    }
    this.setData({
      card: card,
      typeIndex: Math.max(0, this.data.types.indexOf(r.type)),
      showCard: true,
      missingText: missingText,
      detectedText: bits.length ? bits.join(' · ') : '没找到明确的时间/地点线索，已留空不编造',
      routeText: (card.fromPlace && card.toPlace) ? (card.fromPlace + ' → ' + card.toPlace) : '',
      sourceText: (speech ? '🎙️ 语音 · ' : '') + srcLabel,
      confidenceText: Math.round((r.confidence || 0) * 100) + '%',
      lastSource: src,
      notice: notice
    })
  },

  onCardInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    const patch = { ['card.' + field]: value }
    if (field === 'fromPlace' || field === 'toPlace') {
      const c = Object.assign({}, this.data.card, { [field]: value })
      patch.routeText = (c.fromPlace && c.toPlace) ? (c.fromPlace + ' → ' + c.toPlace) : ''
    }
    if (field === 'timeSlot') {
      patch['card.timeLabel'] = (this.data.card.timeStart || '') + (value ? ' ' + value : '')
    }
    this.setData(patch)
  },
  onTypeChange(e) {
    const i = Number(e.detail.value)
    this.setData({ typeIndex: i, 'card.type': this.data.types[i] })
  },
  onDateChange(e) {
    const v = e.detail.value
    this.setData({
      'card.timeStart': v,
      'card.timeLabel': v + (this.data.card.timeSlot ? ' ' + this.data.card.timeSlot : '')
    })
  },
  selectScope(e) { this.setData({ 'card.scope': e.currentTarget.dataset.value }) },
  selectUrgency(e) { this.setData({ 'card.urgency': e.currentTarget.dataset.value }) },

  async publish() {
    const c = this.data.card
    const res = await api.createMutual(Object.assign({}, c, { rawText: this.data.rawText }))
    if (res.code !== 0) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }
    this.setData({ showCard: false, rawText: '', rawTextLength: 0, notice: '', missingText: '', detectedText: '', routeText: '' })
    wx.showToast({ title: '已发到广场 🎉', icon: 'none' })
    this.loadList()
  },

  // 生成一张可保存 / 转发的互助卡片图片
  async saveCardImage() {
    const c = this.data.card
    wx.showLoading({ title: '正在画卡片…', mask: true })
    try {
      const info = await new Promise(function (resolve, reject) {
        wx.createSelectorQuery().select('#cardCanvas').fields({ node: true, size: true }).exec(function (res) {
          if (res && res[0] && res[0].node) resolve(res[0])
          else reject(new Error('画布未就绪'))
        })
      })
      const canvas = info.node
      const ctx = canvas.getContext('2d')
      const dpr = (wx.getSystemInfoSync ? wx.getSystemInfoSync().pixelRatio : 2) || 2
      const W = 640
      const H = 880
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.scale(dpr, dpr)

      ctx.fillStyle = '#FFF8EC'
      ctx.fillRect(0, 0, W, H)
      ctx.strokeStyle = '#3B2B26'
      ctx.lineWidth = 5
      roundRect(ctx, 22, 22, W - 44, H - 44, 30)
      ctx.stroke()

      ctx.fillStyle = '#F4662C'
      ctx.font = 'bold 26px sans-serif'
      ctx.fillText('AI宿造局 · 互助卡', 54, 82)
      ctx.fillStyle = '#A08B79'
      ctx.font = '20px sans-serif'
      ctx.fillText('泓江书院 · ' + c.scope + '可见', 54, 116)

      // 类型 + 紧急度标签
      ctx.fillStyle = '#DCEEFF'
      roundRect(ctx, 54, 140, 140, 48, 24)
      ctx.fill()
      ctx.strokeStyle = '#3B2B26'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle = '#3B2B26'
      ctx.font = 'bold 24px sans-serif'
      ctx.fillText(c.type, 76, 172)
      ctx.fillStyle = '#FFE3E0'
      roundRect(ctx, 208, 140, 130, 48, 24)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#3B2B26'
      ctx.fillText(c.urgency, 230, 172)

      ctx.fillStyle = '#3B2B26'
      ctx.font = 'bold 40px sans-serif'
      const titleLines = wrapText(ctx, c.title || '互助需求', 54, 246, W - 130, 50, 2)

      ctx.fillStyle = '#6E5B4E'
      ctx.font = '24px sans-serif'
      const demandY = 246 + titleLines * 50 + 16
      const demandLines = wrapText(ctx, c.demand || '', 54, demandY, W - 130, 36, 3)

      ctx.strokeStyle = '#E2D2C0'
      ctx.lineWidth = 2
      let lineY = demandY + demandLines * 36 + 18
      ctx.beginPath()
      ctx.moveTo(54, lineY)
      ctx.lineTo(W - 76, lineY)
      ctx.stroke()

      const rows = [
        ['时间', c.timeLabel || c.timeStart || '待补'],
        ['地点', (c.location || '待补') + (c.locationDetail ? '（' + c.locationDetail + '）' : '')],
        ['路线', this.data.routeText || '—'],
        ['酬劳', c.reward || '未提'],
        ['紧急', c.urgency]
      ]
      let y = lineY + 50
      ctx.font = '24px sans-serif'
      rows.forEach(function (row) {
        ctx.fillStyle = '#A08B79'
        ctx.fillText(row[0], 54, y)
        ctx.fillStyle = '#3B2B26'
        ctx.font = 'bold 24px sans-serif'
        wrapText(ctx, row[1], 140, y, W - 220, 32, 1)
        ctx.font = '24px sans-serif'
        y += 52
      })

      ctx.fillStyle = '#A08B79'
      ctx.font = '20px sans-serif'
      ctx.fillText('信息由 AI 从原话提取，发布前请确认 · ' + (this.data.sourceText || ''), 54, H - 66)

      const tmp = await new Promise(function (resolve, reject) {
        wx.canvasToTempFilePath({
          canvas: canvas,
          success: function (r) { resolve(r.tempFilePath) },
          fail: reject
        })
      })
      wx.hideLoading()
      const self = this
      if (wx.showShareImageMenu) {
        wx.showShareImageMenu({ path: tmp, fail: function () { self.saveToAlbum(tmp) } })
      } else {
        this.saveToAlbum(tmp)
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '卡片生成失败，可直接截图分享', icon: 'none' })
    }
  },

  saveToAlbum(path) {
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success() { wx.showToast({ title: '卡片已存到相册 🖼️', icon: 'none' }) },
      fail() { wx.showToast({ title: '保存失败，可截图分享', icon: 'none' }) }
    })
  },

  selectFilter(e) {
    this.setData({ filterIndex: Number(e.currentTarget.dataset.index) }, () => this.loadList())
  },

  async loadList() {
    const profile = getApp().globalData.profile || {}
    const res = await api.listMutual({ scope: '本楼栋', building: profile.building || config.CAMPUS.buildings[0] })
    if (res.code !== 0) {
      this.setData({ list: [] })
      return
    }
    let list = res.data.list.map((x) => Object.assign({}, x, { expanded: !x.expired }))
    if (this.data.filterIndex === 1) list = list.filter((x) => x.status === 'open')
    if (this.data.filterIndex === 2) list = list.filter((x) => x.isMine || x.isTaker)
    this.setData({ list: list })
  },

  async doAction(e) {
    const action = e.currentTarget.dataset.action
    const id = e.currentTarget.dataset.id
    if (action === 'expand') {
      const list = this.data.list.map((x) => x._id === id ? Object.assign({}, x, { expanded: !x.expanded }) : x)
      this.setData({ list: list })
      return
    }
    if (action === 'report') {
      const res = await api.report(id, '用户举报：互助信息')
      wx.showToast({ title: res.code === 0 ? '已收到，我们会看看' : res.msg, icon: 'none' })
      return
    }
    const fn = action === 'take' ? api.takeMutual : (action === 'finish' ? api.finishMutual : api.cancelMutual)
    const res = await fn(id)
    if (res.code !== 0) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }
    const words = { take: '接单成功，联系一下对方吧 🤝', finish: '完成 +1，已记入减碳小账本 🌱', cancel: '已取消' }
    wx.showToast({ title: words[action], icon: 'none' })
    this.loadList()
  },

  scrollToInput() {
    wx.pageScrollTo({ scrollTop: 0, duration: 300 })
    wx.showToast({ title: '在上方输入框说一句吧', icon: 'none' })
  },

  onShareAppMessage() {
    return { title: 'AI宿造局 · 说句话，就有人接 🤝', path: '/pages/mutual/mutual' }
  }
})
