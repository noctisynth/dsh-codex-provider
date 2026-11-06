# DSH 插件适配与安装验证

编号：EVIDENCE-007。日期：2026-11-06。适用：Windows x64、DSH 0.2.1-rc.2、本项目开发产物。

## 来源与观察

核对官方发布包中的 LlmAdapter、内容投影、ReplayEnvelope、授权会话与凭据事务接口。授权流支持通知、选择交互、取消及提交观察，不提供独立远端退出声明；不能把删除记录当成已撤销授权。

- https://registry.npmjs.org/@deepseek-ai/dsh-llm/0.2.1-rc.2
- https://registry.npmjs.org/@deepseek-ai/dsh-authorization/0.2.1-rc.2
- https://registry.npmjs.org/@deepseek-ai/dsh-credentials/0.2.1-rc.2
- https://github.com/deepseek-ai/deepseek-harness

2026-11-06 官方 Responses 文档说明 stateless 请求默认返回加密推理资料；连续工具调用需要保留相关推理、调用与工具结果项。显式 strict=false 保持宿主函数 schema 的非严格语义。

- https://developers.openai.com/api/docs/guides/reasoning
- https://developers.openai.com/api/docs/guides/function-calling
- https://github.com/sindresorhus/open/tree/v10.2.0

## 实验与验证

旧 Codex 相关凭据已复制到用户数据区域备份，包含三个记录及一个凭据引用；内存比较确认备份与原记录一致，同时保存桌面配置、依赖锁及旧安装包。没有将凭据内容、身份资料或设备信息写入仓库。

Rust 十二项测试通过，含消息、工具结果、加密推理重放、流终止和使用量映射；格式及严格 Clippy 检查通过。napi-rs 官方 CLI 生成 Windows release 原生库、加载器和声明。七项原生 Node 测试通过；另以真实 Cordis、授权及 LLM 服务验证插件挂载后出现授权流和 Provider，未登录模型目录为空，卸载后注册均释放。

## 限制

以上为构建、合成协议与独立宿主服务验证，尚未证明桌面应用加载、真实账号登录、推理、工具闭环、持续背压或远端撤销。旧凭据没有作为新协议验证依据。产品保持开发状态。
