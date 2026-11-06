# 侧边栏账号入口契约

编号：EVIDENCE-015。日期：2026-11-06。适用：DSH 0.2.2-rc.1、Windows x64。

用户询问左下角账号是否可切换为 ChatGPT。只读核对目标宿主官方分发的 ui-settings、ui-settings-account、ui-settings-general 和 ui-slots；未修改宿主或读取账号凭据。

## 扩展能力与限制

- settings.launcher 是 single/root slot，接受 SettingsLauncherOwnerProps。当前内置 AccountMenu 使用默认优先级 0；不同优先级的注册支持 shadowing，较小值优先。插件可用优先级 -1 注册，释放注册后恢复原组件。
- 该扩展点替换整个 AccountMenu，不仅替换头像和姓名。原组件还承载 DeepSeek 登录、会话过期及额度提醒，以及登录和退出交互；替换期间这些组件不会渲染。未发现独立头像、姓名或账号展示 slot。
- owner 提供 wide、settingsOpen、settingsShortcut、openSettings 与 openOnboarding。openSettings 无参数，只打开设置面板；不能通过该公开契约指定 ChatGPT 分区。不使用内部 onboarding 路径绕过此边界。
- 内置 AccountMenu 是分发包内部组件，未导出供插件复用。不能把显示切换描述为完全保留原 DeepSeek 菜单行为。

## 偏好机制

宿主 Config 的 volatile 字段可经设置服务实时编辑；浏览器 configForms 提供 get、getSnapshot、subscribe 和 set，并报告 writable。写入通过宿主设置持久化，同一宿主的客户端共享选择。正式接入需要声明实际使用的配置 schema 依赖，不需要自行写凭据或额外存储。

最小可行方式是设置页提供 DeepSeek 与 ChatGPT 选择，ChatGPT 模式注册独立头像姓名入口并打开普通设置，切回时释放注册。2026-11-06，说明上述边界后，用户选择“切换整个组件，允许随时恢复 DeepSeek”，授权按此方式实施。

## 实现与验证

宿主导出默认 deepseek 的 volatile 配置，设置服务关闭该项的自动表单投影，由现有 ChatGPT 页面提供选择。前端订阅正式配置镜像，按偏好注册或释放 launcher；复用头像回退与账号摘要，登录完成、退出和切换账号后通知同一浏览器更新入口。未复制 DeepSeek 认证或内部设置导航。

新增隔离宿主集成测试使用真实 SettingsForms、ConfigEditor、Loader 与临时 profile，确认命名空间公开、偏好写入持久层、重建宿主读回，以及切回 DeepSeek；两次配置修改均保持原业务 fiber 不变，未重新挂载授权插件。测试使用合成存储，不读取真实 profile。

实际浏览器产物组件测试覆盖设置选择、优先级注册、点击打开设置、折叠入口的可访问标签、账号退出后同步，以及切回和卸载释放注册。既有账号交互与目录元数据测试、构建及 Oxc tsrs 类型检查均通过。

用户对中间预览提出尺寸和风格反馈后，核对原 AccountMenu 样式：展开行高 44 像素、内边距 6 像素、间距 8 像素、头像 24 像素、字体 14 像素；折叠按钮 36 像素方形。新版采用这些尺寸、宿主圆角变量和悬停色，移除额外设置图标；偏好选择按钮收紧至 24 像素高。

独立无界面浏览器预览覆盖深浅主题、320 像素设置容器与 56 像素折叠侧栏。实际测量展开按钮 256×44 像素、折叠按钮 36×36 像素、头像均 24×24 像素，未见溢出；切回、重新选择和打开设置的交互通过。预览使用合成头像及近似宿主背景，圆角示例为 8 像素，不作为实际宿主主题值的证据。

产物已打包；真实桌面的设置持久化、菜单恢复与视觉验收待安装后确认。

用户确认完全退出 DSH 后，通过官方插件 CLI 安装合并更新成功。包清单、浏览器入口、宿主入口、原生模块及 napi-rs 加载器和声明的 SHA-256 均与构建产物一致；未修改既有凭据。默认仍显示 DeepSeek，由用户在设置中选择 ChatGPT，真实宿主切换和视觉验收待确认。
