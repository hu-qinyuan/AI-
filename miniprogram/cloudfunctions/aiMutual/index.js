// WF-B 互助提取：口语 → 结构化卡片（相对时间基于服务端 today 归一化）
// 通道：文本模型直连 → Coze/WorkBuddy 工作流 → 前端本地引擎兜底
const {
  ok, fail, wrap, aiConfig, aiStatus,
  callTextModel, callWorkflow, buildMutualPrompt
} = require('./common')

exports.main = wrap(async (event) => {
  if (event.probe) return ok(aiStatus())

  const raw = String(event.raw_text || event.rawText || '').trim()
  if (!raw) return fail('需求原文不能为空', 400)

  const cfg = aiConfig()
  const workflowPayload = {
    raw_text: raw.slice(0, 100),
    now: event.now || new Date().toISOString(),
    today: event.today || '',
    weekday: event.weekday || ''
  }

  let r = null
  if (cfg.text.configured) {
    const p = buildMutualPrompt(Object.assign({}, event, { raw_text: raw }))
    r = await callTextModel(p.system, p.user, { temperature: 0.2, maxTokens: cfg.maxTokens.text })
    if (!r.ok && cfg.workflows.WF_B) r = await callWorkflow('WF_B_URL', workflowPayload)
  } else if (cfg.workflows.WF_B) {
    r = await callWorkflow('WF_B_URL', workflowPayload)
  } else {
    return fail('工作流未接入：未配置文本模型（AI_API_KEY / AI_TEXT_MODEL）或 WF_B_URL', 2)
  }

  if (!r || !r.ok) return fail('AI 接口调用失败：' + ((r && r.reason) || '未知原因'), 2)

  return ok(Object.assign({}, r.data, {
    _meta: {
      source: r.via || 'model',
      provider: cfg.providerName,
      model: r.model || '',
      workflow: 'WF-B'
    }
  }))
})
