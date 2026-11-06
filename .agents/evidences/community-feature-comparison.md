# 社区插件功能对照与核心缺口检查

编号：EVIDENCE-018。日期：2026-11-06。基线：此前参考的 dsh-codex-subscription 3.2.6 发布包、本项目当前实现与 DSH 0.2.2-rc.1。范围：发布代码、现有实现、官方公开文档和无网络合成检查；未启动社区插件或读取私人会话。

## 对照方法与边界

同时核对社区 README 与对应实现，区分声明、实现存在和真实可用。此次不是社区所有功能的在线验收，也未检查比 3.2.6 更新的版本。社区第一方 Codex 后端能力不等于第三方 SIWC 公共路由能力。已确认需求由 RFC-001 维护，下面的额外能力不能自动变成待实现需求。

公开基线：https://registry.npmjs.org/dsh-codex-subscription/3.2.6 、https://github.com/WSL043/dsh-codex-subscription 。

## 功能差异

| 能力 | 社区发布实现 | 本项目状态与含义 |
|---|---|---|
| 文本、模型、普通推理档位、工具循环 | Pi Codex provider 与宿主适配 | 已有原生实现与部分真实验收；异常恢复另见下文 |
| 图片输入 | 读取 input_modalities，传输 input_image 并支持 detail | 当前明确声明仅 text，将图片投影为文本说明；无法原生理解截图内容，属于未纳入的功能差异 |
| 套餐与额度 | usage 查询、窗口、Credits、重置时间 | 当前仅有订阅授权布尔值；邮箱占位已获用户接受，额度查询未实现且范围待定 |
| 用量历史与管理 | history/profile、提醒、重置卡与重置后重试 | 未实现；为额外产品功能，不是文本对话缺陷 |
| 订阅搜索及网页读取 | 注册专用 search/fetch provider | 未提供专用订阅路由；仍可调用 DSH 提供的搜索等普通工具，不能写成不能搜索 |
| 图片生成及编辑 | 注册图片工具，调用 Codex images 后端 | 未实现；不能直接复用第一方后端作为 SIWC 公开方案 |
| Fast 与 Ultrafast | priority/ultrafast 请求值与目录能力过滤 | 当前无开关；Fast 已获实施意图，公开路由调研由 EVIDENCE-017 维护；Ultrafast 未获实施授权 |
| 额外模型偏好 | 隐藏模型、统一默认档位、verbosity、扩展上下文 | 当前使用 DSH 模型选择、官方档位与当前容量；没有集中高级设置，不重复算作宿主能力缺失 |
| 目录持久缓存 | 按账号保存目录、刷新及退役提示 | 当前仅复用进程内目录及在途读取；没有持久缓存、手动刷新或退役展示 |
| 账号附加操作 | 移除、全部退出及旧格式迁移 | 当前已有添加、选择、单账号退出及重新授权；保留注册是现有设计，旧 token 不能直接当 SIWC 授权 |
| 代理与传输选项 | 环境/系统代理、SSE/WebSocket、可调重试 | 当前采用 reqwest 环境代理与 HTTP/SSE；系统代理和其他平台尚未确定 |
| 宿主额外扩展 | 连接器、手机控制、语音、草图、Codex 独立子任务、审查路由 | 当前未实现；DSH 自身的子 Agent 与一般工具仍可使用本 provider |

社区 usage 使用 wham 后端，搜索使用 Codex alpha/search，生图使用 Codex images 后端；此为发布代码观察，不证明当前 SIWC token 获准访问这些接口。官方 SIWC 当前允许模型支持的图片/文件输入及受策略限制的 web search，但不支持 hosted image generation、hosted MCP/connectors、音视频输入及转写等能力。来源：https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations 。

## 已确认范围内的实现缺口

1. 摘要压缩参数：DSH compaction-basic 的 summarize 显式传 maxTokens，默认从 headroomTokens 导出；ChatGptAdapter.stream 传给原生，from_host 再序列化为 max_output_tokens。官方 SIWC 明确要求省略该字段及 temperature。合成调用确认这两个选项会进入原生请求 JSON；后续序列化由代码确认。未对真实账号重现压缩 400，因此结论是已定位协议不兼容路径，不是声称本次用户再次遇到故障。EVIDENCE-016 的容量及切模验收仍有效，但不证明真正触发了压缩。
2. 错误分类：Rust Error 全部通过 napi::Error::from_reason 成为字符串错误，适配器未转换为 DSH LlmError。用真实 LlmRuntime 接收模拟该原生错误形状的 context_length_exceeded、subscription_sharing_usage_limit_exceeded 和 HTTP 401，三者均变为 UNKNOWN。目标 compaction-basic 只在 CONTEXT_WINDOW_EXCEEDED 时进入失败后压缩，因此该恢复路径无法被正确触发。
3. 错误详情：HTTP 解析仅接受 error.message，未保留官方允许的顶层 detail，也丢失 error.code/param；本次 Fast 实测返回的 detail 会只剩状态码。该问题与错误分类相关，但还影响用户可见说明。
4. 终止刷新失败：renew 将所有 refresh 错误泛化，Accounts.selected 的事务随异常结束，未清除已确定不可用的 token。账号状态只检查 token 非空，因此终止失败后仍呈现有凭据，下一次继续尝试。此前 login 的 invalid_grant 重试是授权码交换恢复，不是 refresh 的 invalid_grant 清理。官方要求终止刷新错误清除失效令牌、保留 issued client ID 并重新授权；临时网络失败不应清除。

官方错误依据：https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery 。宿主契约依据：https://registry.npmjs.org/@deepseek-ai/dsh-llm/0.2.2-rc.1 ，以及目标安装附带的 compaction-basic 发布代码。以上检查未改产品代码，也未制造真实令牌失效。

## 验证与发布边界

本轮既有 auth、responses、catalog-cache 共八项测试通过；合成核对覆盖请求选项和实际宿主错误归类。通过项不覆盖上述遗漏的异常恢复。

真实刷新轮换持久化、远端撤销确认、长时间背压及消费提前结束/卸载取消仍缺真实验证；这与已确认未实现的错误分支分别跟踪。用户已验收正常登录、对话、工具续写、模型切换、推理档位与账号菜单，不能因新增发现而抹去这些证据，也不能据这些证据宣称全部场景完整。

当前 Semifold 只有基础版本/发布配置，napi-rs 的产物收集、平台包与根包发布编排尚未闭环；Windows x64 本地构建安装已实测，其他平台与生产发布不能视为已完成。这是交付工程缺口，不是单纯补测试。
