# SSE 传输错误分类修复验证

编号：EVIDENCE-046。日期：2026-11-11。范围：当前锁定的 eventsource-stream 0.2.3、reqwest 0.12.28、DSH 0.2.2-rc.1，本机 macOS arm64 构建与离线验证。

## 观察与实现

用户说明截图中的错误由切换网络触发。源码核对发现 SSE 错误被统一转换为 Protocol，丢弃了 eventsource-stream 已区分的 Transport 及其 reqwest 错误；TS 随后将 protocol 兜底为 PROVIDER_ERROR。没有读取私人会话或运行日志，不能从已丢弃的原因还原此次中断的具体底层错误。

最小修复仅补充 SSE 错误到现有原生 Error 的类型转换，并在流读取处使用该转换：Transport 保留为 Network，沿用 is_timeout 产生 timeout 或 transport；UTF-8 和 SSE 解析失败保持原有 Protocol。错误事件结构、TS 生产代码、取消、完成判定及重放逻辑均不变；未加入依赖、重试、配置或新的传输能力。

## 验证结果

- 原生回归用合成响应体先输出有效文本 delta，再注入 ConnectionReset 或 TimedOut，经实际 reqwest 字节流、SSE 解码和原生错误事件，分别得到 transport 和 timeout；保留已输出 delta，错误后流结束，公开说明不包含注入的底层详情。
- 无效 UTF-8 与无效事件 JSON 仍得到 protocol；既有未完成就结束、取消及完成事件测试继续通过。
- Rust 全量 46 项测试、fmt 及全部目标和全部 feature 的 Clippy 严格检查通过。
- 官方 napi-rs release 构建本机原生库成功；Node 22.20.0 加载重建产物执行 Provider 错误集成测试，2 个顶层测试通过。真实 ChatGptAdapter 与 LlmRuntime 的九类合成错误覆盖 TRANSPORT、TIMEOUT、PROVIDER_ERROR 及既有 API 分类；真实原生缺少 scope 的 AUTH 路径继续通过。此为分层验证，不是对真实网络切换的一次端到端复现。
- 宿主及测试的 Oxc tsrs 类型检查、变更测试的 Biome 检查通过。
- 初次原生回归对 reqwest 的 is_body 作了过窄断言；核对锁定实现后确认 bytes_stream 将响应体读取错误包装为 decode，改为验证本项目 Network 类型及最终事件分类。首次类型检查入口名称与测试格式检查问题均已修正，最终上述检查通过。
- 官方构建首次因用户 Cargo 缓存解包受沙箱限制失败；经批准重跑同一命令成功，未改变缓存权限或构建配置。

## 交付边界

使用 Semifold 创建 patch/fix 变更集，不消费已有变更集、不更新版本。仅提交本次修复及对应上下文，保留此前未提交的性能排查资料。没有读取真实凭据、调用模型、修改已安装插件、推送或发布；真实切换网络的桌面验收及其它平台构建不在本次验证结果内。
