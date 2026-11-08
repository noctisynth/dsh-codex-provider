# 缓存写入统计与推理档位更新验证

编号：EVIDENCE-039。日期：2026-11-08。适用：插件开发产物、DSH 0.2.2-rc.1、Windows x64。关联：RFC-001、SPEC-001、FACT-002、TODO-001、EVIDENCE-032。

## 协议依据与缺陷

- 官方声明：[Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) 将 input_tokens 定义为普通输入、cached_tokens 与 cache_write_tokens 之和；写入时长细分是写入总数的子集，不能重复相加。
- 宿主源码观察：[usage-projection](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/token-meter/src/usage-projection.ts) 分别消费 inputTokens、cacheReadTokens、cacheWriteTokens 与 outputTokens；[StatsPills](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-chat/src/client/chat/StatsPills.tsx) 以互斥输入桶和输出求和，并在非零时展示缓存写入。
- 缺陷确认：原生转换只从总输入扣除读取，忽略写入字段，导致写入归入普通输入。总 token 及读取占总输入比例没有因此增加或降低。修复向宿主独立上报写入，并从普通输入扣除；旧响应缺少该字段时按零。该修复只影响新响应，不猜测回填已持久化的旧统计。
- 离线验证：输入 12000、读取 4000、写入 7000、输出 300（其中推理 200），转换结果普通输入 1000，总量 12300。写入时长子集及推理子集不重复累计；旧字段缺失行为通过验证。

## 能力及重放设计

- 官方声明：[Change reasoning mid-conversation](https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation) 要求保留请求级 effort，通过 configuration_update 改变后续推理档位，并在手工管理历史时保留更新的原始位置。响应 reasoning.effort 仍反映请求级基线，不能用该回显判断更新是否生效；不与自动压缩混用。
- 实现决策：新增 configuration_update 布尔 capability，浏览器与设备码两种过时登录为 true，SIWC 为 false。模型声明 supports_reasoning_effort_updates 是独立必要条件，不从型号推断。辅助审查、标题、摘要和独立搜索请求不启用。
- 检查点仅随成功完成的 assistant 重放资料保存：记录初始档位、更新位置、账号作用域摘要、请求外层及精确输入和输出摘要。不保存原始账号标识、令牌或额外对话副本。账号、模型、指令、工具或前缀变化时以当前选中档位重新建立基线；最近 assistant 缺少检查点时不使用更早记录。没有全局会话缓存或预热推理。
- 离线验证覆盖低到高再到低、不变档位、持久历史重载、工具续接、加密推理重放、输入与输出编辑、摘要截断、账号及模型变更、缺少状态、SIWC 路线强制排除及辅助请求排除。更新保留原位置且不重复插入；未完成请求不产生完成检查点。

## 真实原生与宿主集成

使用插件已有有效 legacy 和 SIWC 凭据及合成资料，经最终原生绑定、适配器与正式 LlmRuntime 验证；不重新登录、刷新凭据、切换活动账号或发送私人历史。实验前后凭据文件字节一致。

- 目录观察：GPT-6.1 Sol、GPT-6 Astra、GPT-6.1 Terra、GPT-6 Sol、GPT-6 Luna 明确声明支持更新；所测 GPT-5.6 Sol/Terra/Luna 声明 false。该观察限于此次目录，不将清单写死在实现中。
- GPT-6.1 Sol 三轮请求均正常完成并回复合成目标文本：选中档位依次 low、high、low，重放基线始终 low，更新数依次 0、1、2。输入分别为 2277、2293、2309，输出每轮为 5，互斥桶之和与总量一致。第二轮 high 的语义依据官方协议，未将返回的基线回显作为独立的有效档位证明。
- 真实合成 lookup 工具闭环通过：首轮 low 返回函数调用，续接仅追加对应工具结果、没有新用户消息，切换 high 后正常回复目标文本；基线仍为 low，记录一条 high 更新。说明无新用户消息时追加更新的实际请求也被所测后台接受。
- 本次三轮缓存读取和写入上报均为 0。因此确认的是更新项可接受、原始位置重放及用量链路正确；没有实测证明缓存命中提升、非零写入或套餐节省比例，不以样本推断服务端缓存失效。
- SIWC 单轮真实完成；即使宿主请求级优化标记为 true，Rust 路线能力仍阻止生成更新和检查点。SIWC 的既有拒绝依据保留在 EVIDENCE-032，不据此宣称未来永远不支持。

## 工程验证与交付边界

Rust 43 项测试、Node 29 项宿主测试通过；两侧 Oxc tsrs、Biome、Rust fmt 及全部目标和特性的 Clippy 通过。原生构建沿用官方 napi-rs CLI，在临时 NTFS 工作副本生成后复制产物；直接在 exFAT 构建的硬链接限制已由 EVIDENCE-003 记录。沙箱阻止已有回环 HTTP 和临时文件原子重命名测试；在允许这些本地操作的环境重跑完整测试通过。未改写 CLI 或加载器。

切档优化没有新增开关、额外模型调用、云端压缩或模型容量调整。少量配置更新项属于请求输入；提高用户所选推理档位本身仍可能增加用量。真实套餐节省和安装后的桌面交互尚未验收。

本地归档包含 10 个预期文件；解包文件逐项 SHA-256 与当前构建产物一致。解包后的原生模块、宿主入口可独立加载，合成记录核对两种过时登录 capability=true、SIWC=false。归档 SHA-256：e56332c178fd906561c2667ed08f34e0d5c1d9125d10eb95cc6cd6e84402943e。未更新版本、公开发布或替换 DSH 安装。
