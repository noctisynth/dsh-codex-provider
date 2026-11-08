# 社区云端压缩实现调研

编号：EVIDENCE-041。日期：2026-11-08。适用：社区插件 3.2.7、同期仓库源码、DSH 0.2.2-rc.1。关联：RFC-001、SPEC-001、FACT-002、TODO-001、EVIDENCE-032、EVIDENCE-039、EVIDENCE-040。类型：公开源码观察、官方协议核对与合成离线实验；本次未使用账号或发送真实推理，未实施产品功能。

## 入口与请求

- 源码观察：[偏好定义](https://github.com/WSL043/dsh-codex-subscription/blob/main/src/preference-fields.js) 中 compactionMode 默认为 dsh，cloud 需要主动开启；[主入口](https://github.com/WSL043/dsh-codex-subscription/blob/main/src/index.js) 将云端桥接包在 Pi 适配器外侧，账号作用域来自现有 OAuth 账号。社区只走 Codex legacy 后台，不能据此推导 SIWC 授权。
- [压缩桥接](https://github.com/WSL043/dsh-codex-subscription/blob/main/src/subscription-compaction.js) 为每次流建立独立 AsyncLocalStorage 状态；prepareCall 保留本次冻结的模型描述与输出预留，避免并发和后续配置变更串用预算。没有第二套会话存储或常驻压缩服务。
- [payload 钩子](https://github.com/WSL043/dsh-codex-subscription/blob/main/src/pi-ai-runtime.js) 在正常 Responses 请求中添加 context_management=[{type:'compaction',compact_threshold:T}]。不额外调用独立 compact 路由，也不另发预热推理。
- 官方声明：[Compaction](https://developers.openai.com/api/docs/guides/compaction) 说明超过阈值后，同一次生成流产出加密 compaction 项，裁剪先前上下文并继续推理。无状态续接可丢弃最新 compaction 项之前的输入；独立 compact 返回的完整窗口则不可随意裁剪，两种契约不能混同。

## 阈值预算

[预算实现](https://github.com/WSL043/dsh-codex-subscription/blob/main/src/context-budget.js) 先在适配器边界按目录 effectiveContextWindowPercent 计算有效窗口 W；缺少比例时采用 95%。正常云端阈值为 floor(min(W×0.8, W−R−65536))，R 是请求 maxTokens 或明确配置的默认输出预留，缺少时为 0，不把模型宣称的最大输出容量自动当作预留。

库级可注入更低阈值，但主入口没有暴露该阈值配置；缺少窗口时回落 100000，计算结果小于 1000 时请求前报错。百分比上限和余量上限取较小值，不重复相减。社区并未将 R 作为订阅路由不支持的 max_output_tokens 发给服务端。

例：原始窗口 500000、有效比例 95% 时 W=475000；R=0 得 T=380000，R=128000 得 T=281464。这是确定性预算计算，不是实测触发时刻或压缩比。

社区固定模仿 [DSH 基础压缩默认策略](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/compaction/compaction-basic/src/config.ts) 的 80% 和 65536 余量，没有读取宿主用户自定义 thresholdRatio、headroomTokens 等策略。默认数值一致不代表始终与宿主同步。

## 加密检查点与后续重放

网络层用透传 TransformStream 观察 SSE，不修改下游收到的字节。它在 response.output_item.done 遇到 compaction 项时重新开始收集，保留该项及之后的全部输出；同一流出现多次压缩时只保留最新一次及尾部。保留尾部函数调用是后续工具结果正确关联的必要条件。

只有看到成功 response.completed，宿主最终 finish 为 stop 或 tool-calls、请求未取消且有重放资料，才把检查点附在当前 assistant 的 replayState.response.codexCompactionV1。字段包括时间、账号与模型作用域摘要、原始宿主历史前缀摘要、当前可见输出摘要、加密项及其摘要。桥接依赖 output_item.done，不从终止事件的 output 数组补捞遗漏的压缩项。

下一次请求倒序寻找最近一个带该字段的消息，并校验账号及模型、历史前缀、当前消息内容、加密项摘要、首项类型和大小。有效期为本地策略的 7 天，大小上限 2 MiB；这两个值不代表 OpenAI 保证的服务端有效期。失效、编辑、账号或模型变化时使用当前完整历史，不跨范围复用。

通过校验后，发给模型的历史改为“最新加密压缩项及其输出尾部 + 后续新增消息”，并保留早期 system 消息。DSH 日志和界面历史没有被删除，检查点随现有 assistant 重放资料持久保存，重启和分叉依靠同一套摘要校验。关闭 cloud 后恢复正常完整历史发送；宿主摘要替换或图片 offload 改变前缀时，云端检查点失效。

## 与宿主、连接及档位更新的关系

- [社区说明](https://github.com/WSL043/dsh-codex-subscription/blob/main/README.zh-CN.md) 明确保留 DSH 历史及原生压缩，云端模式为实验性且默认关闭。桥接没有替换 DSH 的会话 surface 或原生压缩服务；不能把它描述为关闭宿主压缩后的完整接管。
- 源码观察：社区云端阈值与宿主默认压力数值相近，但本地计量、宿主自定义策略、切模预检和上下文超限恢复仍各自存在。本轮未验证两套触发器时序；后续源码及正式宿主模块的合成验证由 EVIDENCE-042 维护，确认可能先触发本地压缩或出现重叠工作。
- 云端桥接只在 chatgpt.com 的 Codex Responses 成功 HTTP 响应上捕获 SSE，明确设置 transport=sse、websocket=false。这是桥接实现边界；[官方 WebSocket 文档](https://developers.openai.com/api/docs/guides/websocket-mode) 也描述服务端自动压缩，并非协议整体不支持 WebSocket。
- [推理桥接](https://github.com/WSL043/dsh-codex-subscription/blob/main/src/subscription-reasoning.js) 在 cloud 模式下不启用切档缓存更新。[官方推理文档](https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation) 禁止 configuration_update 与自动压缩混用；显式 compaction_trigger 是另一个方案，社区当前云端模式未采用。未来接入需明确模式优先级，不能直接同时附带两种参数。
- 缓存 key 保持现有路径；prompt_cache_key 本身不能解决压缩后前缀变化。云端压缩控制上下文增长，提示词缓存复用相同前缀，不能由更短请求直接推算套餐净节省。

## 验证与实施判断

将审阅过的两个社区业务模块与对应上游测试原样放入隔离实验目录，复跑 14 项测试全部通过：预算计算、分片 SSE 捕获、JSON 往返、工具续接、并发隔离、失败及取消不保存、编辑和账号变化拒绝旧状态、损坏及过期回落、宿主摘要与图片 offload 失效、关闭后恢复完整历史。仅为合成离线验证；读取过的真实适配器预算测试没有在本次运行，不将上游测试描述为真实云端或桌面验收。

既有 SIWC 实测由 EVIDENCE-032 维护：自动压缩生成加密项且能续写，独立 compact 路由被拒绝。此次未重复消耗账号验证，未实测社区 legacy 长对话、压缩质量、净用量收益或宿主触发时序。

候选判断：现有 Rust 核心适合直接承担请求参数、compaction 事件、成功检查点及最新压缩项尾部重放，无需照搬社区的 JS 网络层 SSE 旁路。当前原生转换尚不接受 compaction 输出类型，单独加请求参数会遇到该缺口；预算及宿主协调也必须先解决。这里只提出接入边界，云端压缩未授权实施，不新增 capability、设置、依赖或发布产物。
