# 会话生命周期验证

编号：EVIDENCE-005。日期：2026-11-06。适用：开发中的原生会话核心。依据：EVIDENCE-004 的官方协议及目标凭据 provider 契约。

## 已运行验证

Rust 六项测试通过，新增令牌轮换测试覆盖替换 access/refresh token，以及保留缺失的新 refresh token、scope、ID token 和账号资料。严格 Clippy、格式及官方 CLI 生成通过。Node 新增新鲜记录免刷新和远端撤销未确认时的本地退出验证；检查 token 清除且保留注册身份。

公开发现和 JWKS 请求后，原生模块接受本地合成 access_denied 回调，返回授权未授予，未交换 token，监听随尝试结束。未打开浏览器，未使用真实账号，不记录授权 URL 或设备标识。

## 实现边界与限制

刷新使用原 client ID、resource，并省略 scope。响应若包含 ID token，验证身份及可选 nonce；缺少新资料时保留此前验证资料。返回完整替换记录，由后续 JS 在 DSH modifyRecord 事务中持久化后使用。

退出从官方发现元数据读取撤销端点，网络失败或 5xx 使用 1 秒、2 秒的有限退避，4xx 不重试。取消或失败仍返回清空 token 的记录及未确认状态，保留注册映射。尚未对真实远端撤销完成验证。

invalid_grant 时保留本次颁发 client ID，仅显式重试才创建新 state、nonce 和 PKCE；重新授权回调可省略 client ID，但不能更换它。该错误分支尚未与真实服务完成集成验证。

刷新和退出的完整操作限时 25 秒，低于目标凭据 provider 的 30 秒锁等待。限时不代表持久化已经完成；宿主事务及真实轮换一致性仍待验证。生产交付状态由 TODO-001 维护。
