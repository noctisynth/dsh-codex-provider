# 设置入口与 TypeScript 工具链验证

编号：EVIDENCE-008。日期：2026-11-06。适用：DSH 0.2.2-rc.1、Windows x64、本项目开发产物。

## 构建提示核查

2026-11-06，按用户要求核对当前 tsdown 0.23.5、Rolldown 1.2.16 日志及官方文档。出现的提示分三类，未发现构建失败：

- MODULE_LEVEL_DIRECTIVE：Lucide 的两个模块含 use client 指令，打包器不能保证保留模块边界语义。该指令用于 React Server Components；当前产物为 DSH 浏览器 closure factory、共享宿主 React 18，没有服务端组件边界。结合实际产物的加载与交互验证，判断这两条提示不影响当前运行。
- deps.onlyBundle：未配置该可选检查时，tsdown 对内联第三方包显示建议。实际包为 Lucide、clsx、class-variance-authority、tailwind-merge 与 Radix Slot 所需模块，与既定 UI 构建相符；React 保持外置。不是已发现未知依赖的错误。
- PLUGIN_TIMINGS：构建阶段插件回调的耗时诊断，最近一次为约 25 毫秒、占构建时间 1%；不能用它推断插件运行时性能。官方说明重叠异步回调可能只列名称，不提供可相加的耗时。

本次保留现有日志和构建策略，没有为这些提示增加检查门禁、全局屏蔽警告或更换工具链。来源：https://react.dev/reference/rsc/use-client 、https://rolldown.rs/in-depth/directives 、https://tsdown.dev/options/dependencies#deps-onlybundle 、https://rolldown.rs/reference/InputOptions.checks#bundlertimings 。官方在线文档可能高于当前锁定版本；结论同时依据本次实际构建日志与产物测试。

同日安装 EVIDENCE-015 更新时，另有 pnpm peer dependency 提示。只读 peers check 列出的六项均为原有宿主依赖声明；核对实际 DSH 分发版本：Cordis 4.1.0，authorization、client-connection、credentials、llm 均为 0.2.2-rc.1，浏览器静态模块表提供 React 与 React DOM 18.3.1，全部符合插件要求。桌面 profile 使用 hoisted 布局且关闭自动安装 peers；单独检查 profile 的依赖图无法反映安装包和浏览器 ModuleLoader 提供的依赖。官方 app-boot 的双来源运行时解析契约与实际分发相符。因此这是安装图中的缺失 peer 提示，不是已确认的运行时版本冲突；没有为消除此提示在 profile 中重复安装宿主服务或 React。

## 调研依据

参考社区插件公开发布包 3.2.6 的浏览器伴随声明、设置分区、插件配置面与受信 Connection 请求接入方式，没有复用其认证或推理协议实现。仅注册授权流不会自动提供这些界面入口。

- https://github.com/WSL043/dsh-codex-subscription
- https://registry.npmjs.org/dsh-codex-subscription/3.2.6

DSH 官方客户端模块使用 closure factory 与宿主模块表；设置分区由设置域声明，插件配置插槽由插件管理器拥有。正常模型目录监听凭据更新事件，重新加载 Provider 模型目录，无需替换宿主模型选择器。

- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/tsdown.client.ts
- https://registry.npmjs.org/@deepseek-ai/dsh-client-ui-settings/0.2.2-rc.1
- https://registry.npmjs.org/@deepseek-ai/dsh-client-ui-plugin-manager/0.2.2-rc.1
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-model-selection/src/client/service.ts

用户指定的 Rust TypeScript 编译器为 Oxc 的 tsrs。Cloudflare 于 2026-10-20 介绍该项目；Oxc 明确标注其实验状态。它与 Rust 类型声明生成库及其他同名近似项目不同。

- https://blog.cloudflare.com/typescript-rust-port/
- https://oxc.rs/docs/guide/usage/typechecker.html
- https://github.com/oxc-project/tsrs/blob/main/docs/USAGE.md
- https://tsdown.dev/guide/getting-started

## 实验与观察

手写宿主代码、浏览器界面、构建配置和测试已改为 TypeScript。宿主与客户端使用各自的编译上下文，复用官方 DSH 类型。napi-rs 继续生成原生 CommonJS 加载器及声明，手写宿主产物为 ESM，浏览器产物为标准 DSH closure factory。

tsrs 0.22.0-ts7.1.0-beta 在 Windows 上可执行，宿主及浏览器严格类型检查通过。tsdown 0.23.5、Rolldown 1.2.16 构建两个入口通过；未保留 esbuild 构建依赖，未静默回退到其他类型检查器。

十项 Node 测试通过。其中覆盖生成绑定、真实 Cordis 挂载与卸载、授权交互取消、RPC 回包契约、状态不携带凭据、浏览器工厂为设置分区和插件配置面注册入口。编译后的宿主 ESM 可独立加载。原生 release 库及加载器由 napi-rs 官方 CLI 生成，归档包含两个宿主入口与原生产物。

重新使用同名本地归档时观察到 pnpm 保留旧包。改用内容摘要命名的本地归档，保持归档标识不可变；没有消费 changeset 或手工更新产品版本。

更新包替换期间出现 Windows EPERM 重命名失败。用户完整退出 DSH 后重试成功；核对已安装的宿主入口、浏览器导出、原生加载器及 release 库，摘要均与构建产物一致，旧插件不再列于桌面依赖。实际界面显示与账号实测等待用户反馈。

用户随后确认设置中可见登录按钮，并提供点击后 HTTP 400 的界面反馈。复现确认：无参数调用的 undefined payload 被 JSON 序列化省略，官方 clientRequestSchema 拒绝缺失字段的信封，而显式 null 可通过。已将无参数操作统一发送 null，保留后端官方校验；使用 React 18 官方测试渲染器操作实际浏览器产物中的登录按钮及卸载取消，验证 JSON 序列化后的信封通过官方 schema。该测试补齐此前工厂注册测试未覆盖的组件调用边界。

该修复已通过桌面 CLI 安装，核对已安装浏览器文件的摘要与修复构建一致。真实官方登录仍待用户继续操作验证。

## 限制

构建和组件测试不等于机器直接观察用户桌面。界面可见性由用户确认，目前没有真实账号登录或推理证据。用户正在使用设备，明确不提供 Computer Use 权限；桌面交互由用户操作。生产交付验收仍未完成。
