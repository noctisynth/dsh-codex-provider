# 自动权限审查能力核对

编号：EVIDENCE-023。日期：2026-11-07。范围：社区 dsh-codex-subscription 3.2.6、DSH 0.2.2-rc.1 和现有 SIWC 授权。用户询问可实现性；未修改实际审批配置或执行受审操作。

## 语义及宿主契约

社区 README 的 Codex reviewer for Auto review 指待执行工具调用的权限审查，不是 Git diff 代码质量审查。社区实现通过策略提示识别审查请求，按模型目录的 auto_review_model_override 或 codex-auto-review 路由，只有目录实际列出该模型时使用；普通会话模型保留为其他路径。来源：https://registry.npmjs.org/dsh-codex-subscription/3.2.6 。

实际 DSH 安装内的 experimental-auto-review 发布实现使用固定 REVIEW_POLICY，将请求标记为 purpose=auto-review，通过 LlmRuntime 调用当前模型。宿主负责收集待执行操作和上下文，严格解析 risk/decision JSON，执行允许、拒绝与错误路径。DSH 接口已经有明确 purpose，不需要照搬社区的提示前缀识别。此为静态发布实现观察，不是完整用户授权流程验收。

## 当前桌面入口的启用条件

后续用户反馈会话权限菜单只有仅可查看、工作区内修改、完全权限。核对实际安装包：官方实验包名称为 @deepseek-ai/dsh-experimental-auto-review，版本 0.2.2-rc.1，提供独立 bundle 补丁并在 apply 时调用 permissionPresets.registerAuto。权限服务仅在该注册存活时把 auto 添加至当前会话的可选模式；不会添加到全局默认模式列表。

当前 desktop 配置声明的 bundle 为基础包、web-app 和本插件，没有声明该实验包。本插件也没有加载自动审查组件，因此菜单缺少 Auto 与当前状态相符。已安装分发包内存在源码不等于组件已启用；此前仅说明“DSH 已有实现”不足以指导用户找到入口，需要补充此条件。未安装实验包、未修改权限或自动审批设置。

该组件默认通过当前会话路由审查；本插件提供 codex-auto-review 专用路由是独立的增强。仅增加模型路由不会使缺失的 Auto 权限入口出现。正式启用仍需宿主组件加载、会话选择与实际审查集成验证。

## 现有授权实测

GET https://api.openai.com/v1/models 返回 200，目录确实包含 visibility=hide 的 codex-auto-review；所测目录没有 auto_review_model_override，审查模型支持 low。隐藏只表示不进入普通模型列表，实际能否调用另做验证。

以当前未过期 access token、该目录模型、low effort 和公开 POST https://api.openai.com/v1/responses，分别发送两条合成权限判断。测试策略仅允许当前工作区列出文件、禁止删除文件：列文件返回 allow，删除工作区内容返回 deny；两次 HTTP 200，均收到 response.completed 且 JSON 结果与测试策略相符。

该实验采用合成策略，返回 decision 字段，用于确认专用模型实际可调用；没有执行工具、批准真实操作，也没有使用 DSH 完整 risk/decision 提示与解析器进行集成。DSH 的实际风险规则不能从这两条合成策略推广。凭据文件摘要前后相同，未刷新或修改凭据，未记录账号或令牌。

## 可行性与实现边界

当前 SIWC 已验证存在可调用的专用审查模型，不依赖社区后台路由。公开模型和 Responses 路由依据：https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference 。

可沿用 DSH 自动审查流程，插件只对 purpose=auto-review 请求选择目录声明的审查模型及对应 effort；无需另建审批系统，也不能将普通对话切到审查模型。当前 Rust 目录只保留普通可见模型，需要额外保留审查路由资料才能实施专用路由。模型缺失时的明确行为、产品入口及真实宿主集成尚未确定；本次不实施开关、不启用自动审批，不将可调用性写成已交付功能。

## 独立审查路由的可行性验证

后续用户明确偏好在会话模型与 Codex 两种审查模式间独立选择，并要求核对与 Codex 的接近程度。目标 LlmRuntime 在适配器解析之前触发公开 llm/stream waterfall，可由中间件返回另一条路由的流；原请求可能被冻结，不能原地改 provider/model。

隔离实验使用真实 Cordis 和 LlmRuntime，注册名为 deepseek、minimax、openai-codex 的合成适配器。会话模型模式分别保持原 Provider；Codex 模式把两个 Provider 的 auto-review 请求交给专用审查路由；其他 purpose 保持原 Provider。六次请求均只分发一次，冻结请求不变，无递归。还执行了安装包原始 readDecision 及 BlockAssembler，将合成的标准 risk/decision 流解析为有效决策。

这证明正式中间件可支撑跨 Provider 路由，及产出可被宿主解析；没有使用真实 DeepSeek/MiniMax 账号、没有加载完整实验组件或执行受审工具。专用模型的真实 SIWC 调用证据与上述离线宿主试验分别成立，不能合并声称完整真实 Auto 集成已完成。产品代码及实际审批配置未改变。

## 与 Codex 的一致点及限制

2026-11-07 核对官方 Auto-review 文档：主 Agent 和审查者分离；只有产生需审批的动作才进入审查，原有沙箱、规则和工具权限决定触发；拒绝带理由返回主 Agent，超时与明确拒绝区分。来源：https://learn.chatgpt.com/docs/sandboxing/auto-review 。

官方当前模型解析源码从目录选择审查者并处理缺失默认审查模型时的刷新；不是把任意主会话型号直接当审查模型。来源：https://github.com/openai/codex/blob/main/codex-rs/core/src/guardian/reviewer_config.rs 。这是当前 main 的静态观察，不等同本地客户端版本或 SIWC 承诺。

DSH 0.2.2-rc.1 的 Auto preset 则是 danger-full-access 与 ask，在 tools/pre-execute 检查每个实际原生调用及 PTC 内层调用，外层 run_code 运输调用排除；reviewer 拒绝可能转人工确认，reviewer 失败直接阻止执行。它使用固定 DSH 策略与严格 JSON 协议。跨 Provider 路由能对齐“独立审查者”的结构，但不会改变上述触发、策略、沙箱及拒绝处理，不能描述为 Codex 的完整等价机制。

拟保持两项职责分离：使用 DSH 原审查机制，仅独立选择审查模型是最小改动；完全复制 Codex 的沙箱、审批触发、策略及拒绝恢复则涉及宿主权限体系，不纳入仅更换模型的实现。完整一致性不是本次可行性结论。

## 保留沙箱与按需审批的后续核对

用户进一步要求保留沙箱、仅在必要时审批后，核对了同版本 user-approval、sandbox、tool-bash、tool-fs 的实际发布实现。此前结论只分析了实验 Auto preset 和 llm/stream，并未穷尽宿主审批接口；“需要改变宿主权限体系”不适用于下面的公开扩展路径。

ApprovalService.request 先记录 approval/asked，再在有效 policy=ask 时调用公开 approval/request waterfall，最后记录 approval/decided。allowed-once 是唯一许可结果，其他为 rejected、cancelled、unavailable；policy=never 在进入 waterfall 前拒绝。已有人工 UI 也是审批答复者，插件可以在相同接口接入模型而不修改沙箱或取消人工模式。

approveEscalation 对与当前模式相同的调用不请求审批，对严格更宽的单次请求才调用 ApprovalService；allowed-once 只返回本次调用所用的模式。tool-bash 和 tool-fs 将该模式合并到本次策略对象，不调用会话 sandbox/policy 设置。模型拒绝不能通过该接口覆写成许可，沙箱拒绝且没有合法提权请求的动作也不会因模型接入自动放行。来源为目标安装附带官方发布模块，其公开包元数据：https://registry.npmjs.org/@deepseek-ai/dsh-user-approval/0.2.2-rc.1 、https://registry.npmjs.org/@deepseek-ai/dsh-sandbox/0.2.2-rc.1 。

隔离试验直接执行发布代码中的 ApprovalService.request/decide、approveEscalation 和真实 Cordis waterfall；仅会话、投影状态及答复结果为合成，scopeTarget 指向试验根 Context。相同模式零审批；单次加权通过后返回目标模式，而冻结的原 workspace-write 策略未变；审批 ask/decided 成对记录；拒绝、never、预取消及 unavailable 均未取得授权。没有执行任何真实工具或改动实际配置，也没有测试操作系统沙箱 runner，不能把这项接口试验当作实际 OS 隔离验收。

更新结论：保留 DSH 既有沙箱、仅在宿主要求审批时选择模型审查具备公开插件接入路径，不必启用实验 Auto，也不必修改其完全权限 preset。需要在审批入口实现独立审查者及精确请求上下文，而不是仅路由实验 Auto 的模型请求；方案由 SPEC-001 维护，未实施产品改动。
