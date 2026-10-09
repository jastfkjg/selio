# Selio

**Select. Understand. Explore.**

一个 Chrome Manifest V3 AI 阅读助手。点击工具栏图标即可针对当前网页提问；也可以选中文字，翻译、总结或解释，再留在原网页继续追问。基于 WXT、React、TypeScript 和 Floating UI，不需要后端、数据库或账户。

## 快速开始

环境：Node.js 22.12+、pnpm 10、Chrome 116+。开发与自动化测试建议使用当前稳定版 Chrome / Chromium。

```bash
pnpm install
pnpm dev
```

1. 打开 Chrome 的 `chrome://extensions`，开启右上角「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择本项目的 `.output/chrome-mv3-dev` 目录。开发服务器保持运行，浏览器手动加载扩展；控制台也会打印实际输出路径。
3. 将工具栏中的 Selio 固定，点击 Selio 打开侧边栏 → Open settings。界面默认英文；右上角语言菜单可切换为简体中文，下文操作名称使用中文。
4. 在「模型」填写 Provider、Base URL、模型标识和自己的 API Key，点击「保存模型」，在 Chrome 弹窗中授权该 API 来源。
5. 点击「测试连接」。该操作会向所选供应商发送一个简短测试请求，可能产生少量 API 用量。
6. 打开普通 HTTP/HTTPS 网页，点击工具栏 Selio，侧边栏会在本机提取正文。直接输入问题或点击建议问题即可开始网页问答，无需先划词。侧边栏可一键申请“在此网站启用自动划词”，也可在设置的隐私页授权全部网站或指定网站。
7. 选中一段文字，点击选区旁的 Selio 图标，或将鼠标停留约 0.8 秒，在右侧浮窗查看默认动作结果。默认翻译成简体中文。
8. 在底部输入问题，Enter 发送，Shift + Enter 换行。中文输入法组合输入期间 Enter 不会提前发送。

仅在当前页使用时，通过工具栏用户手势获得的 `activeTab` 临时权限注入脚本；重开页面后可能需要重新启用。**普通划词本身不会授予 activeTab 权限。** 已持久授权的网站会在扩展启动、更新和授权变更后检查已有标签页，并为缺失的监听器补注入脚本，无需先点工具栏或刷新网页。

## 生产安装包

```bash
pnpm build
pnpm zip
```

加载 `.output/chrome-mv3` 即可使用生产版本。`pnpm zip` 在 `.output` 内生成可分发 ZIP；安装前先解压并加载其中包含 `manifest.json` 的目录。开发构建包含 WXT 开发工具配置，分发时应使用生产构建。

## 使用方式

- **划词浮窗**：默认 420px，自动避让视口边缘。拖动标题栏或抓手移动，拖动右侧、底部或右下角调整大小；抓手和缩放按钮支持方向键，Shift + 方向键加大步幅，双击抓手恢复自动定位。手动移动后固定在视口内，缩小浏览器窗口时自动约束位置和尺寸。网页 CSS 通过 Shadow DOM 隔离，字体尺寸使用 px，避免宿主页面的 rem 缩放干扰。
- **可配置操作**：内置翻译、总结、解释，可添加自定义 Prompt 操作。按选区、动作和发送范围分别保留回答、追问与草稿。首次切换到未生成过的组合才调用模型；切回已有组合直接恢复，不重复生成。正在生成的旧组合会被停止，返回后保留部分内容，需要主动重新生成继续。
- **多轮对话**：保留原始选区与最近问答。支持停止、重新生成、复制回答、安全 Markdown 和表格。
- **选区切换**：选中文字后点击 Selio 图标即直接切换，新选区清空旧选区的会话与动作缓存，无需二次确认；仅划词不会调用模型；点击或悬停图标约 0.8 秒后执行默认操作；“先编辑”模式会先打开编辑器，不调用模型。收起浮窗不会删除对话或停止后台生成。
- **阅读交互**：Context 默认完全收起，可展开修改发送范围及查看原文；输入框左下可快速切换已配置模型，保留会话且不立即发请求，下次追问或重新生成使用新模型。生成时发送按钮变为停止按钮，已收到内容保留并在对话内标记停止。
- **网站开关**：工具栏点击后通过 activeTab 临时读取当前网页；已停用的网站需要先在设置中移出禁用列表。跨页面自动启用仍需 Chrome 一次授权全部网站或指定网站。
- **侧边栏**：点击浮窗右上角的固定按钮，原始选区、消息、生成状态和草稿接续到 Chrome Side Panel，不会重新调用模型。侧边栏跟随当前窗口的活动标签页，每个标签页有独立会话。
- **右键菜单**：选中文字 →「用 Selio 理解选中文字」，在侧边栏执行默认动作。已有对话时直接切换到新选区。此入口只使用浏览器提供的选中文字，不自动读取段落。
- **划词上下文**：划词模式默认只发送选中文字。选择「选中文字 + 所在段落」才读取和发送段落；仅使用相近的 p/li/pre/blockquote/td/标题元素，不用 body 或大块 div 作为整页回退。选区失效时提示重新选择。
- **界面语言**：默认 English，与浏览器或用户 profile 无关。设置页右上角或 Reading preferences 中切换 English / 简体中文，自动保存到本机；浮窗、侧边栏、工具栏弹窗和右键菜单同步更新。界面语言与翻译/解释目标语言独立，升级时保留旧目标语言和模型配置。
- **设置**：多个模型、默认模型、默认动作、目标语言、浅色/深色/系统主题、划词开关、网站禁用列表、清除数据。

## AI 网页问答（Ask This Page）

工具栏图标直接打开 Chrome 原生侧边栏，不再先显示弹窗。提取正文在本机完成，点击问题或发送输入后才调用当前模型；再次打开同一页保留问答。“刷新正文并开始新对话”在提取成功后替换旧会话，失败时保留旧内容。网页导航后旧快照会标记失效，需刷新正文再提问。动态加载但未改变 URL 的内容请手动刷新正文。

侧边栏提供“使用当前页面”开关。关闭后进入普通 AI 问答，不发送网页正文、标题或 URL；切换会开始新对话，旧网页回答也不会混入普通问答历史。提取失败时显示可展开的原因，并保留普通聊天输入框。刷新失败仍保留原会话；普通问答不会因网页导航而被中断。

正文提取借助 [Mozilla Readability](https://github.com/mozilla/readability)，在文档副本上过滤导航、页脚、侧栏、广告、隐藏元素、输入区和扩展自身 UI；普通文章排除评论，识别到 Reddit 讨论结构时则单独收集已加载的帖子和评论正文、标明评论边界，并提示不代表完整讨论。正文过少时标注内容有限，避免将标题当成全文。对包含代码或表格的文档优先保留语义主区域。不会把整个 DOM 的 `innerText` 直接上传。该策略仍有启发式误差，可以展开“页面内容”核对。

- **短文**：提取正文不超过 16,000 字符时全部提供给模型。
- **长文具体问题**：约 1,600 字符分片，使用本地中英文关键词检索（词项稀有度、标题权重、相邻片段），每次正文预算 16,000 字符；没有额外 embedding 或摘要 API 请求。
- **长文概括问题**：从正文首尾和中间均匀抽样，明确标注“抽样概览”。这不是完整全文总结。检索无匹配时也退回抽样，并要求模型说明证据不足。
- **可核查范围**：每条回答保存当次选择的片段编号、原文字符位置与字符数，可展开原文；模型被要求引用 `[片段编号]`，并区分“所给片段未说明”和“全文未说明”。保留的历史问答也参与后续请求。
- **本地上限**：最多保留 180,000 字符；超过时明确提示尾部未处理。超过 40,000 个 DOM 元素的页面会要求打开独立文章页，避免在极复杂页面上阻塞提取。字符预算不是精确的模型 Token 预算。
- **内容边界**：只读取顶层网页当前已加载的正文，不读取 iframe、Shadow DOM、表单、图片、Canvas、PDF，也不自动滚动或绕过登录/付费墙。

参考 `../ContextCue` 的上下文检查与“刷新后新会话”交互，本版选择文本优先。后续可增加用户主动选择的当前视口截图、预览/裁剪与视觉模型能力检查，用于图表和 Canvas；截图只代表可见区域，不能冒充整页证据。若需要可靠的完整长文总结，再加入可取消、可显示进度和用量的逐片摘要 → 汇总流程。

## 自定义 Prompt 操作

打开设置 → **Actions & prompts / 操作与 Prompt**，可创建、编辑、隐藏或删除自定义操作（最多 24 个，包含内置操作）。内置操作可以修改名称、图标、Prompt、模型和执行方式，也可从快捷区隐藏。隐藏的操作仍可从浮窗与侧边栏的“更多操作”访问；默认操作独立设置，可用于点击、悬停和右键入口。

- 名称最长 40 字；图标从 10 个 Lucide 图标中选择，包含 `Code`、`Pencil`、`Table`。
- Prompt 最长 8,000 字，必须包含 `{{selection}}`；可用 `{{language}}` 引用当前目标语言。只做文本变量处理，不执行代码；请求中网页原文仍独立放入 JSON 源数据，模板通过字段引用读取它。
- 可指定已配置的模型；选择“跟随当前模型”时，新选区使用全局默认模型，对话内沿用当前模型。删除模型后，相应模板自动回到跟随模式。
- “直接执行”立即请求；“先编辑，再执行”打开可预览的本次 Prompt 编辑器，点击执行才请求，取消不产生请求。本次编辑不会修改保存的模板；也可通过回答下方的“编辑 Prompt”调整并重新运行当前操作。
- 每个操作与范围分别保留结果、草稿和本次 Prompt，切回已完成的组合不重复请求。修改已保存的 Prompt 后，再次选择该操作会按新版本处理；删除模板保留已有对话，删除默认模板时自动选择一个剩余操作。
- 模板保存在本机，浮窗与侧边栏同步编辑状态。用量明细保留请求时的操作名称，不保存 Prompt 和网页原文。

## Token 用量

设置页的 **Token usage / Token 用量** 展示最近 1,000 次请求，包括模型测试、初次阅读、追问和主动重新生成。可按最近 7 天、30 天、全部记录以及供应商筛选，查看请求次数、已报告的输入/输出/合计 Tokens、每日趋势与逐次明细。缓存切换不发请求，也不新增用量记录。

- 统计使用供应商真实返回的 `usage`，没有估算 Token 或费用。OpenAI-compatible 请求启用 `stream_options.include_usage`，继续读取 `finish_reason` 之后的用量帧；Anthropic 合并累计输入、缓存输入及输出计数，避免重复累加。
- 缺失用量显示 `—`，取消、失败或中断可能已有实际消耗。部分报告会明确标记，统计不可代替供应商账单。
- 只存请求时间、供应商/模型、动作、状态与计数，不存原文、问题、回答、网页地址或密钥。记录保存在受保护的本机扩展存储中，浏览器重启后仍保留。
- 可单独清除用量历史；清除全部本地数据也会清除用量。正在生成时清除不会让旧请求在结束后重新写回已删除的记录。

所有界面下拉菜单共用可键盘操作的主题弹层，支持方向键、首字母、Home/End、Enter、Escape，适配深色主题及 Shadow DOM。

## 模型配置

支持 **OpenAI-compatible Chat Completions + SSE** 和 **Anthropic 原生 Messages + SSE**。供应商菜单提供品牌标识、协议提示与键盘导航（方向键、Home/End、首字母、Enter、Escape）。

| Provider | 默认 Base URL | 默认模型标识 |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Anthropic | `https://api.anthropic.com/v1` | `claude-sonnet-4-6` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.8-flash` |
| Qwen | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Kimi | `https://api.moonshot.ai/v1` | `kimi-k2.5` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Custom | 用户填写 | 用户填写 |

模型可用性取决于供应商与账户，所有预设均可编辑。Anthropic Base URL 自动补全 `/messages`，其余自动补全 `/chat/completions`；填写完整接口地址也不会重复拼接。通常应包含供应商要求的 `/v1` 路径。

- API 地址必须是 HTTPS；为本地开发允许 `http://localhost`、`http://127.0.0.1` 和 `http://[::1]`。
- 不接受 URL 中的用户名、密码、查询参数或片段；禁止 HTTP 重定向，避免带着密钥跳转到其他来源。
- 通常不发送 Temperature；可自行设置 0–2（Anthropic 为 0–1）。Kimi K2.5 预设使用即时模式，发送 `thinking: { type: "disabled" }` 和固定 Temperature 0.6。
- Qwen 与 Kimi 默认使用国际站地址。中国大陆账户分别改用 `https://dashscope.aliyuncs.com/compatible-mode/v1`、`https://api.moonshot.cn/v1`，密钥必须匹配区域。
- Anthropic 使用 `x-api-key`、`anthropic-version: 2023-06-01` 与浏览器直连头；System 提示放入顶层字段，单独解析文本事件、终止事件和错误。请求仍仅从后台发出。
- 最大输出 Tokens 可设 16–8192，默认 2048。适配器发送 `max_tokens`；要求 `max_completion_tokens`、Responses 或其他未适配原生协议的模型暂不兼容。
- 修改 API 来源时必须重新输入该来源的密钥，不会自动将旧来源的密钥发送过去。
- 切换默认模型只影响新对话。进行中的对话继续使用原模型；原模型被删除后下一次请求使用当前默认模型。
- 常见异常（Key 失效、余额/额度、429、模型不存在、服务故障、截断流）有中英文反馈，重试由用户主动发起。

### API Key 保存边界

默认使用 `chrome.storage.local` 保存在这台设备上，重启浏览器或重新加载扩展后仍可使用。升级时会将仍存在的旧会话 Key 迁移至本机；已被清空的 Key 无法恢复，需要重新输入一次。

本机保存**未加密**，具有本机访问权限的人可能读取，不会同步到云端。仍可选择「仅本次浏览器会话」使用 `chrome.storage.session`，关闭浏览器、停用、重载或更新扩展后清除；升级后的显式会话选择不会再次迁移。

如果更新后看起来需要重新配置，先区分以下情况：

- 编辑表单的 API Key 输入框会始终留空；显示“已保存 / 留空保留现有密钥”时，密钥仍在，不需要重新输入。
- 模型选择“仅本次浏览器会话”时，Chrome 会在重载、更新和重启时清除密钥。需要跨重启保留，请选择“保存在这台设备上”。旧会话密钥已经清除后无法恢复，只需重新保存一次。
- 模型、偏好也全部消失时，请核对是否卸载重装、切换 Chrome profile，或改为加载另一个构建目录。开发版和生产版可能是不同扩展 ID；更新同一个已加载目录后点击重新加载，不要通过卸载来更新。
- 显示“本机密钥已保存”但请求报 401/403 时，应核对供应商密钥、区域和权限，不能直接判断为本地存储丢失。

持久密钥与模型配置现在通过同一次本机存储写入提交；切换保存方式时，确认配置提交成功后才清理旧位置，避免写入失败造成配置与密钥位置不一致。自动化覆盖了写入失败、编辑留空、扩展重载与完整浏览器重启。

`local` 与 `session` 在后台初始化时都设置为 `TRUSTED_CONTEXTS`，不允许 Content Script 直接读取。密钥只在设置表单输入并由后台读取使用，设置查询只返回 `hasKey`。普通网页 DOM、Content Script、日志、Prompt 均不接收密钥；不使用 `storage.sync`。

## 权限与隐私

生产 Manifest 不包含常驻 `host_permissions`，也不包含自动注入所有网站的静态脚本。可选声明 HTTP/HTTPS 来源范围，运行时可一次请求全部 HTTP/HTTPS 网站，也可逐站请求；无法跳过 Chrome 原生授权。

| 权限 | 用途 |
| --- | --- |
| `storage` | 本机偏好、默认持久密钥、可选会话密钥与会话快照 |
| `scripting` | 对已授权网站注册划词脚本，或在主动点击后临时注入 |
| `activeTab` | 工具栏点击后的当前页面临时访问；不是普通划词自动授权 |
| `contextMenus` | 选中文字的主动右键入口 |
| `sidePanel` | 同一会话固定到 Chrome 侧边栏 |
| 可选 HTTP/HTTPS 来源 | 分别用于用户指定的网站自动划词与模型 API 请求 |

API 来源权限本身不会开启该来源网页的自动划词，启用「允许全部网站」或「允许自动划词的网站」列表才参与脚本注册。全站访问可在隐私页撤销；撤销宽泛权限可能同时撤销其覆盖的 API 来源权限，此时重新保存模型授权即可。禁用列表同时匹配域名及其子域名。撤销网站授权会同时撤销相同来源的 API 权限（如果重合），此时重新保存模型即可再次授权。

Chrome 的来源权限以主机为主要边界，不能作为路径级网络沙箱；Selio 仍只使用已保存、校验通过的模型接口发请求。没有任意 URL 代理、网页 postMessage 请求通道或 `externally_connectable`。普通页面不能调用模型管理接口，Content Script 也只能访问它所属标签页的会话。

划词模式只有点击或悬停选区图标约 0.8 秒、首次切换动作、重试、追问或右键菜单才发起 AI 请求，不上传网页标题或 URL。网页问答在用户发送问题后上传提取的页面标题、本次选择的正文片段、范围元数据和保留的问答；打开工具栏或刷新正文不会调用模型。完整 URL 仅用于本地快照来源及导航检查，不放入模型请求。两种模式均不读取浏览历史。网页文字作为独立 JSON 源数据进入 Prompt，并明确标记为不可信数据；这是一项提示注入缓解措施，不承诺模型不会受源文字影响。

Markdown 不执行原始 HTML，不自动加载图片，链接采用安全 URL 过滤和 `noopener noreferrer`。没有第三方分析、远程脚本、远程字体或其他追踪 SDK。

## 划词收藏与 AI 笔记

回答下方的 **Save / 收藏** 可打开笔记表单，添加可选的备注和标签后保存。每条收藏包含原始选中文字、选词时的原文 URL 与标题、当前 AI 回答、用户备注和标签。生成中的回答需先完成或停止；同一条回答再次保存会更新备注与标签，不新增重复条目。扩大到段落模式仍保存原始选区。

侧边栏顶部的 **Saved notes / 收藏笔记** 提供轻量列表和详情，可按关键词搜索原文、标题、URL、回答、备注和标签，也可按来源网站筛选。列表中的 **导出 Markdown** 导出当前筛选结果；详情中导出当前条目。详情支持回到原文、编辑备注与标签、删除收藏。备注最多 4,000 字符，标签最多 20 个，每个最多 40 字符，以中英文逗号分隔。

收藏持久化保存在本机 `chrome.storage.local`，关闭网页、重启浏览器后仍保留，不随临时会话清理。保存、搜索和导出均不调用模型。只有扩展页面能列出全部收藏；网页内容脚本只能保存和读取所属会话的指定回答收藏。设置中的清除全部本地数据会一并删除收藏。升级前已有会话缺少来源 URL 时显示「来源不可用」，重新划词即可记录来源。

## 架构

```text
entrypoints/
  background.ts        权限、消息路由、请求入口、会话存储与恢复
  content/index.tsx    选区检测、Shadow DOM、Floating UI 与浮窗
  options/            设置与网站授权
  popup/              保留的独立权限控制页（非默认工具栏入口）
  page-extractor.content.ts  按需注入的正文提取入口
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
  page/               Readability 提取、分片与本地检索
  components/         共享 Chat、正文范围检查与品牌组件
  hooks/              Port 重连与主题
  shared/             类型、验证、供应商预设、中英文文案、选区快照与 RPC
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

- 单元测试覆盖文本处理、选区快照、编辑区域排除、动作 Prompt、模型校验、UTF-8/SSE 任意分块、Anthropic 事件与请求格式、旧设置语言迁移、文案覆盖、历史预算、HTTP 错误、取消和跨会话竞态。
- Smoke Test 使用原样生产扩展、全新临时 Chromium profile、本地文章与真实 HTTP SSE Mock API。
- 测试在临时 profile 内通过 Chromium 自身的扩展设置 API 预先记录本机来源的用户授权，再由真实设置表单执行 `permissions.request`。`permissions.contains`、来源列表及真实脚本注册均正常执行，不修改生产 Manifest 或业务代码。原生授权弹窗的点击仍列为手动验证项。
- 浏览器截图与 trace 输出到 `test-results/`。临时 profile 在测试结束后删除。

验证命令：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:smoke`。网页问答新增正文过滤、代码/表格保留、分片预算、中文检索、逐次来源范围与过期快照单元测试，以及真实侧边栏内无划词提问、提取失败保留会话、刷新与长文检索测试。浏览器测试包括完整关闭重启后的 Key 持久化、悬停延迟与取消、对话内切换模型、默认收起上下文、停止后的中性提示、网站启用开关，以及英文默认值、中英文切换与持久化、全部自定义下拉菜单、拖动与缩放、动作/范围缓存零重复请求、一次全站授权与撤销、Token 用量解析及筛选、Provider 菜单键盘操作、Anthropic 原生 Messages 配置/连接/生成流程、真实 Side Panel 草稿/历史接续、强制停止 Service Worker 后恢复、390px 窄屏、深色主题、可信存储隔离和撤销网站权限。原生侧边栏通过 CDP 的实际侧边栏目标读取与截图，不使用另建页面代替。

建议手动复核：Chrome 原生授权弹窗的同意/取消、右键菜单、侧边栏在多窗口之间的跟随、浏览器工具栏 activeTab 生命周期、关闭浏览器后的会话 Key 清除、不同真实模型供应商的兼容性。

## 当前范围与限制

- 面向 Chrome MV3，暂不提供 Firefox/Safari 适配。
- Chrome 内部页面、Chrome Web Store、内置 PDF 阅读器等限制注入的页面不支持浮窗；可使用侧边栏处理已存在的对话，支持选择菜单的页面可尝试右键入口。
- 只处理顶层普通网页文本；不处理 iframe 内选区、表单、contenteditable、Canvas 或图片文字。
- 网页的 Shadow DOM 内部文字与高度特殊的自定义排版可能不产生可用选区。
- 主动关闭浮窗保留会话；切换到新选区会替换该标签页旧会话，点击新选区图标或右键动作即切换，无二次确认。没有多会话历史管理。
- 周围段落须保持原 DOM 仍有效；刷新、路由替换或右键入口无法保证取回原段落，会提示重新选择。
- 网页问答支持正文提取和本地关键词分片检索；尚未提供全文分层总结、向量检索、截图/OCR、PDF 解析、长期记忆或云同步。
- 本地测试验证协议与产品流程；未使用真实付费 API 验证供应商账户、模型权限或计费。

后续可按需扩展：Gemini/Ollama 原生适配器、可检查的截图补充、完整长文分层总结，以及更精细的 Token 预算。无需预先引入独立后端。

## 实现参考

- [WXT 内容脚本与隔离 UI](https://wxt.dev/guide/essentials/content-scripts)
- [Chrome 可选权限 API](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Chrome Storage 访问级别与会话存储](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Playwright 扩展测试](https://playwright.dev/docs/chrome-extensions)

## 供应商接口参考

- [Anthropic Messages / SSE](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)
- [Qwen / DashScope compatibility](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope)
- [Kimi API](https://platform.kimi.ai/docs/overview)、[Kimi K2.5 参数](https://huggingface.co/moonshotai/Kimi-K2.5)

供应商模型列表会变化，预设只是起点，可按账户支持的模型修改 Model ID。验证使用本地 Mock API，不包含付费线上调用。

接口依据：[OpenAI Chat streaming usage](https://developers.openai.com/api/reference/resources/chat)、[Anthropic streaming usage](https://platform.claude.com/docs/en/build-with-claude/streaming)、[Chrome optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)。
