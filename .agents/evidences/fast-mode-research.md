# SIWC Fast 模式调研

编号：EVIDENCE-017。日期：2026-11-06。范围：官方公开文档与当前插件静态核对，未使用账号令牌或发送推理请求。

## 官方资料

SIWC UI/UX guidelines 在展示 ChatGPT plan 使用状态的示例中提供 Fast，并注明更快消耗套餐或 credits。该示例证明官方体验设计考虑了 Fast，但没有定义第三方令牌的服务档位请求契约或保证账号权限。来源：https://developers.openai.com/siwc/ui-ux-guidelines 。

官方 Codex Speed 文档明确 ChatGPT 登录可在受支持的桌面、CLI 与 IDE 中使用 Fast，配置为 service_tier=fast；这不是 reasoning effort。适用的是官方客户端，不能直接推广为第三方动态注册令牌的可用性。来源：https://learn.chatgpt.com/docs/agent-configuration/speed 。

通用 Responses API Fast 文档说明 service_tier=fast 与 priority 在支持模型上提供相同行为；实际使用档位由响应中的 service_tier 表示，不能只依据请求值或 HTTP 成功判断。该文档的通用 API 权限与计费不直接等于 SIWC 授权的权利。来源：https://developers.openai.com/api/docs/guides/fast-mode 。

SIWC 开源令牌推理页要求公开 Responses、store=false 和 stream=true，并使用当前账号可用模型。所核对的该页及限制页未明确承诺 Fast 档位权限；未列为禁止字段也不构成权限保证。来源：https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference 、https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations 。

## 项目状态与结论

当前 Rust 请求类型和宿主适配未包含 service_tier，也没有速度开关。Fast 尚未接入；若纳入需求，应先用明确的合成请求核对实际完成及返回档位，再确定模型与账号支持边界，不以降低推理强度模拟 Fast。此次询问不是新增功能的实施授权。

附带静态观察：当前可选 maxTokens、temperature 会映射为 max_output_tokens、temperature，而同日 SIWC 限制页将这两个字段列为不支持。仅字段存在时才会发送；本次没有触发对应请求，不能将该潜在兼容问题写成已复现故障。这是需要后续核对的协议差异。
