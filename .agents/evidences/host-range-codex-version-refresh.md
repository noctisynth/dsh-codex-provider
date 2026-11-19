# 宿主兼容范围与 Codex 版本更新验证

编号：EVIDENCE-057。日期：2026-11-19。适用：本次 DSH 0.2.2 系列准入和依赖更新、Codex 模型目录兼容参数更新。

## 官方来源与观察

- DSH 官方发布为 0.2.2-rc.5，GitHub 发布于 2026-11-18 12:51:39 UTC，npm 发布于同日 13:17:23 UTC；核实时产品包 latest 与 next 均指向该版本。依据：<https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.5>、<https://registry.npmjs.org/@deepseek-ai%2Fdsh>。GitHub 未认证 REST 查询因限流返回 403；发布页、Atom 与 npm 元数据交叉核对，不将失败的 REST 查询记为验证成功。
- Codex 官方最新正式版本为 0.170.0，GitHub 发布于 2026-11-18 03:40:48 UTC，npm 发布于同日 03:45:45 UTC；更高的 alpha 和平台预发布包不作为正式版。依据：<https://github.com/openai/codex/releases/tag/rust-v0.170.0>、<https://registry.npmjs.org/@openai%2Fcodex>。此前固定值为 0.167.0，本次只更新模型目录兼容参数，不引入 Codex 运行时依赖。
- 官方将 DSH 定位为开发者预览，并提醒快速迭代和破坏性变化；未找到整个 0.2.x 或所有 RC 的稳定 API 承诺。SemVer 对 0.y.z 和预发布也不提供这种保证。依据：<https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.2.2-rc.5/README.md>、<https://semver.org/>。这是官方声明及规则，不是从版本号推导的兼容验收。
- DSH 的自有 engines.dsh 优先于 DSH peer 范围，并以 includePrerelease=true 判断；该检查是安装/启动准入，不验证运行时 API。依据：<https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.2.2-rc.5/packages/boot/app-boot/src/plugin-compatibility.ts>。
- 官方源码对照确认 LlmError 构造函数从 rc.2 起将任意字符串限制为内置错误码，同时提供 fromFailure 承载完整 LlmFailure；rc.1 没有这个入口。既有 PERMISSION、PROVIDER_ERROR 不在新版内置码集合，不能靠强制转换伪造兼容。依据：<https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.2.2-rc.1/packages/llm/llm/src/index.ts>、<https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.2.2-rc.2/packages/llm/llm/src/index.ts>、<https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.2.2-rc.5/packages/llm/llm/src/error.ts>。

## 本次实施与边界

用户确认选择 rc.2 起的 0.2.2 系列。统一 engines.dsh 与 DSH peer 为 >=0.2.2-rc.2 <0.2.3-0；上界中的 -0 明确排除下一补丁版本的预发布，避免 includePrerelease=true 使其漏入。未来同系列自动准入是维护政策，不是未来 API 或桌面交互已验证的结论。

所有直接 DSH SDK 开发依赖固定为 0.2.2-rc.5，四个原先仅自动安装的 peer 也纳入精确开发基线，避免解析到 rc.4 后形成混合运行时。逐个核对所用官方包的 rc.5 元数据可用；不使用各子包可能过时的 latest 标签。保持 Cordis、schemastery、非 DSH 工具及 Rust 依赖版本不变。Node 最低版本对齐宿主的 24.9.0。应用随附的 24.21.0 已完成依赖管理、类型和格式检查，但本机 macOS 签名策略拒绝它加载 Lightning CSS 原生模块；直接加载实测返回 Team ID 不一致，而不是文件缺失。使用既有普通 Node 24.11.0 验证 CSS 与插件原生扩展可正常加载，后续构建、行为测试及 CI 使用此版本，不修改签名或系统安全设置。

pnpm 因 rc.5 发布时间较近，按其机制记录仅针对所需包与精确 rc.5 的 minimumReleaseAgeExclude；不关闭全局发布时间防护，不使用通配豁免。安装禁用生命周期脚本，最终 peer 检查无问题。

使用正式 fromFailure 保留错误 code、message、status、requestId 与 cause，不重映射已有错误分类，不加入旧版回退。Codex 浏览器和设备码路线的模型目录固定 client_version=0.170.0；SIWC 不附加该参数。未改变实际推理请求、凭据、路由、模型目录解析或缓存机制。

## 验证结果

- 已通过：Rust fmt、全部目标/全部 feature Clippy（warnings 作为错误）、61 项 Rust 单元测试。
- 已通过：新版 SDK 下两套 Oxc tsrs 类型检查、Biome 全量检查；pnpm peer 检查无问题，frozen-lockfile 安装不需重新解析。
- 已通过：本机 Semifold 0.3.4 的只读发布计划，预计由 0.1.0 升至 0.2.0；因提高宿主和 Node 下限，本次 changeset 记录 minor 意图，不手工消费变更集或改根包版本。CI 固定的 Semifold 0.3.5 与远程工作流本次未执行，不能把本机计划视为远程发布验证。
- 已通过：napi-rs 官方 release 构建和原生加载、Tailwind/tsdown 的宿主与浏览器构建。本机原生 CLI 在项目父目录创建官方 staging，首次受沙箱限制失败，经单次授权后完成；未改造构建流程。JS 构建保留第三方模块的 use client 提示，无构建错误，不据此宣称浏览器集成已验收。
- 已通过：Node 24.11.0 下 41 项 Node 测试（含子测试），覆盖正式宿主错误归一化、AUTH/额度/上下文/传输/超时、PERMISSION 与 PROVIDER_ERROR 原分类、取消终态、恢复重放、图片、审批、搜索及侧边栏偏好。首次新增取消场景错误地期望 error 终态，实际 ABORTED 正确映射为 aborted；仅修正测试预期，未更改取消行为，重跑全部通过。
- 已通过：rc.2 至 rc.5、未来同系列 RC 和正式版的准入边界、rc.1 与下一补丁/次版本预发布的拒绝、SDK 精确基线一致性；根归档及官方平台包回退在当前 macOS arm64 上的实际原生加载。不代表其他三目标实际构建或桌面交互验收。

## 未执行事项

不读取或刷新真实凭据，不调用模型或目录后端，不修改活动 DSH 安装，不执行远端推送、版本消费、发包或 release 合并。既有 rc.1 桌面验收仅是历史证据，本次不会重标为 rc.5 或整个范围的桌面验收。四目标 CI、rc.2 完整宿主、未来 RC、真实 UI 焦点/菜单定位及真实搜索、图片、取消和缓存收益均不由本次本机离线检查替代。
