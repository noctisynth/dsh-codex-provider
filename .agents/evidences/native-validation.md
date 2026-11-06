# 原生核心构建与宿主契约验证

编号：EVIDENCE-003。日期：2026-11-06。方法：编译、Node 加载、维护方源码检查。未登录、未发送真实推理请求、未发布。

## 原生核心

环境：Windows x64，Rust 1.99.1，Node 22.22.3，pnpm 11.28.5。锁定 napi 3.16.1、napi-derive 3.7.0、napi-build 2.6.0、CLI 3.10.12、reqwest 0.12.28。

`cargo test --lib` 两项通过：可见订阅模型保留服务端顺序；普通 API 目录不能静默解析为空。格式检查及 Clippy 严格检查通过。官方 CLI 生成原生模块、加载器及声明，Node 测试实际加载模块并构造客户端通过。未验证模型目录的真实账号访问。

工作分区为 exFAT。pnpm 默认符号链接安装失败，配置 hoisted 后成功；pnpm 11 的 nodeLinker 使用 workspace 配置。

来源：https://pnpm.io/cli/config

CLI 3.10.12 产物生成使用硬链接，直接写入 exFAT 失败；通过官方 package-json-path 与 output-dir 参数在临时 NTFS 位置生成成功。未修改 CLI、加载器或自建绑定框架。常规构建需要支持硬链接的文件系统。这是本地环境观察，不是平台分发安装验证。

Semifold 0.3.5 已识别一个 Node 发布单元及一个产品 changeset，规划 0.0.0 到 0.1.0。未消费 changeset、更新版本或执行发布 lifecycle。

## DSH 凭据服务

来源：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/credentials/credentials/src/index.ts

来源：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/credentials/credentials-local/src/index.ts

官方接口提供 readRecord、modifyRecord 及 grant payload。官方本地 provider 在跨进程文件锁内重读、等待异步回调并原子写入，刷新网络往返可在该回调中执行。JS 可拥有刷新事务边界，Rust 实施协议，不需要另建令牌文件或数据库。

限制：观察的是查询日 master 源码，目标安装版本待核对；不推广到任意第三方 CredentialProvider。未读取真实凭据或验证宿主集成。
