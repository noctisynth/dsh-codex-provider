# ChatGPT 必要审批、搜索与偏好恢复验证

编号：EVIDENCE-024。日期：2026-11-07。适用：Windows x64、DSH 0.2.2-rc.1、当前 SIWC 账号授权与公开服务。范围依据 RFC-001、SPEC-001；此处记录观察与验证，不扩展需求。

## 公开契约及接入边界

协议依据已经获取并核对的 [OpenAI 网页搜索文档](https://developers.openai.com/api/docs/guides/tools-web-search) 与 [SIWC 预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)，能力实测见 EVIDENCE-022。调用使用公开 Responses、内置 web_search 和来源引用，不访问社区专用后台，不增加图片生成。

审批的宿主接口与单次授权边界依据 EVIDENCE-023。新增模式直接答复宿主已产生的 approval/request，不修改会话沙箱或权限 preset。ChatGPT 策略独立发送，仅接受约定的明确 JSON 决策；不声称与 Codex 全部规则一致。原实验 Auto 模式交给宿主自身，不叠加审批。

目标官方 WebRuntime 提供搜索源注册、来源数量截断及本地凭据就绪检查。ConfigEditor 与 SettingsForms 提供条目定位和持久化更新；已观察到 Cordis 的 Fiber 包装对象可能不具备引用相等性，因此自有配置以稳定 uid 定位。搜索源使用其正式配置条目，不直接编辑宿主配置文件。

## 离线与宿主集成

实际发布代码的 ApprovalService、Cordis waterfall 和 LlmRuntime 配合合成会话验证：DeepSeek、MiniMax 请求均路由专用 ChatGPT 审查模型；主会话模型不变，workspace-write 选择不变，asked/decided 成对记录。拒绝、无效许可 JSON、缺失调用 ID、never 策略和预取消均未取得授权；关闭或卸载新增答复者后恢复原答复者；原实验 Auto 不产生重复审查。原生解析拒绝高风险许可、重复或未知字段等歧义结果。

上下文按当前开放 step 和精确 call ID 关联；原生调用读取请求头工具定义，PTC 子调用读取宿主工具 schema。完成的 PTC 调用被拒绝。直接用户输入、父任务指令、约束及工具事实分别标注，不把工具输出或摘要当作用户许可；不发送 Provider 重放数据。该测试不执行真实工具，也不替代 OS 沙箱 runner 验证。

原生搜索工具为明确启用时附带，专用搜索才强制 tool_choice。远端 web_search_call 不转换为客户端工具调用；搜索输出保存在重放资料中，URL 引用附加为可点击来源。共享源通过真实 WebRuntime 验证来源去重、无效 URL 排除和 maxResults 截断；未执行搜索的响应不能冒充搜索成功。普通对话之外的辅助请求不附带搜索。

配置集成通过真实 Loader、ConfigEditor、SettingsForms 及账户 RPC：默认关闭审批与搜索；侧边栏双向选择持久化且不重挂授权流；进入所有模型模式选择 ChatGPT 搜索源，离开恢复旧来源；用户后来手动选择其它来源时保留该选择。卸载恢复、重新挂载及配置重读后的搜索源选择通过。产品偏好写入在服务端串行处理。

用户报告旧版两个入口均无法切回 DeepSeek。本次未在真实桌面捕获旧版异常堆栈，不把过期 revision 或重入确定为唯一根因。实现统一服务端提交，并在释放前清空槽位句柄。真实构建的 React 测试覆盖设置按钮；隔离无界面浏览器覆盖账号菜单切回 DeepSeek，确认注册释放、菜单关闭、页面 pointer-events 恢复且没有浏览器错误。深浅主题与窄容器未观察到可见溢出。桌面宿主是否复发仍需用户验收。

## 真实公开服务验证

通过本次原生模块、ChatGptAdapter 与真实 WebRuntime 发起合成查询，搜索完成并返回真实来源；宿主将来源数截为 3，输出包含可点击引用。另一次普通 ChatGPT 对话实际完成内置搜索，保存搜索 output 项后关闭搜索并续写，后续请求正常完成，没有 HTTP 400。未发送私人会话或资料。

通过真实 Session、SessionProjectionRegistry、ApprovalService、LlmRuntime 和本次审查模块验证两项合成操作：DeepSeek 会话的只读列目录请求得到 allowed-once；MiniMax 会话的未经授权删除请求得到 rejected。两项审查均由公开 codex-auto-review 完成，审批审计成对；没有执行命令。审查模型未出现在普通模型列表。

开始时活动令牌已过期，验证通过既有 Accounts 和官方本地 CredentialProvider 的正常事务完成刷新；没有手工改写 token、复制旧刷新令牌或将凭据输出到日志。此项属于正常账号集成，不沿用此前只读研究的“凭据未变”结论。

## 构建检查及限制

29 项 Rust 测试、20 项 Node 测试、两套 Oxc tsrs 类型检查、cargo fmt 和 Clippy 通过。使用官方 napi-rs release 构建及生成加载器、声明；Tailwind/tsdown 浏览器与宿主产物构建完成。构建仍提示第三方 use client 指令：当前入口直接由浏览器工厂运行，没有服务器组件边界，已通过真实产物加载与交互验证；未增加统一静默告警配置。exFAT 的增量硬链接警告由工具链退回复制，不是源代码 Clippy 错误。

上述真实请求只代表本次账号与服务条件；未证明所有模型、账号、长期运行和所有工具审批场景。桌面开启开关、跨模型搜索及真实沙箱内工具的用户验收待更新安装后进行。额度、Fast 与图片生成的既有限制保持各自证据中的结论。

## 合并安装

用户已确认 DSH 完全退出并授权完成后直接安装。产品实现、变更集及验证文档已在本地提交 3e81d65。通过桌面附带官方 CLI 更新 desktop 插件成功，安装前未发现 DSH 桌面进程；本地不可变归档 SHA-256 前缀为 f36793c8d290。

归档中 9 个文件的已安装摘要均与构建产物一致，包括两个入口、Cordis 补丁、原生加载器、声明、Windows 模块、包清单及品牌与组件许可说明。独立 Node 成功加载已安装模块、构造客户端并执行新增审批解析函数。安装器仍有宿主 peer 提示，但命令成功，不将普通 Node 无宿主环境导入服务入口作为加载验收。更新包含此前标志尺寸修正；不执行版本更新或公开发布。

安装核对完成；真实桌面的设置切换、共享搜索和必要审批仍待用户开启 DSH 后验收，默认不开启新增能力。

## 文件占用确认与设置布局统一

同日用户报告所有配置修改均失败，约等待 1～2 秒。只读检查确认真实宿主的 SettingsForms、ConfigEditor、atomic-write、WebRuntime 与验证依赖源码摘要相同，均为 0.2.2-rc.1；未发现配置文件权限缺失。Windows Restart Manager 报告 Zed 占用配置文件。用户关闭编辑器中的该文件标签后立即确认保存成功，支持本次失败由编辑器占用阻止原子替换的结论；不能推广为所有编辑器或历史所有失败的原因。

此前普通 Loader 测试不足以定位该外部占用。追加使用桌面自带 Electron、ASAR 模块、完整 profile boot、HMR 和正式 Connection Fetch 路由的隔离验证，三项设置通过相同 RPC 正常保存。使用临时目录和空凭据，不更改真实配置；隔离配置未启用完整桌面遥测，不将其等同真实用户环境。对运行中真实配置进行原样原子替换的诊断曾被自动审批拒绝，未执行该操作；后续以只读占用查询和用户关闭标签后的反馈确认。

实现将 Windows rename 的 EACCES、EBUSY、EPERM 映射为 settings-file-unavailable，提示关闭编辑器中的配置文件并检查写入权限；不把路径或原始异常返回界面，不修改宿主重试和原子替换机制。对应 RPC 测试验证错误码、可操作文案及敏感路径不外传。

按用户反馈统一三项为 DSH 通用设置行的层级、间距和右侧控件。账号与搜索采用同一 Radix/shadcn 单选下拉，审批采用 Switch，保留 Tailwind 主题隔离。Switch 契约依据 [Radix 官方文档](https://www.radix-ui.com/primitives/docs/components/switch)，构建依赖版本由锁文件记录。Button 补齐 React 18 的 forwardRef，使 Radix 触发器可以正确定位和恢复焦点。

更新后的 20 项 Node 测试、两套 tsrs 类型检查及 Tailwind/tsdown 构建通过。独立无界面浏览器使用最终产物验证三档搜索选择、审批开关、侧边栏双向恢复、文件占用提示及成功重试后的提示清除；深浅主题、320 像素容器均未观察到溢出，浏览器错误为空。此次只改 TypeScript 与 UI，不重建未更改的 Rust 模块。新布局与错误提示的桌面安装和用户验收尚待完成。

## 会话权限菜单调整的接口限制

用户进一步要求设置只控制入口显示，在会话权限菜单选择独立的 ChatGPT 审批模式。本次已安装实现只答复真实 approval/request；完全权限的 never 策略不会因开关而转为全量审批，原实验 Auto 会跳过新增答复者。不过全局开关的交互语义仍不符合新增的会话级选择目标。

核对目标 0.2.2-rc.1 的 PermissionPresetService 公开声明和运行实现：动态贡献只有 registerAuto，固定绑定保留的 auto 身份及完全权限语义，不接受通用 preset ID 或自定义沙箱组合；同时只允许一个 Auto 贡献者。静态 Config.presets 可定义自定义组合，但不是 volatile 字段，变更需要重载权限服务；Profile 补丁的 config 整体替换，不能当作无副作用的 UI 显示开关。没有采用覆盖现有 Auto、直接改私有预设表或替换宿主方法的方式。

已将“仅插件内的会话级审批开关”和“扩展宿主通用注册接口后增加并列模式”提交用户选择。在决定前暂停安装现有界面更新；尚未实现或验证新会话模式，不把静态预设支持解释为动态注册已可用。

后续用户询问接管官方 Auto：其 classifyRisk 使用公开 LLM 请求并标记 purpose=auto-review，路由实验可将 DeepSeek、MiniMax 的审查交给 ChatGPT；但官方工具前置门禁、完全权限和逐次审查语义均保留，不能满足保留沙箱和仅必要审批的边界。用户据此决定暂时保持现状，未实施请求接管或新会话控件。

再次核对当前产品：会话 current preset 为 auto 时，新增审批答复者在生成上下文和调用模型之前执行 next；官方 Auto 仍使用其 snapshot 的会话 Provider 和模型。产品未注册 auto-review LLM 请求重定向。故同时开启不因本插件重复产生审查推理调用；官方 Auto 本身仍有审查 token 消耗，归属于其实际模型路线。此前合成集成覆盖 auto 时新增模型调用数不变；该结论不等于已单独完成两插件同时开启的真实桌面组合验收。
