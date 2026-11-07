# 依赖与协议事实

编号：FACT-002。更新：2026-11-07。证据：EVIDENCE-002、EVIDENCE-003、EVIDENCE-004；补充来源随事实列出。

2026-11-07，同一现有 Codex 登录凭据的目录对照表明：诊断时插件所用 client_version=0.0.0 缺少 GPT-6.1 Sol/Terra，改为 0.159.0 或 0.167.0 后服务端返回两项且 visibility=list；省略参数返回 400 必填错误。官方将此参数关联 Codex 目录 schema，原参数误取 Cargo 内部版本；此问题不发生在 SIWC 的公开目录。初轮实验限于目录，后续安装修复及用户桌面对话验收见 EVIDENCE-034。

2026-11-07 核对 DSH 0.2.2-rc.1 官方 locale 发布库：命名空间可注册中文、英文字典，插槽 locale 元数据让宿主注入 t 并订阅语言变化；其它语言可回退英文。当前宿主模型菜单直接显示 reasoning effort 的字符串 name，没有该字段的翻译注入。插件 React 界面本地化与宿主原生菜单的能力边界不同，依据 EVIDENCE-029。

2026-11-07 核对 DSH 0.2.2-rc.1：默认适配器派发无条件将 FileBlock 转成文字句柄；正式 llm/stream waterfall 在此转换前执行，允许插件读取完整不可变附件引用并自己返回流结果。AttachmentStore.readFileStream 提供正式文件字节读取契约，具体存储后端须实现。普通及已准备调用的离线短路实验通过，但未验证真实后端上传或桌面集成；计量与默认派发职责限制见 EVIDENCE-030。

同日核对固定版本桌面 token-meter 与 compaction：文件按文字句柄计量，没有文件路由计价注册入口，自动压缩及切模使用同一计量。OpenAI 官方 token 计数文档支持 PDF file_data；所测现有 SIWC 的 PDF、TXT 计数均被授权边界拒绝，同 token 目录对照成功，依据 EVIDENCE-033。保留默认派发的请求级引用映射仅为静态设计，完整预算未闭合，依据 EVIDENCE-030。

| 事实 | 适用限制 |
|---|---|
| legacy 的 Codex Responses 接受现有内置 web_search 参数；Sol、Astra 及多轮搜索真实完成，最终原生和 DSH 共享搜索验证通过 | 2026-11-07 所测凭据及模型；复用既有链路开放能力，见 EVIDENCE-036 |
| SIWC 合成 PDF、文本与 Sol/Astra 四档图片精度完成；插件图片精度已接入，原生文件受宿主默认投影阻塞 | 2026-11-07 所测账号及模型，用户暂缓文件接入；见 EVIDENCE-031 |
| SIWC Responses 服务端自动压缩生成加密项且可续写；独立 compact 路由与 configuration_update 被当前授权拒绝 | 所测公开路由及 Sol，不推导所有模型和未来策略；见 EVIDENCE-032 |
| napi-rs 3 提供 Tokio 异步与 Web Streams | 项目取消、背压和宿主兼容未验证 |
| openidconnect 4.1 覆盖 OAuth 和 ID token 校验 | ChatGPT 动态注册需要业务适配 |
| oauth2 5 集成 reqwest 0.12 | 与 0.13 不可直接视作同一客户端类型 |
| 官方授权使用颁发 client ID、身份校验和订阅权限 | 项目尚无真实授权证据 |
| 官方模型目录包含 models、slug 和 visibility | 不可套用一般 API 模型目录假设 |
| 订阅推理要求公开 Responses、关闭存储和流式读取 | response.completed 才代表成功完成 |
| napi pre-publish 默认发布平台包 | 必须明确唯一发布者并检查产物齐备 |
| 现有插件调用 DSH 模型及凭据服务 | 第三方观察，官方宿主契约仍需核实 |
| DSH 官方本地 provider 在跨进程锁内执行异步 modifyRecord 并原子写入 | 已静态核对发布包 0.2.1-rc.2；锁等待 30 秒，不推广到任意 provider |
| 官方协议要求分开管理多个账号注册及已验证身份 | 宿主账号选择和添加交互仍待实现 |
| napi CLI 3.10.12 生成产物使用硬链接 | exFAT 直接生成失败；临时 NTFS 输出已验证 |

技术决策由 SPEC-001 维护，不在此复制实现进度。

2026-11-07，Base UI 1.9.0 发布包声明支持 React 18；其 Select、Menu、Switch 采用独立的 Portal、Positioner 及公开变更回调，不能直接沿用 Radix 的关闭焦点事件。Biome 2.6.5 支持 Tailwind 4 指令、样式入口与类排序规则。实际包元数据、官方来源及迁移限制见 EVIDENCE-025。

2026-11-07，DSH 0.2.2-rc.1 的 approval/request 答复者可返回单次许可；never 策略在分发前拒绝。WebRuntime 支持正式搜索源注册及来源截断，ready 只检查本地凭据，不应请求模型目录。ConfigEditor 的条目 Fiber 包装对象可能引用不等而 uid 相同。公开模型目录中的专用审查模型可隐藏于普通列表。依据 EVIDENCE-023、EVIDENCE-024，不能据此推断任意宿主版本兼容。

2026-11-07 核对：SIWC 允许模型支持的图片输入但不支持 Files 上传；Responses input_image 接受 data URL。DSH 0.2.2-rc.1 附件服务提供校验后的图片读取，宿主按模型能力执行文字占位，offloaded 表示持久卸载决定。来源与实测限制见 EVIDENCE-020。

依据 EVIDENCE-010：目标公开模型目录提供 supported_reasoning_levels 与 default_reasoning_level；DSH 0.2.2-rc.1 通过精确模型解析的 reasoning 元数据提供档位选择和默认值校验。档位与默认值具有模型差异，不从型号猜测。

依据 EVIDENCE-009 的流实验：目标公开模型可以在 output_item.done 中提供完整输出，同时在完成通知中返回空输出数组；不能只依赖终止通知恢复 stateless 历史。此为特定日期和请求下的观察。

依据 EVIDENCE-008：tsdown 使用 Rolldown/Oxc 构建 TypeScript 产物；Oxc tsrs 是实验性的 TypeScript Rust 移植编译器，当前已验证版本为 0.22.0-ts7.1.0-beta。DSH 正常模型选择目录监听凭据记录更新，授权流注册本身不提供设置入口。

补充事实，依据 EVIDENCE-007：目标 DSH 0.2.1-rc.2 提供授权流注册、账号交互 prompt、凭据事务和 LlmAdapter 注册；宿主未提供声明远端撤销的授权流接口。当前 Responses 文档说明 store=false 时默认返回加密推理资料，并要求函数调用连续上下文保留相关 output 项。适用限制：真实账号及桌面集成尚未完成。
## 身份资料补充

2026-11-06 核对官方 Sign in with ChatGPT Quickstart：身份 scopes 可返回姓名、邮箱和头像。公开开源令牌参考将 OpenAI auth metadata 定义为不透明信息，未列出可用于展示的 Pro/Plus 套餐字段。当前采用经验证的标准 OIDC name、picture、email；使用邮箱作为账号次要信息，不从授权 scope 推断套餐。来源及实现证据见 EVIDENCE-013。

同日真实授权诊断显示，profile scope 存在并不保证返回 picture。当前所测账号 ID token 有 name、无 picture；官方 discovery 声明的 UserInfo 接口成功返回匹配的 sub，但也无 picture。该结果只代表此次账号与授权，不能推广为所有账号均不支持头像。依据 EVIDENCE-014。

Gravatar 官方图片服务按规范化邮箱的 SHA-256 定位头像，支持以 404 响应表示没有匹配图片；图片请求无需 OpenAI 凭据。Gravatar 头像不保证与用户当前 ChatGPT 头像一致。2026-11-06 核对，来源与限制见 EVIDENCE-014。

2026-11-06 核对 DSH 0.2.2-rc.1：reasoning effort 的请求 id 与显示 name 分离；settings.launcher 支持按优先级替换整个左下角账号组件，但没有独立替换头像姓名的公开扩展点。原组件也承载 DeepSeek 账号相关提醒，替换会影响其渲染。依据 EVIDENCE-010、EVIDENCE-015。

依据 EVIDENCE-016：目录的 context_window 是当前容量，DSH 通过 context.contextWindow 消费；max_context_window 不等于默认启用容量。目录 Ultra 是 Codex 客户端的推理与主动委派组合模式，公开 Responses 不接受将 ultra 直接作为 reasoning.effort；目录展示值不能一概视作普通推理请求值。

2026-11-06，SIWC 官方界面规范包含 Fast 示例；当前账号目录对所测两个模型均声明 priority/Fast。真实合成请求拒绝 fast 字面值，priority 完成但响应字段为 default。第一方 Codex 官方反馈说明其回显不一定反映 Fast 路由，该解释尚不能直接推广到 SIWC；当前无法只凭该字段确定加速是否生效。依据 EVIDENCE-017。

2026-11-07 复核 SIWC 公开限制：max_output_tokens 与 temperature 不受支持；错误响应可为顶层 detail；终止刷新错误需清理不可用令牌并保留注册身份。DSH 0.2.2-rc.1 的摘要压缩会传 maxTokens，失败后压缩依赖 CONTEXT_WINDOW_EXCEEDED 分类。依据 EVIDENCE-018、EVIDENCE-019；实现状态由 TODO-001 维护。

2026-11-07 核对：SIWC 官方要求公开 Responses，不能将其授权指向 ChatGPT backend。DSH 随附 pi-ai 1.3.0 的 legacy Codex provider 使用固定客户端、独立 OAuth 地址、账号请求头及 backend Responses；这是发布实现观察，不是第三方公开契约。依据 EVIDENCE-026。

2026-11-07 真实入口探测确认 Codex 设备码服务可签发用户码，当前原生流程能取消；浏览器回调入口也能启动并取消。没有完成用户授权或证明 legacy 推理可用。两种 legacy 登录更新同一账号、SIWC 独立保留是用户确认的产品行为，其实现与验证范围见 EVIDENCE-027。

2026-11-07 官方文档总名称为 Sign in with ChatGPT，当前将使用套餐调用模型的可选能力称为 ChatGPT plan usage；发起登录的推荐用户文案为 Continue with ChatGPT。Token sharing 属于集成与令牌共享语境，不应显示成另一种并列登录方式。依据 EVIDENCE-028。
