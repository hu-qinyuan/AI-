// WF-A 闲置发布：真实视觉模型识图 + 写文案 + 打标签
// 通道：视觉模型直连 → Coze/WorkBuddy 工作流 → 前端本地引擎兜底
// event.probe = true 时只返回 AI 接入状态（不消耗模型额度）
const {
  ok, fail, wrap, aiConfig, aiStatus, resolveImage,
  callVisionModel, callWorkflow, buildPostPrompt
} = require('./common')

exports.main = wrap(async (event) => {
  if (event.probe) return ok(aiStatus())

  const cfg = aiConfig()
  const imageUri = cfg.vision.configured ? await resolveImage(event) : ''
  if (!imageUri && !cfg.workflows.WF_A) {
    return fail('工作流未接入：缺少图片，且未配置视觉模型（AI_API_KEY / AI_VISION_MODEL）或 WF_A_URL', 2)
  }

  const workflowPayload = {
    image_url: event.image_url || '',
    style: event.style || 'minimal',
    user_hint: event.user_hint || '',
    campus_context: '学生宿舍',
    now: new Date().toISOString()
  }

  let r = null
  if (imageUri) {
    const p = buildPostPrompt(event)
    r = await callVisionModel(imageUri, p.system, p.user, { temperature: 0.85, maxTokens: cfg.maxTokens.vision })
    // 模型失败时自动回落到已配置的工作流，避免整条链路断掉
    if (!r.ok && cfg.workflows.WF_A) r = await callWorkflow('WF_A_URL', workflowPayload)
  } else {
    r = await callWorkflow('WF_A_URL', workflowPayload)
  }

  if (!r || !r.ok) return fail('AI 接口调用失败：' + ((r && r.reason) || '未知原因'), 2)

  return ok(Object.assign({}, r.data, {
    _meta: {
      source: r.via || 'model',
      provider: cfg.providerName,
      model: r.model || '',
      workflow: 'WF-A'
    }
  }))
})
