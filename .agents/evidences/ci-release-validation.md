# 质量检查与 Semifold 发布自动化验证

编号：EVIDENCE-044。初始日期：2026-11-11。范围：分发身份、公开仓库、质量及四目标 CI、Semifold 版本 PR 和发布依赖链。初始验证不包含实际发布；2026-11-26 的可信发布迁移及专项发布验收单列记录，不覆盖活动插件。

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

首轮 packages 归档已下载并独立核对五个 npm tarball：根包包含四个对应平台原生库，四个平台包各含一个；名称、版本、repository、OS、CPU 和 Linux glibc 元数据符合配置。此为已通过首轮构建的 0.0.0 安装产物核对，不是实际 registry 发布。

移除 PR 专用 status 后，修复提交为 68e0ffd3ed6d9931c228fdce54ce59a5bed05c55，主分支运行：https://github.com/noctisynth/dsh-codex-provider/actions/runs/42998294665 。版本规划、四目标、完整包集合、汇总及 Semifold 自动化共八个 job 全部成功。版本路线成功创建 release PR，并显式 dispatch release 分支；真实发布步骤按设计未执行。

生成 PR：https://github.com/noctisynth/dsh-codex-provider/pull/1 ，保持 OPEN，未合并。已核对 release 分支 manifest 的实际 npm 名称为 dsh-chatgpt-rs、版本为 0.1.0；diff 仅为工具消费 changeset、生成 changelog 和修改根 manifest。实际版本文件由 Semifold 在远程 release 分支生成，本地未手工消费。

release 分支显式 dispatch 验证：https://github.com/noctisynth/dsh-codex-provider/actions/runs/42999714358 。另一个 PR 事件验证因 GitHub 的 bot PR 安全策略显示 action_required，已在核对其代码范围后批准本次工作流执行，而非批准或合并 PR：https://github.com/noctisynth/dsh-codex-provider/actions/runs/42999716658 。两条运行最终均为 success：版本规划、四个原生目标、完整包集合和汇总全部通过；release job 在非 main push 上按设计跳过，没有递归发包。此处验证的是 Semifold 生成的 0.1.0 分支，未把 workflow dispatch 已受理当作检查成功。

核对时仓库仍未配置 NPM_TOKEN，GitHub Releases 列表为空；主运行中所有 npm 发布准备及真实发布步骤均为 skipped，只执行版本 PR 路线。实际首次发布、平台包与根包 registry 权限和 provenance 尚未验收。

## npm 可信发布迁移（2026-11-26）

### 官方依据与实施边界

- 观察：迁移开始时公开 registry 的根包及四个平台包均已发布 0.2.0；远端主分支已包含该版本。迁移以远端版本为基线，原工作区的未提交业务与方案内容不参与发布。
- 官方 npm trust 要求 npm 11.15.0 及以上、对应包写权限和账号级 2FA；不接受 bypass-2FA granular token 管理可信关系。此次使用隔离的 npm 11.21.3 管理配置，不升级项目依赖。来源：https://docs.npmjs.com/cli/v11/commands/npm-trust
- 发布 OIDC 最低 npm 11.5.1、Node 22.14.0，现有 Node 24.11.0 随附 npm 11.6.1 满足要求。新可信配置的首次成功发布须在 2 天内完成；配置保存不验证实际工作流匹配。来源：https://docs.npmjs.com/trusted-publishers/ ，https://raw.githubusercontent.com/nodejs/node/v24.11.0/deps/npm/package.json
- 五个包已分别绑定 noctisynth/dsh-codex-provider 的 CI 工作流，创建前均无已有 trust；逐包回读的仓库、工作流与直接发布权限一致。CLI 仅显式请求直接发布；实际 registry 同时返回默认 staged publish 权限，与官方新配置默认允许 staged publish 的规则一致，并非额外申请；没有 dist-tag 权限，也不使用 staged publish 改变现有流程。发布 job 没有 GitHub Environment，不配置虚构环境名；保留 job 级 OIDC 权限和 GitHub 自动生成的工作流 token。
- 源码核对：napi-rs 3.10.12 的 npmClient 默认为 npm；平台发布通过子进程 npm publish 并继承环境，无 whoami 或 npm token 必填前置检查。因此保持原有 Semifold → npm lifecycle → napi-rs 平台包发布流程，不自造发布循环。来源：https://github.com/napi-rs/napi-rs/blob/cli%403.10.12/cli/src/api/pre-publish.ts ，https://github.com/napi-rs/napi-rs/blob/cli%403.10.12/cli/src/utils/config.ts
- CI 移除 npm token 注入和必填门禁，保留公开仓库检查、provenance 与完整质量依赖；增加 OIDC 环境存在性检查，不打印身份 token。首次五包 OIDC 发布成功后，再按 npm 官方建议禁用传统 token 发布并删除仓库 NPM_TOKEN secret；不扩大到撤销可能被其他项目使用的账号 token。

### 本地验证

- CI YAML 解析和全部 shell 脚本语法通过；确认发布仍只在 main push、全量检查成功后执行，Semifold 及 provenance 未变。
- 四个合成门禁场景通过：公开仓库且 OIDC 信息完整时允许；私有源、缺请求 URL 或缺请求 token 时拒绝。没有真实凭据或远端发布副作用。
- Semifold 0.3.4 只读计划确认新增 patch changeset 将 0.2.0 升为 0.2.1，未手工更新版本、消费变更集或发布。差异空白检查通过。
- 上述离线结果不能替代 OIDC 发布成功；实际发布和权限收尾须以下述远程结果为准。

### 远程验收

- 迁移提交 ffdd164 的主分支检查全部成功，包含四目标构建、质量与行为回归、打包加载及完整产物收集；Semifold 创建 0.2.1 发布 PR #5，未在版本准备阶段发包。运行：https://github.com/noctisynth/dsh-codex-provider/actions/runs/45779730737
- PR #5 的实际差异仅为消费本次 patch changeset、生成 changelog 和将根版本从 0.2.0 更新为 0.2.1。PR 运行全部检查通过，发布 job 按条件跳过；确认头提交未变化后，以 squash 合并为 db5ea0701ffea1c9e9075001dbe1354921aad927。运行：https://github.com/noctisynth/dsh-codex-provider/actions/runs/45781316933 ，PR：https://github.com/noctisynth/dsh-codex-provider/pull/5
- 合并后的主分支运行 45783257223 全量成功，实际执行了公开源/OIDC 门禁、官方平台产物装配及发布步骤。日志确认四个平台包与根包均完成 0.2.1 发布，GitHub Release 于 2026-11-26 08:39:13 UTC 创建；发布步骤未注入 NPM_TOKEN 或 NODE_AUTH_TOKEN，保留 GitHub 自动 token 与 provenance。运行：https://github.com/noctisynth/dsh-codex-provider/actions/runs/45783257223 ，Release：https://github.com/noctisynth/dsh-codex-provider/releases/tag/dsh-chatgpt-rs-v0.2.1
- 发布后即时读取 registry 返回旧标签或 404，日志明确提示新包仍在处理。官方从 2026-07-28 起在可安装前扫描新包，典型约 5 分钟，可能超过 15 分钟；这不是发布时间保证。保留发布被接受与公开可下载两个独立验收结果，不重复发包或绕过扫描。来源：https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/
- 随后五包的 0.2.1 精确版本与 latest 均公开可见，根包四个 optionalDependencies 同为 0.2.1。逐包解码 registry 的 SLSA provenance，确认包名/版本、sha512 与 registry integrity 一致，仓库、主分支、CI 工作流、合并提交和运行 45783257223 均匹配；不是只检查 provenance 字段是否存在。结合无 npm token 注入的实际发布成功，完成五包 OIDC 发布验收。此次未新增桌面安装或业务功能验收。
- 五包分别执行 npm access set mfa=publish 均成功，保留可信发布，禁止传统 token 绕过 2FA；对应官方实现为 publish_requires_tfa=true、automation_token_overrides_tfa=false，而非仍允许 automation token 的 mfa=automation。随后仅删除本仓库 NPM_TOKEN secret，并回读确认不存在；未撤销可能用于其他项目的账号 token。来源：https://docs.npmjs.com/trusted-publishers/ ，https://github.com/npm/cli/blob/v11.21.3/workspaces/libnpmaccess/lib/index.js
- 本次管理登录已通过 npm 官方 logout 退出，临时认证配置及日志已清理；未读取或输出 token 值。隔离工作区之外的原主分支 HEAD、原有 19 个已修改或未跟踪文件及未提交 diff 经比较保持不变。
