# Selio

**Select. Understand. Explore.**

一个 Chrome Manifest V3 AI 阅读助手。选中文字，翻译、总结或解释，再留在原网页继续追问。基于 WXT、React、TypeScript 和 Floating UI，不需要后端、数据库或账户。

## 快速开始

环境：Node.js 22.12+、pnpm 10、Chrome 116+。开发与自动化测试建议使用当前稳定版 Chrome / Chromium。

```bash
pnpm install
pnpm dev
```

1. 打开 Chrome 的 `chrome://extensions`，开启右上角「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择本项目的 `.output/chrome-mv3-dev` 目录。开发服务器保持运行，浏览器手动加载扩展；控制台也会打印实际输出路径。
3. 将工具栏中的 Selio 固定，点击 Selio → 设置。
4. 在「模型」填写 Provider、Base URL、模型标识和自己的 API Key，点击「保存模型」，在 Chrome 弹窗中授权该 API 来源。
5. 点击「测试连接」。该操作会向所选供应商发送一个简短测试请求，可能产生少量 API 用量。
6. 打开普通 HTTP/HTTPS 网页，点击工具栏 Selio →「允许此网站自动划词」。在 Chrome 弹窗中确认网站访问权限。
7. 选中一段文字，点击选区旁的 Selio 图标。默认立即翻译成简体中文。
8. 在底部输入问题，Enter 发送，Shift + Enter 换行。中文输入法组合输入期间 Enter 不会提前发送。

也可以选择「仅在当前页面启用」：通过工具栏用户手势获得的 `activeTab` 临时权限注入脚本；重开页面后可能需要重新启用。**普通划词本身不会授予 activeTab 权限。**

## 生产安装包

```bash
pnpm build
pnpm zip
```

加载 `.output/chrome-mv3` 即可使用生产版本。`pnpm zip` 在 `.output` 内生成可分发 ZIP；安装前先解压并加载其中包含 `manifest.json` 的目录。开发构建包含 WXT 开发工具配置，分发时应使用生产构建。

## 使用方式

- **划词浮窗**：默认 400px，自动避让视口边缘；多行选区使用末行作为定位锚点；滚动时更新位置。网页 CSS 通过 Shadow DOM 隔离，字体尺寸使用 px，避免宿主页面的 rem 缩放干扰。
- **三种动作**：翻译、总结、解释。切换动作或发送范围会停止旧请求并重新生成当前选区的回答，清空原有问答；输入草稿保留。
- **多轮对话**：保留原始选区与最近问答。支持停止、重新生成、复制回答、安全 Markdown 和表格。
- **选区切换**：新选区不会静默覆盖当前对话，必须点击「切换选区」。收起浮窗不会删除对话或停止后台生成。
- **侧边栏**：点击浮窗右上角的固定按钮，原始选区、消息、生成状态和草稿接续到 Chrome Side Panel，不会重新调用模型。侧边栏跟随当前窗口的活动标签页，每个标签页有独立会话。
- **右键菜单**：选中文字 →「用 Selio 理解选中文字」，在侧边栏执行默认动作。已有对话时先提示切换。此入口只使用浏览器提供的选中文字，不自动读取段落。
- **上下文**：默认只发送选中文字。选择「选中文字 + 所在段落」才读取和发送段落；仅使用相近的 p/li/pre/blockquote/td/标题元素，不用 body 或大块 div 作为整页回退。选区失效时提示重新选择。
- **设置**：多个模型、默认模型、默认动作、目标语言、浅色/深色/系统主题、划词开关、网站禁用列表、清除数据。

## 模型配置

支持 **OpenAI-compatible Chat Completions + SSE**。

| Provider | 默认 Base URL | 默认模型标识 |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Custom | 用户填写 | 用户填写 |

模型可用性取决于供应商与账户，所有预设均可编辑。Base URL 自动补全 `/chat/completions`；填写完整接口地址也不会重复拼接。通常应包含供应商要求的 `/v1` 路径。

- API 地址必须是 HTTPS；为本地开发允许 `http://localhost`、`http://127.0.0.1` 和 `http://[::1]`。
- 不接受 URL 中的用户名、密码、查询参数或片段；禁止 HTTP 重定向，避免带着密钥跳转到其他来源。
- 默认不发送 Temperature，避免不支持该参数的模型报错；可自行设置 0–2。
- 最大输出 Tokens 可设 16–8192，默认 2048。适配器发送 `max_tokens`；要求 `max_completion_tokens`、Responses 或原生专有协议的模型暂不兼容。
- 修改 API 来源时必须重新输入该来源的密钥，不会自动将旧来源的密钥发送过去。
- 切换默认模型只影响新对话。进行中的对话继续使用原模型；原模型被删除后下一次请求使用当前默认模型。
- 常见异常（Key 失效、余额/额度、429、模型不存在、服务故障、截断流）有中文反馈，重试由用户主动发起。

### API Key 保存边界

默认使用 `chrome.storage.session`：在浏览器会话内存中保存；关闭浏览器、停用、重载或更新扩展后清除，需要重新输入。

可选「保存在这台设备上」使用 `chrome.storage.local`，**未加密**，具有本机访问权限的人可能读取。它不会同步到云端。需要更高安全性的用户应保持默认会话模式。

`local` 与 `session` 在后台初始化时都设置为 `TRUSTED_CONTEXTS`，不允许 Content Script 直接读取。密钥只在设置表单输入并由后台读取使用，设置查询只返回 `hasKey`。普通网页 DOM、Content Script、日志、Prompt 均不接收密钥；不使用 `storage.sync`。

## 权限与隐私

生产 Manifest 不包含常驻 `host_permissions`，也不包含自动注入所有网站的静态脚本。可选声明 HTTP/HTTPS 来源范围，运行时只请求用户选择的具体来源。

| 权限 | 用途 |
| --- | --- |
| `storage` | 本机偏好、会话密钥、可选持久密钥与会话快照 |
| `scripting` | 对已授权网站注册划词脚本，或在主动点击后临时注入 |
| `activeTab` | 工具栏点击后的当前页面临时访问；不是普通划词自动授权 |
| `contextMenus` | 选中文字的主动右键入口 |
| `sidePanel` | 同一会话固定到 Chrome 侧边栏 |
| 可选 HTTP/HTTPS 来源 | 分别用于用户指定的网站自动划词与模型 API 请求 |

API 来源权限本身不会开启该来源网页的自动划词，只有「允许自动划词的网站」列表才参与脚本注册。禁用列表同时匹配域名及其子域名。撤销网站授权会同时撤销相同来源的 API 权限（如果重合），此时重新保存模型即可再次授权。

Chrome 的来源权限以主机为主要边界，不能作为路径级网络沙箱；Selio 仍只使用已保存、校验通过的模型接口发请求。没有任意 URL 代理、网页 postMessage 请求通道或 `externally_connectable`。普通页面不能调用模型管理接口，Content Script 也只能访问它所属标签页的会话。

只有主动点击图标、动作、重试、追问或右键菜单才发起 AI 请求。默认不上传网页标题、URL、浏览记录或整页内容。网页文字作为独立 JSON 源数据进入 Prompt，并明确标记为不可信数据；这是一项提示注入缓解措施，不承诺模型不会受源文字影响。

Markdown 不执行原始 HTML，不自动加载图片，链接采用安全 URL 过滤和 `noopener noreferrer`。没有第三方分析、远程脚本、远程字体或其他追踪 SDK。

## 架构

```text
entrypoints/
  background.ts        权限、消息路由、请求入口、会话存储与恢复
  content/index.tsx    选区检测、Shadow DOM、Floating UI 与浮窗
  options/            设置与网站授权
  popup/              工具栏入口、临时启用与授权
  sidepanel/          标签页对应的共享聊天 UI
src/
  background/
    repository.ts     可信存储与模型配置
    conversations.ts  会话与请求 ID、取消、竞态隔离
  llm/
    adapter.ts        ProviderAdapter / OpenAI-compatible 实现
    sse.ts            增量 SSE 分帧与 delta 解析
    prompts.ts        动作指令、明确的源数据边界与历史预算
    errors.ts         安全错误映射，不反射原始服务响应
  components/         共享 Chat、品牌组件
  hooks/              Port 重连与主题
  shared/             类型、验证、选区快照与 RPC
```

后台是会话状态的唯一所有者，按 tabId / conversationId / requestId 隔离。浮窗与侧边栏订阅同一状态，草稿逐次同步；Port 每 10 秒发轻量心跳，5 秒未收到响应会主动重连，也处理 Chrome 未及时通知断线的情况。内存状态按约 400ms 间隔写入 `storage.session`，请求结束立即保存。后台意外终止后，重连读取最近快照并将旧的生成状态标记为中断，**不会自动重复请求或重复计费**。极端终止时可能损失最后约 400ms 的增量。

单次请求最长两分钟；原文最多 12,000 字符，段落最多 16,000 字符，追问最多 4,000 字符，回答最多 32,000 字符。Prompt 保留最近至多 12 轮且历史不超过 24,000 字符；字符预算是简单的成本上限估计，不是精确 Token 计算。原选区始终保留。显示历史也受轮数和字符限制。

标签页导航时停止该标签页的生成并保留旧对话，关闭标签页时删除其会话。所有对话只保存到浏览器会话内存，不提供长期历史。

## 验证

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build

# 首次准备 Chromium
pnpm exec playwright install chromium
pnpm test:smoke
```

如已有 Playwright Chromium，可通过环境变量 `SELIO_CHROMIUM_PATH` 指定其可执行文件；不要使用个人浏览器的用户数据目录。

测试不使用真实 API Key：

- 单元测试覆盖文本处理、选区快照、编辑区域排除、动作 Prompt、模型校验、UTF-8/SSE 任意分块、历史预算、HTTP 错误、取消和跨会话竞态。
- Smoke Test 使用原样生产扩展、全新临时 Chromium profile、本地文章与真实 HTTP SSE Mock API。
- 测试在临时 profile 内通过 Chromium 自身的扩展设置 API 预先记录本机来源的用户授权，再由真实设置表单执行 `permissions.request`。`permissions.contains`、来源列表及真实脚本注册均正常执行，不修改生产 Manifest 或业务代码。原生授权弹窗的点击仍列为手动验证项。
- 浏览器截图与 trace 输出到 `test-results/`。临时 profile 在测试结束后删除。

本次交付已运行：`pnpm install --frozen-lockfile`、`pnpm dev`（确认开发服务启动后停止）、`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:smoke` 和 `pnpm zip`。52 个单元测试与 4 组浏览器 Smoke Test 通过；浏览器测试包括真实 Side Panel 草稿/历史接续、强制停止 Service Worker 后恢复、390px 窄屏、深色主题、可信存储隔离和撤销网站权限。原生侧边栏通过 CDP 的实际侧边栏目标读取与截图，不使用另建页面代替。

建议手动复核：Chrome 原生授权弹窗的同意/取消、右键菜单、侧边栏在多窗口之间的跟随、浏览器工具栏 activeTab 生命周期、关闭浏览器后的会话 Key 清除、不同真实模型供应商的兼容性。

## 当前范围与限制

- 面向 Chrome MV3，暂不提供 Firefox/Safari 适配。
- Chrome 内部页面、Chrome Web Store、内置 PDF 阅读器等限制注入的页面不支持浮窗；可使用侧边栏处理已存在的对话，支持选择菜单的页面可尝试右键入口。
- 只处理顶层普通网页文本；不处理 iframe 内选区、表单、contenteditable、Canvas 或图片文字。
- 网页的 Shadow DOM 内部文字与高度特殊的自定义排版可能不产生可用选区。
- 主动关闭浮窗保留会话；切换到新选区会替换该标签页旧会话，切换前有明确提示。没有多会话历史管理。
- 周围段落须保持原 DOM 仍有效；刷新、路由替换或右键入口无法保证取回原段落，会提示重新选择。
- 不读取整页正文，不解析 PDF，不做 OCR、RAG、长期记忆、登录、支付或云同步。
- 本地测试验证协议与产品流程；未使用真实付费 API 验证供应商账户、模型权限或计费。

后续可按需扩展：Gemini/Anthropic/Ollama 原生适配器、经过明确同意的正文提取、更多输入区域支持，以及更精细的 Token 预算。无需预先引入独立后端。

## 实现参考

- [WXT 内容脚本与隔离 UI](https://wxt.dev/guide/essentials/content-scripts)
- [Chrome 可选权限 API](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Chrome Storage 访问级别与会话存储](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Playwright 扩展测试](https://playwright.dev/docs/chrome-extensions)
