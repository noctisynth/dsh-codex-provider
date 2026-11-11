# Rust 原生插件技术方案

编号：SPEC-001。依据：RFC-001。状态：核心主链路及已确认异常恢复已有验证，发布验收尚未完成。更新：2026-11-12。事实：FACT-002；证据：EVIDENCE-002、EVIDENCE-007、EVIDENCE-019。

## 用户文档

README 是唯一用户文档，按随新版分发的常规项目说明编写，覆盖 Desktop 和 Web profile 的公开包名安装，以及登录与模型选择入口。只保留必要的登录能力和用量说明，不逐项解释界面控件或扩展功能目录，不带文档编号、开发状态或开发过程。以公开仓库 URL 引用配图和外部资源，不另生成 HTML 手册或 docs 文档目录。正文使用简洁短句，尽量少用分号。配图使用当前 React 组件、正式中文词典及构建样式渲染示例状态，不访问真实账号或模型，不模拟宿主截图。能力表前以简短提示推荐 SIWC，链接 OpenAI 官方接入文档，明确 OpenAI 对第三方应用使用 SIWC 的指引、过时方式可能受限、失效或被判定违规的风险及现有功能差异。不将未有官方公告支持的未来政策变更写成确定事实。分发清单包含必要图片，不改变实际版本及发布流程。

## 展示元数据

通过 DSH 正式 locale 资源声明 ChatGPT Rust 的中英文标题与描述，manifest 描述使用英文回退。导出 locale JSON 与原创 SVG logo，纳入分发白名单，保留现有运行时导出。使用宿主正式元数据读取器核对源码及解包产物，不加载插件或改变活动 profile。图像通过浏览器解码核对，不以文件扩展名代替可渲染验证。npm 包名、插件内部标识与设置页保持不变。

## 组件职责

原生性能诊断按 HTTP/SSE、JSON 与宿主事件映射、N-API 对象流、宿主消费及统计口径分层。使用隔离源码副本与合成会话、本地独立线程 SSE 源，保持实际解析、映射与绑定实现，分别测量 Rust 内消费、纯桥接和完整 JS 交付；固定速率与完成尾延迟分开验证。不为诊断新增产品接口、后台队列或用户配置；真实 TLS、代理、服务等级与完整宿主背压的结论须有对应实测。证据及限制由 EVIDENCE-045 维护。

社区云端压缩实现调研由 EVIDENCE-041 维护，预算与触发时序、重复压缩及模式互斥协调由 EVIDENCE-042 维护；候选接入需独立评估原生事件、持久重放和宿主预算，当前不更改既有 DSH 压缩职责或开放新能力。

宿主适配只透传正式 GenerateOptions.sessionId，由 Rust 将非空会话 ID 的 SHA-256 摘要编码为无填充 Base64URL，作为固定 43 字符的 prompt_cache_key；不依赖账号令牌、模型、档位、请求次数或进程随机量。缺少或空 ID 时省略字段，保留原有 SSE、store=false 和完整历史重放。该字段只作为请求元数据，不加入模型输入、配置或持久化重放副本；不改变档位更新检查点的内容校验。真实支持与验证边界由 EVIDENCE-040 维护。

Responses 用量转换将 input_tokens 拆为普通输入、cached_tokens 和 cache_write_tokens 三个互斥桶；缓存写入缺失时按零处理，输出中的 reasoning_tokens 不重复计入总量。向 DSH 上报独立 cacheWriteTokens，不改变服务端总输入、输出及总量的口径。

新增 configuration_update 布尔能力（TypeScript 为 configurationUpdate），仅过时登录为 true；当前仅用于推理档位更新，同时要求模型目录 supports_reasoning_effort_updates=true，且请求为普通对话。Rust 在成功输出的重放资料中保存请求前缀校验及档位更新位置，后续保持初始顶层 effort，并在新输入前插入 configuration_update；历史重放必须保留原位置。账号、模型、指令、工具或历史前缀变化时不复用检查点，重新以当前选择建立基线。辅助请求及 SIWC 不发送更新项；取消和失败不写入检查点，不增加预热调用、用户开关或上下文预算。具体协议依据与验证边界由 EVIDENCE-039 维护。

额度格式化与查询订阅分离：共享格式化函数处理套餐名称、窗口标签与按分钟更新的重置倒计时；同一 RPC 连接与账号共享查询结果、在途请求及刷新定时器。设置卡片与侧边栏复用数据，失去最后一个消费者时取消请求和定时器；后台页面不轮询，返回页面时刷新。刷新间隔沿用现有标量偏好、统一 Select 和正式配置保存，默认 5 分钟，支持关闭、1、5、15 分钟。SIWC 不订阅额度；侧边栏在原有次要文字行展示 Codex 窗口剩余比例，不增加行高或修改布局。额度卡片保留手动刷新、以服务端时间戳计算相对重置时间，Pro 各档只归一展示名称，原始接口数据不修改。

额度与图片生成分别由 Rust 业务模块承担请求和响应解析，复用现有认证头、错误分类及取消；两种 legacy 共用实现。额度通过独立账号 RPC 按需读取，不混入账号状态轮询，不修改活动账号；界面仅在有额度能力的登录账号下展示。图片生成使用正式 DSH 工具注册及 AttachmentStore 保存结果，按活动账号能力控制可用性；生成结果使用宿主图片展示，不发送 Base64 文本至对话。SIWC 的 quota、image_generation 保持 false，仅在实际请求与集成验证通过后开放 legacy 对应布尔值。

legacy 搜索使用现有 Codex Responses 路由，复用 SIWC 的 web_search、tool_choice 和来源参数、原生事件转换、引用重放及 DSH 搜索提供者。两种 legacy 共用 web_search=true，不另建传输、模型调用或专用搜索协议，不运行自动探测或额外重试。真实验证边界由 EVIDENCE-036 维护。

Rust 单独维护布尔 Capabilities，经现有账号摘要和 napi-rs 类型投影至 TypeScript，不写入凭据或配置。内置网页搜索及远端撤销使用同一协议能力定义；浏览器、设备码共用 legacy 值。SIWC 与 legacy 均开放已验证的 Responses 内置搜索；远端撤销仅 SIWC 开放，legacy 退出保持仅本地清除。额度、生图仅向 legacy 开放，连接器未开放。普通对话只在协议能力及用户开关同时允许时附带搜索；共享搜索源检查活动账号能力，显式搜索不可用时明确报错。界面从账号摘要消费能力，保留关闭选项及已有偏好，不增加新开关。模型与授权验证保持独立，不将能力布尔值解释为所有账号和模型均可用。

Codex legacy 目录的 client_version 固定传入当前最新正式版本 0.167.0，与 Cargo/npm 项目版本分离。按用户选择只替换该查询参数；继续使用现有动态目录、解析、缓存和路由，不新增版本检测、配置或兼容框架。两种 legacy 共用此路径，SIWC 不携带该参数。官方版本来源、目录对照及实际验证边界见 EVIDENCE-034；目录恢复不能替代新模型推理验收。

附件扩展先以合成资料验证 SIWC 真实行为，再接入 Rust 请求转换与现有 TypeScript 附件投影。图片精度沿用现有偏好保存、官方 locale 和统一 Select，默认自动；通过封闭类型传入原生，不新建通用请求参数透传。文件只从正式宿主附件引用读取，不解析文字句柄或任意本地路径；如果宿主强制丢失文件结构，先报告接口障碍，不修改宿主或引入历史反查补丁。云端压缩保持暂缓，SIWC 切档保持现有顶层档位流程；过时登录优化遵循 configuration_update 能力边界。

原生文件选定在现有 ChatGPT 插件内接管，当前仅作设计调研。派发优先评估在正式 llm/stream 中读取本次不可变 FileBlock，通过插件自有请求级异步上下文携带精确位置与引用，并继续 next。自有适配器在默认派发后仅将对应文件位置序列化为后端文件输入，字节经 AttachmentStore.readFileStream 读取；保留宿主已过滤的其他内容、重放、默认值、错误归一化和代际绑定。此为静态候选，流迭代作用域、消息对应关系、并发与重入隔离均未验证；不解析句柄或反查会话。全短路仍为比较方案，需自行承接末端派发职责。

文件预算尚有契约缺口：目标版本没有按模型的文件计价注册接口；发送前独立计数不能同步宿主节点计价、切模与压缩。现有 SIWC 的合成文件计数实测被授权边界拒绝，依据 EVIDENCE-033。后续预算方案须一致处理完整请求、路由节点价、usage 锚点、摘要缩小及稳定性校验、目标模型重估，不能只修正发送前总量。官方压缩 headroom 只能作为有明确开销上限时的保守候选，不擅自改宿主配置、虚报模型容量或注入估算文本。完整接入方式未确定前保持调研，不实施生产文件传输。设计边界见 EVIDENCE-030。

宿主适配复用 DSH 的授权会话、凭据事务、内容投影及 LlmAdapter。Rust 将宿主消息转换为 Responses 输入，并将文本、推理摘要、工具参数及完成事件转换为 DSH 流块。stateless 请求保留加密推理重放资料。插件使用单个账号注册集合保存稳定 host ID、活动注册及各注册的后端记录。

授权流提供已有注册选择和添加账号，通过 open 社区库打开系统浏览器；授权 URL 不作为通知发送到前端。刷新在凭据事务中完成并提交后才调用模型。注册集合按 issued client ID 区分，登录完成时合并事务内最新集合。设置界面提供账号切换及退出；退出先取消当前插件请求，事务内调用原生撤销并保存已清除令牌的注册，分别展示已确认撤销与仅本地清除的结果。

浏览器侧按 DSH 的 dsh.client 声明和模块加载契约提供设置分区，以及插件详情配置面；复用正常模型选择器，不替换模型选择组件。界面通过宿主受信 connection 的 RPC 请求登录、账号切换、退出和安全状态，使用宿主 schema 校验 RPC 信封；后端只返回账号摘要及授权交互，不返回凭据或授权 URL。取消与卸载关闭等待中的授权交互。

侧边栏展示偏好采用宿主 Config 的 volatile 字段 sidebarAccount，默认 DeepSeek，使用 configForms 订阅，经受信 RPC 交宿主 Settings 写入，不自行实现持久化。选中 ChatGPT 时以优先级 -1 注册 settings.launcher，切回或插件卸载时释放注册，恢复原组件。入口遵循宿主 wide 状态，复用账号头像，显示活动且有凭据的账号；无活动登录时显示 ChatGPT 登录提示。入口展开 shadcn/Base UI Menu 的最小菜单，设置项调用公开 openSettings，恢复项写入既有偏好，退出项复用既有确认弹窗和接口。不调用宿主内部导航或复制 DeepSeek 认证菜单。账号操作完成后通知同一浏览器中的入口刷新，恢复窗口焦点时也读取最新摘要。契约及限制见 EVIDENCE-015。

菜单 Portal 使用宿主同一 React DOM 运行时，构建保持 react-dom 外置；复用 DropdownMenu 的定位、键盘、关闭及焦点管理。触发器直接应用现有 Button 样式，避免 React 18 下普通函数 Button 无法接收触发器 ref。菜单关闭后打开退出确认时协调焦点，不新增第二套退出逻辑。

侧边栏展开入口采用宿主原有的 44 像素行高、6 像素内边距、8 像素图文间距和 24 像素头像，姓名 14 像素、次要信息 12 像素；折叠入口为 36 像素方形。复用宿主圆角和悬停色，不增加卡片容器。设置切换复用小尺寸 Button。

适配器复用当前账号的目录结果及同一次在途请求，避免宿主模型校验与默认设置变化重复访问远端目录。本插件的凭据记录更新时失效；失败请求不缓存，不增加 TTL 配置或浏览器目录实现。

Rust 解析目录中的 supported_reasoning_levels 和 default_reasoning_level，通过 napi-rs 传给宿主。过滤当前不支持的 Codex Ultra 组合模式，并省略指向 Ultra 的默认档位；保留其余服务端顺序和值，不自行补充 Max。适配器在精确模型解析中提供 DSH 的 reasoning 元数据，缺少可选档位时不猜测能力。使用同一个目录缓存，取消精确解析不取消其他调用共享的目录请求。请求继续映射宿主 reasoningEffort 到 Responses 的 reasoning.effort；已保存的 Ultra 选择交由宿主能力校验拒绝，用户重新选择支持档位，不自动替换。

Rust 与 napi-rs 保留可选 context_window，适配层映射为 DSH 的 context.contextWindow。该值表示请求与响应的总容量；不使用 max_context_window 扩大当前容量，不重复扣除宿主自身的输出预算与余量。缺少字段时不猜测。容量依据 EVIDENCE-016，错误诊断契约见下文。

宿主适配层为已支持 reasoning effort 提供可读 name，采用当前 Codex 简体中文显示文案；id、有效 defaultEffort、服务端顺序和 description 不变。未知档位保留原名称，不添加目录之外的选项，不替换宿主模型选择器。映射与实际宿主消费方式见 EVIDENCE-010；Ultra 排除依据 EVIDENCE-016。

Fast 使用公开 Responses 的 service_tier，与 reasoning.effort 分开。完成适用性验证后，拟沿用宿主 Config/configForms 保存默认关闭的布尔开关，每次请求读取 volatile 配置，影响后续请求而不打断当前流；无需新的凭据或持久化服务。请求值应采用账号目录声明的档位 ID，不能把界面 Fast 名称直接当作请求值。用户已授权继续调研，当前尚未实施开关；公开契约、目录与回显边界见 EVIDENCE-017。

原生请求与宿主转换不发送 SIWC 不支持的 max_output_tokens 和 temperature；DSH 继续负责压缩时机、摘要和预算，不新增压缩实现。

HTTP 错误仅保留状态、标准 error.message/code/param、公开顶层 detail 和请求标识；SSE 失败保留事件中的 message/code/param，不展示整份响应体。原生对象流以内部终止错误事件跨 napi 边界传递这些信息，TS 错误模块将其转换为 DSH LlmError，不将该内部事件交给宿主。按机器码及状态映射上下文、额度、认证、限流、服务端和传输失败，不解析展示文案猜测分类。SSE 错误转换将 EventStreamError::Transport 中的 reqwest 错误保留为现有 Network 类型，继续按 is_timeout 映射 timeout 或 transport；UTF-8 和 SSE 解析错误仍为 Protocol。不修改原生错误事件结构、TS 分类规则或重连行为。上下文恢复沿用 DSH 中间件，取消仍遵循既有 AbortSignal 与原生取消路径。

刷新使用 OAuth 库的错误码与实际 HTTP 状态区分终止授权失败。明确终止的 4xx 清除不可用令牌并保留注册身份，以既有 LoginResult 返回；宿主先提交凭据事务，再拒绝当前请求并提示重新登录。后续请求不再刷新已清空的令牌。未知、网络、5xx 和其他临时失败保留原记录；提交失败不报告清理成功。不增加返回协议、重试框架或凭据存储。原生及 DSH 集成验证见 EVIDENCE-019。

手写宿主适配和浏览器代码使用 TypeScript。tsdown 基于 Rolldown/Oxc 构建宿主 ESM 与浏览器标准 closure factory，React 由宿主提供；Oxc 的 tsrs 通过 tsconfig 检查类型。此适配仅声明宿主要求的模块入口，不实现新的浏览器模块加载器。原生构建继续完全由 napi-rs 管理。tsrs 为实验性工具，实际兼容结果由证据记录，遇到阻碍时说明，不静默替换编译器。

界面重设计采用 React 与 TypeScript，保持宿主 React 运行时共享。按实际使用引入 shadcn/ui 组件，采用 Tailwind utilities；关闭插件侧 Preflight，避免重置宿主元素，使用插件专属前缀隔离工具类。颜色和字体优先映射 DSH 主题，不引入独立主题开关。仅保留 Tailwind 构建指令、必要主题映射及宿主样式装载所需的最小 CSS。组件版本与 React 18 的兼容性、Tailwind 产物的加载和样式边界须在实现时验证。

账号交互状态由独立 React hook 维护，视图复用 Button、Skeleton，以分隔线账号列表组织内容。Tailwind 4 官方 CLI 生成带 cp 前缀的样式，tsdown 官方 CSS inline 导入将其收进浏览器工厂；Cordis effect 装载样式并在卸载时移除。UI 依赖只参与构建并内联，React 与 JSX runtime 由宿主提供。主题颜色直接引用 DSH 变量，保留 Tailwind 自动生成的命名空间主题变量与运行时属性声明，不引入手写全局重置。依据及验证边界见 EVIDENCE-011、EVIDENCE-012。

拟采用紧凑的连接状态、账号行和主操作层级，替换目前的原生按钮和内联样式；主设置页与插件配置面共用组件。加载、浏览器授权等待、账号选择和错误状态沿用现有后端契约。

模型目录的 input_modalities 映射为宿主支持的 text/image 能力；未声明图片的模型保持文字投影。TS 图片适配模块通过 DSH AttachmentStore.readImage 读取用户或工具消息中已验证的规范化图片，编码为 data URL；Rust 将用户图片转换为 Responses input_image，含图片的工具结果转换为同一 function_call_output.output 下按原顺序排列的 input_text/input_image 数组，保留 call_id 并沿用现有图片精度设置。纯文本工具结果保持既有换行拼接字符串，不将工具图片改写为用户消息。已经 offloaded 的图片使用宿主文字占位，不读取或重新发送图片。复用附件校验与取消，不自行读取本地路径、上传文件、变换图片或增加配置。工具使用非严格函数 schema，工具参数保持原始字符串。完成事件按宿主内容块关联完整 Responses output 项；后续调用重放保留项，避免重复发送推理摘要。

流中的完整输出以带 output_index 的 output_item.done 收集；完成通知可以不重复输出数组，不能因此清空历史。完成通知若携带完整输出则使用该数组，否则按输出索引恢复已完成项，再映射到宿主重放资料。

已产生的空重放快照不能覆盖会话内已有文本和工具调用；缺少任何协议输出项时按宿主保留内容构建输入，不创建虚假的加密推理资料。

本地安装包必须包含 Cordis 入口与补丁、官方生成的原生加载器和与目标 OS、CPU、ABI 匹配的原生产物。先完成独立加载验证，再通过桌面安装附带的 DSH CLI 更换插件；不直接编辑活动宿主的插件依赖文件。旧凭据不直接改造成新协议授权证据。

当前桌面实测目标为 DSH 0.2.2-rc.1，宿主依赖声明与该版本一致，Cordis 使用 4.1 版本线；使用安装器的兼容性检查，不启用版本豁免。

Rust 核心承载官方认证与模型请求。JS 负责 DSH 插件注册、宿主交互及原生绑定调用。通过 napi-rs 直接集成；此前子进程标准输入输出方案不再采用。

Rust 按认证、请求及流式事件、绑定边界划分模块；按实际职责逐步形成代码，不预先生成空模块或通用 Provider 框架。绑定层只做必要类型映射和错误传递，业务逻辑归属 Rust。工具执行由宿主负责，插件负责协议转换。

使用一个 Rust library crate，按 auth、session、transport、responses、binding 的业务职责形成模块。分别处理授权回调、会话刷新协调、HTTP、请求与事件语义、绑定转换。不预建空模块，不拆分额外 crate。JS 使用宿主类型，不依赖 Pi 作为认证和推理中间层。

由 DSH 凭据服务负责唯一持久存储，Rust 管理认证和刷新，JS 只在宿主后端传递记录，不把 token 返回浏览器 UI。JS 在 modifyRecord 异步事务内调用 Rust 刷新并返回轮换结果，使用官方本地 provider 的跨进程排他与原子写入，不另建存储回退。目标安装版本仍需核对，不能将该保证推广到任意 provider。

## 官方协议与依赖

工程治理保持认证、推理协议和用户流程不变。Rust 原生绑定的返回类型与转换独立于客户端操作，继续使用一个 crate；TypeScript 将模型元数据映射和偏好校验、搜索来源协调分开，避免在适配器或路由内堆叠转换细节。Biome 统一自有 TS/TSX、测试及配置格式与基础 lint，排除生成绑定、生成样式、构建产物及实验目录；启用 Tailwind 4 指令解析和项目样式入口，不另加并行格式化工具。

UI 封装迁移至 Base UI 的 Button、Menu、Select 与 Switch，保持 React 18、宿主 React 共享及 Tailwind 前缀隔离；移除不再使用的直接 Radix 依赖。组件负责定位、选择、焦点与键盘行为，宿主模态框中的 Portal 仍归属于触发器所在弹窗。shadcn 派生样式的 MIT 许可放在组件目录并纳入包清单；使用 CLI 不改变许可保留义务。依据与验证见 EVIDENCE-025。

设置 Select 从同一组选项提供 Root 的 items 值与标签映射，供 Value 渲染用户文案，不依赖弹出列表是否已挂载；实际保存值保持原配置契约。

登录区域提取为独立界面组件，复用既有授权状态与 answer/cancel，不改变凭据及登录协议。账号选择以头像、姓名和邮箱呈现，添加账号与取消放入统一底栏；方式选择使用相同的行高、图标及箭头留白。等待和设备码共用区域框架。顶部 48 像素图形加 6 像素内边距，保持原素材；账号方法标签保留 SIWC，并明确标识过时的 Codex 浏览器或设备码，标准入口采用“继续使用 ChatGPT”及套餐说明。

客户端依赖目标宿主同版本的正式 locale 服务，以插件命名空间注册中英文资源，使用宿主插槽的 t 注入、订阅与英文回退；不附带第二套翻译运行时或保存语言配置。主机授权文案使用英文源消息，客户端经同一字典翻译提示、选项和安全错误，切换语言时不固化旧翻译；远端诊断保持原文。设置页、插件配置、侧边栏和确认弹窗共用字典。条件 className 使用 cn，静态样式保持普通字符串。

方式选择提供 back 选项，由登录界面的左侧返回按钮答复；主机在开始原生登录前回到账号选择，没有已有账号时按授权取消返回设置。返回不切换当前账号、不清空令牌，账号选择、方式选择与重试仍由同一授权流程管理。

本次落地为默认关闭的 codexReview 和三档 searchMode，复用配置表单和紧凑 shadcn Button。审批关闭交给原 answerer；开启时在 approval/request 前置答复，仅生成当前请求的 allowed-once/rejected/cancelled/unavailable。使用会话当前 step、精确 call ID、工具参数与上下文形成独立审查请求；不把工具输出当作用户授权。原实验 Auto 模式不叠加第二次审批。账号轮换与取消继续复用已有模块，审查模型目录资料独立于普通模型列表。

用户已决定暂时保留现有审批开关。选择原实验 Auto 的会话由宿主原有审查链路负责，本插件在生成审查上下文或请求模型前直接交给后续答复者；不把官方 Auto 请求重定向至专用 ChatGPT 审查模型，也不额外重复审查。

设置说明以账号显示、需要用户确认的操作、搜索范围及账号用量描述行为；审批说明直接交代官方 Auto 的模型归属和不叠加审查调用。不改变开关语义或审查触发逻辑。

偏好项共用设置行的间距、分隔线、字号与标题说明层级，对齐 DSH 本体的通用设置：纵向内边距 16 像素，标题 14 像素，说明 12 像素，控件右对齐。账号和搜索使用 Base UI/shadcn Select，审批使用 Base UI/shadcn Switch，样式继续使用 Tailwind。Select 的 Portal 挂载到触发器所属 dialog 内；普通页面沿用默认挂载位置，Escape 关闭列表而不继续关闭宿主弹窗。共享一个偏好保存状态与逐项错误提示，账号菜单仍调用同一保存接口。Windows rename 的占用或权限错误返回明确配置错误码与安全提示，不暴露底层路径，不追加重试或降级为非原子写入。

searchMode 为 off、chatgpt、all。非关闭时普通 ChatGPT 对话启用官方内置 web_search，辅助审查、摘要与标题请求不附带搜索。all 额外注册正式 DSH 搜索源，以服务端目录顺序的首个可见 ChatGPT 模型执行一次仅搜索请求，返回摘要和真实来源。原生层发送内置工具、保留搜索 output 项，并把 URL 引用转换为可点击来源；不把远端搜索误作待宿主执行的函数调用。共享源使用公开 Settings/ConfigEditor 选择并保存可恢复的原来源，不更改其它模型适配器；离开 all 或卸载时仅在当前仍选择本源时恢复，不覆盖用户后来手动选择的其它来源。

偏好写入统一通过既有受信 RPC 转交后端正式 Settings API，仅允许已声明字段，不依赖两个组件各自的表单写入与释放时序。搜索来源与范围的联动串行处理，必要恢复信息是隐藏的宿主配置，不增加第二份配置文件。槽位卸载先清空本地释放句柄，再释放注册，避免重入释放。

独立审查接入公开 approval/request waterfall，只处理宿主已产生的审批请求，不使用实验 Auto preset 扩大整个会话权限，也不在 tools/pre-execute 对所有调用新增审查。ChatGPT 开关默认关闭并保留原答复流程；原实验 Auto 的会话模型模式由宿主原入口提供。审查请求通过宿主 LLM 服务调用专用模型，不能修改当前会话模型或冻结的输入。

由宿主继续决定何时申请权限、实施沙箱、执行单次授权及写入 approval/asked、approval/decided。模型审查通过只返回 allowed-once；拒绝、取消、不可用分别映射宿主对应结果，不能把 never 策略或不允许申请的禁止操作改成允许。审查输入必须关联准确的待执行操作、参数、上下文和申请权限，不能仅凭自然语言 justification 判断。该流程不依赖官方实验 Auto 组件；若用户选择原实验 Auto，仍保留其自身行为，避免叠加重复审查。

Codex 模式使用现有活动 ChatGPT 账号，明确其上下文发送与用量归属。Rust 目录额外保留审查模型及路由元数据，与普通可见列表分离；按适用元数据或目录中的 codex-auto-review 解析。审查 effort 取该模型能力，不继承主会话的 Ultra/Max。未登录、模型缺失和网络失败明确不可用，不静默放行或换审查者；卸载恢复原审批处理。策略与 Codex 保持单次授权、按真实效果和用户意图审查等原则，不声明与其全部规则完全等价；实现验证及边界由 EVIDENCE-024 维护。

SIWC 额度仍缺少当前授权可用的数据源，不进行额度查询或轮询，也不以本地用量推算。legacy 使用已实测的后台额度接口并按能力展示，按需及定时读取由前述共享订阅负责；两路线的证据边界分别见 EVIDENCE-021、EVIDENCE-037、EVIDENCE-038。

网页搜索使用 Responses 的 web_search 及其来源引用，不依赖社区专用搜索后台。SIWC 的后台额度和生图授权限制不因增加搜索而改变；legacy 生图由独立模块按能力开放。搜索能力依据 EVIDENCE-022、EVIDENCE-036，实现验证见 EVIDENCE-024；额度与生图依据 EVIDENCE-037。

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

三种登录实现按 SIWC、legacy 浏览器、legacy 设备码分别封装；legacy 两种方式仅共用令牌交换、身份验证、刷新及后端路由。原生边界接收封闭的登录方式枚举，不接受前端指定端点或凭据字段。账号摘要增加稳定账号键和登录方式，SIWC 保留原 client_id 对应账号键，旧记录缺省方式仍为 SIWC；legacy 使用独立路线、工作区账号与主体区分，浏览器及设备码更新同一 legacy 记录；不影响 SIWC。刷新与退出仍由 DSH 凭据事务串行持有。

前端共用既有授权交互、账号列表及操作。添加账号先选择登录方式；已有账号重新登录沿用其方式。主机打开系统浏览器，设备码验证地址和短码通过授权通知投影至界面；完整 OAuth URL、设备授权句柄及令牌不进入浏览器。原生负责轮询间隔、超时、取消、交换及验证；设备码不启动回调服务。legacy 浏览器使用其固定回调端口，端口被占用时报告可操作错误，不自动终止其他客户端。

模型目录和 Responses 按保存的授权类型选择路由与请求头，复用宿主模型、消息、图片及流事件映射。SIWC 的 scope 校验和公开接口约束保持独立，不为支持 legacy 放宽；账号切换沿用现有目录失效行为。不新增 WebSocket、代理配置或通用认证框架。

### SIWC 授权

先持久化 host ID，绑定 127.0.0.1 临时端口及固定回调路由，再使用宿主能力打开系统浏览器。每次授权由库生成 state、nonce 和 S256 PKCE，业务层补充 ChatGPT 参数。动态注册回调后使用颁发 client ID 创建 public client、换取令牌及校验 audience。

校验回调 state、OAuth 错误、注册 ID，以及 ID token 的签名、issuer、audience、expiry、nonce。重授权核实原身份后才替换记录，使用 token 响应 scopes 判断订阅权限。保存验证后的身份、邮箱、ID token、access/refresh token、注册信息与到期时间，不解析 access token 猜测身份。

刷新按会话串行，使用原注册 client ID，持久化轮换结果后再继续请求。响应缺少新账号资料时保留已验证资料；新的身份资料需验证。退出按官方会话撤销及本地清除处理，准确报告未确认的远端撤销。注册按 issued client ID 与验证身份隔离；账号选择和添加遵守官方契约，具体宿主交互仍需确定，不从存储结构推导附加功能。

### Legacy 授权

浏览器登录校验 state 并使用 S256 PKCE；设备码轮询获得授权码与 verifier，再完成对应交换。两种方式共享通过 OpenID Connect 的 JWKS、签名、issuer、audience、expiry 和 access-token hash 校验，不只解码 JWT 即接受身份。验证后的 ID token 提供工作区账号；重新登录与返回新 ID token 的刷新核对主体及工作区。legacy 未请求 nonce，不套用 SIWC 的 nonce 与 direct scope 要求。退出按 Codex 语义清除此插件的本地令牌并保留账号信息，不宣称已远端撤销；SIWC 的远端撤销流程保持独立。

### 共享生命周期与传输

原生刷新在到期前 60 秒内执行；未到期的记录直接返回。完整刷新与退出限时 25 秒，以配合目标凭据 provider 的锁等待。SIWC 撤销仅针对网络失败与 5xx 做有限退避，不形成通用重试层。SIWC 授权码 invalid_grant 保留本次 issued client ID，显式重试重新生成授权随机值；不自动重放失效 code。legacy 设备码按服务端间隔轮询，slow_down 增加等待，15 分钟后到期；取消中止轮询及交换。

复用 reqwest 客户端，授权请求禁用自动重定向，按官方元数据发现 JWKS。模型目录和 Responses 按授权路线选择，SIWC 使用公开接口，legacy 使用 Codex backend；store=false、stream=true，不硬编码型号或静默回退。SSE 处理文本、工具参数增量及终止状态，完成以 response.completed 判断；错误、不完整和断流分别处理。不自动重连重放推理。

优先使用 reqwest 环境代理能力；系统代理与自定义证书需求待确定，不预设已支持或自行读取系统设置。

## 异步绑定与资源生命周期

普通操作导出 async Promise；推理通过 napi-rs web_stream 返回对象事件 ReadableStream，必要时用 AsyncBlock 完成 JS 线程映射，JS 转换成 DSH 所需迭代事件。优先直接消费 Rust Stream，确需队列时使用有界队列。

请求对象持有 CancellationToken 并暴露显式取消。JS 将 DSH AbortSignal、消费提前结束及插件卸载传递到 Rust，释放 HTTP 响应和登录监听。不能假定 stream.cancel 自动停止所有后台任务，需要实际验证。

异步导出采用共享引用与必要内部同步，避免可变 self 所要求的 unsafe；使用安全绑定 API，错误经 Result 传播，日志不得携带凭据或 ID token hint。

## 构建与发布

采用 napi-rs 官方 CLI、模板、原生加载器和类型生成能力。确认的目标为 x86_64-pc-windows-msvc、aarch64-apple-darwin、x86_64-apple-darwin、x86_64-unknown-linux-gnu；不引入自制原生加载、绑定生成或交叉编译框架。原生构建与通用 TypeScript 构建分开提供命令，完整构建仍依次执行二者；目标参数由官方原生命令传入。

四目标 CI 在对应 OS 与原生架构分别构建、执行现有离线测试并验证打包后的原生加载；Windows 使用 MSVC，Linux 使用 GNU/glibc。runner 固定 Windows Server 2022、macOS 15 arm64、macOS 15 Intel、Ubuntu 22.04，避免 latest 标签迁移改变架构；这些是验证环境，不是未实测旧系统的兼容承诺。Linux 产物按实际 runner 的 glibc 边界记录，不承诺更低版本。

所有目标成功后，由 napi-rs 创建平台包并收集原生产物。锁定的 CLI 3.10.12 已在 artifacts 阶段拒绝缺失、重复或未声明的目标，在 pre-publish 的真实发布前校验全部平台包并统一版本；直接复用这些职责，不另写重复的完整性检查或平台元数据生成。通过官方收集后，既有 napi-rs pre-publish 发布平台包，最后由 Semifold 发布根包；不增加第二套版本或发布编排。可复用的原生工作流仅构建、测试和归档，不直接发布、变更版本或创建 GitHub Release；新的顶层 CI 依照下述 Semifold 编排协调发布。原生文件沿用根包白名单，供离线本地安装；官方平台包保持独立产物。每个目标测试从根归档解包加载，并验证无根二进制时的官方平台包目录解析；最终聚合平台归档的实际安装验收仍需独立证据。

macOS 独立 Node 与桌面 Electron 进程须分别判断签名与加载权限。只验证现有运行时，不修改签名、不关闭系统安全机制；独立 Node 的加载失败不直接等同桌面宿主失败。安装观察、工具来源与实际测试结果由 EVIDENCE-043 维护。

Semifold 管理 changeset、根 npm 版本、release PR 和发布编排。一个公开 npm 插件发布单元；Rust crate 不发布至 crates.io，Cargo 内部版本不承担用户可见版本。平台包由 napi-rs 从根 npm 版本派生，不独立计算升级。

受控发布步骤先收集并检查所声明平台产物，再调用 napi pre-publish 发布平台包并关闭其 GitHub Release 功能，最后发布根包。GitHub Release 由 Semifold 负责，不再配置第二条平台发布流程。实施时验证 npm lifecycle 与重跑行为，避免重复发布。构建工具版本、Node-API 等级和平台矩阵由目标 DSH 运行时确定。

新增顶层质量与发布编排，先执行 Semifold 配置及版本计划的只读检查，再调用四目标原生构建与现有 fmt、全部目标 Clippy、tsrs、Biome、Rust/Node 测试和打包加载。稳定的汇总检查必须依赖所有必要 job 成功，文档及 release PR 同样产生可见检查，不以跳过结果冒充全量通过。

根 npm 名称改为 dsh-chatgpt-rs，平台 npm 名称由官方 napi-rs 按根名派生；原生 binaryName、Rust crate、内部凭据键及业务标识保持不变。Semifold 的稳定 PackageId 保留，既有 changeset 不手工消费；registry 查询及发布使用 manifest 的实际名称。元数据指向真实公开仓库，不另行改 GitHub 仓库名。

固定 Semifold 0.3.5，使用维护方 setup action 的已核对 commit。顶层 main push 且所有检查通过后，在独立最小写权限 job 先运行 ci --dry-run，以 Semifold 自身的 JSON outputs 判断版本或发布分支，不解析提交文案。存在 changeset 时由 ci 创建或更新 release PR；无 changeset 时才装配同一 run、同一提交的完整原生产物，配置 npm 认证后由 ci 发布。npm 认证仅注入真实发布步骤，GitHub Release 仍由 Semifold 负责，napi-rs 禁用自己的 GitHub Release；根包及四个平台包均需要对应的发布权限。

GitHub 权限分离：质量与原生 job 只读，Semifold job 仅持有创建 release 分支、PR、Release 和 provenance 所需权限。由 Actions token 创建 release PR 后，显式 dispatch 同一 CI 到 release 分支，避免依赖 token push 自动触发检查；dispatch 验证不进入真实发布 job。本次以真实 GitHub 运行结果验收质量与版本 PR 路线，npm 初次发布认证及实际 provenance 验收另行跟踪。仓库按用户要求公开，保留现有 --provenance 参数，不通过降低校验掩盖私有源仓库限制。来源、版本与限制由 EVIDENCE-044 维护。

纯 Agent 上下文修改不创建 changeset。产品成果附 changeset 和本地提交；此次允许推送 CI 配置并验证，但不为测试而手工更新版本、合并 release PR 或实际发包。配置实施及实际发布验证由 TODO-001 跟踪。

## 验证尺度

登录选择按 option ID 关联账号摘要，显示“重新登录”加姓名或邮箱；添加选项显示“添加新账号”。保留其他授权提示的原始含义。登录操作区使用单层圆角细边框、弱主题背景及内边距，与已有账号和容器外的模型说明区分；内部选项继续使用 ghost Button。通过 Tailwind 明确覆盖含图标按钮的右侧内边距为 20 像素，箭头右移 4 像素后仍有 16 像素留白。动画仅使用 group-hover、transition-transform 和 motion-reduce utilities；加载指示仅用于没有待选项的授权等待。

取消登录复用小尺寸 outline Button，置于登录区域底部的独立操作行，靠右排列并以细分隔线和留白与选项区分。两种授权状态共用该操作行，继续调用既有取消逻辑。

从经过现有 OIDC 验证的 ID token 读取可选 name、picture，与 email 一起保存并投影为账号摘要。刷新返回这些字段时更新，未返回则保留已有资料；旧会话缺字段可正常读取，通过后续登录或携带 ID token 的刷新补齐。前端不解析令牌，套餐位置使用邮箱。

账号摘要在宿主 TypeScript 侧用 Node 内置 crypto 对去首尾空白、转小写的邮箱计算 SHA-256，生成可选 Gravatar 图片地址；不把派生地址写入凭据，不增加依赖或配置。图片使用 HTTPS，Gravatar 固定请求 96 像素、G 评级、无匹配图片时返回 404。React 组件依次尝试官方 picture、Gravatar，加载失败后显示姓名首字、邮箱首字或问号文本；图片不携带 Referer 或 OpenAI 凭据，不增加重试或资料查询接口。依据见 EVIDENCE-014。

标题与设置导航复用一个 OpenAI 标志组件，保留官方 SVG 形状和比例；收紧 viewBox 至图形周围的小幅留白，使可见图形占图标框约九成，外围间距交由宿主布局提供。以当前文字颜色适配宿主深浅主题。导航通过 settings.section.icon 插槽按同一分区 ID 注册，并采用宿主传入的 size。SVG 随浏览器产物内联，不增加运行时远程图片请求。

账号设置在挂载、窗口重新获得焦点及页面恢复可见时重新读取状态，登录期间保持短轮询，操作完成后显式刷新。普通成功反馈短暂显示后清除，授权进度仅在登录进行时展示。账号行不展示注册 ID；当前账号标记以凭据存在为前提。退出确认使用浏览器原生模态 dialog 的焦点管理与 Escape 行为，内部操作采用 shadcn Button 和 Tailwind；避免为单个弹窗引入第二个 React DOM 运行时。

围绕已实现行为选择必要检查：授权与身份校验、刷新一致性、流式事件、工具调用、取消、宿主加载和发布产物安装。优先关键行为和集成证据，不为实现细节镜像编写测试，不额外构建审查体系。

未决事项为其余产品范围、DSH 官方 adapter 与凭据服务契约、支持宿主及四目标的真实集成和最低系统边界、依赖实际解析与编译。当前技术选型不等于实现或生产验证。
