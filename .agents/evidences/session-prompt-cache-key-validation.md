# 稳定会话缓存 key 接入验证

编号：EVIDENCE-040。日期：2026-11-08。适用：插件开发产物、DSH 0.2.2-rc.1、Windows x64。关联：RFC-001、SPEC-001、FACT-002、TODO-001、EVIDENCE-039。

## 官方协议与宿主依据

- 官方声明：[Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching#cache-location) 支持稳定 prompt_cache_key。GPT-5.6 及之后由服务端自动处理路由，key 并非优化命中率的必要条件，也可用于分组核算；不保证命中或节省比例。
- 官方声明：[SIWC preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) 要求 HTTP 请求 stream=true、store=false、完整输入历史，禁止 prompt_cache_retention；未将 prompt_cache_key 列为禁止项。缺少禁止声明不单独作为实际支持证明，真实请求结果见下文。
- 宿主源码观察：[会话定义](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/src/index.ts) 令 id 读取持久化 header.id；[恢复入口](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/index.ts) 按 resumeSessionId 恢复；[请求组装](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/agent.ts) 将 session.id 放入 GenerateOptions.sessionId。同一已保存聊天恢复后沿用原 ID，新建和分叉创建新身份；未持久化的临时实例不保证跨重建稳定。

## 实现与离线验证

TypeScript 只透传正式 sessionId；Rust 对非空 ID 的 UTF-8 字节计算 SHA-256，再编码为固定 43 字符的无填充 Base64URL。使用已有依赖，不保存额外 ID，不掺入模型、档位、令牌或随机进程量；缺少和空 ID 均省略 prompt_cache_key。两条登录路线共用现有请求投影；保持 SSE，不增加缓存时长、预热、请求头或 WebSocket。

- Rust 使用独立计算的固定摘要向量校验线协议，覆盖序列化恢复后相同 ID、下一轮消息和模型及档位变化、长 ID 的固定长度、相同长前缀但不同尾部，以及缺失、空字符串和 null。不同长 ID 不通过截断合并为同一 key。
- 正式 DSH LlmRuntime 测试使用真实 Session 创建和序列化会话头后恢复；分别重建客户端与适配器，确认相同 ID 继续透传，新会话 ID 独立，无 ID 的独立请求不出现该字段。此为离线恢复模拟，不替代桌面退出重启验收。
- prompt_cache_key 只作为请求元数据发送，不放入模型 input、持久化配置或输出重放副本。已有档位更新检查点、加密推理与工具重放流程保持不变。

## 真实原生及宿主集成

仅使用插件已有凭据和合成 lookup 工具资料。初次验证因 SIWC 访问令牌过期而在发起推理前停止；随后通过插件正式 Accounts.selected 与 DSH 凭据事务完成正常续期，SIWC 记录更新，legacy 无需更新，活动账号保持不变。未重新登录、手工编辑凭据或记录身份及令牌。续期后推理实验前后凭据文件字节一致。

SIWC 和 legacy 各完成两轮 GPT-6.1 Sol 请求：第一轮携带会话 ID 并正常返回 lookup 工具调用，第二轮从序列化头恢复相同 ID、重建客户端和适配器，再追加工具结果，正常回复目标文本。四次请求均经最终 Rust 绑定及正式 LlmRuntime 完成。第一轮输入 70、输出 13，续接输入 96、输出 5；两条路线一致，缓存读取与写入均为 0。确认本次参数可接受、会话身份透传及工具重放正常，未证明命中率提升或套餐节省。

## 工程与交付

Rust 44 项测试、Node 30 项宿主测试通过；Rust fmt、全部目标及特性的 Clippy、两侧 Oxc tsrs 和 Biome 通过。原生产物沿用官方 napi-rs CLI 与已验证的临时 NTFS 工作副本方式生成，宿主及界面沿用正式构建脚本。

本地归档包含 10 个预期文件，解包后逐项 SHA-256 与构建产物一致；原生模块与宿主入口可独立加载，原有路线能力核对通过。归档 SHA-256：4f4572f4fba324ce50afff6849000d39952b5d25c1ed4b133b6833a0c2584a78。已记录产品变更集；不消费版本、不推送或发布。安装结果见下节，真实桌面重启及长期缓存收益待验收。

## 安装核对

2026-11-08，用户明确要求先安装最新插件。确认 DSH 进程不存在后，通过桌面自带官方 CLI 更新 desktop profile，命令成功。安装前核对上述归档摘要，安装后 10 个文件逐项 SHA-256 与构建产物一致，profile 指向本次独立归档；原生模块及额度、生图绑定可加载。合成记录核对两种过时登录 configuration_update=true、SIWC=false，既有搜索、额度及生图能力保持正确。此次合并交付 EVIDENCE-039 的缓存写入统计和切档缓存优化。

安装前后凭据文件摘要一致。安装器保留既有 peer dependency 提示，未启用兼容豁免或手工编辑宿主依赖配置。此核对证明安装产物一致及原生加载，不替代用户重新打开 DSH 后的桌面交互验收。
