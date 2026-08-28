// dsh-novelai-studio · client half（浏览器侧）
// 生图工作室：侧栏底部「生图」按钮 → 弹出可交互窗口（prompt/参数/生成/预览）。
// host 通信走 /plugins/dsh-novelai-studio/*（webServer 本地端点，无 CORS）。
window.__ModuleLoader__.load({
  id: "dsh-novelai-studio",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })
    var React = require("react")

    var CONFIG = "/plugins/dsh-novelai-studio/config"
    var GENERATE = "/plugins/dsh-novelai-studio/generate"
    var MODELS = "/plugins/dsh-novelai-studio/models"

    // ── CSS ──────────────────────────────────────────────────────────
    var TAG = "dsh-novelai-studio/client.css"
    var CSS = [
      ".nas-btn{display:inline-flex;align-items:center;gap:6px;justify-content:center;width:100%;padding:8px 10px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12.5px;transition:all .15s}",
      ".nas-btn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.05))}",
      ".nas-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);backdrop-filter:blur(2px)}",
      ".nas-window{width:min(880px,94vw);max-height:92vh;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-2,#1c1c1e);box-shadow:0 20px 60px rgba(0,0,0,.5);overflow:hidden}",
      ".nas-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:move;user-select:none;-webkit-user-select:none}",
      ".nas-head h3{margin:0;font-size:15px;font-weight:600;flex:1;color:var(--dsw-alias-label-primary)}",
      ".nas-close{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-tertiary);width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:16px;line-height:1}",
      ".nas-body{display:grid;grid-template-columns:1fr 260px;gap:0;min-height:0}",
      ".nas-left{padding:14px 16px;display:flex;flex-direction:column;gap:10px;overflow-y:auto}",
      ".nas-right{padding:14px;border-left:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:8px;overflow-y:auto;font-size:12.5px}",
      ".nas-label{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary);margin-bottom:3px}",
      ".nas-input,.nas-textarea,.nas-select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 10px;font:inherit;font-size:13px;box-sizing:border-box;width:100%}",
      ".nas-textarea{min-height:130px;resize:vertical;line-height:1.5}",
      ".nas-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}",
      ".nas-generate{width:100%;padding:10px;border:none;border-radius:10px;background:var(--dsw-alias-state-business-primary,#4f6ef7);color:var(--dsw-alias-label-on-accent,#fff);font:inherit;font-size:14px;font-weight:600;cursor:pointer}",
      ".nas-generate:disabled{opacity:.5;cursor:default}",
      ".nas-preview{flex:1;min-height:280px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-3);display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}",
      ".nas-preview img{max-width:100%;max-height:100%;object-fit:contain}",
      ".nas-preview .nas-ph{color:var(--dsw-alias-label-tertiary);font-size:13px;text-align:center;padding:20px}",
      ".nas-status{font-size:12px;color:var(--dsw-alias-label-tertiary);min-height:16px;white-space:pre-wrap;word-break:break-all}",
      ".nas-status.err{color:var(--dsw-alias-state-error-primary)}",
      ".nas-status.ok{color:var(--dsw-alias-state-success-primary)}",
      ".nas-download{display:inline-block;margin-top:4px;color:var(--dsw-alias-state-business-primary);text-decoration:underline;cursor:pointer;font-size:12px}",
      ".nas-hint{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.5}",
      ".nas-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;width:100%}",
      ".nas-cell{position:relative;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-3)}",
      ".nas-cell img{width:100%;height:auto;display:block;object-fit:contain}",
      ".nas-cell .nas-dl{position:absolute;right:4px;bottom:4px;background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:6px;padding:2px 8px;font-size:11px;text-decoration:none;cursor:pointer}",
      ".nas-upload{display:inline-flex;align-items:center;gap:6px;border:1px dashed var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;width:100%;box-sizing:border-box;justify-content:center}",
      ".nas-upload:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-business-primary)}",
      ".nas-upload img{max-width:60px;max-height:60px;border-radius:6px;object-fit:cover}",
      ".nas-range{display:flex;align-items:center;gap:8px}",
      ".nas-range input[type=range]{flex:1;accent-color:var(--dsw-alias-state-business-primary,#4f6ef7)}",
      ".nas-range output{font-size:11px;color:var(--dsw-alias-label-secondary);min-width:34px;text-align:right}",
      ".nas-check{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--dsw-alias-label-secondary);cursor:pointer}",
      ".nas-check input{accent-color:var(--dsw-alias-state-business-primary,#4f6ef7)}",
    ].join("")
    if (typeof document !== "undefined" && !document.querySelector("style[data-plugin-css=" + JSON.stringify(TAG) + "]")) {
      var tag = document.createElement("style")
      tag.dataset.plugin = "dsh-novelai-studio"
      tag.dataset.pluginCss = TAG
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // ── 生图工作室窗口 ──────────────────────────────────────────────
    function StudioWindow({ onClose }) {
      const [cfg, setCfg] = React.useState(null)
      const [models, setModels] = React.useState([])
      const [prompt, setPrompt] = React.useState("")
      const [negative, setNegative] = React.useState("")
      const [width, setWidth] = React.useState(832)
      const [height, setHeight] = React.useState(1216)
      const [steps, setSteps] = React.useState(28)
      const [seed, setSeed] = React.useState("")
      const [model, setModel] = React.useState("nai-diffusion-4-5-curated")
      const [busy, setBusy] = React.useState(false)
      const [status, setStatus] = React.useState("")
      const [statusKind, setStatusKind] = React.useState("")
      const [imgs, setImgs] = React.useState([])
      const [count, setCount] = React.useState(1)
      const [useImg2Img, setUseImg2Img] = React.useState(false)
      const [srcImg, setSrcImg] = React.useState("")
      const [strength, setStrength] = React.useState(0.7)
      const [noise, setNoise] = React.useState(0)
      const fileRef = React.useRef(null)
      const [dragPos, setDragPos] = React.useState(null)
      const winRef = React.useRef(null)
      const dragState = React.useRef(null)

      // 标题栏拖拽移动窗口
      const onHeadMouseDown = (e) => {
        if (e.button !== 0) return
        const win = winRef.current
        if (!win) return
        const rect = win.getBoundingClientRect()
        dragState.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
        const onMove = (ev) => {
          const ds = dragState.current
          if (!ds) return
          setDragPos({ x: ev.clientX - ds.dx, y: ev.clientY - ds.dy })
        }
        const onUp = () => {
          window.removeEventListener("mousemove", onMove)
          window.removeEventListener("mouseup", onUp)
          dragState.current = null
        }
        window.addEventListener("mousemove", onMove)
        window.addEventListener("mouseup", onUp)
      }

      React.useEffect(() => {
        fetch(CONFIG, { cache: "no-store" })
          .then((r) => r.json())
          .then((c) => {
            setCfg(c)
            if (c.model) setModel(c.model)
          })
          .catch(() => setCfg({ hasToken: false }))
        fetch(MODELS, { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => setModels(d.models || []))
          .catch(() => {})
      }, [])

      const saveToken = (token) => {
        fetch(CONFIG, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        })
          .then((r) => r.json())
          .then((c) => {
            setCfg(c)
            setStatus(c.hasToken ? "Token 已保存" : "Token 无效")
            setStatusKind(c.hasToken ? "ok" : "err")
          })
          .catch(() => { setStatus("Token 保存失败"); setStatusKind("err") })
      }

      const generate = () => {
        setBusy(true)
        setStatus("正在生成…")
        setStatusKind("")
        const payload = { prompt, negative_prompt: negative, width: Number(width), height: Number(height), steps: Number(steps), model, n_samples: Number(count) }
        if (seed !== "" && seed !== null && !isNaN(Number(seed))) payload.seed = Number(seed)
        if (useImg2Img && srcImg) {
          payload.image = srcImg
          payload.strength = Number(strength)
          payload.noise = Number(noise)
        }
        fetch(GENERATE, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then(async (r) => {
            const d = await r.json()
            if (!r.ok || !d.ok) {
              setStatus(d.error || "生成失败")
              setStatusKind("err")
              return
            }
            const list = (d.images && d.images.length) ? d.images : (d.b64 ? [d.b64] : [])
            setImgs(list.map((b) => "data:image/png;base64," + b))
            setStatus("生成成功 ×" + list.length + " (" + d.width + "x" + d.height + ", " + d.model + (d.img2img ? ", img2img" : "") + ")")
            setStatusKind("ok")
          })
          .catch((e) => { setStatus("请求失败: " + String(e.message)); setStatusKind("err") })
          .finally(() => setBusy(false))
      }

      const onPickFile = (e) => {
        const file = e.target.files && e.target.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => { setSrcImg(String(reader.result)) }
        reader.readAsDataURL(file)
      }

      return React.createElement("div", { className: "nas-overlay", onClick: (e) => { if (e.target === e.currentTarget) onClose() } },
        React.createElement("div", { ref: winRef, className: "nas-window", style: dragPos ? { position: "fixed", left: dragPos.x, top: dragPos.y, margin: 0 } : null },
          React.createElement("div", { className: "nas-head", onMouseDown: onHeadMouseDown, title: "拖动移动窗口" },
            React.createElement("h3", null, "🎨 生图工作室（NovelAI）"),
            React.createElement("button", { className: "nas-close", onClick: onClose, title: "关闭" }, "✕"),
          ),
          React.createElement("div", { className: "nas-body" },
            React.createElement("div", { className: "nas-left" },
              React.createElement("div", { className: "nas-label" }, "Prompt（正向提示词）"),
              React.createElement("textarea", { className: "nas-textarea", value: prompt, onChange: (e) => setPrompt(e.target.value), placeholder: "1girl, masterpiece, best quality, ..." }),
              React.createElement("div", { className: "nas-label" }, "Negative（负向，可留空）"),
              React.createElement("textarea", { className: "nas-input", style: { minHeight: 60 }, value: negative, onChange: (e) => setNegative(e.target.value), placeholder: "lowres, bad anatomy, ..." }),
              React.createElement("div", { className: "nas-preview" },
                imgs.length
                  ? React.createElement("div", { className: "nas-grid" },
                    imgs.map((u, i) => React.createElement("div", { key: i, className: "nas-cell" },
                      React.createElement("img", { src: u, alt: "结果" + (i + 1) }),
                      React.createElement("a", { className: "nas-dl", href: u, download: "novelai_" + Date.now() + "_" + (i + 1) + ".png" }, "下载"),
                    )),
                  )
                  : React.createElement("div", { className: "nas-ph" }, "生成结果将显示在这里"),
              ),
              React.createElement("button", { className: "nas-generate", disabled: busy || !prompt.trim(), onClick: generate }, busy ? "生成中…" : "🎨 生成图片"),
              React.createElement("div", { className: "nas-status " + (statusKind === "err" ? "err" : statusKind === "ok" ? "ok" : ""), style: { whiteSpace: "pre-wrap" } }, status),
            ),
            React.createElement("div", { className: "nas-right" },
              React.createElement("div", { className: "nas-label" }, "Token"),
              React.createElement("input", { className: "nas-input", type: "password", placeholder: cfg && cfg.hasToken ? "已保存（输入可更换）" : "粘贴 NovelAI Token", onBlur: (e) => { if (e.target.value.trim()) saveToken(e.target.value.trim()) } }),
              React.createElement("div", { className: "nas-label" }, "模型"),
              React.createElement("select", { className: "nas-select", value: model, onChange: (e) => setModel(e.target.value) },
                (models.length ? models : ["nai-diffusion-4-5-curated", "nai-diffusion-4-5-full", "nai-diffusion-4-curated", "nai-diffusion-4-full"]).map((m) => React.createElement("option", { key: m, value: m }, m)),
              ),
              React.createElement("div", { className: "nas-row" },
                React.createElement("div", null,
                  React.createElement("div", { className: "nas-label" }, "宽"),
                  React.createElement("input", { className: "nas-input", type: "number", value: width, onChange: (e) => setWidth(e.target.value) }),
                ),
                React.createElement("div", null,
                  React.createElement("div", { className: "nas-label" }, "高"),
                  React.createElement("input", { className: "nas-input", type: "number", value: height, onChange: (e) => setHeight(e.target.value) }),
                ),
              ),
              React.createElement("div", { className: "nas-row" },
                React.createElement("div", null,
                  React.createElement("div", { className: "nas-label" }, "步数"),
                  React.createElement("input", { className: "nas-input", type: "number", value: steps, onChange: (e) => setSteps(e.target.value) }),
                ),
                React.createElement("div", null,
                  React.createElement("div", { className: "nas-label" }, "种子"),
                  React.createElement("input", { className: "nas-input", type: "number", value: seed, onChange: (e) => setSeed(e.target.value), placeholder: "随机" }),
                ),
              ),
              React.createElement("div", { className: "nas-label" }, "生成张数"),
              React.createElement("select", { className: "nas-select", value: count, onChange: (e) => setCount(Number(e.target.value)) },
                [1, 2, 3, 4].map((n) => React.createElement("option", { key: n, value: n }, n + " 张")),
              ),
              React.createElement("label", { className: "nas-check" },
                React.createElement("input", { type: "checkbox", checked: useImg2Img, onChange: (e) => setUseImg2Img(e.target.checked) }),
                "图生图（img2img）",
              ),
              useImg2Img
                ? React.createElement(React.Fragment, null,
                  React.createElement("button", { type: "button", className: "nas-upload", onClick: () => fileRef.current && fileRef.current.click() },
                    srcImg ? React.createElement("img", { src: srcImg, alt: "源图" }) : null,
                    srcImg ? "点击更换源图" : "📁 选择源图",
                  ),
                  React.createElement("input", { ref: fileRef, type: "file", accept: "image/*", style: { display: "none" }, onChange: onPickFile }),
                  React.createElement("div", { className: "nas-label" }, "改图强度 (strength)"),
                  React.createElement("div", { className: "nas-range" },
                    React.createElement("input", { type: "range", min: 0, max: 1, step: 0.05, value: strength, onChange: (e) => setStrength(Number(e.target.value)) }),
                    React.createElement("output", null, strength.toFixed(2)),
                  ),
                  React.createElement("div", { className: "nas-label" }, "噪声强度 (noise)"),
                  React.createElement("div", { className: "nas-range" },
                    React.createElement("input", { type: "range", min: 0, max: 1, step: 0.05, value: noise, onChange: (e) => setNoise(Number(e.target.value)) }),
                    React.createElement("output", null, noise.toFixed(2)),
                  ),
                  React.createElement("div", { className: "nas-hint" }, "强度越高改得越彻底（0.7 左右常用）；噪声 0 保持构图，越高越偏离原图。"),
                )
                : null,
              React.createElement("div", { className: "nas-hint" },
                "提示：Token 保存在本机。生成的图可在对话中通过图片工具查看。图片 API 可能需要有效的 NovelAI 订阅。",
              ),
            ),
          ),
        ),
      )
    }

    // ── 按钮：输入栏右侧入口（胶囊样式，与鲸鱼人设按钮一致）────────
    function StudioButton({ onClick }) {
      return React.createElement(
        "button",
        {
          type: "button",
          onClick,
          title: "打开 NovelAI 生图工作室",
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 8px",
            borderRadius: "999px",
            border: "1px solid rgba(128,128,128,0.35)",
            background: "transparent",
            color: "inherit",
            fontSize: "12px",
            lineHeight: "20px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          },
        },
        React.createElement("span", null, "🎨"),
        React.createElement("span", null, "生图"),
      )
    }

    // ── 插件入口 ────────────────────────────────────────────────────
    function apply(ctx) {
      ctx.slots.inject("conversation.input.right", () => ctx.slots.register(
        { name: "conversation.input.right", id: "novelai-studio", order: -110 },
        () => {
          const [open, setOpen] = React.useState(false)
          return React.createElement(React.Fragment, null,
            React.createElement(StudioButton, { onClick: () => setOpen(true) }),
            open ? React.createElement(StudioWindow, { onClose: () => setOpen(false) }) : null,
          )
        },
      ))
    }

    exports.inject = ["slots"]
    exports.apply = apply
    return module.exports
  },
})
