# Codex 登录模型目录版本诊断

编号：EVIDENCE-034。日期：2026-11-07。适用：当前插件、DSH 0.2.2-rc.1、所测有效 Codex 设备码登录、Codex CLI 0.167.0。类型：插件代码检查、官方说明与同凭据真实目录对照。关联：RFC-001、SPEC-001、FACT-002、EVIDENCE-027。

## 问题与来源

用户报告 Codex 登录只能看到 GPT-6 Astra 与 GPT-5.6 系列，缺少 GPT-6.1 Sol、GPT-6.1 Terra，而 SIWC 可见。本次仅诊断模型目录，不修改实际代码、安装或版本，不发起推理请求。

- [官方模型说明](https://learn.chatgpt.com/docs/models)：提供 GPT-6.1 Sol、GPT-6.1 Terra 的 Codex 使用方式，并明确 Terra 要求 Codex CLI 0.159.0 或更高版本。不能从普通 API 模型存在推导所有登录路线都支持。
- [官方 SIWC 模型与推理说明](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)：公开目录使用 api.openai.com 的模型接口，并按 visibility=list 展示。
- [官方 SIWC app-server 说明](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)：模型列表本身不是推理权限验收，完成实际调用才验证该请求的访问能力。
- [官方模型目录兼容说明](https://learn.chatgpt.com/docs/enterprise/roll-out-a-gateway)：client_version 使用 Codex CLI 版本，并对应相同版本的 ModelsResponse、ModelInfo 和目录结构；后端目录应保持动态刷新，版本和模型元数据不授予推理权限。此为后续通用方案调研的补充来源。

## 代码观察

legacy 从 chatgpt.com 的 Codex backend 模型接口读取目录，client_version 取 Rust env!(CARGO_PKG_VERSION)。当前 Cargo 内部版本为 0.0.0；根 npm 版本亦为 0.0.0，但 Semifold 与原生构建的既有职责要求 Cargo 版本不承担用户可见版本管理。

SIWC 使用公开模型接口，不发送此 client_version。因此两条路线出现列表差异有明确实现依据。当前 Rust 目录转换没有按 6.1 型号写排除规则，保留 visibility=list 及必要隐藏审查模型；TypeScript 普通列表再过滤 hidden。用户所见缺项可能发生在服务端返回目录阶段，不能直接归因于前端缓存或隐藏规则。

## 同凭据版本对照

只读取本插件保存的未到期 legacy 凭据，不读取其他客户端凭据、不刷新或改写。保持 token、账号请求头、originator、归因与 URL 路径相同，顺序发起三次 GET，仅改变 client_version。0.159.0 来自官方 Terra 最低客户端要求，0.167.0 来自本机实际 Codex CLI 的只读版本输出；这是隔离兼容条件的实验，不是已实施的客户端身份或版本声明。

| client_version | HTTP | 服务端可见模型 |
|---|---|---|
| 0.0.0 | 200 | GPT-6 Astra、GPT-5.6 Sol、GPT-5.6 Terra、GPT-5.6 Luna |
| 0.159.0 | 200 | 上述模型，以及 GPT-6.1 Sol、GPT-6.1 Terra、GPT-6 Sol、GPT-6 Luna |
| 0.167.0 | 200 | 与 0.159.0 相同 |

各版本原始目录均还含隐藏模型；GPT-6.1 两项在后两个请求中明确为 visibility=list，旧版本原始目录没有它们，故不是本插件把已返回的 6.1 隐藏。三次对照直接复现旧列表并隔离出版本参数影响。

附加尝试通过当前原生绑定获取目录时返回通用网络失败，未产生可比较的原生目录。该失败与上面三次成功 HTTP 对照分开记录；未据此推断原生已验证或另有账号错误。凭据文件前后摘要保持不变，未重登、切账号、刷新、修改配置、更新插件或发起真实推理。

## 判断及修复边界

结论：本次列表缺失是插件将内部工程版本用于 Codex 目录兼容参数的适配缺陷，触发服务端旧客户端目录筛选。不是官方普遍不提供 GPT-6.1 Sol/Terra，也不是已证实的账号缺少这两项目录授权。对照只证明目录可见性，尚未验证两个模型在该 legacy 路线上的实际推理、工具和多轮能力。

修复候选应把目录兼容版本从 Cargo/npm 产品版本分离，依据已核对的 Codex 协议能力声明可支持的兼容版本；不要为了模型列表擅自提升 Cargo/npm 版本，不依赖本机是否安装 Codex，不静默换用 SIWC，也不把完整官方客户端能力伪装成本插件能力。生产声明值和兼容验证需在实施时确定，不能只把“填更大版本”视为完整修复。

后续验收应覆盖两种 legacy 登录的公共目录路径、SIWC 目录保持正常、账号切换后的目录缓存失效，以及所需新模型的实际合成推理与关键能力。初轮仅诊断；后续最简实施见下文，不以目录恢复将此前 legacy 真实集成待办全部标为完成。

## 通用方案补查

用户追问能否通用解决及 SIWC 为何受 Codex 限制。澄清：本次缺项发生在 Codex 直接登录路线，SIWC 的公开目录未受该参数影响。两者都使用 ChatGPT 身份，但授权记录、目录和推理端点分别路由；不能将 SIWC 的公开契约套用到 Codex backend，也不能混用凭据取得另一条路线的目录。

追加一次同类只读目录请求，省略 client_version，其余沿用插件 legacy 目录请求头。HTTP 400，公开错误指出 query.client_version 为 Field required。凭据前后摘要相同，未刷新、改配置或实际代码。因此删除参数无法解决，也没有在此接口发现无版本的最新模型协商入口。结果限于所测接口和日期。

结合官方说明，通用候选是独立维护插件已经验证的 Codex 目录 schema 兼容基线，以该基线请求服务端动态目录；不写死型号，不取 Cargo/npm 项目版本，不运行或依赖本机 Codex，不自动抓取最新 CLI 版本充当已经支持的协议能力。新增字段按实际需要评估与映射，模型开放与展示继续以当前路由的服务端目录及可执行能力为准。此设计可避免本次工程版本误用及设备环境差异，但无法承诺未来无需任何兼容维护。

若要求彻底不处理 Codex backend 的目录版本契约，现有正式方案是由用户选择 SIWC 路线；不能在 Codex 直接登录后悄悄用 SIWC 凭据替换目录或请求。通用方案未实施，用户随后选择下述最简修复。

## 最简修复

2026-11-07，用户明确要求直接传入当前最新 Codex 版本。核对[官方更新日志](https://learn.chatgpt.com/docs/changelog)，最新正式发布为 2026-11-06 的 0.167.0，与此前成功目录对照相同。

实际改动仅为 legacy 目录查询的 client_version 固定为 0.167.0，并注明独立于 crate 版本。两种 legacy 共用该分支；没有修改 SIWC、动态目录解析、缓存、凭据、项目版本、构建发布流程或增加依赖与配置。变更意图通过 Semifold changeset 记录，不执行版本更新或发布。

35 项既有 Rust 测试、cargo fmt 及全部目标和特性的 Clippy -D warnings 通过；Clippy 仅保留既有文件系统增量缓存硬链接转复制提示，无源码诊断。此次未新建镜像实现的版本常量测试；此前同 token 的真实 HTTP 对照已确认该值返回两个缺失模型。未重新执行原生真实目录或新模型推理，未重新构建安装产物或更新安装，不能将本次源码修复写为桌面验收完成。

## 更新安装

2026-11-07，用户授权安装。确认 DSH 未运行后重建更新：沿用此前已验证的系统临时目录暂存相同源码，通过官方 napi-rs 完成 release、原生加载器及声明生成，避免项目文件系统的硬链接限制；Tailwind/tsdown 宿主和浏览器入口构建通过，23 项 Node/宿主测试通过。没有修改构建器、源代码或项目版本。

通过官方桌面 CLI 安装不可变本地归档成功。归档 SHA-256 为 d43f7ce07eebc191ae2b67fd04efb4d33b31ece8d62742819a8c35957718f9b7。10 个安装文件摘要与归档全部一致，已安装原生模块加载及客户端构造成功。安装器的既有 peer dependency 提示没有阻止安装；未将此视为完整桌面加载验证。

此次合并安装现有图片精度成果，相关功能依据 EVIDENCE-031；安装信息集中记录于本节。没有读取或改写账号凭据，没有发起推理或打开桌面会话。用户重开 DSH 后的 Codex 目录显示与新模型实际对话仍需验收。
