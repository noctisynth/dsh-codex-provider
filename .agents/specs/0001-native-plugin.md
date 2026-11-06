# Rust 原生插件技术方案

编号：SPEC-001。依据：RFC-001。状态：宿主适配已实现，桌面真实授权待验证。更新：2026-11-06。事实：FACT-002；证据：EVIDENCE-002、EVIDENCE-007。

## 组件职责

宿主适配复用 DSH 的授权会话、凭据事务、内容投影及 LlmAdapter。Rust 将宿主消息转换为 Responses 输入，并将文本、推理摘要、工具参数及完成事件转换为 DSH 流块。stateless 请求保留加密推理重放资料。插件使用单个账号注册集合保存稳定 host ID、活动注册及各注册的后端记录。

授权流提供已有注册选择和添加账号，通过 open 社区库打开系统浏览器；授权 URL 不作为通知发送到前端。刷新在凭据事务中完成并提交后才调用模型。注册集合按 issued client ID 区分，登录完成时合并事务内最新集合。设置界面提供账号切换及退出；退出先取消当前插件请求，事务内调用原生撤销并保存已清除令牌的注册，分别展示已确认撤销与仅本地清除的结果。

浏览器侧按 DSH 的 dsh.client 声明和模块加载契约提供设置分区，以及插件详情配置面；复用正常模型选择器，不替换模型选择组件。界面通过宿主受信 connection 的 RPC 请求登录、账号切换、退出和安全状态，使用宿主 schema 校验 RPC 信封；后端只返回账号摘要及授权交互，不返回凭据或授权 URL。取消与卸载关闭等待中的授权交互。

适配器复用当前账号的目录结果及同一次在途请求，避免宿主模型校验与默认设置变化重复访问远端目录。本插件的凭据记录更新时失效；失败请求不缓存，不增加 TTL 配置或浏览器目录实现。

Rust 保留目录中的 supported_reasoning_levels 和 default_reasoning_level，通过 napi-rs 传给宿主。适配器在精确模型解析中提供 DSH 的 reasoning 元数据，档位值视为不透明字符串并保留服务端顺序；缺少可选档位时不猜测能力。使用同一个目录缓存，取消精确解析不取消其他调用共享的目录请求。请求继续映射宿主 reasoningEffort 到 Responses 的 reasoning.effort。

手写宿主适配和浏览器代码使用 TypeScript。tsdown 基于 Rolldown/Oxc 构建宿主 ESM 与浏览器标准 closure factory，React 由宿主提供；Oxc 的 tsrs 通过 tsconfig 检查类型。此适配仅声明宿主要求的模块入口，不实现新的浏览器模块加载器。原生构建继续完全由 napi-rs 管理。tsrs 为实验性工具，实际兼容结果由证据记录，遇到阻碍时说明，不静默替换编译器。

界面重设计采用 React 与 TypeScript，保持宿主 React 运行时共享。按实际使用引入 shadcn/ui 组件，采用 Tailwind utilities；关闭插件侧 Preflight，避免重置宿主元素，使用插件专属前缀隔离工具类。颜色和字体优先映射 DSH 主题，不引入独立主题开关。仅保留 Tailwind 构建指令、必要主题映射及宿主样式装载所需的最小 CSS。组件版本与 React 18 的兼容性、Tailwind 产物的加载和样式边界须在实现时验证。

账号交互状态由独立 React hook 维护，视图复用 Button、Skeleton，以分隔线账号列表组织内容。Tailwind 4 官方 CLI 生成带 cp 前缀的样式，tsdown 官方 CSS inline 导入将其收进浏览器工厂；Cordis effect 装载样式并在卸载时移除。UI 依赖只参与构建并内联，React 与 JSX runtime 由宿主提供。主题颜色直接引用 DSH 变量，保留 Tailwind 自动生成的命名空间主题变量与运行时属性声明，不引入手写全局重置。依据及验证边界见 EVIDENCE-011、EVIDENCE-012。

拟采用紧凑的连接状态、账号行和主操作层级，替换目前的原生按钮和内联样式；主设置页与插件配置面共用组件。加载、浏览器授权等待、账号选择和错误状态沿用现有后端契约。

本地桌面验证使用文本模型能力声明。宿主负责图片占位和文件投影，工具使用非严格函数 schema，工具参数保持原始字符串。完成事件按宿主内容块关联完整 Responses output 项；后续调用重放保留项，避免重复发送推理摘要。公开目录未提供的模型能力不自行推断。

流中的完整输出以带 output_index 的 output_item.done 收集；完成通知可以不重复输出数组，不能因此清空历史。完成通知若携带完整输出则使用该数组，否则按输出索引恢复已完成项，再映射到宿主重放资料。

已产生的空重放快照不能覆盖会话内已有文本和工具调用；缺少任何协议输出项时按宿主保留内容构建输入，不创建虚假的加密推理资料。

本地安装包必须包含 Cordis 入口与补丁、官方生成的原生加载器和 Windows 原生产物。先完成独立加载验证，再通过桌面安装附带的 DSH CLI 更换插件；不直接编辑活动宿主的插件依赖文件。旧凭据不直接改造成新协议授权证据。

当前桌面实测目标为 DSH 0.2.2-rc.1，宿主依赖声明与该版本一致，Cordis 使用 4.1 版本线；使用安装器的兼容性检查，不启用版本豁免。

Rust 核心承载官方认证与模型请求。JS 负责 DSH 插件注册、宿主交互及原生绑定调用。通过 napi-rs 直接集成；此前子进程标准输入输出方案不再采用。

Rust 按认证、请求及流式事件、绑定边界划分模块；按实际职责逐步形成代码，不预先生成空模块或通用 Provider 框架。绑定层只做必要类型映射和错误传递，业务逻辑归属 Rust。工具执行由宿主负责，插件负责协议转换。

使用一个 Rust library crate，按 auth、session、transport、responses、binding 的业务职责形成模块。分别处理授权回调、会话刷新协调、HTTP、请求与事件语义、绑定转换。不预建空模块，不拆分额外 crate。JS 使用宿主类型，不依赖 Pi 作为认证和推理中间层。

由 DSH 凭据服务负责唯一持久存储，Rust 管理认证和刷新，JS 只在宿主后端传递记录，不把 token 返回浏览器 UI。JS 在 modifyRecord 异步事务内调用 Rust 刷新并返回轮换结果，使用官方本地 provider 的跨进程排他与原子写入，不另建存储回退。目标安装版本仍需核对，不能将该保证推广到任意 provider。

## 官方协议与依赖

DSH 适配提供宿主 attributionHeaders，由共享 HTTP 客户端发送；账号和认证资料不进入这些公开应用身份 header。消息及工具转换以目标宿主类型为依据，完成实际集成前不标记 Provider 交付。

采用官方开源应用授权和公开请求路径。授权注册、身份验证、令牌更新等具体契约以实施时官方文档为准；依据记录在 FACT-001 与 EVIDENCE-001，不在此复制调研材料。

| 能力 | 选型 | 使用边界 |
|---|---|---|
| 原生绑定与构建 | napi 3、napi-derive 3、napi-build 2、官方 CLI 3 | 官方模板、加载器、类型及平台产物 |
| 异步 | Tokio 1 | 复用 napi-rs runtime，按需启用功能 |
| OAuth/OIDC | openidconnect 4.1 | 复用 OAuth 重导出、PKCE、身份校验；不重复加入 oauth2 或 JWT 库 |
| HTTP/TLS | reqwest 0.12，rustls-tls、json、stream | 与 OIDC 共享客户端版本，不使用 blocking |
| loopback 回调 | axum 0.8 | 登录时临时监听，不建立常驻管理服务 |
| SSE | eventsource-stream 0.2、futures-util 0.3 | 负责分帧，业务模块解释 Responses 事件 |
| 流生成 | async-stream 0.3 | 按需生成事件，避免手写状态机及额外后台队列 |
| 取消 | tokio-util 0.7 CancellationToken | 登录、请求和卸载生命周期 |
| 数据与错误 | serde 1、serde_json 1、thiserror 2 | 明确边界类型，不建 Schema 框架 |
| host ID | uuid 1，v4 | 持久化官方支持的 UUID host 标识 |
| 系统浏览器 | open 10 | JS 后端打开授权 URL，不实现平台命令分支 |

上述为版本线选择；已使用的依赖通过锁文件固定，其余在实现对应职责时引入，仅启用所需 feature。优先库的随机值、PKCE 和身份校验；不手写密码学。暂不引入 OpenAI 社区 SDK，使用 reqwest 和所需协议类型覆盖订阅目录及 Responses，避免额外兼容层。

## 授权与请求流程

先持久化 host ID，绑定 127.0.0.1 临时端口及固定回调路由，再使用宿主能力打开系统浏览器。每次授权由库生成 state、nonce 和 S256 PKCE，业务层补充 ChatGPT 参数。动态注册回调后使用颁发 client ID 创建 public client、换取令牌及校验 audience。

校验回调 state、OAuth 错误、注册 ID，以及 ID token 的签名、issuer、audience、expiry、nonce。重授权核实原身份后才替换记录，使用 token 响应 scopes 判断订阅权限。保存验证后的身份、邮箱、ID token、access/refresh token、注册信息与到期时间，不解析 access token 猜测身份。

刷新按会话串行，使用原注册 client ID，持久化轮换结果后再继续请求。响应缺少新账号资料时保留已验证资料；新的身份资料需验证。退出按官方会话撤销及本地清除处理，准确报告未确认的远端撤销。注册按 issued client ID 与验证身份隔离；账号选择和添加遵守官方契约，具体宿主交互仍需确定，不从存储结构推导附加功能。

原生刷新在到期前 60 秒内执行；未到期的记录直接返回。完整刷新与退出限时 25 秒，以配合目标凭据 provider 的锁等待。撤销仅针对网络失败与 5xx 做有限退避，不形成通用重试层。invalid_grant 保留本次 issued client ID，显式重试重新生成授权随机值；不自动重放失效 code。

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

登录选择按 option ID 关联账号摘要，显示“重新登录”加姓名或邮箱；添加选项显示“添加新账号”。保留其他授权提示的原始含义。登录操作区使用单层圆角细边框、弱主题背景及内边距，与已有账号和容器外的模型说明区分；内部选项继续使用 ghost Button。通过 Tailwind 明确覆盖含图标按钮的右侧内边距为 20 像素，箭头右移 4 像素后仍有 16 像素留白。动画仅使用 group-hover、transition-transform 和 motion-reduce utilities；加载指示仅用于没有待选项的授权等待。

取消登录复用小尺寸 outline Button，置于登录区域底部的独立操作行，靠右排列并以细分隔线和留白与选项区分。两种授权状态共用该操作行，继续调用既有取消逻辑。

从经过现有 OIDC 验证的 ID token 读取可选 name、picture，与 email 一起保存并投影为账号摘要。刷新返回这些字段时更新，未返回则保留已有资料；旧会话缺字段可正常读取，通过后续登录或携带 ID token 的刷新补齐。前端不解析令牌，套餐位置使用邮箱。

账号摘要在宿主 TypeScript 侧用 Node 内置 crypto 对去首尾空白、转小写的邮箱计算 SHA-256，生成可选 Gravatar 图片地址；不把派生地址写入凭据，不增加依赖或配置。图片使用 HTTPS，Gravatar 固定请求 96 像素、G 评级、无匹配图片时返回 404。React 组件依次尝试官方 picture、Gravatar，加载失败后显示姓名首字、邮箱首字或问号文本；图片不携带 Referer 或 OpenAI 凭据，不增加重试或资料查询接口。依据见 EVIDENCE-014。

标题与设置导航复用一个 OpenAI 标志组件，保留官方 SVG 形状和比例；以当前文字颜色适配宿主深浅主题。导航通过 settings.section.icon 插槽按同一分区 ID 注册，并采用宿主传入的 size。SVG 随浏览器产物内联，不增加运行时远程图片请求。

账号设置在挂载、窗口重新获得焦点及页面恢复可见时重新读取状态，登录期间保持短轮询，操作完成后显式刷新。普通成功反馈短暂显示后清除，授权进度仅在登录进行时展示。账号行不展示注册 ID；当前账号标记以凭据存在为前提。退出确认使用浏览器原生模态 dialog 的焦点管理与 Escape 行为，内部操作采用 shadcn Button 和 Tailwind；避免为单个弹窗引入第二个 React DOM 运行时。

围绕已实现行为选择必要检查：授权与身份校验、刷新一致性、流式事件、工具调用、取消、宿主加载和发布产物安装。优先关键行为和集成证据，不为实现细节镜像编写测试，不额外构建审查体系。

未决事项为产品范围、DSH 官方 adapter 与凭据服务契约、支持宿主及平台、依赖实际解析与编译。当前技术选型不等于实现或生产验证。
