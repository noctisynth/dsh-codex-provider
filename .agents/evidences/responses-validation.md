# Responses 流传输验证

编号：EVIDENCE-006。日期：2026-11-06。适用：开发中的原生 Responses 传输。来源：EVIDENCE-002 的官方推理与 napi-rs 流文档。

请求固定使用公开 Responses，Rust 设置 store=false、stream=true。eventsource-stream 解析 SSE，async-stream 0.3.6 按需生成，避免自写 Stream 状态机或增加后台队列；futures-util 衔接流，napi-rs 转换为 Web ReadableStream。

async-stream 维护方依据：https://docs.rs/async-stream/0.3.6/async_stream/

只有 response.completed 代表成功；failed、incomplete、显式 error 及断流分别报告。不重连或重放推理。请求前检查订阅 scope；显式取消覆盖建连和等待读取。

## 已运行验证

Rust 共十项测试通过，新增请求字段约束、完成与 EOF 区分、失败与不完整区分、等待期间的取消。格式、严格 Clippy 和官方 CLI 构建通过。

Node 实际获得原生 ReadableStream，取消经 reader.read 拒绝传播；缺少订阅权限时在创建流前拒绝。使用内存合成凭据，没有真实推理请求。

## 限制

尚未验证真实账号的对象事件交付、持续背压及宿主消费提前结束。当前输出为协议事件，DSH 消息、工具及流块转换仍待实现。

JS 必须先取消原生操作，再取消可能等待中的 reader；单独 Web Stream cancel 不证明能中断绑定内部等待。后续需验证宿主退出路径。

目标 DSH 的 LlmAdapter 要求 Provider HTTP 请求携带 attributionHeaders，需在宿主适配时接入。当前原生传输不是完整 DSH Provider。

宿主依据：https://registry.npmjs.org/@deepseek-ai/dsh-llm/0.2.1-rc.2
