# 设置入口与 TypeScript 工具链验证

编号：EVIDENCE-008。日期：2026-11-06。适用：DSH 0.2.2-rc.1、Windows x64、本项目开发产物。

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

## 限制

以上为类型、构建、接口与工厂注册验证，不代表在用户桌面观察到界面，也没有真实账号登录或推理证据。用户正在使用设备，明确不提供 Computer Use 权限；后续桌面交互由用户操作。生产交付验收仍未完成。
