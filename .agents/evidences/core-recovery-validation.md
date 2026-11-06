# 压缩请求、错误分类与失效登录恢复验证

编号：EVIDENCE-019。日期：2026-11-07。范围：Windows x64 原生 release、DSH 0.2.2-rc.1、napi-rs 3；缺口基线为 EVIDENCE-018。

## 官方依据

- SIWC 公开限制要求省略 max_output_tokens 与 temperature，使用 store=false、stream=true。来源：https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations 。
- 官方错误契约允许标准 error 字段及顶层 detail；终止刷新错误应清理不可用令牌并保留注册身份，暂时失败不能据此清理。来源：https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery 。
- 目标 DSH LlmRuntime、compaction-basic 和 LocalCredentialProvider 使用实际发布实现；错误分类与压缩恢复是宿主契约，不从 OpenAI 文档推断。公开宿主元数据：https://registry.npmjs.org/@deepseek-ai/dsh-llm/0.2.2-rc.1 、https://registry.npmjs.org/@deepseek-ai/dsh-credentials-local/0.2.2-rc.1 。

## 压缩请求

Rust 序列化验证使用宿主摘要参数 maxTokens=65536、temperature=0.2，确认公开请求省略两个不支持字段，仍有 instructions、input、reasoning、store=false 与 stream=true。

隔离集成使用真实 Cordis、LlmRuntime、Session 及 BasicCompactionEngine，仅提供合成凭据、原生输出与确定性 token 估算。直接调用 compactRegion 后，摘要替换一个原节点，replaceGeneration 为 1，提交 compaction/start、compaction/summary、user/message、compaction/end 四个事件。宿主摘要预算仍为 65536，传入原生的 JSON 不含 maxTokens 或 temperature。

真实公开请求使用同一宿主压缩入口、合成对话材料、当前有效授权和重新构建的原生模块，目标 gpt-6-astra。公开 Responses 成功生成非空摘要，真实 Session 完成节点替换并提交上述四个事件。未读取私人会话、未刷新或写入实际凭据，未保存账号、令牌或摘要正文。这证明所测组合的摘要请求成立，不推断所有模型及所有上下文长度。

## 错误分类与恢复

Rust 测试确认 HTTP 标准错误保留 status、code、param 与 requestId；公开 detail 可展示但不会凭文案生成机器码；非标准响应不输出原始正文。SSE response.failed 及 error 同样保留机器字段。

通过实际 ChatGptAdapter 和 LlmRuntime 注入七种合成失败，确认上下文、额度、认证、限流、服务端、未知参数和传输错误得到宿主分类，并保留公开说明、状态与请求标识。另以真实原生模块产生缺少订阅 scope 的失败，验证 napi 对象流到宿主的 AUTH 分类，全程不发网络请求。

上下文超限集成先通过 LlmRuntime 得到 CONTEXT_WINDOW_EXCEEDED，再调用真实 agent/request-error 中间件。BasicCompactionEngine 完成摘要替换并返回 retry，未进入后续 fallback。按该恢复结果从 Session 派生压缩后的消息再请求，确认使用摘要而非被替换的长内容，完成原因是 stop。这里运行了实际恢复中间件和后续请求，没有运行完整桌面 AgentLoop，也未故意制造真实账号超限。

## 失效登录恢复

使用真实 openidconnect 令牌交换逻辑和合成 HTTP 响应，验证 invalid_grant、invalid_refresh_token、token_expired、refresh_token_expired、refresh_token_invalidated、refresh_token_reused 六类终止 4xx 清空令牌、nonce、scope 及到期时间，保留注册与已验证身份。503 即使携带 invalid_grant 也不返回清理结果；invalid_client、暂时失败、损坏响应和网络错误均保留现有记录。正常轮换仍更新令牌并保留身份。

真实 LocalCredentialProvider 在隔离临时存储中执行 Accounts.selected 事务，以合成终止刷新结果验证：磁盘先保存清理后的记录，随后才抛 INVALID_CREDENTIAL；摘要变为未登录，下一次请求为 AUTH 且不重复刷新；其他账号不变，重新授权继续使用原注册。暂时错误和模拟提交前失败均保持已保存记录不变。测试未更改真实账号状态；新建开发依赖仅用于该宿主事务验证。

## 构建与验证边界

Rust fmt、Clippy、24 项 Rust 测试、17 项 Node 测试及两套 tsrs 类型检查通过。官方 napi-rs CLI 生成 release 原生模块与绑定；Tailwind/tsdown 构建通过。现有 exFAT 增量缓存复制提示、客户端依赖内联提示和 use client 指令告警仍存在，不是本次新增构建失败。

本次不安装或发布更新，不替代桌面更新验收。真实刷新轮换、远端撤销、持续背压及卸载取消的既有验证待办仍保留；没有用本次合成错误覆盖声明它们已完成。
