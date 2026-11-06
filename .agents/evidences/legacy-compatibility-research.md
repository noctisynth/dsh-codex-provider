# SIWC 与 legacy Codex 兼容成本调研

编号：EVIDENCE-026。日期：2026-11-07。适用：当前插件、DSH 0.2.2-rc.1、随附 pi-ai 1.3.0、社区插件 3.2.6。legacy 在本次调研中特指旧 Codex OAuth 与 ChatGPT Codex backend 路线，不指 Chat Completions 或 API key。此次只调研，没有实施第二条路线，也没有调用 legacy 真实账号。

## 官方文档事实

[SIWC 注册文档](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)要求动态注册，并保存每个账号获发的 client_id 与独立 host 标识。[模型与推理文档](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)明确使用公开模型目录及 Responses，不能将这条授权路线指向 ChatGPT backend-api。[账号文档](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)要求使用对应 client_id 刷新，隔离注册及凭据并串行处理旋转令牌。

[Codex 认证文档](https://learn.chatgpt.com/docs/auth)说明 Codex 自身支持 ChatGPT 登录、自动刷新与文件或系统凭据存储。这不能推导为第三方应用获得了同等 backend 接口支持承诺；此次查阅的 SIWC 文档没有提供 legacy backend 的第三方兼容契约。

## 发布代码观察

只读核对 DSH 随附 pi-ai 1.3.0 的 Codex OAuth provider：使用固定 Codex client ID，授权与换令牌地址分别为 auth.openai.com 的 oauth/authorize 和 oauth/token；浏览器回调固定为 localhost:1455/auth/callback。登录参数包括 id_token_add_organizations 与 codex_cli_simplified_flow；从访问令牌取 chatgpt_account_id。社区插件仍委托该 provider 管理旧登录与刷新。

该 provider 推理使用 chatgpt.com/backend-api/codex/responses，附 chatgpt-account-id、originator 和 Responses 实验标识；社区目录使用 backend-api/codex/models 与 client_version。以上是版本化发布实现观察，不是 OpenAI 的第三方公共 API 保证，也不是本次真实调用结果。

两条路线均构造 Responses input、reasoning、tools，使用 store=false、stream=true，并处理流式 Responses 事件。现有宿主消息转换、图片编码、输出映射和取消机制有较多复用空间，但不能据此认定所有事件与错误完全一致。

## 当前代码的实际改动面

当前原生 Session、登录验证、刷新、退出和流入口都专用于 SIWC；流入口检查 chatgpt.tokens.use.direct。宿主账号选择和注册标识以每个动态 client_id 为主，而 legacy 多账号共用固定 client ID。因此必须定义明确的授权类型和稳定账号键，不能仅给 Session 填入旧 token 或统一放宽 SIWC 的验证。

最小兼容实现需要按授权类型分离认证及凭据，集中选择请求路由、账号请求头、模型目录与能力；复用现有宿主适配和 Responses 主体。不需要新增第二套 TS LLM 适配器或全面通用化 provider 框架。固定端口的实际占用、刷新旋转和退出语义需要分别处理，不能默认与 SIWC 相同。直接依赖整个 pi-ai 虽然有现成 legacy provider，但会扩大 JS 核心职责和依赖，不符合当前 Rust 核心方向；可作为协议观察依据。

必要验证覆盖两种授权并存、账号与目录切换、错误分类及失效恢复，以及两路的多轮工具、图文、长会话压缩、取消、搜索和审查。若导入已有 Codex 凭据，需另行决定文件与系统存储范围、复制或共享及刷新所有权；本次不默认读取用户 Codex 凭据。

## 工程评估与限制

评估为中等实现成本，主要新增认证及凭据分支和真实集成验证，而不是重写整个插件。长期维护成本高于单独 SIWC：需要跟踪 backend 的实际变化、账号能力和错误差异。此为代码检查后的工程推断，不是经过实施测量的工期承诺。

额度、Fast、专用搜索和图片生成是独立能力。legacy 路由可能提供进一步验证它们的机会，但本次没有证明当前账号可用，也不把这些能力列为兼容后自动获得的结果。若后续获准实施，建议保留 SIWC 为默认，明确提供独立的 legacy 选择，不在 SIWC 失败时静默改用 legacy。该建议尚未成为用户确认的产品决策。
