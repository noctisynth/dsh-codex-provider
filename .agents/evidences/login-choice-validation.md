# 登录选择与头像缺失诊断

编号：EVIDENCE-014。日期：2026-11-06。适用：DSH 0.2.2-rc.1、当前公开 OAuth 授权。

## 头像诊断

用户澄清官方标志正常，缺失的是用户头像。只读检查当前授权的字段存在性：保存的姓名存在、头像不存在；ID token payload 中 name 存在、picture 不存在，profile scope 存在。payload 解码仅用于诊断，不作为应用身份验证或资料写入路径。

公开 discovery 返回 UserInfo endpoint。使用当前授权对该官方 endpoint 作一次只读查询，HTTP 200，sub 与保存主体相同，name、email、picture 均未返回。未将请求内容、凭据、个人资料或设备标识写入文档。此结果表明当前头像占位源于公开接口未提供数据，不能用 Codex 的显示结果推定公开 OAuth 有相同字段。

用户要求排除漏读后，进一步检查完整原始 JSON 的递归字段结构：ID token 的标准字段包含 name 与 email，无 picture；唯一扩展对象仅包含 per_user_salt。UserInfo 原始 JSON 只有 sub。另核对 openidconnect 4.1.0 的 JWT 实现：保存原始 header/payload signing_input，序列化复用该输入，不会通过类型投影删除原始 token 中的其他字段。因此本次观察不只是本地 AccountInfo 投影结果。

来源：https://auth.openai.com/.well-known/openid-configuration ，https://developers.openai.com/siwc/quickstart 。本次未增加无收益的 UserInfo 网络请求到产品，也未引入私有资料接口。

用户提供社区报告后，核对 apache/maka PR 1950 的完整 diff：subscription-auth 测试确有从 ID token 补取 picture/email 的用例，但 makeJwt 人工生成 payload，测试标头使用 alg none、签名为固定占位。因此它是解析行为证据，不能证明真实授权必返头像。项目已经请求 profile，并从经过验证的 ID token 读取 picture，不存在该报告假定的只检查 access token 的问题。官方网站登录文档将 profile 描述为返回 available claims，示例亦使用可空 picture。来源：https://github.com/apache/maka/pull/1950/files 、https://developers.openai.com/siwc/website 。

### 授权参数复核

通过当前原生构建产物分别生成新增账号和已有账号的授权 URL，仅检查参数匹配结果，随后取消尝试；未打开浏览器、发送授权请求、交换或刷新 token，也未改动凭据。两条分支均生成 openid profile email offline_access resource.invoke chatgpt.tokens.use.direct；当前已保存的服务端授予 scopes 也包含全部六项，并非只依据请求值推断授权成功。

授权端点、response_type=code、PKCE S256、resource、稳定 host ID、环回回调及 state/nonce 均符合官方参数表。新增账号使用 dynamic_agent_client 并包含 agent_name_hint；已有账号使用保存的 issued client ID，省略 agent_name_hint，身份与邮箱 hint 均与所选记录匹配。代码交换使用同一 resource、回调及 PKCE verifier。openid 由 openidconnect 默认加入，实际 URL 验证了这一行为。来源：https://developers.openai.com/siwc/token-sharing-open-source/sign-in 。

官方 discovery 声明支持 picture，但未声明 claims_parameter_supported；公开登录指南未要求额外 claims 或强制同意参数才能返回头像。因此没有依据认定缺少这些参数是根因，也未将未经验证的参数加入产品。此处“支持该声明”不等于“每个账号、客户端和授权都返回该字段”。当前证据排除了缺少 profile 请求、未获得 profile 授权及本地字段漏读，但尚未确定服务端未返回头像的具体原因，也未捕获首次 code exchange 的整份原始 HTTP 响应。Codex 桌面客户端的取图链路见后述静态调查；不能直接推定两种授权具有相同资料可见性。

### 相近公开反馈

截至 2026-11-06，本次公开检索未找到证据充分、与当前动态注册流程及原始 picture 缺失完全匹配的反馈；不代表不存在该问题。

- Archon PR 1973 于 2026-06-12 合并，针对 Pi 丢弃整个 ID token、导致 Codex CLI invalid ID token format；使用 Codex CLI 的固定公共 client。没有报告单独缺失 picture。来源：https://github.com/coleam00/Archon/pull/1973 。
- apache/maka PR 1950 使用 Codex device-code 流程，其头像回退测试为合成数据；不能作为真实动态注册响应必返头像的证据。来源同前述 PR。
- Codex issue 54506 于 2026-10-16 报告头像及 Plus 权益消失，报告者选择原账号后恢复；属于账号选择问题，没有原始 token 字段证据。来源：https://github.com/openai/codex/issues/54506 。
- Codex issue 57065 于 2026-10-26 报告头像、账号页及会话同时异常；未提供 OAuth 参数或原始 claims 证据，不能归因于 picture 返回。来源：https://github.com/openai/codex/issues/57065 。

### Codex 官方客户端的头像来源

2026-11-06，只读检查本机官方应用分发代码：Windows 包版本 26.1103.3517.0，应用内部版本 26.1103.31037。未读取 Codex 的账号凭据或私人会话，未控制界面，未携带凭据调用这些资料接口。以下属于静态代码观察，不是本机当前账号的实际响应或网络抓包。

侧边栏 profileFooter 的个人账号分支依次选择可用图片：资料对象的 profile_details.profile_picture_url、当前用户对象的 picture、个人工作区的 profile_picture_url、尚未取得当前用户对象时保留的登录图片。团队工作区分支优先展示工作区图片。由此可确认该客户端并不只依赖 ID token 的 picture；无法仅凭静态代码确认用户截图命中了哪一项。

| 数据来源 | 官方客户端的请求与字段 | 静态定位 |
|---|---|---|
| 资料身份 | GET https://chatgpt.com/backend-api/profiles/me ，读取 profile_details.profile_picture_url | IPsH 查询模块；根据账号资料可见性启用 |
| 当前用户 | GET https://chatgpt.com/backend-api/me ，读取 picture、name、email | tvcH 模块的 chatGptCurrentUserQuery；缓存一分钟 |
| 工作区资料 | GET https://chatgpt.com/backend-api/wham/accounts/check ，读取工作区 profile_picture_url | 桌面 readAccounts 及公开 BackendClient |

请求链路由 Ghh3 导出 HFSu 的 Request，随后经过 GDNt 和桌面传输；生产默认基址为 https://chatgpt.com/backend-api 。桌面传输使用自身 app-server 提供的认证 token，添加 Bearer Authorization 和可用的 ChatGPT-Account-Id，并支持工作区后端路由。观察到这些实现并不等于它们具有第三方 SIWC 公开契约。

另核对官方公开源码 commit f57966695fc936a1b4e5da6758ad6d532724fe83：AccountSession 虽声明用户 image_url，但当前映射直接赋 None；工作区图片另行映射 profile_picture_url。公开 Rust ProfileIdentity 类型未建模头像，不能由此推断服务端响应没有头像；桌面代码还会从 https://chatgpt.com/backend-api/wham/profiles/me 的 profile.profile_picture_url 读取资料页图片。来源：https://github.com/openai/codex/blob/f57966695fc936a1b4e5da6758ad6d532724fe83/codex-rs/app-server/src/request_processors/account_processor/workspace_switching.rs#L43 、https://github.com/openai/codex/blob/f57966695fc936a1b4e5da6758ad6d532724fe83/codex-rs/backend-client/src/client/profile.rs#L18 。

公开 Codex 认证实现将后端认证提供者注明为第一方凭据；SIWC 官方 token reference 则规定本项目流程的 audience 为 https://api.openai.com/v1 ，其 app-server 接入指南配置的是独立 Responses provider。此次未找到支持 SIWC 动态客户端调用上述 backend-api 资料接口的官方公开说明；静态调查本身不证明接口会拒绝该 token，后续用户授权实测见下一节。既有公开身份途径仍为经验证的 ID token 与 discovery 的 UserInfo。来源：https://github.com/openai/codex/blob/f57966695fc936a1b4e5da6758ad6d532724fe83/codex-rs/model-provider/src/auth.rs#L522 、https://developers.openai.com/siwc/token-sharing-open-source/token-reference 、https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server 。

### 现有 SIWC token 的头像接口实测

2026-11-06，按用户要求，只读使用 DSH 当前活动账号已有的 access token。请求前核对其本地到期时间仍有效；discovery 返回 200，UserInfo 地址与官方公开地址一致。每个资料接口仅发送一次 Bearer GET，禁止重定向，不刷新、撤销或修改凭据，不使用 Codex 客户端凭据。

| 接口 | 实际结果 |
|---|---|
| https://auth.openai.com/api/accounts/oauth/userinfo | HTTP 200，application/json；原始字段结构仅 sub，没有图片地址 |
| https://chatgpt.com/backend-api/me | HTTP 401，text/plain；未取得资料 |
| https://chatgpt.com/backend-api/profiles/me | HTTP 401，text/plain；未取得资料 |

结论限于本次凭据与请求方式：当前保存的 token 没有通过上述接口取得头像。UserInfo 接受了该 token，桌面资料接口拒绝了当前 Bearer 请求；不是由本地已过期凭据得出的判断。两个非 JSON 错误响应未提供可核实的结构化错误码，不把具体原因归结为 audience、scope 或某项客户端限制，也不推广为全部 SIWC 客户端永久不可访问。诊断只输出状态、字段结构和头像存在性，不保存个人资料或 token。

### Gravatar 说法核查

2026-11-06，核查用户转述的“通过 ChatGPT 应用登录时改用 Gravatar”说法。Gravatar 官方 FAQ 明确说明 ChatGPT 使用 Gravatar 显示用户头像，文档标注更新日期为 2026-01-28；但该说明没有涉及 SIWC、ID token 或 UserInfo，不能据此确定第三方授权的头像来源和返回规则。OpenAI 当前资料页说明允许直接编辑 ChatGPT profile photo，因此不能把所有 ChatGPT 头像等同为 Gravatar。来源：https://support.gravatar.com/basic/ 、https://help.openai.com/en/articles/20001539-shareable-profiles-in-chatgpt 。

对前述官方桌面版本分发脚本的静态检索发现，Avatar 组件会过滤同时包含 gravatar.com 与 cdn.auth0.com 的传入地址；这表明客户端兼容此类地址，但本次没有找到它自行按邮箱生成并请求 Gravatar 的逻辑。没有检查当前账号实际图片 URL，也没有发送用户邮箱或邮箱哈希到 Gravatar。

目前可确认 ChatGPT 存在 Gravatar 这一头像来源，无法确认 SIWC 会优先使用它、用它替代当前 ChatGPT 头像，或因此省略 picture。公开身份文档仍只承诺可用的资料字段，没有要求集成方自行查询 Gravatar。该说法本身不构成新增功能的依据；后续实施来自用户明确提出的 Gravatar 回退要求。来源：https://developers.openai.com/siwc/website 。

## 登录选择调整

选择阶段使用轻量行列表，移除背景大卡片及按钮描边叠加；等待用户选择时不显示加载动画。已有账号通过 option ID 关联摘要，显示“重新登录”加姓名或邮箱；添加项显示“添加新账号”。其他授权提示保留原本含义。

箭头使用 Tailwind group-hover 和 group-focus-visible 向右移动，transition-transform 控制过渡；motion-reduce 禁用位移与过渡。样式与行为继续使用现有 Button，不引入动画依赖。

构建、Oxc tsrs 类型检查及已有浏览器工厂组件集成测试通过；合成账号的独立浏览器渲染确认“重新登录”与“添加新账号”文案及简化列表。安装包已生成，实际宿主显示与悬停交互待安装后确认。

用户确认完全退出 DSH 后，官方插件 CLI 安装成功；浏览器入口、宿主入口、原生模块及 napi-rs 加载器和声明的 SHA-256 与构建产物一致。实际宿主交互等待用户确认。

### 登录区域分区修正

用户反馈移除容器后，登录操作与上下内容缺少区分。恢复单层圆角细边框、弱主题背景与内边距；内部仍使用轻量选项行，底部模型说明留在容器外，原有箭头动画与登录行为不变。

浏览器构建、Oxc tsrs 类型检查和 diff 检查通过。独立无界面浏览器使用实际浏览器产物与合成账号，检查深浅主题的 480 像素容器和深色 320 像素容器；账号列表、登录区域和模型说明边界清楚，未见裁切、横向溢出或箭头错位。安装包已生成；尚未替换运行中的 DSH 插件，真实宿主验收待完成。

用户确认完全退出后，官方 DSH CLI 安装分区修正包成功；浏览器入口、宿主入口、原生模块及 napi-rs 加载器和声明的 SHA-256 与构建产物一致。等待用户重新打开 DSH 验收显示层级。

### 取消按钮可见性修正

用户继续反馈取消登录不明显。将其改为小尺寸描边按钮，放在登录容器底部独立操作行，使用细分隔线和留白、靠右排列；选择账号和等待浏览器授权两种状态共用原有取消行为。

浏览器构建、Oxc tsrs 类型检查、既有账号交互与浏览器产物测试通过。独立无界面预览覆盖两种授权状态、深浅主题及 320 像素窄容器，按钮边界清晰，未见裁切或溢出。更新包已生成，安装与真实宿主验收待完成。

### Gravatar 回退与箭头留白

2026-11-06，用户明确要求在官方未返回头像时尝试 Gravatar，以文字作为最终占位。同日核对 Gravatar 官方文档：邮箱去除首尾空白、转小写后计算 SHA-256；图片接口通过 d=404 在没有匹配头像时返回 404，并支持尺寸与评级参数。该回退独立于 OpenAI 身份协议，不表示取回了用户当前 ChatGPT 头像。来源：https://docs.gravatar.com/rest/hash/ 、https://docs.gravatar.com/sdk/images/ 。

实现使用 Node 内置哈希生成图片地址，由浏览器在官方图片缺失或加载失败时请求；Gravatar 无图片或加载失败后显示姓名或邮箱首字，均缺失时显示问号。没有新增依赖，不修改已保存身份资料，不传递 OpenAI token。验证使用合成账号，不向 Gravatar 发送真实用户邮箱或哈希。

用户同时反馈箭头悬停后过于靠近选项背景边缘；调整含图标按钮的右侧内边距，保留既有轻微右移动画及减少动态效果偏好。

构建与 Oxc tsrs 类型检查通过。现有宿主交互测试使用官方合成邮箱哈希向量验证规范化、无邮箱与凭据不变；实际浏览器产物组件测试验证官方图片优先、图片失败后依次回退、缺失官方图片时直接使用 Gravatar，以及姓名或邮箱文字占位。两项针对性测试通过。

独立无界面浏览器的深色与浅色 480 像素、深色 320 像素容器中，实际悬停测量右内边距均为 20 像素，箭头位移 4 像素，移动后内部留白为 16 像素；目视未见裁切，独立取消按钮保留。产物已打包，待与取消按钮更新一起安装；真实账号能否匹配 Gravatar 仍待宿主验证。
