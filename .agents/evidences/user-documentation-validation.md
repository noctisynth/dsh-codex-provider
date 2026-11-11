# 用户文档与配图验证

编号：EVIDENCE-048。日期：2026-11-11 至 2026-11-12。适用：当前开发版本、DSH 0.2.2-rc.1。关联：RFC-001、SPEC-001、TODO-001。类型：实现核对、独立组件渲染与本地分发预检。

## 结果

- README 按随新版发布的常规项目说明编写，覆盖 Desktop 与 Web profile 安装、登录与模型选择入口，以及必要的账号能力和用量说明。不包含开发过程、开发状态、Agent 编号或上下文格式，分号为零。
- Web 安装命令依据本机 DSH launcher 帮助确认，使用带 profile 的 plugin add。只执行帮助查询，未安装插件。
- 最终保留一张 1440×1754 的账号设置概览 PNG。使用实际 React 组件、正式中文词典及现有构建样式，通过隔离 Chrome 157 的 CDP 渲染。人工查看无裁切或文字遮挡，图片可解码且无 EXIF。
- 图片是独立组件的界面示例，账号与额度均为合成资料。未读取真实账号、凭据或私人会话，未调用模型，浏览器进程正常退出。
- 按用户要求，只保留 README 和 assets 配图，不提供独立 HTML 或 docs 目录。README 使用公开仓库 URL 引用图片，远端展示需对应资源进入仓库。最终分发清单、链接和格式检查结果见本次工具记录。

## 登录方式提示补充

2026-11-12 核对 OpenAI 官方 SIWC Quickstart、开源套餐接入总览及 Models and inference。官方为第三方开源应用提供动态客户端注册和公开 Responses 接入规范，明确要求该流程不使用 ChatGPT backend-api。README 将 SIWC 建议归于 OpenAI 的正式接入指引。过时方式未来可能受限、失效或被判定违规为风险提示，不表示已存在针对本插件的违规判定或已公布的停用日期。现有能力差异继续由能力表说明。

来源：https://developers.openai.com/siwc/quickstart 、https://developers.openai.com/siwc/token-sharing-open-source 、https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference 。

## 边界

本次检查文档、示例图片和分发清单，不代表新的真实账号或全平台桌面功能验收。未安装插件、推送、更新版本或发布。
