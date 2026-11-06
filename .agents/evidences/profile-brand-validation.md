# 官方标志与账号资料接入

编号：EVIDENCE-013。日期：2026-11-06。适用：DSH 0.2.2-rc.1、Windows x64、React 18.3.1、openidconnect 4.1.0。

## 官方依据

- https://openai.com/brand/
- https://cdn.openai.com/brand/OpenAI-Logos-2025.zip
- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/token-reference

官方身份说明支持姓名、邮箱和头像。现有登录已请求 profile，但此前身份投影只取 email，未保存 name 和 picture。公开令牌参考没有可直接展示的套餐字段，且要求 auth metadata 保持不透明；不解析其内部数据或推断 Pro/Plus。

标志直接取自官方 CDN 的黑色 Blossom SVG，保留路径与画布比例，以 currentColor 显示单色。标题恢复图标区域，设置侧边栏使用 DSH settings.section.icon 插槽和宿主 size；随包提供品牌来源与归属说明。

## 实现与验证边界

Rust 在原有 ID token 验证成功后读取可选 name、picture，并通过会话保存及 napi-rs AccountInfo 传递给受信账号摘要。picture 限定 HTTPS；前端图片不发送 referrer，加载失败显示姓名首字或用户图标。旧会话无资料字段仍可读取；后续重新登录或返回 ID token 的正常刷新可补齐，不解码未经验证的历史令牌来填充。

账号采用头像、姓名、邮箱的两行布局；姓名缺失时以邮箱为主标题，当前使用标记仅针对仍有凭据且获授权的账号。资料保存在宿主原有凭据存储，不进入工程文档或日志。

验证结果：16 项 Rust 测试通过，Clippy 无代码错误；官方 napi-rs release 构建成功。Oxc tsrs 检查与 12 项 Node 测试通过，包括旧会话读取与原样保留、可选资料投影、头像加载失败回退、图标插槽注册及原有账号交互。独立 headless Chromium 检查深浅主题下的标题标志、姓名邮箱和缺头像布局。npm 安装包已生成并包含品牌归属说明。

验证使用合成资料；真实账号是否返回头像姓名仍需安装后重新登录确认。
