# 登录选择与头像缺失诊断

编号：EVIDENCE-014。日期：2026-11-06。适用：DSH 0.2.2-rc.1、当前公开 OAuth 授权。

## 头像诊断

用户澄清官方标志正常，缺失的是用户头像。只读检查当前授权的字段存在性：保存的姓名存在、头像不存在；ID token payload 中 name 存在、picture 不存在，profile scope 存在。payload 解码仅用于诊断，不作为应用身份验证或资料写入路径。

公开 discovery 返回 UserInfo endpoint。使用当前授权对该官方 endpoint 作一次只读查询，HTTP 200，sub 与保存主体相同，name、email、picture 均未返回。未将请求内容、凭据、个人资料或设备标识写入文档。此结果表明当前头像占位源于公开接口未提供数据，不能用 Codex 的显示结果推定公开 OAuth 有相同字段。

用户要求排除漏读后，进一步检查完整原始 JSON 的递归字段结构：ID token 的标准字段包含 name 与 email，无 picture；唯一扩展对象仅包含 per_user_salt。UserInfo 原始 JSON 只有 sub。另核对 openidconnect 4.1.0 的 JWT 实现：保存原始 header/payload signing_input，序列化复用该输入，不会通过类型投影删除原始 token 中的其他字段。因此本次观察不只是本地 AccountInfo 投影结果。

来源：https://auth.openai.com/.well-known/openid-configuration ，https://developers.openai.com/siwc/quickstart 。本次未增加无收益的 UserInfo 网络请求到产品，也未引入私有资料接口。

用户提供社区报告后，核对 apache/maka PR 1950 的完整 diff：subscription-auth 测试确有从 ID token 补取 picture/email 的用例，但 makeJwt 人工生成 payload，测试标头使用 alg none、签名为固定占位。因此它是解析行为证据，不能证明真实授权必返头像。项目已经请求 profile，并从经过验证的 ID token 读取 picture，不存在该报告假定的只检查 access token 的问题。官方网站登录文档将 profile 描述为返回 available claims，示例亦使用可空 picture。来源：https://github.com/apache/maka/pull/1950/files 、https://developers.openai.com/siwc/website 。

## 登录选择调整

选择阶段使用轻量行列表，移除背景大卡片及按钮描边叠加；等待用户选择时不显示加载动画。已有账号通过 option ID 关联摘要，显示“重新登录”加姓名或邮箱；添加项显示“添加新账号”。其他授权提示保留原本含义。

箭头使用 Tailwind group-hover 和 group-focus-visible 向右移动，transition-transform 控制过渡；motion-reduce 禁用位移与过渡。样式与行为继续使用现有 Button，不引入动画依赖。

构建、Oxc tsrs 类型检查及已有浏览器工厂组件集成测试通过；合成账号的独立浏览器渲染确认“重新登录”与“添加新账号”文案及简化列表。安装包已生成，实际宿主显示与悬停交互待安装后确认。

用户确认完全退出 DSH 后，官方插件 CLI 安装成功；浏览器入口、宿主入口、原生模块及 napi-rs 加载器和声明的 SHA-256 与构建产物一致。实际宿主交互等待用户确认。
