/**
 * dsh-novelai-studio · Node half（host 侧）
 *
 * 生图工作室的宿主服务：
 * 1. 配置（token/model）持久化到本地 JSON 文件 ~/.dsh/novelai-studio-config.json，
 *    不依赖 ctx.settings（避免 inject 声明问题导致插件树崩溃）。
 * 2. 注册 webServer HTTP 端点：
 *    - GET  /plugins/dsh-novelai-studio/config    → 读配置（token 脱敏）
 *    - PATCH /plugins/dsh-novelai-studio/config   → 写配置
 *    - POST  /plugins/dsh-novelai-studio/generate → 代理 NovelAI 图像 API
 *      （浏览器直连 NovelAI 有 CORS 问题，统一走本端点转发；token 只在 host 侧）
 *
 * 零依赖：只用 Node 内建（fetch 需 Node ≥18）。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const NA_IMAGE_ENDPOINT = 'https://image.novelai.net/ai/generate-image'

const DEFAULT_PARAMS = {
  width: 832,
  height: 1216,
  steps: 28,
  scale: 5.0,
  sampler: 'k_euler_ancestral',
  n_samples: 1,
  uc: 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, jpeg artifacts, signature, watermark, username, blurry',
}

const MODEL_LIST = [
  'nai-diffusion-5-full',
  'nai-diffusion-5-curated',
  'nai-diffusion-4-5-full',
  'nai-diffusion-4-5-curated',
  'nai-diffusion-4-full',
  'nai-diffusion-4-curated',
  'nai-diffusion-4-curated-preview',
  'nai-diffusion-3',
  'nai-diffusion-furry-3',
  'nai-diffusion-2',
  'nai-diffusion-furry2',
  'nai-diffusion-furry',
  'nai-diffusion-xl',
  'safe-diffusion',
]

export const name = 'dsh-novelai-studio'

export const CONFIG_ENDPOINT = '/plugins/dsh-novelai-studio/config'
export const GENERATE_ENDPOINT = '/plugins/dsh-novelai-studio/generate'
export const MODELS_ENDPOINT = '/plugins/dsh-novelai-studio/models'

const DEFAULTS = Object.freeze({
  token: '',
  model: 'nai-diffusion-4-5-curated',
})

const CONFIG_PATH = path.join(os.homedir(), '.dsh', 'novelai-studio-config.json')

// ── 本地文件持久化（不依赖 ctx.settings）──────────────────────────────
function readFileConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    const j = JSON.parse(raw)
    return { ...DEFAULTS, ...(j && typeof j === 'object' ? j : {}) }
  } catch {
    return { ...DEFAULTS }
  }
}

function writeFileConfig(patch) {
  const next = { ...readFileConfig(), ...patch }
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8')
  } catch { /* 持久化失败不致命 */ }
  return next
}

function sanitize(config) {
  const token = String(config.token ?? DEFAULTS.token ?? '')
  return {
    hasToken: token.length > 0,
    model: String(config.model ?? DEFAULTS.model),
  }
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function json(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
    ...extraHeaders,
  })
  res.end(payload)
}

async function readJson(req, limit = 25 * 1024 * 1024) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > limit) throw new Error('request body too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** 代理 NovelAI 图像生成（token 只在 host 侧使用）。 */
async function proxyGenerate(config, body) {
  const token = String(config.token ?? '')
  if (!token) return { status: 400, json: { error: '未配置 NovelAI Token（请先到生图窗口设置）' } }

  const prompt = String(body?.prompt ?? '').trim()
  if (!prompt) return { status: 400, json: { error: 'prompt 必填' } }

  const params = { ...DEFAULT_PARAMS }
  if (typeof body?.negative_prompt === 'string' && body.negative_prompt.trim()) params.uc = body.negative_prompt.trim()
  if (Number.isFinite(Number(body?.width))) params.width = Number(body.width)
  if (Number.isFinite(Number(body?.height))) params.height = Number(body.height)
  if (Number.isFinite(Number(body?.steps))) params.steps = Number(body.steps)
  if (body?.seed !== undefined && body.seed !== null && body.seed !== '') params.seed = Number(body.seed)

  // 批量张数（1~4）
  let nSamples = 1
  if (Number.isFinite(Number(body?.n_samples))) {
    nSamples = Math.max(1, Math.min(4, Math.floor(Number(body.n_samples))))
  }
  params.n_samples = nSamples

  // 图生图：image（base64 或 dataURL）+ strength（改图强度）+ noise（噪声强度）
  let imageB64 = ''
  if (typeof body?.image === 'string' && body.image.trim()) {
    imageB64 = String(body.image).trim()
    const dataUrl = imageB64.match(/^data:image\/[^;]+;base64,(.+)$/i)
    if (dataUrl) imageB64 = dataUrl[1]
    params.image = imageB64
    if (Number.isFinite(Number(body?.strength))) params.strength = Number(body.strength)
    if (Number.isFinite(Number(body?.noise))) params.noise = Number(body.noise)
  }

  const model = String(body?.model ?? config.model ?? DEFAULTS.model)
  const payload = { input: prompt, model, parameters: params }

  let res
  try {
    res = await fetch(NA_IMAGE_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    return { status: 502, json: { error: `请求 NovelAI 失败: ${String(err.message)}` } }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { status: res.status, json: { error: `NovelAI 返回 ${res.status}: ${String(text).slice(0, 300)}` } }
  }

  // 响应解析：JSON（多图/图生图）或二进制（单图）。
  const contentType = res.headers.get('content-type') ?? ''
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 100) return { status: 502, json: { error: 'NovelAI 响应为空' } }

  let images = []
  if (contentType.includes('application/json')) {
    try {
      const j = JSON.parse(buf.toString('utf8'))
      const out = j?.output
      if (Array.isArray(out)) {
        images = out.map((s) => String(s).replace(/^data:image\/[^;]+;base64,/i, ''))
      } else if (typeof out === 'string') {
        images = [out.replace(/^data:image\/[^;]+;base64,/i, '')]
      }
    } catch { /* fallthrough */ }
  }
  if (!images.length) images = [buf.toString('base64')]
  if (!images.length) return { status: 502, json: { error: 'NovelAI 响应为空' } }

  return {
    status: 200,
    json: {
      ok: true,
      contentType,
      images,
      count: images.length,
      width: params.width,
      height: params.height,
      model,
      img2img: !!imageB64,
      strength: params.strength,
      noise: params.noise,
    },
  }
}

export function apply(ctx, config = {}) {
  const base = { ...DEFAULTS, ...(config ?? {}), ...readFileConfig() }
  const logger = console

  // 端点处理器
  const configHandler = async (req, res) => {
    if (!isLoopback(req.socket?.remoteAddress)) return json(res, 403, { error: 'local only' })
    const origin = req.headers?.origin
    if (origin) {
      let host
      try { host = new URL(origin).host } catch { host = '' }
      if (host && host !== req.headers.host) return json(res, 403, { error: 'origin mismatch' })
    }
    if (req.method === 'GET') return json(res, 200, sanitize(base))
    if (req.method === 'PATCH') {
      try {
        const patch = await readJson(req)
        if (patch && typeof patch === 'object') {
          if (typeof patch.token === 'string') base.token = patch.token.trim()
          if (typeof patch.model === 'string') base.model = patch.model.trim() || DEFAULTS.model
        }
        writeFileConfig({ token: base.token, model: base.model })
        return json(res, 200, sanitize(base))
      } catch (err) {
        return json(res, 400, { error: String(err.message) })
      }
    }
    return json(res, 405, { error: 'method not allowed' })
  }

  const generateHandler = async (req, res) => {
    if (!isLoopback(req.socket?.remoteAddress)) return json(res, 403, { error: 'local only' })
    if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
    try {
      const body = await readJson(req)
      const out = await proxyGenerate(base, body)
      return json(res, out.status, out.json)
    } catch (err) {
      return json(res, 400, { error: String(err.message) })
    }
  }

  const modelsHandler = async (req, res) => {
    if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
    return json(res, 200, { models: MODEL_LIST })
  }

  // 通过 ctx.inject 挂到 webServer（不直接访问未注入属性）
  const mount = (httpCtx) => {
    httpCtx.effect(
      () => httpCtx.webServer.register({ kind: 'exact', path: CONFIG_ENDPOINT, handler: configHandler }),
      'dsh-novelai-studio: config endpoint',
    )
    httpCtx.effect(
      () => httpCtx.webServer.register({ kind: 'exact', path: GENERATE_ENDPOINT, handler: generateHandler }),
      'dsh-novelai-studio: generate endpoint',
    )
    httpCtx.effect(
      () => httpCtx.webServer.register({ kind: 'exact', path: MODELS_ENDPOINT, handler: modelsHandler }),
      'dsh-novelai-studio: models endpoint',
    )
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], mount)
  } else {
    mount(ctx)
  }

  logger.info?.('[novelai-studio] host 就绪')
}
