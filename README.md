# dsh-novelai-studio

> 🤖 **AI 生成声明**：本插件由「鲸鱼娘」（DeepSeek 驱动的 AI 助手）编写，代码与文档均由其完成。
> 作者（仓库所有者）仅提供需求与验收。质量责任由发布者自负，欢迎 fork / PR 改进。

DSH 生图可视化互动窗口：在对话输入栏右侧加入「🎨 生图」按钮，点击弹出 NovelAI 生图工作室——
支持文生图 / 图生图 / 批量生成，prompt 输入、负向词、模型/尺寸/步数/种子参数、多图预览与下载。

## 功能
- **按钮**：对话输入栏右侧「🎨 生图」胶囊按钮（与鲸鱼人设按钮同槽位、位于其左侧；未装鲸鱼人设时独立显示在最左，不依赖对方插件）
- **窗口**：居中浮层（可点外部关闭，标题栏可拖动移动），左右布局：
  - 左：Prompt / Negative / 多图预览网格 / 生成按钮 / 状态
  - 右：Token（只写不回显）/ 模型 / 宽高 / 步数 / 种子 / 生成张数 / 图生图开关
- **批量生成**：一次 1~4 张（`n_samples`），多图网格展示，每张独立下载
- **图生图（img2img）**：选择本地源图 → 改图强度 `strength`（0~1，默认 0.7）+ 噪声强度 `noise`（0~1，默认 0），参数与 NovelAI 官网一致
- **模型列表**：V5 / V4.5 / V4 / V3 实测可用模型（`nai-diffusion-5-full`、`nai-diffusion-4-5-curated`、`nai-diffusion-4-full`、`nai-diffusion-4-curated-preview`、`nai-diffusion-3`、`nai-diffusion-furry-3`），默认 `nai-diffusion-4-5-curated`；已被官方移除的旧 ID（V2/XL/safe 等）不再列出
- **V4+ 结构化请求**：自动携带 `v4_prompt`/`v4_negative_prompt` 与数字 `ucPreset`（官方 API 要求，缺了会 500），V5 自动用 Karras 噪声调度
- **Host 代理**：浏览器不直连 NovelAI（CORS），统一走本地端点转发，Token 只在 host 侧；host 自动探测系统代理（直连失败时经 Windows 代理转发，兼容 clash 等代理工具）

## 安装
1. 把 `dsh-novelai-studio` 放到 `~/.dsh/local-plugins/`
2. 拷贝到 `~/.dsh/profiles/web-desktop/node_modules/dsh-novelai-studio/`
3. 在 `~/.dsh/profiles/web-desktop/cordis.patch.yml` 末尾追加：
   ```yaml
   - insert:
       - id: dsh-novelai-studio
         name: dsh-novelai-studio
   ```
4. 重启 DSH

## 使用
1. 重启后对话输入栏右侧出现「🎨 生图」按钮
2. 点开窗口，在右侧粘贴 NovelAI Token（失焦即保存）
3. 输入 Prompt，选张数/模型/参数，点「生成图片」，预览网格显示结果，可逐张下载 PNG
4. 图生图：勾选「图生图」→ 选择源图 → 调改图/噪声强度 → 生成

## 备注
- 需要有效的 NovelAI 订阅（图片生成额度）
- Token 仅存本机 `~/.dsh/novelai-studio-config.json`，不回显完整值；host 端点仅接受本机回环访问
- 图片 API 端点：`https://image.novelai.net/ai/generate-image`
- 图生图强度建议 0.7 左右；源图较大时先用小图（≤1024px）试，省 Anlas

## 合规
本插件为**非官方第三方工具**，与 NovelAI / Anlatan 无关联；使用者需自备订阅与 Token。
详细条款对照与免责声明见 [`COMPLIANCE.md`](COMPLIANCE.md)。
