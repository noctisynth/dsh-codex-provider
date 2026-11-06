# 依赖与协议事实

编号：FACT-002。更新：2026-11-06。证据：EVIDENCE-002、EVIDENCE-003、EVIDENCE-004。

| 事实 | 适用限制 |
|---|---|
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

2026-11-06，SIWC 官方界面规范包含 Fast 示例，通用 Responses API 通过 service_tier 请求 Fast；官方客户端的 ChatGPT 登录支持不能直接证明第三方动态授权的实际档位权限。当前项目尚未验证该组合，依据 EVIDENCE-017。
