# Rust 原生插件技术方案

编号：SPEC-001。依据：RFC-001。状态：依赖及实现路线已选定，宿主接口待验证。更新：2026-11-06。事实：FACT-002；证据：EVIDENCE-002。

## 组件职责

Rust 核心承载官方认证与模型请求。JS 负责 DSH 插件注册、宿主交互及原生绑定调用。通过 napi-rs 直接集成；此前子进程标准输入输出方案不再采用。

Rust 按认证、请求及流式事件、绑定边界划分模块；按实际职责逐步形成代码，不预先生成空模块或通用 Provider 框架。绑定层只做必要类型映射和错误传递，业务逻辑归属 Rust。工具执行由宿主负责，插件负责协议转换。

使用一个 Rust library crate，按 auth、session、transport、responses、binding 的业务职责形成模块。分别处理授权回调、会话刷新协调、HTTP、请求与事件语义、绑定转换。不预建空模块，不拆分额外 crate。JS 使用宿主类型，不依赖 Pi 作为认证和推理中间层。

由 DSH 凭据服务负责唯一持久存储，Rust 管理认证和刷新，JS 只在宿主后端传递记录，不把 token 返回浏览器 UI。JS 在 modifyRecord 异步事务内调用 Rust 刷新并返回轮换结果，使用官方本地 provider 的跨进程排他与原子写入，不另建存储回退。目标安装版本仍需核对，不能将该保证推广到任意 provider。

## 官方协议与依赖

采用官方开源应用授权和公开请求路径。授权注册、身份验证、令牌更新等具体契约以实施时官方文档为准；依据记录在 FACT-001 与 EVIDENCE-001，不在此复制调研材料。

| 能力 | 选型 | 使用边界 |
|---|---|---|
| 原生绑定与构建 | napi 3、napi-derive 3、napi-build 2、官方 CLI 3 | 官方模板、加载器、类型及平台产物 |
| 异步 | Tokio 1 | 复用 napi-rs runtime，按需启用功能 |
| OAuth/OIDC | openidconnect 4.1 | 复用 OAuth 重导出、PKCE、身份校验；不重复加入 oauth2 或 JWT 库 |
| HTTP/TLS | reqwest 0.12，rustls-tls、json、stream | 与 OIDC 共享客户端版本，不使用 blocking |
| loopback 回调 | axum 0.8 | 登录时临时监听，不建立常驻管理服务 |
| SSE | eventsource-stream 0.2、futures-util 0.3 | 负责分帧，业务模块解释 Responses 事件 |
| 取消 | tokio-util 0.7 CancellationToken | 登录、请求和卸载生命周期 |
| 数据与错误 | serde 1、serde_json 1、thiserror 2 | 明确边界类型，不建 Schema 框架 |
| host ID | uuid 1，v4 | 持久化官方支持的 UUID host 标识 |

上述为版本线选择；已使用的依赖通过锁文件固定，其余在实现对应职责时引入，仅启用所需 feature。优先库的随机值、PKCE 和身份校验；不手写密码学。暂不引入 OpenAI 社区 SDK，使用 reqwest 和所需协议类型覆盖订阅目录及 Responses，避免额外兼容层。

## 授权与请求流程

先持久化 host ID，绑定 127.0.0.1 临时端口及固定回调路由，再使用宿主能力打开系统浏览器。每次授权由库生成 state、nonce 和 S256 PKCE，业务层补充 ChatGPT 参数。动态注册回调后使用颁发 client ID 创建 public client、换取令牌及校验 audience。

校验回调 state、OAuth 错误、注册 ID，以及 ID token 的签名、issuer、audience、expiry、nonce。重授权核实原身份后才替换记录，使用 token 响应 scopes 判断订阅权限。保存验证后的身份、邮箱、ID token、access/refresh token、注册信息与到期时间，不解析 access token 猜测身份。

刷新按会话串行，使用原注册 client ID，持久化轮换结果后再继续请求。响应缺少新账号资料时保留已验证资料；新的身份资料需验证。退出按官方会话撤销及本地清除处理，准确报告未确认的远端撤销。账号数量仍是产品待决定项，不能从存储结构推导新增账号管理功能。

复用 reqwest 客户端，授权请求禁用自动重定向，按官方元数据发现 JWKS。模型来自公开目录；请求使用公开 Responses、store=false、stream=true，不硬编码型号或静默回退。SSE 处理文本、工具参数增量及终止状态，完成以 response.completed 判断；错误、不完整和断流分别处理。不自动重连重放推理。

优先使用 reqwest 环境代理能力；系统代理与自定义证书需求待确定，不预设已支持或自行读取系统设置。

## 异步绑定与资源生命周期

普通操作导出 async Promise；推理通过 napi-rs web_stream 返回对象事件 ReadableStream，必要时用 AsyncBlock 完成 JS 线程映射，JS 转换成 DSH 所需迭代事件。优先直接消费 Rust Stream，确需队列时使用有界队列。

请求对象持有 CancellationToken 并暴露显式取消。JS 将 DSH AbortSignal、消费提前结束及插件卸载传递到 Rust，释放 HTTP 响应和登录监听。不能假定 stream.cancel 自动停止所有后台任务，需要实际验证。

异步导出采用共享引用与必要内部同步，避免可变 self 所要求的 unsafe；使用安全绑定 API，错误经 Result 传播，日志不得携带凭据或 ID token hint。

## 构建与发布

采用 napi-rs 官方 CLI、模板、原生加载器和类型生成能力，按确定的平台选择构建目标。只对 DSH 插件要求做必要适配，不自行重写这些工具已提供的能力。

Semifold 管理 changeset、根 npm 版本、release PR 和发布编排。一个公开 npm 插件发布单元；Rust crate 不发布至 crates.io，Cargo 内部版本不承担用户可见版本。平台包由 napi-rs 从根 npm 版本派生，不独立计算升级。

受控发布步骤先收集并检查所声明平台产物，再调用 napi pre-publish 发布平台包并关闭其 GitHub Release 功能，最后发布根包。GitHub Release 由 Semifold 负责，不再配置第二条平台发布流程。实施时验证 npm lifecycle 与重跑行为，避免重复发布。构建工具版本、Node-API 等级和平台矩阵由目标 DSH 运行时确定。

纯 Agent 上下文修改不创建 changeset。产品成果附 changeset 和本地提交；开发期间不执行公开发布。配置实施及实际发布验证由 TODO-001 跟踪。

## 验证尺度

围绕已实现行为选择必要检查：授权与身份校验、刷新一致性、流式事件、工具调用、取消、宿主加载和发布产物安装。优先关键行为和集成证据，不为实现细节镜像编写测试，不额外构建审查体系。

未决事项为产品范围、DSH 官方 adapter 与凭据服务契约、支持宿主及平台、依赖实际解析与编译。当前技术选型不等于实现或生产验证。
