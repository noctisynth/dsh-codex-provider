# 原生绑定与认证依赖调研

编号：EVIDENCE-002。日期：2026-11-06。方法：维护方文档、依赖清单及发布产物静态检查。未运行构建、真实登录或宿主集成。

## 原生接口

来源：https://napi.rs/docs/concepts/async-fn

v3 的 async 或 tokio_rt 提供 Tokio runtime，导出异步函数转换为 Promise。异步可变 self 涉及 unsafe 限制，设计采用共享引用及必要内部同步。

来源：https://napi.rs/docs/concepts/streams

web_stream 支持 Rust Stream 转 Web ReadableStream，对象事件及 AsyncBlock 可用于 JS 线程值转换。宿主需要 Web Streams globals；不据此宣称本项目取消与资源释放已经可靠。

来源：https://napi.rs/docs/introduction/getting-started

维护中的 v3 模板包含加载器、类型及平台包流程。文档要求 Rust 1.88 起；构建 CLI 的 Node 要求不等同于产物运行时要求。

## OAuth 与 HTTP

来源：https://docs.rs/openidconnect/4.1.0/openidconnect/

来源：https://docs.rs/openidconnect/4.1.0/openidconnect/struct.IdTokenVerifier.html

openidconnect 支持 PKCE、发现、JWKS、身份验证及异步 HTTP。public-client verifier 可使用回调颁发的 client ID。单独 oauth2 不包含完整 OIDC 校验，因此不选择 oauth2 加自写 JWT 验证路线。

来源：https://raw.githubusercontent.com/ramosbugs/openidconnect-rs/main/Cargo.toml

来源：https://raw.githubusercontent.com/ramosbugs/oauth2-rs/5.0.0/Cargo.toml

观察 openidconnect 4.1.0 依赖 oauth2 5.0.0，后者集成 reqwest 0.12。为复用客户端选择 0.12，而非另引入 0.13。主分支可变，实际兼容性需锁文件和编译确认。

来源：https://docs.rs/reqwest/latest/reqwest/

reqwest 提供异步 HTTP、表单、JSON、TLS 和代理；复用客户端，认证禁止自动重定向。系统代理与自定义证书支持仍需明确需求和验证。

## 官方协议

来源：https://developers.openai.com/siwc/token-sharing-open-source/sign-in

官方要求动态注册、稳定 host ID、state/nonce/PKCE、loopback 回调、保存颁发 client ID 和验证身份。标准库不能自动完成 ChatGPT 动态注册回调及参数适配。

来源：https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions

刷新使用同一注册的 client ID 与 resource，保存轮换结果并串行执行；退出包含会话撤销，保留注册映射。文档指向官方 Usage 页面，不证明旧额度后端适用于新授权。

来源：https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference

模型目录包含 models 数组、slug、display_name、visibility。推理使用公开 Responses，store=false、stream=true；需读取终止事件，断流不代表完成。

## 回调、SSE 与取消

来源：https://docs.rs/axum/0.8.9/axum/

axum 与 Tokio/Hyper 集成并提供 Query extractor，可用于临时 loopback 回调，避免手写 HTTP 解析。

来源：https://docs.rs/eventsource-stream/0.2.3/eventsource_stream/

该库从字节 Stream 解析 SSE，可衔接 reqwest bytes_stream。仅负责分帧，Responses 语义仍需业务处理。

来源：https://docs.rs/tokio-util/0.7.20/tokio_util/sync/struct.CancellationToken.html

CancellationToken 提供协作取消。终止任务和释放响应仍需项目实现与验证。

## 发布与宿主

来源：https://napi.rs/docs/cli/version

来源：https://napi.rs/docs/cli/pre-publish

根 npm 版本可同步到平台包。pre-publish 默认发布平台包，不发布根包；可关闭 GitHub Release；缺失产物可能只告警，不能当成纯打包命令。

来源：https://semifold.noctisynth.org/docs/workspace/nodejs/

来源：https://semifold.noctisynth.org/docs/configuration/reference/

本次读取维护方文档副本，确认 Node resolver 及发布步骤能力；官网抓取失败，实际配置需工程建立后验证。选用一个公开 npm 发布单元，平台包由 napi-rs 派生。

来源：https://github.com/WSL043/dsh-codex-subscription/tree/main/src

静态检查此前下载的 3.2.6 产物，观察到 registerAdapter 和凭据 readRecord/modifyRecord 调用。第三方样例不是宿主兼容保证；DSH 官方类型、生命周期及跨进程语义尚待核实。未读取真实凭据。
