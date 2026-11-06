# Reasoning effort 元数据验证

编号：EVIDENCE-010。日期：2026-11-06。适用：DSH 0.2.2-rc.1、Windows x64、公开模型目录及 Responses。

## 观察与依据

用户确认 EVIDENCE-009 的安装产物可正常切换模型，原会话继续对话不再出现 HTTP 400；同时报告无法选择 reasoning effort。

核对发现：原生请求转换已接收 reasoningEffort，但目录解析仅保留型号和名称，适配器未提供精确型号的 reasoning 能力，宿主因此没有可选档位。

使用当前授权读取公开模型目录，观察到 supported_reasoning_levels 及 default_reasoning_level。不同模型的默认值和可选集合不同；将其作为实际可用元数据，不从型号名称猜测。官方 Codex 类型也描述了同名字段及可扩展 effort 值；此处接口字段依据以实际公开目录为准。

- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/api/docs/guides/reasoning
- https://github.com/openai/codex/blob/main/codex-rs/protocol/src/openai_models.rs
- https://registry.npmjs.org/@deepseek-ai/dsh-llm/0.2.2-rc.1

## 实现与验证

Rust 保留服务端档位、说明和默认值，napi-rs 生成对应对象声明。宿主精确模型解析返回 DSH 的 reasoning 元数据，复用同一目录读取；缺少档位的模型不生成选项，未知新档位保持其字符串值和服务端顺序。

十六项 Rust、十一项 Node 测试通过，格式、严格 Clippy、tsrs、tsdown 及官方原生 release 构建通过。真实 DSH LLM 服务测试覆盖目录元数据、默认值应用、选择高档位、拒绝未声明档位，以及取消单次精确解析不影响共享目录读取。

原生绑定成功读取实际档位及默认值。公开接口的两个合成短请求分别指定 low 和 high，服务端确认了对应 effort，且均收到 response.completed；没有读取或发送用户历史对话，没有把凭据或账号资料写入仓库。Rust 请求转换另有测试确认所选字符串写入 reasoning.effort，未指定时不自行添加默认值。

更新产物已通过桌面 CLI 安装，已安装宿主入口、类型声明和原生库摘要匹配。用户随后确认：桌面中可以选择 reasoning effort，切换后对话正常。该反馈完成本项桌面交互验收，不代表其他未验证事项已完成。

## 显示名称修正

2026-11-06，用户报告下拉菜单仍显示 low、medium、xhigh 等原始值。核对 DSH 0.2.2-rc.1 的 LlmReasoningEffortInfo：id 是请求使用的不透明标识，name 是面向用户的名称；实际 model-selection 分发组件以 effort.id 作为选项值、effort.name 作为标签，当前选择同样按 ID 查找 name。项目原生绑定将 ID 同时赋给 name，宿主适配直接透传，因而显示原始值。

只读核对官方 Codex 桌面应用内部版本 26.1103.31037 的推理档位组件及简体中文词典，显示映射如下。low 使用当前 v2 文案“轻度”，描述针对计算与推理强度，不代表固定耗时。

| 原始 ID | 显示名称 |
|---|---|
| none | 无 |
| minimal | 极低 |
| low | 轻度 |
| medium | 中 |
| high | 高 |
| xhigh | 极高 |
| max | Max |
| ultra | Ultra |

该表仅用于已有档位的展示，不扩展服务端能力；未知档位沿用已有名称。修改集中在宿主适配层，保持请求 ID、默认值、顺序与说明不变。来源为目标宿主与官方 Codex 已安装分发代码的只读检查，不是新的模型调用结果。

现有真实 DSH LLM 服务集成测试通过：已知名称映射正确，未知档位名称和说明保留，默认值仍为原始 low，选择高档位后调用配置仍为 high；没有增加远端模型请求。构建、Oxc tsrs 类型检查通过，真实桌面文案验收待安装后完成。

该修正随后与 EVIDENCE-015 的侧边栏更新一起通过官方 CLI 安装，宿主与浏览器入口摘要核对一致；真实菜单文案仍待用户确认。
