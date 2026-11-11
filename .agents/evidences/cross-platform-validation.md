# 四目标构建与 macOS 安装核对

编号：EVIDENCE-043。日期：2026-11-11。范围：用户确认的平台范围、现有安装的只读观察、官方工具核对及本机离线验证。不读取登录凭据，不重新安装，不发送真实授权或推理请求，不公开发布或推送。

## 已确认范围

Windows x64 MSVC、macOS arm64、macOS x64、Linux x64 GNU/glibc，共四个原生目标。Windows ARM64、Linux ARM64 与 musl 不在范围内。完整交付包含各目标构建、包内原生加载及目标 DSH 的关键交互验收；当前 Mac 的成功结果不能推广为其余目标已通过。

## 现有 Mac 安装观察

- 本机为 macOS arm64。桌面 profile 通过本地 npm 归档安装并启用此插件，而非直接引用当前源码工作区；归档内有官方生成的 CommonJS 加载器、类型声明、宿主与界面产物、macOS arm64 原生库、补丁及许可，共十个文件。逐文件 SHA-256 对照与安装内容全部一致。
- 已安装包仍只声明 Windows x64 的分发目标，但实际含 Mach-O arm64 原生库；生成加载器已有 macOS arm64 和 x64 的平台分支。这证明单一目标声明不等于本机无法构建，也不证明已有完整跨平台分发。
- 标准 Node 22.20.0、Node-API 10 无加载路径覆盖时成功加载已安装 arm64 原生库，并返回原生客户端、取消、登录等导出。没有调用真实账号功能。
- DSH 工具链所附 Node 24.21.0 独立加载时被 macOS 的签名团队校验拒绝。只读签名检查显示该 Node 未声明禁用库验证 entitlement，插件为链接器 ad-hoc 签名；桌面 Electron 主程序则具有允许第三方原生库的 entitlement。故独立 Node 失败不能直接判定桌面插件不可用。未修改签名、宿主应用或系统安全设置；本次没有观察桌面进程内部的原生模块映射，也没有重新做桌面交互验收。
- 无法仅凭现有归档完整还原先前构建命令，也不以该归档证明其二进制必然来自当前提交。未将历史本地构建位置或用户资料写入本文。

## 官方工具依据

适用版本：项目锁定 napi-rs CLI 3.10.12；同时核对查询日的维护方文档和已安装 CLI 源码。

- 官方 build 的 target 参数传给 Cargo，platform 参数为产物加平台后缀；当前默认构建没有固定 Windows target。来源：https://napi.rs/docs/cli/build
- 官方 create-npm-dirs 按配置生成平台包名称、根版本、主文件及 OS、CPU、libc 元数据；本次通过已安装 CLI 的实现和实际生成结果核对，不自行生成平台包。入口文档获取失败，以项目实际锁定版本的实现及离线实验为依据。
- 官方 artifacts 会把二进制复制到平台包及根包；后缀匹配本身不证明真实 ABI。锁定 CLI 3.10.12 的实现先拒绝重复、未声明和缺失的目标，再进行完整收集。来源：https://napi.rs/docs/cli/artifacts
- 官方 pre-publish 有真实发布副作用。本次读取的在线页面仍描述缺失目标会警告跳过，但锁定 CLI 3.10.12 的实际实现已在任何发布前先校验并暂存全部平台包。实施判断以实际锁定版本为准，直接复用官方检查，不新增重复门禁。最初按在线说明增加的完整性检查及其合成测试已移除。本次没有运行 pre-publish 或 publish，包括发布 dry-run；打包统一显式禁用生命周期。来源：https://napi.rs/docs/cli/pre-publish
- 四目标 CI runner 标签及架构按 GitHub 维护方现有清单核对，使用 Windows Server 2022、macOS 15 arm64、macOS 15 Intel、Ubuntu 22.04 x64；macOS 14 已退役，不采用旧标签。runner 是验证环境，不是最低 OS 的验收结论。来源：https://github.com/actions/runner-images
- action 引用及原生归档模式参考 napi-rs 维护方模板；pnpm 使用 Node 先安装、再 action-setup 的顺序，以适配 pnpm 11 的 Intel macOS。来源：https://github.com/napi-rs/package-template ，https://github.com/pnpm/action-setup

## 实现与离线实验

- 保持 Rust 核心、宿主业务及 UI 不变，扩展四个 napi 目标，拆分原生命令与通用 JS 命令。CI 在对应原生架构构建、检查和测试，全部目标成功后收集官方平台包，仅归档根包和平台包，不包含版本更新或公开发布 job。
- 直接复用锁定 CLI 的目标完整性与发布前校验；自有代码仅增加打包加载测试，不解析 target triple、不自建原生加载器，不用其他平台名称包装本机二进制。
- 本机为 macOS 27.0 arm64，已按锁文件安装依赖，Rust 1.98.0、pnpm 11.28.5、Node 22.20.0；使用官方 CLI release 构建 aarch64-apple-darwin 成功。通用 Tailwind 与 tsdown 构建成功，保留第三方 use-client 指令的已有构建警告，没有修改构建器或静默替换编译工具。
- npm pack 禁用生命周期后生成包含十个运行文件的本机归档。精简重复检查后的全部 Node 测试通过：31 个顶层测试、含子用例合计 33 项，零失败、零跳过。新增打包实验从归档解包，分别验证官方加载器直接加载包内 arm64 原生库、移除本地原生文件后加载官方生成的平台包；两条分支均成功。该结果是离线打包加载，不是安装到活动 DSH 的验收。

- Rust fmt、全部目标及全部 feature 的 Clippy 严格检查通过；Rust 单元测试 44 项全部通过。宿主与界面的 tsrs 检查及 Biome 检查通过。CI YAML 解析成功，四条矩阵与官方 napi 配置的 target、CPU 完全一致，收集 job 依赖所有构建且仅有只读权限；此为本地静态验证，不是远程执行结果。
- 环境限制：首次 Rust 构建和 npm 打包分别因用户级缓存写入被沙箱拒绝，均仅在批准后重试相同命令成功，未改缓存权限。本机 PATH 中既有 pnpm wrapper 使嵌套的总 check 命令失败；未修改用户包管理设置，改为通过 DSH 提供的 Node 与 pnpm 入口逐项执行同样的 Rust、类型、格式检查，结果均通过。未更换编译器。直接运行各验证脚本和完整 Node 测试的结果已分别记录。

## 验证边界与剩余工作

本机尚无其他三个目标的原生构建、运行与真实 DSH 安装证据。新增 CI 尚未推送或执行，不能记为远程矩阵通过。Linux GNU/glibc 的预期构建环境为 Ubuntu 22.04；实际 glibc 要求和最低系统边界必须随真实产物核对，不推断覆盖更老发行版。macOS x64 不以 Rosetta 或 arm64 构建代替原生验证。四目标的授权回跳、设备码、模型与多轮工具、图片、取消、设置及重启恢复仍需目标宿主实测；生产交付保持未完成。
