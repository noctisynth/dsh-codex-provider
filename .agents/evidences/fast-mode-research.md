# SIWC Fast 模式调研

编号：EVIDENCE-017。日期：2026-11-06。范围：官方公开文档、当前插件静态核对及用户随后授权的真实合成推理验证。

## 官方资料

SIWC UI/UX guidelines 在展示 ChatGPT plan 使用状态的示例中提供 Fast，并注明更快消耗套餐或 credits。该示例证明官方体验设计考虑了 Fast，但没有定义第三方令牌的服务档位请求契约或保证账号权限。来源：https://developers.openai.com/siwc/ui-ux-guidelines 。

官方 Codex Speed 文档明确 ChatGPT 登录可在受支持的桌面、CLI 与 IDE 中使用 Fast，配置为 service_tier=fast；这不是 reasoning effort。适用的是官方客户端，不能直接推广为第三方动态注册令牌的可用性。来源：https://learn.chatgpt.com/docs/agent-configuration/speed 。

通用 Responses API Fast 文档说明 service_tier=fast 与 priority 在支持模型上提供相同行为；实际使用档位由响应中的 service_tier 表示，不能只依据请求值或 HTTP 成功判断。该文档的通用 API 权限与计费不直接等于 SIWC 授权的权利。来源：https://developers.openai.com/api/docs/guides/fast-mode 。

SIWC 开源令牌推理页要求公开 Responses、store=false 和 stream=true，并使用当前账号可用模型。所核对的该页及限制页未明确承诺 Fast 档位权限；未列为禁止字段也不构成权限保证。来源：https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference 、https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations 。

## 项目状态与结论

初次调研时 Rust 请求类型和宿主适配未包含 service_tier，也没有速度开关。用户随后明确要求验证后加入开关；以下记录真实验证结果，不以降低推理强度模拟 Fast。

附带静态观察：当前可选 maxTokens、temperature 会映射为 max_output_tokens、temperature，而同日 SIWC 限制页将这两个字段列为不支持。仅字段存在时才会发送；本次没有触发对应请求，不能将该潜在兼容问题写成已复现故障。这是需要后续核对的协议差异。

## 真实 SIWC 请求验证

使用当前 DSH 活动账号尚有效的 SIWC access token，仅发送要求简短回复的合成输入，未读取或发送私人会话，未刷新或写入凭据。请求使用公开 Responses、宿主 attribution headers、store=false、stream=true 和 reasoning.effort=low。分别核对完整流中的终止事件及原始 response.service_tier，不通过耗时推断速度档位。

| 模型 | 请求 service_tier | HTTP 与终止结果 | 实际返回档位或错误 |
|---|---|---|---|
| gpt-6.1-sol | default | 200，response.completed | default |
| gpt-6.1-sol | fast | 400 | detail: Unsupported service_tier: fast |
| gpt-6.1-sol | priority | 200，response.completed | default |
| gpt-6-astra | default | 200，response.completed | default |
| gpt-6-astra | fast | 400 | detail: Unsupported service_tier: fast |
| gpt-6-astra | priority | 200，response.completed | default |

fast 的第一次诊断仅查看标准 error 对象，未取得说明；随后读取实际顶层 detail，两个模型均重复出现相同的拒绝。共八次短请求，四次完成、四次拒绝。未记录令牌、账号资料、响应标识或正文。

官方通用 API 文档允许 fast 或 priority，并要求以响应档位判断实际处理方式；部分文档对返回 fast 还是 priority 的描述存在版本范围差异，但两者都不等于本次返回的 default。来源：https://developers.openai.com/api/reference/typescript/resources/responses 、https://developers.openai.com/api/docs/guides/fast-mode 。未找到 SIWC 需要额外速度参数的公开说明。

观察结论：本次账号、授权与两个模型组合没有实际获得 Fast；priority 请求成功不能视为 Fast 成功。尚不能区分服务端 SIWC 限制、账号资格或其他服务端降档因素，也不能推广为所有 SIWC 账号永久不支持。当前不足以交付有效开关；按用户既有要求停止依赖该能力的实现并询问后续方向。未改产品代码、未构建或替换安装包。
