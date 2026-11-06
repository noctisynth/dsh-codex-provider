# 模型切换与多轮重放验证

编号：EVIDENCE-009。日期：2026-11-06。适用：DSH 0.2.2-rc.1、Windows x64、公开 Responses 与本项目开发产物。

## 用户反馈与问题定位

用户确认官方登录成功，模型可选择，单轮文本能够输出；随后报告 Codex 模型切换时明显刷新整个目录，偶发切换失败，以及工具执行后的后续请求返回 HTTP 400。不记录用户对话、身份或凭据内容。

核对目标宿主实现：选择模型会保存默认选择，客户端在设置文档更新后重新加载全局目录。本插件原先每次列目录均请求远端，包括宿主选择校验触发的读取。未到期会话的原生续期实验返回完全相同的记录，没有发现该路径自行改写凭据。可见刷新变慢与重复远端请求一致；切换失败的宿主竞态尚未独立重现，仍需用户复测。

- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-model-selection/src/client/service.ts
- https://registry.npmjs.org/@deepseek-ai/dsh-api-session-controller/0.2.2-rc.1
- https://registry.npmjs.org/@deepseek-ai/dsh-credentials-local/0.2.2-rc.1

## 协议实验

使用当前授权执行最小合成请求，没有读取或发送用户历史对话，也没有将凭据、账号或生成的会话内容保存到工程文档。观察到 GPT-6.1-Sol 的流通过 response.output_item.done 返回完整项，而 response.completed 内的 output 数组为空。

原实现只用完成通知的数组构建重放资料，导致已输出文本仍产生空快照，并在后续请求跳过助手内容及工具调用。直接使用已完成输出项构造合成工具结果续写，服务器返回成功，支持保留这些项的修复方向。

官方文档要求 stateless 连续工具上下文保留相关推理、调用及结果；完成通知不重复输出数组的结论来自上述实际流观察，不能误写成所有模型均采用该形态的官方保证。

- https://developers.openai.com/api/docs/guides/reasoning
- https://developers.openai.com/api/docs/guides/function-calling

## 修复及验证

Rust 按输出索引收集完整完成项；完成通知有完整输出时使用该数组，否则恢复已收集项。对于已经保存的空快照，保留宿主现有文本及工具调用构建输入，不伪造已经丢失的加密推理资料。

适配器按当前账号复用目录和在途请求，本插件的凭据更新时失效；失败读取不缓存。没有修改或替换 DSH 的模型选择器，也没有拦截全局刷新通知。

十四项 Rust 测试、十一项 Node 测试通过，格式和严格 Clippy 及 tsrs 检查通过。测试覆盖空完成通知、旧空快照的工具关联、目录并发去重、失效和失败后重新加载。

真实原生绑定与官方 BlockAssembler 共同完成三次连续请求：工具调用、工具结果续写、下一轮文本；每次均收到成功完成。另将首条合成助手消息替换为旧空快照形态，再完成同样三次请求，验证可继续使用保留的内容。没有把这些合成实验替代为用户原会话验收。

两个修复已通过桌面 CLI 安装，核对已安装宿主、浏览器及原生库摘要与产物一致。桌面连续切换和用户原会话的复测仍待反馈。

后续用户确认：模型切换表现正常，原会话继续对话未再出现 HTTP 400。新增 reasoning effort 入口问题的验证由 EVIDENCE-010 记录。
