# SIWC 文件计数验证与宿主计量一致性

编号：EVIDENCE-033。日期：2026-11-07。适用：所测现有 SIWC 凭据、gpt-6.1-sol、公开 API、DSH 0.2.2-rc.1。类型：真实接口观察、固定发布代码核对及设计推断。关联：RFC-001、SPEC-001、FACT-002、EVIDENCE-030。

## 授权、方法与来源

用户明确授权使用现有 SIWC 凭据，以合成 PDF 和文本文件验证 token 计数，再调研与压缩、切模的一致性；暂不修改实际代码。实验使用已存在的合成附件，PDF 的验证内容位于页图，TXT 为固定验证码与合成说明。请求带 DSH attribution，不携带私人文件、会话或身份资料。

按官方 schema 向 POST /v1/responses/input_tokens 各发送一次 PDF 与 TXT：仅提供 model 和 input，文件用 input_file.file_data 内联 data URL，并附相同的简短合成阅读指令；没有 Files 上传、file_id、推理生成或后端替代路由。请求禁止重定向。再以同一内存 token 向 GET /v1/models 发送一次只读有效性对照，仅记录目录是否存在，不保存其内容。

维护方来源：

- [OpenAI 官方计数指南](https://developers.openai.com/api/docs/guides/token-counting)。明确计数返回完整处理后的输入量，文件计数文档当前明确支持 PDF。
- [OpenAI 官方计数接口](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count)。
- [OpenAI 官方 SIWC 预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)。支持模型接受的文件输入，不支持 Files 上传 API；未明确保证计数路由可用于此授权。
- [DSH token-meter](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/token-meter/src/index.ts)。
- [DSH 文件节点计价](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/token-meter/src/route-pricing.ts)。
- [DSH 压缩及切模策略](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/compaction/compaction-basic/src/index.ts)。
- [DSH 压缩区间及提交校验](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/compaction/compaction-basic/src/region.ts)。公开主干用于交叉核对；区间选择、摘要缩小比较和节点稳定性同时核对固定版本发布实现。

## 真实结果

| 请求 | HTTP | 返回的公开机器码或结果 |
|---|---|---|
| 合成 PDF 计数 | 401 | hardened_oauth_rule_missing；rejected_by_hardened_oauth_boundary |
| 合成 TXT 计数 | 401 | hardened_oauth_rule_missing；rejected_by_hardened_oauth_boundary |
| 同一 token 的模型目录对照 | 200 | 存在模型目录 |

两次计数错误的公开说明均为：This ChatPass credential is not authorized for the requested operation.

未得到 input_tokens，也没有成功的 file_data 解析或格式验收证据。结论限于该日期、该凭据和该公开路由：现有授权未获准执行计数；同 token 的目录对照成功，不能把此次拒绝解释为一般的凭据过期。不能据此推断 TXT 本身不受支持、所有 SIWC 账号永远不可用，或新增某个未公开 scope 就能修复。

合计三次请求。凭据文件前后摘要相同，没有刷新、重注册、重新登录或写入。没有尝试 legacy、API key、第一方私有端点或修改授权参数。实验只保存合成脚本及脱敏结果，没有保存 token、账号字段、请求头或响应目录。

## 与压缩、切模保持一致的必要条件

以下是静态设计要求，不是已实现能力；本次拒绝也意味着这些要求没有真实计数值可供集成验证。

1. **同一请求表示。** 计数须使用实际将发送的模型、文件字节及 detail、图片投影、系统内容、工具定义和重放输入；文件摘要只能标识附件，不能标识整次计数。计数结果必须关联会话表面修订及完整请求表示，异步计数期间有新输入、切模或压缩后必须作废，不能套用旧值。
2. **节点价格与总量分工。** 宿主同步 measure 返回总量及每个持久节点的 tokens、heuristicTokens。单次接口返回整包 input_tokens，不能直接推导每节点可相加的价格，也不能只增加 totalTokens；保留尾部和压缩区间选择读取的是节点价格。必须定义同一量纲的路由节点计价政策，再将整包计数用于最终校准或准入，不能宣称若干单文件计数相加即为精确请求总量。
3. **usage 基线不重复。** 宿主在相同 canonical header 下可复用上次成功 usage，并加上当前表面与锚点表面的价格差。若 usage 已包含原生文件，再额外给历史文件永久加总会重复。文件价必须同时作用于当前表面与锚点，新增、移除及摘要替换都按差值处理；输入计数也不能冒充包含输出的整段压力值。
4. **压缩选择、缩小与稳定性一致。** 固定版本先按节点价保留尾部，再把文本摘要价格与被替换区间的路由价比较；摘要不小则拒绝。推断：大文件若只有短句柄价格，内容正确的文件摘要也可能被判定更大。压缩期间还会再次比较节点数组；若后台计价在期间直接改变而无一致快照，即使消息没改也会失败。所有选择和提交校验必须使用同一已完成的计价快照；摘要请求自身也需要预算，不能只估最终摘要大小。
5. **切模对目标重估。** 目标模型、文件输入政策、输出预留及工具表示改变后，源模型计数不能沿用；从其他 Provider 的文字句柄切回 ChatGPT 原生文件时尤其如此。当前宿主会在提交新 header 前校验目标模型压力，压缩仍默认由旧路由完成，失败保留旧模型。候选计量必须接入该时序，不能发送后才发现目标超限。

## 当前接口能否承接

目标版本 measure 为同步接口，文件计价仍调用无路由参数的 fileRequestText，没有异步文件计数准备或路由文件计价注册入口。计数请求即使将来获准，也只能先成为插件内的独立发送前检查；仅在 llm/stream 取得结果已经晚于宿主本次压缩和切模计量，不能自动满足上述节点、基线和事务一致性。

只替换或包装 totalTokens、追加虚假文本、挪用图片计价、虚报模型窗口或改用其他凭据均不属于本次方案。固定 headroom 仍只是有明确文件总开销上限时的保守候选；本次未得到计数结果，无法建立这样的上限。完整替换计量与压缩服务需改变宿主服务组合，并承担所有 Provider 的重放和计价职责，超出现有 ChatGPT 插件内部最小接管范围。

结论：现有 SIWC 计数能力验证为被拒；在不修改 DSH 本体、保持当前服务组合的边界下，尚无完整计量一致性的正式接入方案。现有插件可以继续评估文件传输和默认派发复用，但预算问题仍阻止按完整验收标准实施。后续可核对官方开放计数权限与 DSH 提供正式文件计价扩展的变化；本次不创建自动跟踪、不改代码、不改宿主配置或安装。
