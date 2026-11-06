# 账号设置界面重设计验证

编号：EVIDENCE-011。日期：2026-11-06。适用：DSH 0.2.2-rc.1、React 18.3.1、Windows x64。

## 来源与实现依据

- shadcn/ui 官方 New York v4 registry 的 Button、Badge、Card、Alert、Skeleton 源码；按插件前缀、独立 Radix Slot 包及关闭 Preflight 后所需的元素边界作局部调整。保留 MIT 许可并随安装包分发。
- https://ui.shadcn.com/r/styles/new-york-v4/button.json
- https://ui.shadcn.com/r/styles/new-york-v4/badge.json
- https://ui.shadcn.com/r/styles/new-york-v4/card.json
- https://ui.shadcn.com/r/styles/new-york-v4/alert.json
- https://ui.shadcn.com/r/styles/new-york-v4/skeleton.json
- https://github.com/shadcn-ui/ui/blob/main/LICENSE.md
- https://tailwindcss.com/docs/preflight
- https://tailwindcss.com/docs/styling-with-utility-classes
- https://tsdown.dev/options/css
- https://tsdown.dev/options/dependencies
- https://pnpm.io/cli/approve-builds

实际解析：Tailwind 与官方 CLI 4.3.4、tsdown 与官方 CSS 插件 0.23.5、Radix Slot 1.5.0、Lucide React 1.69.0、tailwind-merge 3.7.0。Slot 的 peer 范围包含 React 18；实际构建及组件运行使用 React 18.3.1。

## 观察与验证

- 独立状态 hook 保留原有 RPC、轮询、登录取消及退出反馈语义；界面重做未改变授权协议及 Rust 核心。
- pnpm 正常执行样式构建、双入口 tsdown 构建和 Oxc tsrs 类型检查成功。浏览器产物约 168 kB，gzip 约 31 kB；只有 React 和 JSX runtime 为外部运行时依赖，其余 UI 库已内联。Parcel watcher 的安装脚本显式不执行；当前只使用一次性构建，已验证不依赖该脚本。Lucide 的 use-client 指令产生打包提示；宿主是纯客户端工厂，实际组件运行通过，不涉及 React Server Components。
- 11 项 Node 测试全部通过。实际浏览器产物在宿主式工厂中挂载 React 组件，校验无参数登录与取消、账号切换与退出的请求、远端撤销未确认时的准确提示，以及插件样式卸载清理。外部 require 限定为实际宿主提供的两个 React 入口。
- 使用现有 headless Chromium 和合成账号渲染真实浏览器产物。检查深色账号列表、浅色未连接、窄容器授权选择和浅色错误提示。初次发现的深色描边按钮颜色及提示框盒模型已修正；最终截图无明显裁切。指定 1240 像素视口下页面无横向溢出，宿主示例按钮保持浏览器默认背景。
- 样式没有导入 Preflight，没有手写全局元素重置或内联 style。颜色来自宿主主题变量；工具类与主题变量使用 cp 前缀。Tailwind 自身仍生成全局自定义属性注册及兼容性属性初始化，因此该方案不是 Shadow DOM 级别的隔离；独立页面验证不能代替 DSH 全部宿主样式的实测。
- npm 安装包生成成功，包含浏览器及宿主入口、官方 napi-rs 产物和组件许可，不包含开发依赖源码。

## 安装与桌面验收

用户确认完全退出 DSH 后，已通过官方插件 CLI 更新桌面配置的本地安装。安装命令成功；安装后的浏览器入口、宿主入口、napi-rs 加载器、类型声明、原生模块和组件许可均与构建产物 SHA-256 一致。安装过程提示宿主 peer 依赖信息，不据此推导桌面加载结果。

2026-11-06，用户重新打开 DSH 后，针对设置页和插件详情配置页的布局、主题颜色及账号操作，确认“显示和操作均正常”。据此完成本次界面重设计的桌面验收；此结论不扩展为其他平台或全部发布流程的验收。

预览使用合成账号和模拟宿主主题值，不包含私人账号或凭据。未通过桌面自动化操作 DSH；真实宿主验收依据为用户反馈，独立渲染为补充证据。
