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
 *    - GET  /plugins/dsh-novelai-studio/models    → 可用模型列表
 *
 * NovelAI API 要点（经官方前端 / Langbai 客户端实测确认）：
 * - 普通文生图/图生图用 application/json 发送（multipart 仅用于 director reference）
 * - V4/V4.5/V5 必须携带结构化 v4_prompt / v4_negative_prompt（缺了会 HTTP 500），
 *   ucPreset / uc_preset 必须是数字（0=heavy 1=light 2 3=none）
 * - 图生图：action="img2img" + parameters.image(base64) + strength + noise + extra_noise_seed
 * - 响应可能是裸 PNG（二进制）、JSON（多图）或 ZIP（含 image_N.png）
 *
 * 零依赖：只用 Node 内建（fetch 需 Node ≥18）。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { ProxyAgent, fetch as undiciFetch } from 'undici'

const NA_IMAGE_ENDPOINT = 'https://image.novelai.net/ai/generate-image'
const NA_HOST = 'image.novelai.net'

// ── 系统代理探测（Windows 注册表）────────────────────────────────────
let cachedProxyUrl = null
let proxyProbed = false
function detectSystemProxy() {
  if (proxyProbed) return cachedProxyUrl
  proxyProbed = true
  // 环境变量优先（标准代理变量）
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy']) {
    const v = process.env[key]
    if (v && /^https?:\/\//i.test(v)) { cachedProxyUrl = v; return cachedProxyUrl }
  }
  try {
    // Windows 注册表系统代理
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyEnable'], { encoding: 'utf8' })
    const enabled = /0x1\b/i.test(out)
    if (enabled) {
      const srv = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer'], { encoding: 'utf8' })
      const m = srv.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i)
      if (m) {
        const proxy = m[1].trim()
        // 支持 "host:port" 或 "http=host:port;https=host:port" 形式
        let httpsPart = proxy
        if (proxy.includes('=')) {
          const parts = proxy.split(';')
          const hp = parts.find((p) => p.trim().startsWith('https='))
          if (hp) httpsPart = hp.trim().slice('https='.length)
        }
        if (httpsPart && !httpsPart.startsWith('http')) httpsPart = 'http://' + httpsPart
        cachedProxyUrl = httpsPart
      }
    }
  } catch { /* 无注册表/非 Windows，保持 null */ }
  return cachedProxyUrl
}

let proxyAgent = null
function getProxyAgent() {
  const url = detectSystemProxy()
  if (!url) return null
  if (!proxyAgent) {
    try { proxyAgent = new ProxyAgent(url) } catch { return null }
  }
  return proxyAgent
}

async function postNovelAI(token, payload) {
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    accept: 'application/zip, application/octet-stream, application/json',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  }
  const body = JSON.stringify(payload)
  // 先尝试直连（用 undici 自己的 fetch，兼容外部 dispatcher）
  try {
    const r = await undiciFetch(NA_IMAGE_ENDPOINT, { method: 'POST', headers, body })
    return r
  } catch {
    // 直连失败 → 走系统代理
    const agent = getProxyAgent()
    if (agent) {
      try {
        return await undiciFetch(NA_IMAGE_ENDPOINT, { method: 'POST', headers, body, dispatcher: agent })
      } catch (err) {
        throw new Error(`代理请求失败: ${String(err.cause?.code || err.message)}`)
      }
    }
    throw new Error('直连与代理均失败')
  }
}

const DEFAULT_UC = 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, jpeg artifacts, signature, watermark, username, blurry'

// 实测可用模型（2026-08 逐个调用验证；其余旧 ID 已被 API 移除返回 400）。
const MODEL_LIST = [
  'nai-diffusion-5-full',
  'nai-diffusion-5-curated',
  'nai-diffusion-4-5-full',
  'nai-diffusion-4-5-curated',
  'nai-diffusion-4-full',
  'nai-diffusion-4-curated-preview',
  'nai-diffusion-3',
  'nai-diffusion-furry-3',
]

const V4_PLUS = new Set([
  'nai-diffusion-5-full',
  'nai-diffusion-5-curated',
  'nai-diffusion-4-5-full',
  'nai-diffusion-4-5-curated',
  'nai-diffusion-4-full',
  'nai-diffusion-4-curated-preview',
])

const V5_MODELS = new Set(['nai-diffusion-5-full', 'nai-diffusion-5-curated'])

// 各模型官方默认 scale / steps（对齐官网前端；V5 噪声调度固定 Karras）。
const MODEL_DEFAULTS = {
  'nai-diffusion-5-full': { scale: 7, steps: 23 },
  'nai-diffusion-5-curated': { scale: 7, steps: 23 },
  'nai-diffusion-4-5-full': { scale: 5, steps: 23 },
  'nai-diffusion-4-5-curated': { scale: 5, steps: 23 },
  'nai-diffusion-4-full': { scale: 5.5, steps: 23 },
  'nai-diffusion-4-curated-preview': { scale: 5.5, steps: 23 },
  'nai-diffusion-3': { scale: 10, steps: 28 },
  'nai-diffusion-furry-3': { scale: 10, steps: 28 },
}

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

function stripDataUrl(b64) {
  const m = String(b64).match(/^data:image\/[^;]+;base64,(.+)$/i)
  return m ? m[1] : String(b64)
}

/**
 * 构建 NovelAI 请求体。
 * - V4+：结构化 v4_prompt/v4_negative_prompt（空 char_captions 也必须带 centers 哨兵结构），
 *   ucPreset 用数字；V5 噪声调度固定 karras。
 * - V3 系：传统参数即可。
 * - img2img：action=img2img + image + strength + noise + extra_noise_seed。
 */
function buildPayload({ prompt, negative, model, width, height, steps, scale, seed, nSamples, image, strength, noise }) {
  const md = MODEL_DEFAULTS[model] ?? { scale: 5, steps: 23 }
  const uc = negative && negative.trim() ? negative.trim() : DEFAULT_UC
  const safeScale = Math.min(10, Math.max(0, Number.isFinite(Number(scale)) ? Number(scale) : md.scale))
  const safeSteps = Number.isFinite(Number(steps)) ? Math.round(Number(steps)) : md.steps
  const noiseSchedule = V5_MODELS.has(model) ? 'karras' : 'native'

  const params = {
    params_version: 4,
    width: Number(width) || 832,
    height: Number(height) || 1216,
    scale: safeScale,
    sampler: 'k_euler_ancestral',
    steps: safeSteps,
    n_samples: nSamples || 1,
    uc,
    negative_prompt: uc,
    ucPreset: 0,
    uc_preset: 0,
    cfg_rescale: 0,
    legacy: false,
    legacy_v3_extend: false,
    dynamic_thresholding: false,
    skip_cfg_above_sigma: null,
    qualityToggle: true,
    quality_toggle: true,
    noise_schedule: noiseSchedule,
    use_coords: false,
  }

  if (V4_PLUS.has(model)) {
    params.v4_prompt = {
      caption: { base_caption: prompt, char_captions: [] },
      use_coords: false,
      use_order: true,
    }
    params.v4_negative_prompt = {
      caption: { base_caption: uc, char_captions: [] },
      use_coords: false,
      use_order: false,
      legacy_uc: true,
    }
  }

  const payload = { input: prompt, model, action: 'generate', parameters: params }
  if (image) {
    payload.action = 'img2img'
    payload.parameters.image = stripDataUrl(image)
    payload.parameters.strength = Math.min(1, Math.max(0, Number.isFinite(Number(strength)) ? Number(strength) : 0.7))
    payload.parameters.noise = Math.min(0.99, Math.max(0, Number.isFinite(Number(noise)) ? Number(noise) : 0))
    payload.parameters.extra_noise_seed = Math.floor(Math.random() * 2_147_483_647) + 1
  }
  if (seed !== undefined && seed !== null && seed !== '') {
    payload.parameters.seed = Math.min(2_147_483_647, Math.max(1, Math.round(Number(seed))))
  }
  return payload
}

/** 从响应字节里提取图片 base64 列表（支持裸 PNG / JSON / ZIP）。 */
function extractImages(contentType, buf) {
  // ZIP（PK 头）：解出 image_*.png
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const out = []
    try {
      // 极简 ZIP central directory 扫描：定位 "image_N.png" 文件名 + 本地文件头
      // 的压缩数据段。NovelAI 返回的 ZIP 用 store 或 deflate；这里用 Node 的
      // zlib 处理 deflate，且逐段解析。
      const { findLocalEntries } = parseZip(buf)
      for (const { name, data } of findLocalEntries()) {
        if (/^image_\d+\.png$/i.test(name)) out.push(data.toString('base64'))
      }
    } catch { /* fallthrough */ }
    if (out.length) return out
  }
  // JSON（多图 / 图生图）
  if (contentType.includes('application/json')) {
    try {
      const j = JSON.parse(buf.toString('utf8'))
      const o = j?.output
      if (Array.isArray(o)) return o.map((s) => stripDataUrl(String(s)))
      if (typeof o === 'string') return [stripDataUrl(o)]
    } catch { /* fallthrough */ }
  }
  // 裸 PNG
  return [buf.toString('base64')]
}

// 极简 ZIP 解析器（只读本地文件头 + 中心目录，取 image_*.png 条目）。
function parseZip(buf) {
  // 找 End of Central Directory
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('no EOCD')
  const count = buf.readUInt16LE(eocd + 10)
  const cdOffset = buf.readUInt32LE(eocd + 16)
  const entries = []
  let pos = cdOffset
  for (let n = 0; n < count; n++) {
    if (buf[pos] !== 0x50 || buf[pos + 1] !== 0x4b || buf[pos + 2] !== 0x01 || buf[pos + 3] !== 0x02) break
    const method = buf.readUInt16LE(pos + 10)
    const compSize = buf.readUInt32LE(pos + 20)
    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    const localOffset = buf.readUInt32LE(pos + 42)
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen)
    entries.push({ name, method, compSize, localOffset })
    pos += 46 + nameLen + extraLen + commentLen
  }
  const findLocalEntries = () => entries.map((e) => {
    // 本地文件头
    const sig = e.localOffset
    const nameLen = buf.readUInt16LE(sig + 26)
    const extraLen = buf.readUInt16LE(sig + 28)
    const dataStart = sig + 30 + nameLen + extraLen
    let data = buf.subarray(dataStart, dataStart + e.compSize)
    if (e.method === 8) {
      data = zlib.inflateRawSync(data, { maxOutputLength: 128 * 1024 * 1024 })
    }
    return { name: e.name, data: Buffer.from(data) }
  })
  return { findLocalEntries }
}

/** 代理 NovelAI 图像生成（token 只在 host 侧使用）。 */
async function proxyGenerate(config, body) {
  const token = String(config.token ?? '')
  if (!token) return { status: 400, json: { error: '未配置 NovelAI Token（请先到生图窗口设置）' } }

  const prompt = String(body?.prompt ?? '').trim()
  if (!prompt) return { status: 400, json: { error: 'prompt 必填' } }

  const model = String(body?.model ?? config.model ?? DEFAULTS.model)
  if (!MODEL_LIST.includes(model)) {
    return { status: 400, json: { error: `模型 ${model} 不可用（已被 NovelAI API 移除）` } }
  }

  let nSamples = 1
  if (Number.isFinite(Number(body?.n_samples))) {
    nSamples = Math.max(1, Math.min(4, Math.floor(Number(body.n_samples))))
  }

  const payload = buildPayload({
    prompt,
    negative: body?.negative_prompt,
    model,
    width: body?.width,
    height: body?.height,
    steps: body?.steps,
    scale: body?.scale,
    seed: body?.seed,
    nSamples,
    image: body?.image,
    strength: body?.strength,
    noise: body?.noise,
  })

  let res
  try {
    res = await postNovelAI(token, payload)
  } catch (err) {
    return { status: 502, json: { error: `请求 NovelAI 失败: ${String(err.message)}` } }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { status: res.status, json: { error: `NovelAI 返回 ${res.status}: ${String(text).slice(0, 300)}` } }
  }

  const contentType = res.headers.get('content-type') ?? ''
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 100) return { status: 502, json: { error: 'NovelAI 响应为空' } }

  const images = extractImages(contentType, buf)
  if (!images.length) return { status: 502, json: { error: 'NovelAI 响应中未找到图片' } }

  return {
    status: 200,
    json: {
      ok: true,
      contentType,
      images,
      count: images.length,
      width: payload.parameters.width,
      height: payload.parameters.height,
      model,
      action: payload.action,
      strength: payload.parameters.strength,
      noise: payload.parameters.noise,
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
