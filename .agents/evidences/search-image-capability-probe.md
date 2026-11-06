# 官方搜索与图片生成能力实测

编号：EVIDENCE-022。日期：2026-11-07。范围：当前活动 SIWC 授权、公开 Responses、社区 dsh-codex-subscription 3.2.6 使用的专用接口。用户明确要求实测确认后回复。

## 官方依据与请求边界

官方 SIWC 限制允许受模型、账号和 workspace 策略约束的 web search，明确不支持 image generation。来源：https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations 。搜索使用公开 Responses 的 web_search 与 tool_choice=required；来源：https://developers.openai.com/api/docs/guides/tools-web-search 。

社区实现的独立搜索地址为 https://chatgpt.com/backend-api/codex/alpha/search ，生成地址为 https://chatgpt.com/backend-api/codex/images/generations 。来源：https://registry.npmjs.org/dsh-codex-subscription/3.2.6 。

仅在内存读取已保存、未过期的 access token，不刷新或写入凭据；发送合成的公开查询和蓝色方形图片提示，不使用私人会话或图片。每轮检查凭据文件摘要，均未变化。公开模型目录先返回 200，验证同一 token 有效。

## 结果

| 路径 | 实测结果 | 适用结论 |
|---|---|---|
| POST /v1/responses，web_search，gpt-6.1-sol | HTTP 200，收到 response.completed；3 个已完成 web_search_call、18 个来源及 1 个 URL 引用 | 当前所测账号和模型可实际执行官方搜索 |
| 社区 codex/alpha/search | HTTP 401；rejected_by_access_enforcement / no_matching_rule | 当前凭据及请求条件不能直接使用社区专用接口 |
| POST /v1/responses，image_generation，gpt-6.1-sol | HTTP 400；subscription_sharing_unsupported_capability，param=tools | 当前公开 SIWC 路由拒绝图片生成，与文档一致 |
| 社区 codex/images/generations，gpt-image-2 | HTTP 401；rejected_by_access_enforcement / no_matching_rule | 当前凭据及请求条件不能直接使用社区生成接口 |

社区搜索使用发布实现的默认模型 gpt-5.6-luna、commands.search_query、settings 及输出预算；生成使用默认引擎与简单合成提示。请求保留本插件宿主 attribution，没有冒用社区插件身份；现有 token 的对应身份声明不包含 chatgpt-account-id，因此没有发送或伪造该请求头，也没有添加第二种登录。该差异属于实验边界，不能据此断言其他登录或所有参数组合均不可用。

## 搜索完成的核验

首次官方搜索收到 200，但响应没有 Content-Type，探测脚本最初未识别事件流。改为按实际 SSE 内容解析后收到完成事件，而终止通知的 output 为空；再次修正为从 output_item.done 收集实际输出。最终核对到原生 web_search_call 的搜索中、已完成事件、来源和引用，并收到非空回答；不是仅凭 200 判断成功。以上两项为探测脚本的解析修正，未改产品代码。

该验证绕过当前插件仅支持函数工具的请求 DTO，直接发送公开 Responses 参数，所以证明官方能力可用，不代表插件已经接入内置搜索、进度或引用展示。结果不推广到其他模型和账号。图片编辑未另发请求；本次没有成功生成图片。
