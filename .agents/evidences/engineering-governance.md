# 两侧工程治理与 Base UI 迁移验证

编号：EVIDENCE-025。日期：2026-11-07。适用：Windows x64、DSH 0.2.2-rc.1、React 18.3.1。范围依据 RFC-001、SPEC-001；此次不新增产品功能，不改变 OAuth、Responses 或审批策略。

## 检查与职责整理

原 Rust 的认证、HTTP、模型目录和 Responses 职责已经分开，没有新增 crate 或通用框架。将原生绑定的公开数据结构及转换从客户端操作中分离，保持同一 napi-rs 接口；模块内部继续使用 Result，未引入 unsafe、unwrap 或 expect。既有 Clippy unwrap_used、expect_used 与 unsafe_code 限制保留。

TypeScript 将模型元数据映射提取为独立目录模块，适配器保留目录复用、取消及请求职责；偏好值校验使用可辨别联合，与搜索源协调分开。账号请求回调保持稳定，补全 Hook 依赖；手动查询失效计数保留一条带原因的局部依赖说明。移除未使用参数、导入及可避免的非空断言，测试中的图片请求使用明确结构，设置读取先断言命名空间存在。未全局关闭推荐 lint 规则来掩盖诊断。

## 工具与组件依据

使用 Biome 2.6.5，依据 [Biome 配置文档](https://biomejs.dev/reference/configuration/)。单引号同时适用于 JavaScript 字符串及 JSX 属性，缩进为 2 空格，行尾由 Git 属性统一。启用 Tailwind 4 指令解析、实际样式入口与 useTailwindSortedClasses，识别 cn、cva 等默认合并及变体函数。自有宿主、客户端、共享类型、测试和配置纳入检查；原生生成文件、样式生成物、构建产物和实验目录不纳入格式治理。没有增加第二套格式器、提交钩子或 CI 门禁。

使用 Base UI 1.9.0，其发布包 peer 声明支持 React 17、18、19。接口依据 [Base UI Select](https://base-ui.com/react/components/select)、[Menu](https://base-ui.com/react/components/menu)、[Switch](https://base-ui.com/react/components/switch) 和 [shadcn 的 Base UI Select 文档](https://ui.shadcn.com/docs/components/base/select)。Button、Menu、Select 和 Switch 统一使用 Base UI；shadcn 派生样式保留，继续使用 Tailwind 工具类和宿主主题。React、React DOM、JSX runtime 仍由宿主共享，没有附带第二个 React 实例。

迁移落实公开 API 差异：菜单关闭使用 finalFocus，选择动作使用 onClick，保持打开的恢复操作使用 closeOnClick；Switch 显式渲染原生按钮。Select 的 Portal 继续归属所在 dialog，普通页面将空容器转换为默认挂载值；Escape 不继续关闭宿主弹窗。Base UI 关闭列表后可以保留不可见 DOM，因此浏览器断言按实际可见性检查，而非以节点不存在判断关闭。

## 依赖与许可

与治理前锁文件比较，4 个直接 Radix 包及其全部 30 个 Radix 锁定包被移除；新增 Base UI 组件与工具包以及 Biome。锁定包总数由 368 降为 346。未压缩浏览器入口由约 449 KB 增为约 664 KB，gzip 约 143 KB；这是依赖体系简化，不是体积优化结论。

保留 shadcn 的完整 MIT 许可，并将其移至 UI 组件所在目录；同处加入 Base UI 的 MIT 许可，二者均列入发布包。使用组件 CLI 不改变许可保留义务，此次没有为了生成现有组件新增 CLI 依赖。实际 npm 归档包含 10 个文件，两个 UI 许可均存在，原根目录许可不再分发。

## 验证与限制

统一 check 入口实际完成 cargo fmt --all --check、cargo clippy --all-targets --all-features -- -D warnings、两套 tsrs 类型检查和 biome check --error-on-warnings。Biome 检查 53 个文件，无诊断；29 项 Rust 测试、官方 napi-rs release 构建及绑定生成通过。重新载入本次生成的原生模块后，20 项 Node 测试通过。包管理器在受限环境中访问引擎缓存锁曾被拒绝，具备正常缓存权限的完整入口执行成功；编译中的增量硬链接复制回退提示属于 exFAT 环境，不是源代码 lint 错误。

独立无界面浏览器使用最终浏览器产物，验证普通页面、设置遮罩弹窗、原生模态 dialog 的鼠标与键盘选择；Escape 仅关闭列表、焦点恢复、外层保持打开。Switch 的真实点击、保存、错误提示与成功重试通过；账号菜单的设置入口、退出确认与取消、DeepSeek 恢复、深浅主题、折叠栏定位通过，无浏览器错误或可见溢出。框架内部保留隐藏 DOM 不视为可见列表未关闭。

本次未调用真实 OpenAI 推理或授权，不操作用户 DSH 窗口，不修改宿主或已安装插件。新包尚未安装；上述隔离验证不替代下一次安装后的真实桌面验收。构建仍有第三方 use client 指令提示，当前纯浏览器工厂入口未采用服务器组件；没有通过全局静默配置隐藏提示。

## 后续安装

用户授权安装后，确认未发现运行中的 DSH 进程，使用 Electron 随附的桌面 CLI 更新 desktop 插件成功。归档 SHA-256 前缀为 ad67e1ab90b2，10 个安装文件摘要均与构建产物一致，包括两份组件许可；独立 Node 加载已安装的原生绑定并构造客户端成功。安装器提示宿主 peer 依赖信息，命令成功。未读取或修改账号凭据，真实桌面交互等待用户重新打开后验收。

## 选中值显示回归

用户反馈安装后下拉列表标签正确，但收起后的账号和搜索控件显示 chatgpt、all 等内部值，其余目前观察正常。核对 [Base UI Select 值格式文档](https://base-ui.com/react/components/select#formatting-the-value)：Value 默认渲染原始值，需要向 Root 提供 items 或显式格式化。此次迁移漏传 items，既有交互验证只检查保存值，遗漏了选中标签。

设置控件从既有同组选项生成 items 映射，不新增标签副本或改变配置值。构建产物测试加入初始关闭和 DeepSeek 文案断言；隔离浏览器检查初始 ChatGPT 与关闭，以及全部搜索选项、账号双向切换后的收起文案和实际保存值，均通过，浏览器错误为空。两套 tsrs、Biome 和 Tailwind/tsdown 构建通过，未改动 Rust。浏览器首次在受限环境未启动，允许独立临时配置的无界面浏览器后验证成功；没有操作用户 DSH 窗口。该修复等待更新安装后的桌面验收。
