# 额度展示与连接器边界调研

编号：EVIDENCE-021。日期：2026-11-07。范围：社区 dsh-codex-subscription 3.2.6 发布实现及当前 SIWC 公开文档；初始为静态及文档核对，后续按用户明确授权进行只读接口实测。

## 社区实现观察

额度模块请求 https://chatgpt.com/backend-api/wham/usage ，解析窗口 used_percent、limit_window_seconds、reset_at 或 reset_after_seconds；另有用量历史、profile 与重置额度的后台接口。该数据源与本项目使用的 SIWC 公开模型和推理路由不同，不能仅凭社区可调用就推断本项目令牌也可用。

连接器模块请求 https://chatgpt.com/backend-api/ps/mcp 。界面说明复用用户在 ChatGPT 已连接的 GitHub、Gmail、网盘及日历等应用，向 DSH 模型暴露相关工具，提供关闭、只读、询问后写入、直接写入选项。这是社区发布实现的观察，没有运行这些读写操作。来源：https://registry.npmjs.org/dsh-codex-subscription/3.2.6 。

## 官方事实与尚未确定的事项

SIWC 公开限制明确不支持 hosted MCP/connectors；本地 shell/MCP 工具由客户端执行，属于另一层，不能据此称 DSH 的普通工具不可用。来源：https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations 。

官方 UI/UX 文档要求链接至 https://chatgpt.com/settings/usage ，并展示用量摘要示例；所核对页面没有给出填充剩余比例及重置时间的机器接口。官方错误说明要求不要仅凭 usage_limit_exceeded 推断整个套餐耗尽或重置时间，应用自身限制也可能适用。来源：https://developers.openai.com/siwc/ui-ux-guidelines 、https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery 。

公开问题 #54219 的报告者称 2026-10-14 使用 SIWC 令牌请求 wham/usage 遭到 401，公开 Responses 未提供相应 quota header 或事件，并请求官方提供查询途径。2026-11-07 查阅时问题仍打开；这属于第三方实验报告，不是官方承诺，也不是本项目账号实测。来源：https://github.com/openai/codex/issues/54219 。

结论：已发现对齐完整额度展示的数据源障碍，当前未找到可据以实现的 SIWC 公开查询契约；尚不能将“未找到”扩大为所有未来接口均不可用。完整额度展示技术方案未确定。没有添加第二套登录或改用 ChatGPT 后台路由，连接器尚未获实施授权。

## 现有 SIWC token 只读实测

用户明确要求使用现有 token 验证社区额度接口。读取活动注册的未过期 access token，仅在内存使用，不刷新、不改写凭据；两次请求后均比较凭据文件摘要，确认文件未变化。没有发送私人会话或记录账号、令牌及完整响应。

对社区同一地址 GET https://chatgpt.com/backend-api/wham/usage 发出 Bearer、JSON accept、no-store 及本插件宿主 attribution header，禁用重定向，返回 HTTP 401。响应为 JSON，error.type=rejected_by_access_enforcement，error.code=no_matching_rule，没有套餐、主次额度窗口或 Credits 数据。

社区实现还要求 chatgpt-account-id 请求头；当前 access token 与 ID token 的对应身份声明中未找到该值，本次未伪造账号 ID，因此没有发送该请求头。没有以社区插件名称替换本插件身份 header，也未复现其整套第一方登录。以上是实验适用限制，不据此断言任何其他令牌或参数组合都不可用。

随后使用同一现有 token 对 GET https://api.openai.com/v1/models 做有效性对照，返回 HTTP 200 且 models 为数组。所测 token 仍可用于公开 SIWC 模型路由，额度请求的 401 不能归因为该 token 已过期。结论：当前 SIWC 凭据与请求条件不能直接复用社区额度接口，尚无据以实现完整额度展示的数据源。
