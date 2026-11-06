# Legacy 浏览器、设备码登录与账号并存验证

编号：EVIDENCE-027。日期：2026-11-07。适用：Windows x64、DSH 0.2.2-rc.1、当前原生 release 构建。需求依据 RFC-001，技术职责由 SPEC-001 维护。用户确认两种 legacy 登录可以更新同一记录，但不得影响 SIWC；此次没有导入外部客户端凭据或增加额度、Fast、生图能力。

## 依据与边界

[Codex 认证文档](https://learn.chatgpt.com/docs/auth)说明浏览器及设备码登录，设备码需要在账号安全设置或工作区中启用。[App Server 文档](https://learn.chatgpt.com/docs/app-server)区分浏览器与设备码，要求界面展示验证地址、用户码并等待登录结果。这些官方文档描述 Codex 客户端和 App Server，不等于承诺第三方 backend 的稳定公共契约。

本次直接登录的低层地址、固定客户端、PKCE 参数、设备授权码交换及轮询协议，依据 EVIDENCE-026 所核对的 DSH 随附 pi-ai 1.3.0 发布实现，并以当前真实设备码签发做有限核对。SIWC 仍遵循 [注册文档](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)与[公开推理文档](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)；两路 token 不混用。

## 实现

原有 SIWC 登录、刷新、退出收拢到独立职责模块，协议行为保持不变；浏览器与设备码分别实现，legacy 共享令牌与身份处理。原生边界把字符串参数解析为封闭的方式枚举，不接受界面传入任意端点。浏览器使用 state 和库生成的 S256 PKCE，通过固定端口回调；设备码不启动监听器，由原生按返回间隔轮询，处理 pending、slow_down、拒绝、15 分钟到期和取消。

两路均使用现有 OpenID Connect 库进行签名、issuer、audience、expiry 和可用 access-token hash 的校验；legacy 在验证后才解析 ID token 的工作区账号声明。legacy 没有请求 nonce，不套用 SIWC 的 nonce 和 direct scope 判断；重新登录及返回新 ID token 的刷新核对主体和工作区。仅新增成熟的 base64 解码依赖，没有手写密码学、引入 unsafe 或 panic 型 unwrap、expect。

SIWC 旧记录缺少方式字段时仍按 SIWC 读取，并保留原账号键及序列化格式。legacy 账号键由 Codex 路线、工作区账号、主体共同确定，浏览器与设备码写入同一记录，标签显示最近成功的方式。当前账号、目录失效与凭据事务沿用既有流程。legacy 的退出只清除本插件令牌，明确以 local-only 结果区别于 SIWC 远端撤销，避免显示错误的撤销失败提示。

宿主与界面复用既有授权选择、通知、完成、取消及账号操作；添加账号时可选择三种方式，已有账号重登沿用保存的方式。只把设备验证页和短码投影至界面，不传递 OAuth URL、设备授权句柄或令牌。账号行加入低强调的方式标签，窄容器允许换行。模型目录与 Responses 使用保存的路线，legacy 附工作区账号及 Codex 请求头，复用消息、图文、流、压缩及审查适配；不静默回退到另一种授权。

## 验证结果

- 项目统一 check 入口通过：fmt、全部目标及功能的 Clippy -D warnings、两套 tsrs、Biome。保留环境既有的增量缓存硬链接复制提示，没有源代码 Clippy 诊断。
- 34 项 Rust 测试通过，新增覆盖两种 legacy 共用账号键而 SIWC 不合并、不同工作区或主体隔离、清除凭据后保留方式、设备码 pending/slow_down/成功交换材料/拒绝、到期和取消。实际本地 HTTP 刷新测试验证 JSON grant、固定客户端、令牌旋转、终止失效清除及 5xx 不返回已清空记录。
- 官方 napi-rs release 构建与绑定生成通过。重新加载最终原生构建后，22 项 Node 测试通过。共享授权流程的合成集成验证三种方式路由、legacy 覆盖、SIWC 记录不变、设备通知、失败登录不覆盖、legacy 本地退出，以及已有的图文、压缩、错误、搜索和审查契约。
- 隔离无界面浏览器使用构建产物及合成账号，检查三种登录选择、SIWC 与 legacy 标签、设备码和验证链接、深浅主题及窄容器；没有溢出或浏览器错误。没有操作用户 DSH 或个人浏览器。
- 真实入口探测：浏览器方式启动本地回调并生成 auth.openai.com 的授权入口，取消完成；设备码方式从官方服务取得非空短码及固定验证页，取消完成。未打开浏览器、未授权账号、未输出或保存真实验证码、完整授权 URL、设备句柄或令牌；不把入口探测视为完整登录成功。

## 尚待真实验收

尚未完成用户的两种 legacy 授权、模型目录与推理请求；实际账号的刷新、失效恢复、多轮工具、图片、长会话压缩、搜索与审查尚待实测。legacy 模型目录以插件版本作为 client_version；服务端对此版本及账号返回的目录仍需真实授权验证。此次未修改已安装插件，待用户关闭 DSH 后更新。上述限制不等于方案失败，也不能将此开发状态写为生产交付完成。
