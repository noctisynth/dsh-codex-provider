# SIWC 云端压缩与切档缓存实测

编号：EVIDENCE-032。日期：2026-11-07。适用：当前 SIWC 凭据、公开 Responses、所测 Sol 模型。类型：官方文档、社区发布代码观察、合成真实请求。关联：EVIDENCE-017、EVIDENCE-018、EVIDENCE-031、TODO-001。

## 范围与依据

用户要求在附件工作后确认云端压缩和切档缓存复用可行性；未授权实施这两项。探测只使用合成记录与校验码，不发送私人会话，不调用 legacy 后台。

来源：[公开压缩指南](https://developers.openai.com/api/docs/guides/compaction)、[推理配置更新](https://developers.openai.com/api/docs/guides/reasoning)、[提示词缓存](https://developers.openai.com/api/docs/guides/prompt-caching)、[SIWC 限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)。社区 3.2.6 云端压缩使用 Responses context_management，而非单独 compact 请求；切档缓存方案保持顶层初始 effort，在追加历史中插入 configuration_update。以上是其发布代码观察，不将普通 API 支持等同于 SIWC 授权。

## 凭据续期

开始探测时，先前附件实验使用的 access token 已到期。通过本项目 Accounts.selected、原生 renewSession 和正式 LocalCredentialProvider 的 modifyRecord 事务正常刷新、持久化轮换结果；未重新登录，没有改变当前账号或切换路线。刷新阶段与后续只读探测分开。后续探测前后凭据文件摘要一致，未再次刷新。

## 结果

| 请求 | 实际结果 | 结论 |
|---|---|---|
| 独立 POST /v1/responses/compact | HTTP 401，hardened_oauth_rule_missing，提示当前凭据未获准该操作 | 当前授权不能使用独立 compact 路由；不是令牌到期或所有压缩均不可用 |
| POST /v1/responses 加 context_management，compact_threshold=2048 | HTTP 200、response.completed，实际产出带非空 encrypted_content 的 compaction 项 | 当前 SIWC 支持同一推理请求中的服务端自动压缩 |
| 保留最新加密压缩项并移除其前的输入，继续普通 Responses | HTTP 200、response.completed，正确恢复此前合成校验码 | 本次压缩项可用于 stateless 后续推理，不只验证参数被接受 |
| 普通长前缀及同前缀对照请求 | 均完成且回答正确；两次 cached_tokens 为 0 | 本次没有观测到缓存命中，不能由此断言普通缓存不可用 |
| 顶层 effort 保持 low，历史追加 configuration_update 改为 high | HTTP 400，subscription_sharing_unsupported_capability，param=input；错误列出的可接受输入不含 configuration_update | 当前所测 SIWC 拒绝社区切档缓存方案所需的输入类型；不再重复同一无效请求 |

压缩请求和恢复请求的 input_tokens 分别为 3224、3276；本次上下文较短，证明真实压缩项生成和续写可用，不承诺固定压缩比、费用下降或长会话的最终集成质量。

## 实施判断

可以继续设计 SIWC 的服务端自动压缩接入，需与 DSH 历史、预算、取消、持久重放和既有摘要压缩协调；不需要改走 legacy。独立 compact 接口不能作为当前方案。

切档缓存复用目前不能直接采用 configuration_update；不能用重复低档请求、仅改 UI 或静默忽略选择冒充该能力。该限制不等于否定已有普通缓存。两项均未改产品代码或增加配置，实施待用户另行决定。
