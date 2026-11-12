# 会话缓存两轮排查记录

编号：EVIDENCE-050。日期：2026-11-12。关联：RFC-002、SPEC-002、TODO-001、EVIDENCE-039、EVIDENCE-040、EVIDENCE-045。类型：用户观察、官方源码依据、本项目及社区实现观察、纯内存合成验证和待验证推断。

## 范围、版本与限制

- 用户观察社区缓存约 95%–97%，本插件约 20%–40%；补充确认固定 GPT-6.1 Sol / High，从未切模型或思考强度，短长会话、较短及较长时间间隔均可复现。这不是本轮程序化测量；具体登录路线、输入规模、工具或系统提示是否变化、传输偏好和单轮／累计口径仍待确认。
- 对照社区发布包为 dsh-codex-subscription 3.2.10；真实宿主为 DSH 0.2.2-rc.1，内置 PiAiAdapter 0.2.2-rc.1、pi-ai 1.3.0。观察的是这些版本，不代表用户原测量必然使用相同社区版本或设置。
- 当次已安装宿主 JS、原生模块与工作区构建产物摘要一致，不支持简单以“只改了未安装源码”解释差距；没有据此证明活动进程映射或精确源提交。
- 两轮调查只读取工程、公开资料及宿主归档，在内存检查算法与合成事件；未修改产品、配置或安装，未读取真实凭据或私人会话，未调用模型。需求与方案的后续编排不是已经执行的修复或真实对照。

## 公开来源

- 官方 Codex 正式标签 rust-v0.167.0，固定提交 `086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a`：
  - [会话与 body key、缓存亲和关系](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/core/src/client.rs#L709-L740)。
  - [Responses 请求头传递](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/codex-api/src/endpoint/responses.rs#L70-L95)。
  - [session-id 与 thread-id 构造](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/codex-api/src/requests/headers.rs#L5-L13)。
  - [turn 状态的生命周期限制](https://github.com/openai/codex/blob/086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a/codex-rs/core/src/client.rs#L316-L342)。
- 当日另外核对 main 固定提交 `6bfdc75f0d9e6fae313234f694839866d7c63c39`，同一亲和说明亦存在；上述判断优先引用已发布标签，不依赖主分支的新变化。
- 官方指南：[Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)、[Keep the prefix unchanged](https://developers.openai.com/api/docs/guides/preserved-reasoning)、[Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)。
- 社区发布记录：[3.2.10 registry 元数据](https://registry.npmjs.org/dsh-codex-subscription/3.2.10)；源码观察以该发布包与实际宿主绑定的依赖为准，不以另一个版本的线上主分支替代。

公开来源给出客户端契约和机制，不公开服务端内部命中记录。以下关于实际缓存率的因果归属仍受此限制。

## CACHE-01：body key 不等于后端亲和头

**官方源码观察：**正式版 Codex 的请求 body key 策略与 `session-id` 头独立。客户端会话代码说明 ChatGPT 从 Responses 的 `session-id` 头派生缓存亲和性；Responses endpoint 经 `build_session_headers` 实际写入会话头。`x-client-request-id` 在官方实现中取 thread 身份，不保证与 session 身份总相同，未找到它自身提高缓存率的契约。

**本项目观察：**宿主正式 `sessionId` 在 Rust 的 `from_host` 中只被计算为固定 43 字符 SHA-256 Base64URL body key。`Transport::response` 与 `authorized` 不发送会话头；`attributionHeaders` 仅提供 User-Agent。构建出的 Request 没有可供传输层使用的独立会话亲和元数据。

**社区观察：**实际 pi-ai Codex provider 同时把处理后的 session ID 用于 body key 和 SSE 的 `session-id`；社区默认 short cache retention、SSE，不改这条 session 身份。仅显式 WS 分支使用含进程 namespace、账号作用域、端点和代理的派生身份，不能把该分支说成默认 SSE 行为。

**推断与限制：**body-only 与 body 加会话头是当前首要对照变量，有 ChatGPT 后端特定源码支持。但本轮没有真实单变量对照，不能宣称补头后必达 95%–97%，也不能把其作用推广到 SIWC。先前以公开 API 自动路由说明降低该缺口优先级的判断已收窄。

## CACHE-02：完成输出不能只按非空判断完整

**本项目观察：**事件映射以 `output_index` 收集 done 项，但 `Mapper::accept` 对非空 `response.completed.output` 整体优先；仅空数组时回退到 done 集合。

**社区观察：**实际 pi-ai `processResponsesStream` 保存 done 的完整 reasoning signature，完成时执行 `backfillReasoningSignatures`。已有非空加密内容不被清空，完成事件只补充原来缺失的加密内容。

**合成验证：**直接从真实宿主归档读取 pi-ai 的该处理函数，在内存执行合成事件；成本计算以空操作替代。native 一列是忠实翻译当前完成集合选择算法，不是通过产品原生模块执行或真实 SSE 抓取。

| 合成输入 | 实际内置 Pi 保留加密项 | native 当前集合选择算法保留加密项 |
|---|---:|---:|
| done 完整，completed 同项缺加密字段 | 是 | 否 |
| done 缺字段，completed 补齐 | 是 | 是 |
| done 完整，completed 非空但漏 reasoning 项 | 是 | 否 |
| done 完整，completed 空数组 | 是 | 是 |
| 双方完整 | 是 | 是 |

**结论边界：**存在确定的条件式资料损失分支，但真实后端是否触发、频率和缓存影响均未观测。两个不同非空加密值及冲突项目的协议权威规则不由这些样本证明。

## CACHE-03：可见顺序与全局原生顺序不同

**源码观察：**native 可见块按首个可见事件到达编号，完成阶段把有序原生项挂到对应块，再在下一请求按块顺序拼接。原生顺序为 reasoning、function_call，但可见块先出现 function_call、后出现非空 reasoning summary 时，可能回放为 function_call、reasoning。BTreeMap 只修复收集集合顺序，不修复最后跨块拼接。

**验证：**纯内存脚本忠实复现保存／回放算法，构造相反的两种顺序，得到重排结果。已有空完成测试虽然先收到 index 1 的调用，再收到 index 0 的推理，但 summary 为空，没有覆盖独立推理可见块的分支。

**纠正：**这证明新输出后缀可能与原始输出不同，不自动证明上一请求已经发送的旧 input 被改写。固定旧消息和选项时，后续仍可能保留原有 input 前缀。因此不能以此单独解释用户固定设置下持续低命中。

## CACHE-04、CACHE-05：历史追加能力未闭合

**宿主与社区观察：**PiAiAdapter 从精确模型兼容能力声明 `systemPromptUpdate: in-history` 和 `toolUpdate: addition-only`。实际 pi-ai 1.3.0 的 6.1 Sol 模型具备对应兼容能力；社区 `mergeModel` 保留基模型 compat。Pi 的工具声明过滤 deferLoading，历史新增转换为 `additional_tools`，避免提前进入初始工具集合。

**本项目观察：**模型映射没有上述两项元数据，适配器还固定以 undefined 调用 `projectToolUpdates`，删去工具更新 developer 消息并发送当前完整工具列表。用宿主真实投影函数做内存验证：新增 B 时，关闭更新的路径移除更新消息且 B 不延迟；addition-only 路径保留消息并延迟 B。

**宿主系统提示语义：**无 in-history 支持时，只有提示真实改变才替换头部 system 消息。正常 agent-loop 生成的是包含开头 system 的 messages，不是必然生成顶层 instructions。时间和 runtime context 通过追加 user 消息更新，不能说每轮时间采样必然重写系统提示。

**限制：**社区 compat 是其实现依据，不自动等于本插件所有授权路线的官方能力。工具或提示实际变化时存在前缀差异；用户固定模型和 effort 的补充未证明工具／提示全程不变，也不能反过来假定它们必然变化。

## CACHE-06：推理检查点失效与固定 High 的区别

**源码观察：**检查点外层摘要含模型、工具、instructions 等，另校验精确 input 和 output。合法失配会以当前 effort 重建基线且不继承旧更新项。工具变化可改变外层摘要，开头 system 变化可改变 input 摘要；先前已有配置更新时可能伴随更新项不再继承。

**用户补充后的结论：**固定 High、从未切档且无历史更新时，valid 或 invalid 都得到相同顶层 High 和空更新列表，不能把检查点重建视为本批低命中的原因。失配校验本身用于语义正确性，不应为了缓存直接删除。

## CACHE-07：显式 include 与实际推理回传分开看

**实现差异：**Pi 和所查官方 Codex 默认显式请求 `reasoning.encrypted_content`，本插件的 include 仅在搜索时请求来源。两侧未发现通过显式 all_turns 形成的对应差异。

**官方文档与适用限制：**公开 Responses 文档说明 stateless 模式默认提供加密推理，旧 include 仍接受。该说明不能单独证明 legacy 后端在本插件参数下总会返回完整加密项；缺少 include 也不能单独证明它没有返回。既有合成测试手工提供加密资料，真实记录没有给出每阶段加密字段存在性。

**待验证：**区分请求声明、done 回传、completed 回传、最终保存和下一请求重放五个环节。不要以补一个 include 代替 round-trip 验证，也不伪造缺失的加密内容。

## CACHE-08、CACHE-09：用量与验收覆盖

**统计观察：**当前 native 普通输入为总输入减读取减写入，读取和写入各自上报，推理是输出子集。实际宿主 UI 的读取率分母不含输出，累计率是累计桶相除，不是每轮百分比均值。因此本轮没有发现需要重新修改统计公式的依据；但单轮与整会话不能混比。

**既有证据边界：**EVIDENCE-039 的真实三轮约 2277、2293、2309 输入 token，读写均零；EVIDENCE-040 的真实两路线工具验证为 70 到 96 输入 token，读写均零。它们证明参数接受、重放和用量链路，不能作为长期缓存收益证据。

**固定前缀核对：**旧消息与 source、投影选项不变时，native 请求逐条独立映射；最新 cache candidate 的覆盖不等于删除旧消息的 replay。宿主每条成功消息保存 replayState，普通派生和 JSONL 编码保留它，没有仅保存 latest 的机制。来源属于其他 adapter、块数不匹配、编辑、压缩或图片 offload 等是条件式失效，不是正常每轮必发的覆盖。

**编辑边界：**native 当前读取 raw replay 没有独立可见内容摘要验证；社区桥有对应一致性检查。冻结消息保证普通追加不原地编辑，但不证明所有正式编辑／投影入口都会清除旧 replay。这里只登记待核实边界，不认定用户实际遭遇过旧内容覆盖，也不把已有 raw input/output 编辑测试说成可见编辑的完整证明。

## 不作为本专题直接修复依据的差异

- `x-client-request-id`、`originator` 的差异没有独立缓存收益证据，不能一起修改后将收益归因给会话头。
- SSE Beta 行为并非这里确认的关键差异；社区默认 SSE，不能把它的优势归为必然使用 WebSocket。
- `x-codex-turn-state` 是服务端返回、仅同一用户 turn 内复用的 opaque sticky token；不得跨 turn 盲目重放。社区与 native 均未接入，不能解释两者现有差距。
- 云端压缩、显式 TTL、预热、Fast、HTTP/2、改为纯 JS 传输不在本次缓存修复范围；吞吐排查及其四次真实请求结果继续由 EVIDENCE-045 维护，不能借用为本次缓存对照。

## 当前归因结论

首要验证对象为 Codex body-only key 与社区稳定 `session-id` 的差异，其次核对真实加密推理 round-trip。输出完整性和顺序缺陷、历史追加能力缺口各有独立修复价值，但都未被量化为 20%–40% 的唯一或全部原因。

至此没有执行新的真实模型请求，也没有形成“修复后 95%–97%”的验收结果。真实路线、实验阈值和调用预算未确认前，保持该限制；任务执行顺序和状态只在 TODO-001 维护。
