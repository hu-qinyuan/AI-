// WF-S 语音互助：两条 ASR 通道 → 文本纠错 → 互助卡
// 通道 A：微信同声传译插件（端侧实时识别）→ 前端把 raw_text 送进来
// 通道 B：端侧原生录音 → audio_base64 / file_id → 本云函数调用 TokenHub sync_transcribe
// B 完全不依赖小程序插件授权，插件未启用时也能把声音变成文字。
const {
  cloud, ok, fail, wrap, aiConfig, aiStatus,
  callTextModel, callWorkflow, callASR, buildSpeechPrompt
} = require('./common')

exports.main = wrap(async (event) => {
  const cfg = aiConfig()
  if (event.probe) {
    return ok(Object.assign({}, aiStatus(), {
      asr: { configured: cfg.asr.configured, model: cfg.asr.model }
    }))
  }

  let raw = String(event.raw_text || event.rawText || '').trim()
  let recognized = ''
  let asrMeta = null
  const hasAudio = !!(event.audio_base64 || event.file_id || event.fileId)

  // ① 云端 ASR：把录音转文字（插件已识别出文字时不重复转）
  if (hasAudio && !raw) {
    let audio = String(event.audio_base64 || '')
    if (!audio) {
      try {
        const f = await cloud.downloadFile({ fileID: event.file_id || event.fileId })
        audio = f.fileContent.toString('base64')
      } catch (err) {
        return fail('读取录音文件失败：' + ((err && err.message) || '云存储不可达'), 3)
      }
    }
    const ar = await callASR(audio, { format: event.audio_format || 'mp3' })
    // 额度未开通 / 接口异常时明确报错，不再让前端拿空文字去跑本地引擎
    if (!ar.ok) return fail(ar.reason, 3)
    recognized = ar.text
    raw = recognized
    asrMeta = { model: ar.model, duration_ms: ar.duration_ms }
  }

  if (!raw) return fail('没听清，再说一次～', 400)
  raw = raw.slice(0, 100)

  const workflowPayload = {
    raw_text: raw,
    source: asrMeta ? 'tokenhub_asr' : 'wechat_si_asr',
    now: event.now || new Date().toISOString(),
    today: event.today || '',
    weekday: event.weekday || ''
  }

  // ② 纠错 + 结构化：有文本模型走模型，否则外部工作流；都没有则只回文字，前端用本地规则生成卡片
  let r = null
  if (cfg.text.configured) {
    const p = buildSpeechPrompt(Object.assign({}, event, { raw_text: raw }))
    r = await callTextModel(p.system, p.user, { temperature: 0.2, maxTokens: cfg.maxTokens.text })
    if (!r.ok && cfg.workflows.WF_B) r = await callWorkflow('WF_B_URL', workflowPayload)
  } else if (cfg.workflows.WF_B) {
    r = await callWorkflow('WF_B_URL', workflowPayload)
  } else {
    return ok({
      cleaned_text: raw,
      recognized_text: raw,
      _asr_only: true,
      _meta: { source: asrMeta ? 'asr' : 'passthrough', provider: cfg.providerName, model: '', workflow: 'WF-S', asr: asrMeta }
    })
  }

  if (!r || !r.ok) return fail('AI 接口调用失败：' + ((r && r.reason) || '未知原因'), 2)

  return ok(Object.assign({}, r.data, {
    cleaned_text: String(r.data.cleaned_text || raw).slice(0, 100),
    recognized_text: recognized || String(r.data.cleaned_text || raw).slice(0, 100),
    _meta: {
      source: r.via || 'model',
      provider: cfg.providerName,
      model: r.model || '',
      workflow: 'WF-S',
      asr: asrMeta
    }
  }))
})
