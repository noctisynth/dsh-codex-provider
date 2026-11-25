# 模型请求代理验证

编号：EVIDENCE-058。日期：2026-11-26。关联：RFC-001、SPEC-001、TODO-001。

## 依据与验证

- reqwest 0.12.28 的[客户端构造文档](https://docs.rs/reqwest/0.12.28/reqwest/struct.ClientBuilder.html#method.proxy)说明显式代理会禁用自动代理选择。DSH 0.2.2-rc.5 的设置镜像通过通知接收宿主文档变更，可能在插件写入 RPC 结束后才更新。
- 本地 HTTP 转发模拟器使用合成凭据捕获两种登录路线的 HTTPS CONNECT 目标。它拒绝转发、不连接上游。两路走指定代理；拒绝、无效配置及取消不改用原网络路径。换地址后选择新代理，清空恢复原环境代理；目录始终使用原客户端，CONNECT 握手不携带 OpenAI Authorization。
- 隔离的 DSH Loader、ConfigEditor 和 Settings 集成验证了地址格式校验、错误不回显凭据、持久化、清空及无须重挂载。浏览器成品组件测试验证中文标签、拒绝后的草稿和错误、设置镜像迟于保存响应时的值与反馈。完成一次静态交互审查。
- macOS arm64 正式原生产物和宿主／客户端构建通过；Rust 格式、检查、Clippy、61 项 Rust 测试、TypeScript 类型与 Biome 检查、打包和 43 项 Node 测试通过。

## 未验证范围

未更新活动 DSH 安装，未在运行界面中实测显示和键盘焦点。未使用真实账号、代理或 OpenAI 请求；模拟测试未覆盖成功的代理隧道及其 TLS 握手，也未验收其他平台。
