# 自动权限审查能力核对

编号：EVIDENCE-023。日期：2026-11-07。范围：社区 dsh-codex-subscription 3.2.6、DSH 0.2.2-rc.1 和现有 SIWC 授权。用户询问可实现性；未修改实际审批配置或执行受审操作。

## 语义及宿主契约

社区 README 的 Codex reviewer for Auto review 指待执行工具调用的权限审查，不是 Git diff 代码质量审查。社区实现通过策略提示识别审查请求，按模型目录的 auto_review_model_override 或 codex-auto-review 路由，只有目录实际列出该模型时使用；普通会话模型保留为其他路径。来源：https://registry.npmjs.org/dsh-codex-subscription/3.2.6 。

实际 DSH 安装内的 experimental-auto-review 发布实现使用固定 REVIEW_POLICY，将请求标记为 purpose=auto-review，通过 LlmRuntime 调用当前模型。宿主负责收集待执行操作和上下文，严格解析 risk/decision JSON，执行允许、拒绝与错误路径。DSH 接口已经有明确 purpose，不需要照搬社区的提示前缀识别。此为静态发布实现观察，不是完整用户授权流程验收。

## 现有授权实测

GET https://api.openai.com/v1/models 返回 200，目录确实包含 visibility=hide 的 codex-auto-review；所测目录没有 auto_review_model_override，审查模型支持 low。隐藏只表示不进入普通模型列表，实际能否调用另做验证。

以当前未过期 access token、该目录模型、low effort 和公开 POST https://api.openai.com/v1/responses，分别发送两条合成权限判断。测试策略仅允许当前工作区列出文件、禁止删除文件：列文件返回 allow，删除工作区内容返回 deny；两次 HTTP 200，均收到 response.completed 且 JSON 结果与测试策略相符。

该实验采用合成策略，返回 decision 字段，用于确认专用模型实际可调用；没有执行工具、批准真实操作，也没有使用 DSH 完整 risk/decision 提示与解析器进行集成。DSH 的实际风险规则不能从这两条合成策略推广。凭据文件摘要前后相同，未刷新或修改凭据，未记录账号或令牌。

## 可行性与实现边界

当前 SIWC 已验证存在可调用的专用审查模型，不依赖社区后台路由。公开模型和 Responses 路由依据：https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference 。

可沿用 DSH 自动审查流程，插件只对 purpose=auto-review 请求选择目录声明的审查模型及对应 effort；无需另建审批系统，也不能将普通对话切到审查模型。当前 Rust 目录只保留普通可见模型，需要额外保留审查路由资料才能实施专用路由。模型缺失时的明确行为、产品入口及真实宿主集成尚未确定；本次不实施开关、不启用自动审批，不将可调用性写成已交付功能。
