# 云端与宿主压缩协调调研

编号：EVIDENCE-042。日期：2026-11-08。适用：DSH 0.2.2-rc.1 官方发布模块、同期公开源码、社区插件 3.2.7。关联：RFC-001、SPEC-001、FACT-002、TODO-001、EVIDENCE-032、EVIDENCE-039、EVIDENCE-041。类型：源码观察、官方协议核对、合成离线验证与候选判断。本次未调用真实模型、未使用账号、未修改产品实现或宿主设置。

## 预算与两种计量视图

社区阈值计算由 EVIDENCE-041 维护：有效窗口 W 下，T=floor(min(0.8W, W−R−65536))。这只是服务端自动压缩阈值，不是 DSH 的统一调度预算；社区没有读取宿主自定义压缩策略。

源码观察：[TokenMeter](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/token-meter/src/index.ts) 存在两个不同用途的视图：

- contextPressure 用于当前上下文压力展示，可采用最近一次请求的输入用量，包含缓存读写，不含输出。
- measure 用于 [BasicCompactionEngine](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/compaction/compaction-basic/src/index.ts) 自动压缩及切模预检。它计量完整活动会话 surface 与工具；只有匹配的 usage 锚点总量不低于完整锚点的估算量时，才采用 usage，否则采用估算。随后加上当前 surface 相对锚点的有符号变化；不同请求头或模型需要重新计价。

因此，云端检查点缩短实际发送的历史、保留完整 DSH surface 时，较小的服务端用量不会让本地 measure 自动降到云端窗口大小。界面显示的压力可能很低，本地压缩依然认为完整历史超限。不能用较小的 usage 上报来修复这一差异，也不能把提示词缓存 key 当作预算协调手段。

边界观察：所核对 TokenMeterConfig 没有可配置项；图片计价与文件文字表示之外，未发现供 provider 注册任意有效请求窗口的正式通用计量入口。此结论限于所审阅版本，不宣称宿主未来不能提供扩展。

## 触发顺序与重复工作

[agent loop](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/agent.ts) 的源码顺序为：

1. 从 inbox 领取待处理消息，但尚未追加到持久 surface。
2. agent/pre-step：本地压力检查可先压缩现有 surface。
3. 开始 step；prepareRequest 内 agent/request 执行模型切换预检。
4. 追加系统提示更新、已领取的用户或运行时消息，构造正式请求。
5. 适配器应用云端检查点投影；服务端在这次生成中按 context_management 触发自动压缩。
6. 若请求上下文超限，agent/request-error 可触发本地恢复，再重试请求。

观察与推断：两套阈值相同也不保证不重复。本地可能在云端请求发出前先执行；新消息在预检后把请求推过阈值时，也可能先发生云端压缩，下一步又因完整 surface 过大执行本地压缩。本地摘要替换或 offload 改变历史前缀后，社区云端检查点失效，下一次发送重新构建的本地历史。这里的重复是两套机制针对重叠历史分别工作，不代表每一步一定连发两次压缩。

BasicCompactionEngine 的 auto 是全局开关；只有开启时才同时注册压力、切模、上下文超限恢复三种自动处理。modelPolicies 支持部分数值与摘要策略，但没有按路由关闭 auto 的字段；本次未找到可直接按云端模式跳过本地自动压缩的正式 veto 钩子。全局关闭 auto 会一起移除三种自动保护，不能作为只针对 ChatGPT 云端压缩的精确协调方案。

## configuration_update 互斥与切换

官方声明：[推理档位更新](https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation) 不能与自动压缩或自动截断混用，独立 compact 也不接受含该更新项的历史。官方另述显式 compaction_trigger 后重新声明 configuration_update 的流程；这不是社区自动压缩方案，也未验证所测 SIWC 授权是否接受。

源码观察：[社区推理桥接](https://github.com/WSL043/dsh-codex-subscription/blob/main/src/subscription-reasoning.js) 让 cloud 优先：cloud 开启时跳过切档优化，仍按当前选择发送顶层 reasoning.effort，不重建自身元数据中的 configuration_update。此类更新原本由桥接按需重建，并非普通 DSH 可见消息。

离线验证得到的社区行为：

| 状态变化 | 实际请求行为 |
|---|---|
| 本地模式 low → high | 顶层基线仍为 low，历史中加入 configuration_update |
| 随后开启 cloud、选择 max | 发送 context_management，顶层为 max，不含 configuration_update；本轮仅保存云端检查点 |
| 关闭 cloud、选择 low | 恢复完整 DSH 历史，不含旧云端项或旧配置更新；建立 low 新推理基线 |
| 此后再次切到 high | 从新 low 基线重建一次更新，不恢复更早基线 |
| 本地压缩提交新的 surface | 当前档位成为新基线，旧更新不复活 |

候选处理要求，不属于已确认实施需求：模式切换按请求边界冻结；关闭 cloud 时完整历史可能重新变大，应先校验目标窗口并沿用宿主压缩保护。成功的本地替换才重置基线，失败且未提交替换不应清除有效状态。不能因为关闭优化而保留错误档位，也不能盲目剥离导入的任意原始 configuration_update；它可能包含 reasoning 以外的配置。prompt_cache_key 可继续稳定，但历史形态改变后的命中不受保证。

## 合成验证证据

从官方 npm 发布包独立加载同版本 TokenMeter、CompactionEngine 与 BasicCompactionEngine，配合正式 Session、投影注册服务和 LlmRuntime；模型窗口、历史与摘要适配器使用合成数据，不进行网络推理。断言全部通过：

| 场景 | 观察结果 |
|---|---|
| 云端小用量、完整本地历史 | 输入上报 200，展示压力 200；measure 仍为估算 35031，超过阈值 34464，调用一次本地摘要，替换后 23466 |
| 切到较小窗口 | 输入上报 200，目标窗口 90000、阈值 24464；触发本地摘要，摘要沿用原模型 |
| 新消息在预检后进入 | 预检前 33024，低于 34464；入队消息落入 surface 后 35032，模拟云端压缩后下一次 pre-step 仍触发本地摘要 |
| 关闭全局 auto | 压力、切模、超限恢复三种自动钩子均不再处理 |

第三项按源码顺序调用实际宿主钩子并插入合成消息，云端完成以合成 usage/checkpoint 表示；没有运行完整桌面 agent loop 或真实云端压缩。它证明重复工作的可发生性，不测量生产频率。

另将审阅的社区压缩、预算、推理和 JSON 业务模块原样载入离线夹具，用普通请求覆盖上表三类模式边界：开启 cloud、关闭 cloud、已提交本地替换；包含稳定缓存 key、配置项不存在和新基线的断言。仅将无关的自动审查识别函数替换为恒 false，故不声称验证自动审查或完整社区分发包集成。

本次 4 个宿主预算场景与 3 个社区模式场景通过；先前 14 项社区检查点测试由 EVIDENCE-041 维护。未测真实云端压缩质量、延迟、费用或套餐净收益；本次不建立额外产品测试门禁。

## 实施判断

候选一：保留原生自动保护，以社区式云端投影作为混合优化，接受重叠压缩可能性。降低云端阈值只能改变先后概率，不能消除完整本地计量导致的重复。

候选二：若要求云端为主且可靠避免重复，需要宿主识别经校验的有效请求窗口，并提供按路由协调压力、切模和超限恢复的策略边界；检查点无效、关闭模式或切换 provider 时回到完整 surface 计量。目前所核对通用接口不足，不能只在插件附加 context_management 就宣称完成协调。

不建议虚报模型容量、伪造用量、全局关闭 auto，或无条件同时发送自动压缩与配置更新。当前产品保持 DSH 本地压缩及已实现缓存优化，不新增云端能力或配置。
