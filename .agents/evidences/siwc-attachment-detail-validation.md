# SIWC 文件与图片精度实测

编号：EVIDENCE-031。日期：2026-11-07。适用：DSH 0.2.2-rc.1、Windows x64、当前 SIWC 账号和所测模型。关联：RFC-001、SPEC-001、FACT-002、TODO-001。

## 授权与来源

用户授权使用现有 SIWC 凭据实测原生文件和图片精度，成功后接入；Codex 独立子任务不实施。只发送合成 PDF、文本和几何图形，无私人内容。请求保留宿主 attribution，使用公开 Responses、store=false、stream=true，读取完整终止事件与实际输出，不只检查 HTTP 状态。

官方依据：[SIWC 限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)、[文件输入](https://developers.openai.com/api/docs/guides/file-inputs)、[图片精度](https://developers.openai.com/api/docs/guides/images-vision)。官方支持模型接受的文件，但不支持 Files 上传 API；本次使用 input_file 内联数据，不上传文件取得 file_id。

## 真实接口结果

所测 Sol 的合成 PDF 和纯文本输入均 HTTP 200、response.completed，并正确返回仅写在附件里的校验码。PDF 的内容以页面图片承载，因此不是仅把文件名或提问文字当作内容。

Sol 与 Astra 分别使用 auto、low、high、original，八次均 HTTP 200、response.completed，并正确识别合成图片从左到右的颜色。该小图片的各档输入 token 均为 102；只能证明档位被接受及推理完成，不证明特定画质、倍率或费用差异，不推广到所有账号和模型。

初始附件探测和最终原生链路验证均未刷新或改写凭据。后续压缩探测前 access token 到期，另经现有插件逻辑及 DSH 跨进程凭据事务正常刷新并持久化；与本次附件探测的只读阶段分开，依据 EVIDENCE-032。

## 宿主限制与用户决定

核对固定版本 DSH 默认派发实现及类型，文件在适配器前无条件投影为文字句柄；没有通用原生文件透传能力声明。正式 llm/stream 提供投影前拦截，但接管默认派发会增加计量、能力过滤和错误处理等集成职责，不是现有适配器的一项能力声明。

向用户说明后，用户选择“文件暂记宿主阻塞，继续接入图片精度”。因此本次没有实现文件传输、文字句柄解析、历史反查或默认派发替代。服务端文件实测成功不能写为本插件已支持原生文件。

## 图片精度实现与验证

现有统一设置行新增“图片精度”，复用 Base UI/shadcn Select、官方 locale、受信 RPC、Settings 保存和 volatile 配置；自动为默认值，保留低、高、原图。TypeScript 用封闭类型传入原生请求，Rust 用反序列化枚举校验，再设置每个保留图片的 input_image.detail。没有新依赖、通用参数透传或独立配置。变更同时作用于历史中的保留图片，不修改持久消息或卸载决定；不静默改换档位。

- 35 项 Rust 测试通过；覆盖默认值、多个历史图片的全部精度及非法值拒绝。23 项 Node 测试通过；覆盖宿主附件投影、偏好即时读取、历史不变、配置重启持久化与构建界面默认文案。
- fmt、全部目标与特性的 Clippy、两套 tsrs、Biome 通过；Tailwind/tsdown 构建完成。
- 原生 release 编译成功。当前项目所在文件系统的硬链接失败使 napi-rs 后处理不能完成；将相同源码暂存到支持硬链接的系统临时文件系统，沿用同一官方 napi-rs 命令完成绑定和平台二进制生成，再复制发布产物。未修改构建器、依赖或项目构建流程。
- 独立隐藏浏览器验证四档实际选择、保存、中文和英文 display 文案及窄容器无溢出；没有浏览器错误，截图已查看。没有操作用户 DSH 或私人浏览器。
- 最终原生产物通过真实 DSH LLM 服务完成原图请求，再切到低精度多轮续写，均正确识别图片并正常结束；凭据文件保持不变。只代表所测账号、模型及合成图，不代替真实桌面设置验收。

2026-11-07，用户授权的 Codex 目录修复更新已合并安装本次图片精度成果，构建与安装核对统一见 EVIDENCE-034；桌面图片精度交互仍待用户验收。
