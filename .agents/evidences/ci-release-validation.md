# 质量检查与 Semifold 发布自动化验证

编号：EVIDENCE-044。日期：2026-11-11。范围：用户确认的分发身份、公开仓库、质量及四目标 CI、Semifold 版本 PR 和发布依赖链。本次不合并 release PR、不实际发布 npm 或 GitHub Release，不读取登录凭据，不覆盖活动插件。

## 已确认事项与观察

- 用户要求 GitHub 实际全量检查通过，并明确要求公开源码、保留 provenance、不采用 scope。确认根 npm 名称为 dsh-chatgpt-rs；四个平台包由 napi-rs 按该名称派生。查询日根名称及四个平台名称均返回 npm Registry 404，此观察不是名称保留或发布权限证明。
- 旧 npm 根名及候选 dsh-chatgpt-provider 均属于其他公开项目，不能用其 registry 版本作为本项目发布成功证据。当前 Semifold 稳定 PackageId 保留，既有 changeset 不手工改名或消费；manifest 名称才是 registry 和 GitHub tag 的身份。
- GitHub 仓库已按用户要求由私有改为公开；未更改仓库名称。查询时 Actions 已启用，无既有运行、release PR 或仓库发布 secret。只核对 secret 名称，不读取凭据值。公开操作前核对本仓库不是 fork，已跟踪文件中没有凭据、环境密钥或私钥文件名；这不是对全部提交历史进行完整密钥扫描的保证。
- 分发改名覆盖 npm 元数据、Cordis 包加载名、客户端模块注册及插件配置 key。内部 provider、凭据键、RPC、locale、Rust crate 与原生 binaryName 保留，避免无需求支撑的迁移。已有安装不变；新官方加载器必须重建，不能仅替换界面名称。

## 官方工具事实

- 本机原有 Semifold 为 0.3.4；CI 固定维护方正式二进制版本 0.3.5。setup-semifold 尚无 tag，因此引用已核对的 commit，并显式传入工具版本。来源：https://github.com/noctisynth/setup-semifold ，https://github.com/noctisynth/semifold/releases/tag/semifold-v0.3.5
- 对照 0.3.5 源码：ci 只在 base 分支处理工作；有 changeset 时创建或更新 release PR，无 changeset 时直接进入真实发布及 GitHub Release。不能把 ci 无条件当只读验证。CLI 提供 semifold-version、semifold-publish JSON outputs，工作流用非空输出判断路线，不解析提交文案。来源：https://github.com/noctisynth/semifold/blob/semifold-v0.3.5/crates/semifold/src/cli/ci.rs
- 官方 engine 使用配置 PackageId 关联既有 changeset，但发布上下文 name 来自 manifest_name。因此保留旧稳定 ID 时，HTTP pre-check 仍查询新的 dsh-chatgpt-rs，tag 也使用新分发名称。来源：https://github.com/noctisynth/semifold/blob/semifold-v0.3.5/crates/semifold-engine/src/publish_plan.rs
- npm provenance 要求公开源仓库和公开 npm 包，不能用当前私有仓库状态直接验证。用户要求公开后，保留根发布命令中的 provenance，并将该设置传给 napi-rs 启动的平台包 npm 发布。首次发包仍需用户提供有根包及全部平台包权限、满足无人值守认证要求的 NPM_TOKEN，不能从 registry 404 推断已获权限。来源：https://github.com/npm/documentation/blob/main/content/packages-and-modules/securing-your-code/generating-provenance-statements.mdx
- Actions token 的普通 push 不可靠地产生后续 CI；生成 release PR 后显式 workflow_dispatch 到 release 分支执行完整检查，不给验证 job npm 写凭据。来源：https://github.com/github/docs/blob/main/data/reusables/actions/actions-do-not-trigger-workflows.md

## 实施与本地核对

- 原生工作流改为可复用调用和手动 dispatch，保留四目标、完整包收集及打包加载测试。顶层 CI 执行 Semifold 只读规划和全部原生质量检查，稳定汇总 job 要求所有依赖成功。没有通过 path 排除跳过文档或 release PR 的检查。
- 真实 Semifold job 仅在 main push 且全量检查成功后运行。先 dry-run 选路；版本 PR 路线不需要 npm token。只有真实发布路线才检查公开仓库、要求认证并从本次 run 的四目标产物装配官方平台包；不复用旧版本的产物。平台包和根包 npm provenance 保留，GitHub Release 由 Semifold 单独管理。
- 改名后的 macOS arm64 官方原生与 JS 构建成功；fmt、全部目标及 feature 的 Clippy、两侧 tsrs、Biome 均通过，Rust 44 项和 Node 33 项测试全部通过。本地解析核对了工作流依赖、四目标一致性、分发 key 和保留的 provenance；未把暂存区外的 pnpm/npm 缓存权限问题当作代码失败，批准重试后完成打包测试。首次 Semifold version dry-run 被 clean-tree 前置条件拒绝；提交本次成果后，另一个任务的未跟踪调研文档仍存在，保留且未纳入本次提交。随后使用显式 allow-dirty 的只读 dry-run 成功验证 0.0.0 到 0.1.0 的计划，未修改发布文件。远程干净 clone 不依赖此本地选项。
- GitHub 全量验证、release PR 路线及最终结果以下述真实运行记录为准；本地 YAML 解析与脚本检查不能替代远程执行。实际 npm 发布、provenance 和目标桌面功能验收尚未完成，不能将发布缺凭据导致的阻止视为已发布。

## GitHub 实际运行

首轮提交 18bc0b0002b263470d6fb0a43ee1b6c8d7ec8fe6，运行：https://github.com/noctisynth/dsh-codex-provider/actions/runs/42995602713 。四个原生目标的 release 构建、fmt/Clippy/tsrs/Biome、Rust/Node 测试、打包加载和产物上传全部成功；官方完整收集及根包与四个平台包打包成功。

全量汇总未通过：Semifold 0.3.5 的 status 在 push 事件中输出计划后，因事件缺少 pull_request 字段失败。源码表明该命令在 Actions 环境下直接按 PR 事件解析，不能用于通用 push 校验。因此移除重复的 status 命令，保留官方 version --dry-run 的完整规划及只读检查；该路径不读取 PR 事件，dry-run 不收集远程 changelog 元数据。汇总门禁因上述失败而失败，真实 release job 被阻止，未发布。来源：https://github.com/noctisynth/semifold/blob/semifold-v0.3.5/crates/semifold/src/cli/status.rs ，https://github.com/noctisynth/semifold/blob/semifold-v0.3.5/crates/semifold/src/cli/version.rs

修复后的新运行及 release PR 路线待继续核对，不以首轮四平台成功替代最终全量通过。
