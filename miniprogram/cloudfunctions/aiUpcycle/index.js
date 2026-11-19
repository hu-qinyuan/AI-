// WF-C 旧物改造：3 套方案 + 效果图占位（效果图失败时前端展示占位图）
// 通道：文本模型直连 → Coze/WorkBuddy 工作流 → 前端本地引擎兜底
const {
  ok, fail, wrap, aiConfig, aiStatus,
  callTextModel, callWorkflow, buildUpcyclePrompt
} = require('./common')

exports.main = wrap(async (event) => {
  if (event.probe) return ok(aiStatus())

  const item = String(event.item || '').trim()
  if (!item) return fail('旧物名字不能为空', 400)

  const cfg = aiConfig()
  const workflowPayload = {
    item: item.slice(0, 20),
    scene: event.scene || '收纳',
    constraints: event.constraints || '零成本、宿舍现有材料、不动明火',
    now: new Date().toISOString()
  }

  let r = null
  if (cfg.text.configured) {
    const p = buildUpcyclePrompt(event)
    r = await callTextModel(p.system, p.user, { temperature: 0.8, maxTokens: cfg.maxTokens.upcycle, kind: 'upcycle' })
    if (!r.ok && cfg.workflows.WF_C) r = await callWorkflow('WF_C_URL', workflowPayload)
  } else if (cfg.workflows.WF_C) {
    r = await callWorkflow('WF_C_URL', workflowPayload)
  } else {
    return fail('工作流未接入：未配置文本模型（AI_API_KEY / AI_TEXT_MODEL）或 WF_C_URL', 2)
  }

  if (!r || !r.ok) return fail('AI 接口调用失败：' + ((r && r.reason) || '未知原因'), 2)

  return ok(Object.assign({}, r.data, {
    _meta: {
      source: r.via || 'model',
      provider: cfg.providerName,
      model: r.model || '',
      workflow: 'WF-C'
    }
  }))
})
