# 历史追加更新与检查点协调验证

编号：EVIDENCE-053。日期：2026-11-12。关联：RFC-002、SPEC-002、EVIDENCE-050、TODO-001。范围：功能阶段三的协议依据、有界实现及离线验证；真实后端接受性与缓存收益单独验收。

## 官方协议依据与最小支持范围

本次核对的官方 latest release 为 rust-v0.167.2。其公开 ModelInfo 没有系统中途更新或 additional tools 的独立能力字段，`supports_reasoning_effort_updates` 只代表推理配置更新，不能挪作两类新能力的依据。目录版本查询参数不在本次修复范围，不因核验文档而顺带升级该参数。

- [保持前缀不变](https://developers.openai.com/api/docs/guides/preserved-reasoning.md) 明确推荐以 developer 角色追加 `additional_tools`，并以新的 developer 消息要求改用更新后的应用指令，而不是重写旧提示。
- [Tool search 指南的追加工具协议](https://developers.openai.com/api/docs/guides/tools-tool-search.md#add-tools-at-a-specific-point-in-the-input) 给出 `type`、`role: developer`、完整 `tools`，不要求 wire `defer_loading`；工具只从该项之后启用，后续保留原位置。
- [6.1 Sol 模型说明](https://developers.openai.com/api/docs/models/gpt-6.1-sol.md) 与实际 pi-ai 1.3.0 精确模型 compat 提供有界实现参考；指南未单独列出该模型在 legacy 路线的 additional_tools 实测结果。
- [官方 ModelInfo](https://github.com/openai/codex/blob/rust-v0.167.2/codex-rs/protocol/src/openai_models.rs#L414-L518) 与 [AdditionalTools 项](https://github.com/openai/codex/blob/rust-v0.167.2/codex-rs/protocol/src/models.rs#L1063-L1071) 分别用于区分目录事实与协议类型。
- [推理提示指南](https://developers.openai.com/api/docs/guides/reasoning-best-practices.md) 说明 developer 是应用指令的表示；[指令层级](https://model-spec.openai.com/2025-12-18.html#follow_all_applicable_instructions) 区分 system 与 developer，同级的后续明确更新可覆盖先前内容。

最初临时提出的精确 Sol 范围被用户质疑后撤销，未作为第三阶段提交。进一步核对官方实际发送链发现：ModelInfo 的 `use_responses_lite` 是真实目录模式字段；StepContext 按该模式与 IncrementalTools 功能决定窗口布局，不是按一个型号名称判断。官方目录中多款模型为 true，普通窗口和其他 provider 另有策略。因此“没有独立 additional-tools 字段”不等于“不支持”。

最终实现从现有模型发现结果解析该模式（缺失默认 false），在 Codex 两条路线投影为分别表达的系统更新、原生工具追加能力，不复制模型表、不按名称猜测，也不新增自动探测或设置。SIWC 不开启；没有模式声明的模型保持旧行为。使用公开 developer／additional_tools 表示，不添加官方内部 RLite 头、不切换端点、不声称与官方完整状态／传输策略等同。模型声明和离线通过仍不等于实际 legacy 接受性或收益验收。

固定版本源码：[实际增量门控](https://github.com/openai/codex/blob/ce21072c90d32c40af7a55b60b2fb35c84a43a6a/codex-rs/core/src/session/step_context.rs#L57-L77)、[模式字段](https://github.com/openai/codex/blob/ce21072c90d32c40af7a55b60b2fb35c84a43a6a/codex-rs/protocol/src/openai_models.rs#L484-L492)、[多型号目录](https://github.com/openai/codex/blob/ce21072c90d32c40af7a55b60b2fb35c84a43a6a/codex-rs/models-manager/models.json)、[工具与指令 diff](https://github.com/openai/codex/blob/ce21072c90d32c40af7a55b60b2fb35c84a43a6a/codex-rs/core/src/session/world_state.rs#L45-L137)。

社区 3.2.10／实际 pi-ai 1.3.0 有八款模型声明系统与工具历史更新，其中七款走原生 additional_tools，GPT-5.5 走 tool-search 替代路径；spark 缺少这两类声明。社区还可能让新增目录型号继承基模型 compat。这些不等于官方保证，本专题不因此引入额外 tool-search 调用或任意型号回退。

## 系统提示与工具历史的约束

应用提示从第一轮就统一使用 developer 表示，不能把初始提示留在高一级 system，再声称后续 developer 一定能完整替换。完整替换语句只针对先前 DSH 应用指令集合，不覆盖 OpenAI 系统指令、其他 developer 消息、工具声明或工具可用性；初始基线与后续更新均保持原始历史位置。

宿主 ToolAdditionBlock 只携带 `toolName`，完整 schema 由正式 `toolHistory` 与投影后的 tools 提供。`deferLoading` 是宿主级字段，用于过滤初始工具列表；不把它误写成 additional_tools 的必需 wire 字段，也不合成 tool_search 调用。

addition-only 的工具删除和同名 schema 变化沿用宿主正式投影／历史重建：移除工具不能继续在历史新增项中保持启用；同名定义变化不是只按名称追加合并。语义变化允许前缀与检查点合法失效，不为缓存保留过时权限。

## 验证记录

原生目录解析保留实际模式声明，N-API 分别导出系统更新与工具追加能力，宿主按实际路线和精确目录记录选择投影。Rust 请求转换分别处理两个标记：系统消息规范成带限定替换作用域的 developer；新增工具在其历史位置序列化为完整 additional_tools，宿主 deferLoading 字段不进入 wire。两个标记仅是内部请求元数据，不进入最终 API body；发送前仍拒绝 SIWC 扩展输入。

Rust 61 项测试通过，包括目录模式真／假／缺失且不以型号猜测、路线隔离、独立开关、稳定初始 surface、系统／工具新增顺序、缺声明及错误角色拒绝，以及追加后检查点继续保持原 effort 基线与配置更新原位置。工具删除的真实历史投影变化继续合法重建基线。

完整 Node 套件 39 项（含子测试）通过。新增正式 LlmRuntime 与 projectToolUpdates 聚合回归覆盖多型号和未来 slug、6.1 Sol 不声明模式时不误开启、两项能力独立、初始／后续系统位置、延迟新增、移除、同名 schema 重建及辅助调用不额外查询目录；实际切换 SIWC 时即使旧目录仍缓存也不开启扩展。恢复由既有会话身份／重放和 Rust 序列化检查点回归覆盖，不把新增 Node 模拟目录测试冒充真实模型发现。

官方 napi-rs release、tsdown 宿主和界面构建、npm 归档与官方加载器验证通过；两侧 Oxc tsrs、Biome、Rust fmt、全部目标和特性的 Clippy 通过。构建保留第三方 Base UI／Lucide 的既有模块级 use-client 指令提示，未为隐藏提示更换依赖、编译器或规则。

已记录阶段三产品变更集并按授权本地提交。未发起真实模型请求、访问真实凭据、安装、推送或发布；没有把模型模式声明、离线回归或一次构建写成 95%–97% 收益保证。
