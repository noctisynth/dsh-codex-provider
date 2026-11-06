# 依赖与协议事实

编号：FACT-002。更新：2026-11-06。证据：EVIDENCE-002、EVIDENCE-003、EVIDENCE-004。

| 事实 | 适用限制 |
|---|---|
| napi-rs 3 提供 Tokio 异步与 Web Streams | 项目取消、背压和宿主兼容未验证 |
| openidconnect 4.1 覆盖 OAuth 和 ID token 校验 | ChatGPT 动态注册需要业务适配 |
| oauth2 5 集成 reqwest 0.12 | 与 0.13 不可直接视作同一客户端类型 |
| 官方授权使用颁发 client ID、身份校验和订阅权限 | 项目尚无真实授权证据 |
| 官方模型目录包含 models、slug 和 visibility | 不可套用一般 API 模型目录假设 |
| 订阅推理要求公开 Responses、关闭存储和流式读取 | response.completed 才代表成功完成 |
| napi pre-publish 默认发布平台包 | 必须明确唯一发布者并检查产物齐备 |
| 现有插件调用 DSH 模型及凭据服务 | 第三方观察，官方宿主契约仍需核实 |
| DSH 官方本地 provider 在跨进程锁内执行异步 modifyRecord 并原子写入 | 查询日 master 源码，目标安装版本待核对 |
| 官方发布的本地凭据 provider 0.2.1-rc.2 具备上述刷新事务语义 | 锁等待 30 秒，不推广到任意 provider |
| 官方协议要求分开管理多个账号注册及已验证身份 | 宿主账号选择和添加交互仍待实现 |
| napi CLI 3.10.12 生成产物使用硬链接 | exFAT 直接生成失败；临时 NTFS 输出已验证 |

技术决策由 SPEC-001 维护，不在此复制实现进度。
