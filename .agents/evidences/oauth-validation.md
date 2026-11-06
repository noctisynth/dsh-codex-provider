# OAuth 原生授权验证

编号：EVIDENCE-004。日期：2026-11-06。方法：官方协议、公开元数据、发布包、离线测试及公开发现请求。

## 来源与契约

https://developers.openai.com/siwc/token-sharing-open-source/sign-in

https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions

https://auth.openai.com/.well-known/openid-configuration

完整正文要求不同账号注册分别保存 issued client ID 与验证身份，并允许选用已有注册或添加账号；重新授权不能覆盖另一注册。宿主中的具体交互仍待实现。

公开元数据的 issuer、授权、token、JWKS 与撤销端点符合官方正文。原生模块实际完成发现、JWKS 获取、授权尝试创建与监听取消；未打开浏览器、授权或交换真实 code，未持久化账号或设备标识。

## 验证与限制

Rust 五项测试通过：模型目录两项，加上新注册必须取得 issued client ID、重新授权不能替换 client ID、错误 state 不消耗有效回调。Node 取消预检及无效 host ID 拒绝通过。官方 CLI 生成新增接口的绑定与类型，格式及严格 Clippy 检查通过。

ID token 的签名、issuer、audience、expiry、nonce 和可选 access-token hash 使用 openidconnect 校验；未用真实 token 完成端到端验证。缺少订阅权限时保留验证后的登录结果，单独返回权限状态，后续推理入口仍需检查授权。

仍需刷新、退出、宿主持久化及 invalid_grant 后保留本次 issued client ID 的重新授权恢复；当前不是完整认证交付。

## 目标宿主版本

https://registry.npmjs.org/@deepseek-ai/dsh-credentials/0.2.1-rc.2

https://registry.npmjs.org/@deepseek-ai/dsh-credentials-local/0.2.1-rc.2

官方发布包 0.2.1-rc.2 的本地 provider 在跨进程文件锁内重读记录、等待异步 modifyRecord 回调并原子写入，锁等待 30 秒。补充 EVIDENCE-003 的 master 观察，仍不替代真实宿主集成。
