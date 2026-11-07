# 原生文件插件扩展点调研

编号：EVIDENCE-030。日期：2026-11-07。适用：DSH 0.2.2-rc.1、Cordis 4.1.0、Node 22.22.3。类型：维护方发布代码静态观察、公开源码交叉核对、合成离线运行时实验。关联：RFC-001、SPEC-001、FACT-002。

## 来源与版本边界

- [固定版本 LLM 发布包](https://www.npmjs.com/package/@deepseek-ai/dsh-llm/v/0.2.2-rc.1)。实际读取已安装发布包的版本、运行时代码和类型；网页抓取未成功，不把网页当作已读正文。
- [固定版本附件发布包](https://www.npmjs.com/package/@deepseek-ai/dsh-attachment/v/0.2.2-rc.1)。实际读取已安装发布包的版本、服务实现和类型。
- [维护方 LLM 运行时源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/src/index.ts)。公开主干仅用于交叉核对，不能代替固定发布版本。
- [维护方内容投影源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/src/content.ts)。
- [维护方附件服务源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/attachment/attachment/src/index.ts)。
- [维护方请求计量源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/token-meter/src/route-pricing.ts)。首轮只核对公开主干；下述深化已只读核对桌面归档中的固定版本实现，仍未执行目标桌面的计量集成。
- [社区 dsh-chat-files 作者仓库](https://github.com/xzyonline/dsh-chat-files)。作者说明通过会话授权工具解析 PDF、Office 和压缩文件，不能视为模型后端原生接收文件的证据。

## 静态观察

目标版本保留 FileAttachmentRef 的完整摘要、名称和长度，以及逐字节存储的文件对象。AttachmentStore 提供 saveFile、saveFileStream 和 readFileStream；基础类默认拒绝未实现文件能力的存储后端，不能从接口存在推断任意部署都可读取。前端上传到 DSH 与 DSH 向模型服务发送文件是两段独立链路。

LlmRuntime 的默认末端派发无条件调用 projectFilesToText，然后执行图片能力过滤、工具更新投影、跨适配器重放资料清理和适配器派发。因此仅增加 LlmAdapter 或声明模态，不能使默认派发保留 FileBlock。

但 streamWithRegistration 先执行正式 llm/stream waterfall，其默认回调才进入 adapterStream。该钩子的公开类型明确允许监听者自己产生 StreamChunk，以短路方式完成调用；next 无参数，调用 next 仍走默认文件投影。钩子收到原始 GenerateOptions，循环产生的请求不可变，监听者只能读取，不能改写其消息或原地替换内容。

prepareCall 的一次性检查和配置一致性检查在进入 waterfall 前执行，因此循环使用已准备调用不妨碍读取完整附件。但捕获的 prepared dispatch 不暴露给监听者；短路后不会自动沿用其绑定代际的末端派发。插件自有动态适配器必须另行保证模型元数据、账号、端点与派发代际一致，不能宣称直接调用当前 adapter.stream 等价于默认 prepareCall 全部语义。

## 合成离线实验

使用目标发布包的真实 Context、LlmRuntime、LlmAdapter 与 prepareCall，构造冻结且标记为循环请求的输入。文件名称、摘要和字节全部合成，附件读取器为内存 fixture，自有 sink 只记录请求并返回 stop；没有网络、真实授权、桌面操作或安装变更。

六组断言通过：

1. 不安装监听者时，普通适配器收到的文件块已变成文字块。
2. 正式 waterfall 监听者拿到完整 FileBlock 和冻结请求；使用其精确引用按两段读取合成字节，拼接与原文件一致；短路调用自有 sink 时保留结构化引用。
3. 使用真实 prepareCall 返回的一次性 stream 也先到达监听者，sink 仍收到 FileBlock。
4. 其他 Provider 和纯文字请求调用 next，继续默认链路，没有触发附件读取。
5. 合成取消传给读取器后在读取前拒绝；监听者抛错直接传播，未被默认 adapterStream 转为终止块，证实生产实现必须负责这一边界。
6. 释放监听者后默认文字投影恢复；原始冻结历史的序列化结果始终相同。

实验只证明扩展点的时序、引用可达性和短路机制。内存读取器不证明真实附件后端的摘要校验、持久化或流式背压；sink 不证明任何远端接受文件。模拟循环请求也不替代真实 agent-loop、压缩、工具闭环和桌面验收。

## 可行性判断与实现代价

推断：为插件自有后端提供原生文件输入，技术上可以完全以插件实现。沿用正常附件上传与持久引用，在 llm/stream 中只接管明确支持的 Provider、模型和请求用途，经 readFileStream 读取本次派生请求确实携带的引用，映射到后端正式文件输入协议，再返回宿主流块。读取保留的多轮请求引用即可，不需要从文字句柄恢复信息，也不需要反查被压缩或移除的旧附件。

此方式不是给任意现有适配器开启文件透传。只调用 next 无效；短路又会跳过其后续监听者和默认末端派发，所以应由持有自有适配器及生命周期的插件实现。独立通用插件无法通过公开参数取得默认已准备的 dispatch，也不能让不支持文件的适配器自动支持文件协议。

采用前必须处理：精确模型与调用默认值；图片模态过滤和已有 offloaded 决定；工具更新与跨 Provider 重放隔离；错误、取消、提前结束、资源释放和归因请求头；已准备调用的代际一致性。辅助用途特别是摘要压缩不能无差别继承普通对话的上传策略。

公开计量源码按 fileRequestText 的文字句柄给文件计量，尚无对应原生文件的路由计价协议。推断：只接管发送会使新增文件的上下文消耗、切模重估及压缩判断可能低估；服务端 usage 回报不能保证请求发送前的预算正确。固定版本对应实现已在下述深化中核实，实际偏差仍未集成验证，不能把发出字节视作生产交付完成。

首轮支持专用后端的插件内候选；用户随后选定该方向，要求先解决预算与派发职责。当前深化结论如下，未开始实际代码实施。

## 插件内预算与派发职责深化

日期：2026-11-07。本轮仅只读检查当前插件代码、目标桌面发布归档及官方文档；没有新增实验、接口请求、凭据读取、宿主配置修改或安装。前述六组合成实验只覆盖短路方式，不作为以下新候选的验证。

补充来源：

- [维护方 token-meter 服务](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/token-meter/src/index.ts)。
- [维护方压缩后端](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/compaction/compaction-basic/src/index.ts)。
- [维护方摘要请求](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/compaction/compaction-basic/src/summarizer.ts)。
- [维护方 Agent 请求契约](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/runtime-types.ts)。
- [Node 22 异步上下文文档](https://nodejs.org/docs/latest-v22.x/api/async_context.html)。
- [OpenAI 官方 token 计数文档](https://developers.openai.com/api/docs/guides/token-counting)。
- [OpenAI 官方文件输入文档](https://developers.openai.com/api/docs/guides/file-inputs)。
- [OpenAI 官方 SIWC 预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)。

### 预算事实与限制

只读解析目标桌面归档，确认 token-meter、agent-loop、agent、compaction 均为 0.2.2-rc.1；已有压缩后端发布包亦为该版本。没有提取或改写宿主文件。

固定版本 token-meter.measure 使用节点价格和历史 usage anchor。文件部分调用 llm.fileRequestText 并按该文字估价；它没有 Provider、模型或用途参数，也没有文件计价注册入口。路由计价接口仅覆盖图片。压缩后端据同一 meter 的总量、节点量决定触发、保留区间和缩小结果；切模对目标 header 重估也使用该 meter。

不能在总量上永久累加文件开销：历史 usage anchor 可能已经包含同一附件，再相加会重复；新增、移除、切模和摘要替换又须重估节点。压缩后文件字节数和 Base64 长度不能可靠代表 PDF 提取文字、页图或表格展开后的输入消耗。

OpenAI 官方提供 POST /v1/responses/input_tokens，计数文档明确支持 PDF file_data 的处理后输入计数；文件输入文档的格式范围比计数文档明确保证的 PDF 更广。SIWC 文档允许模型支持的文件输入，但不支持 Files 上传 API。后续用户单独授权的现有 SIWC 计数验证被拒，真实结果与限制由 EVIDENCE-033 维护；既有 PDF、TXT 推理结果由 EVIDENCE-031 维护，不能代替计数能力。

| 预算候选 | 可解决部分 | 当前限制 |
|---|---|---|
| 按实际完整请求调用官方计数 | 如授权及格式支持，可在推理前核对输入总量 | 无入口写回宿主节点、界面和压缩；完整请求总量不天然等于可加的文件分项价格；现有 SIWC 实测被拒，见 EVIDENCE-033 |
| 按模型配置压缩 headroom，限制保留文件总开销 | 官方配置可预留固定空间，保留原压缩服务 | 须证明文件开销上限，且保留尾部仍有界；可能过早压缩；需调整宿主压缩插件配置，尚未实施 |
| 独立预检，溢出时返回上下文错误 | 可由默认错误恢复尝试压缩 | 节点仍按句柄估价，不能保证选对区间；摘要也可能超限，不能代替完整预算 |
| 替换或包装宿主计量与压缩服务 | 理论上可重做全局计量 | 需要改变服务组合并承担全局重放；即使不改源文件，也超出仅在现有 ChatGPT 插件内接管的最小范围，未采纳 |

固定 headroom 阈值为 min(contextWindow × thresholdRatio, contextWindow − 输出预留 − headroom)，并非文件逐项价格。它与真实请求预检可作为受限部署候选，但尚无适用于完整文件范围的、经证明的开销上限。不能虚报模型窗口、把输出上限充当文件预留、向日志塞无意义文本改变计数或滥用图片计价接口。当前完整预算仍未闭合。

### 默认派发的更小候选

静态推断：不必优先复制 adapterStream。llm/stream 读取本次请求的文件位置与引用，使用插件自有 AsyncLocalStorage 携带只读映射，并继续 next。宿主照常处理最终默认值、图片能力过滤、工具投影、跨适配器重放清理、代际绑定、错误归一化及迭代清理。ChatGPTAdapter 在正常 stream 内读取映射，以宿主已投影和清理的消息为基础，仅将对应文件位置序列化为原生文件输入。

依据是当前文件投影一对一替换内容块、工具投影只改开发者更新、forAdapter 只清理助手重放。映射使用稳定消息身份及块位置；无持久身份的一次性用户输入只能按该固定有序输入关联。不得解析句柄、用原始整段消息覆盖宿主已清理的助手消息，或搜索 Session 补回本次请求已不存在的附件。不能无歧义关联时显式拒绝该文件调用，不静默猜测。

只在 AsyncLocalStorage.run 中创建 next 返回的迭代器不足以覆盖惰性执行；作用域必须覆盖实际迭代的 next、return、throw 与取消和释放。并发、嵌套、重试、卸载均需隔离。此为 Node 官方原语之上的插件私有设计，不是 DSH 原生文件契约，本轮未运行验证。

| 职责 | 候选承担方式 | 后续验证 |
|---|---|---|
| 精确模型、默认值及代际 | 保留默认 prepared dispatch，不从监听者直接重选当前适配器 | 准备后账号或目录变化、热更新、卸载 |
| 图片及工具投影 | 保留默认链路；文件映射只用于精确位置 | 混合附件、文字模型、卸载图片、工具更新 |
| 跨 Provider 重放 | 使用默认清理后的助手消息 | 往返切模，不恢复外部重放资料 |
| 错误、取消及释放 | 文件读取和后端错误在 adapter.stream 内产生，由默认边界归一化，继续使用原生 Operations | 校验失败、读取中止、提前结束和卸载 |
| 归因、工具及 usage | 沿用现有原生客户端与流协议 | 工具往返、缓存和非缓存分桶、不重复结算 |

普通对话、摘要、审批和搜索须分别确定文件策略。compaction 的一次性请求也可携带文件；一律只发句柄可能遗漏尚未进入摘要的文件语义，一律发原文件又可能导致摘要超限。必须在可靠预算下处理实际摘要输入，才能认可压缩验收。

### 恢复实施条件

默认派发可优先评估保留 next 的请求级映射，预期比全短路更小，但目前仅有静态依据。完整预算没有找到现有公开接口可直接闭合的插件内方案；固定预留和独立预检只解决部分行为。当前继续评估，不启动代码实施和新增真实上传。

恢复实施前，预算方案须覆盖首传、多文件、重放、切模、移除及摘要输入，并解决现有授权计数被拒及宿主计价接入缺口；随后验证映射与派发边界。两者闭合后，再验证真实 DSH 附件到后端推理、多轮工具、压缩及取消，继续使用合成文件，依据实际内容识别结果验收，不能只检查 HTTP 200 或上传成功提示。计价与压缩、切模事务一致性的后续细化统一见 EVIDENCE-033。
