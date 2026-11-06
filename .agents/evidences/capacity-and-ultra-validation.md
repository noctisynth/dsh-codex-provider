# 上下文容量与 Ultra 请求验证

编号：EVIDENCE-016。日期：2026-11-06。适用：DSH 0.2.2-rc.1、当前 SIWC 官方公开目录与 Responses。

## 用户反馈与范围

用户报告已有会话切换模型时出现 MODEL_SWITCH_COMPACTION_FAILED，错误明确要求 adapter model 声明 contextWindow。另在已有会话及新会话中选择 Ultra 出现 HTTP 400，改为 High 后输出正常。档位文案已显示正确，但不能据此前短暂反馈把全部档位的对话标记为通过。

用户随后澄清，选择 ChatGPT 后侧边栏展示正常；缺失的是点击账号后的弹出菜单。该项由 EVIDENCE-015 维护，不再按注册失败调查。

## 上下文容量观察

只读使用有效的当前 DSH 授权查询官方模型目录，未刷新凭据、未发送用户对话。目录 HTTP 200：gpt-6.1-sol 的 context_window 为 500000，gpt-6-astra 为 272000；两者 max_context_window 为 872000，auto_compact_token_limit 为空。当前原生解析没有保留这些容量字段。

DSH LlmResolvedModelInfo 通过 context.contextWindow 提供请求与响应总容量。目标 compaction-basic 在比较压缩阈值前先检查该元数据，缺失即可触发截图错误；不能由这条错误推断会话实际已超过模型容量。DSH 自行计算阈值、输出预算与余量。

官方 Codex 模型类型将 max_context_window 定义为配置覆盖的上限；当前插件没有扩窗配置，因此采用目录的 context_window，不以通用 API 模型页的 1.05M 或最大扩展窗口替代。来源：https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference 、https://github.com/openai/codex/blob/main/codex-rs/protocol/src/openai_models.rs 。目录数值仅代表本次观察，产品不硬编码型号容量。

## Ultra 请求观察

同日使用同一有效授权与合成短输入分别请求 gpt-6-astra。目录原始 supported_reasoning_levels 包含 ultra，其说明涉及自动任务委派；实际 reasoning.effort=ultra 返回 HTTP 400，error.type 为 invalid_request_error、code 为 invalid_value、param 为 reasoning.effort，支持值只到 max。high 对照请求返回 HTTP 200、response.completed，并确认实际 effort 为 high。该实验排除了用户会话长度与工具历史作为这次 Ultra 失败的原因。

官方 GPT-6 Astra 与 GPT-6.1 Sol 模型页也列出 low、medium、high、xhigh、max，不包含普通 ultra 参数。目录展示项与公开请求契约存在区别，不能直接透传或悄悄将 Ultra 降为 Max。已按用户原有要求询问移除不兼容选项还是继续调研完整 Ultra 能力；尚未确定方案。来源：https://developers.openai.com/api/docs/models/gpt-6-astra 、https://developers.openai.com/api/docs/models/gpt-6.1-sol 。

## 官方客户端语义

同日核对官方 Codex 主分支源码，resolve_reasoning_effort 将 Ultra 转换为目录指定的 multi_agent_reasoning_effort，或 Max／最高非 Ultra 档位；effective_multi_agent_mode 同时启用 Proactive 委派模式。官方集成测试验证非 Ultra 请求值与主动委派提示同时出现。因此本插件直接透传 Ultra 属于实现缺口，仅映射为 Max 并不等于完整 Ultra 支持。来源：https://github.com/openai/codex/blob/main/codex-rs/protocol/src/openai_models/reasoning_effort.rs 、https://github.com/openai/codex/blob/main/codex-rs/core/src/session/multi_agents.rs 、https://github.com/openai/codex/blob/main/codex-rs/core/tests/suite/multi_agent_mode.rs 。

公开 Responses Multi-agent beta 是另一项需独立接入的接口能力，要求 beta header、multi_agent.enabled，以及 Agent 归属的输出和工具结果处理；文档明确不支持 reasoning.summary。当前解析器和请求不满足该契约，不能据“类似 Codex Ultra”的说明直接认定两者等价。来源：https://developers.openai.com/api/docs/guides/responses-multi-agent 。

## 容量与错误说明修复验证

Rust 目录解析、napi 绑定和 DSH 适配已传递可选当前容量。扩展现有目录用例，验证当前值未被最大扩展值覆盖、缺失保持未知，实际 LlmRuntime 的精确解析收到嵌套容量。HTTP 错误只展示标准 error.message 与状态码；合成参数错误和非标准响应体用例通过，不显示额外响应字段。

格式、Clippy、Rust 单元测试及原生 release 构建通过；Clippy 所见警告仅为既有文件系统不支持增量缓存硬链接而退回复制。napi-rs 生成的声明包含可选 contextWindow，真实生成加载器及原生取消测试通过。真实 DSH 会话切模与压缩仍待更新安装后验收；Ultra 未按未确认的方案修改。
