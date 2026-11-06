# 原生图片输入验证

编号：EVIDENCE-020。日期：2026-11-07。适用：DSH 0.2.2-rc.1、Windows x64 原生 release、当前 SIWC 公开 Responses。

## 依据与宿主契约

官方 SIWC 限制允许模型支持的图片输入，不支持 Files 上传接口。Responses 的 input_image 支持 base64 data URL，可在上下文中携带多张图片。来源：https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations 、https://developers.openai.com/api/docs/guides/images-vision 。

核对目标宿主发布类型及实现：ImageBlock 保存不可变附件引用；AttachmentStore.readImage 返回经过摘要、格式、长度和尺寸校验的规范化图片。LlmRuntime 按精确模型的 inputModalities 对文字模型执行占位投影；offloaded 是已保存的卸载决定，适配不能重新发送图片。来源：https://registry.npmjs.org/@deepseek-ai/dsh-attachment/0.2.2-rc.1 、https://registry.npmjs.org/@deepseek-ai/dsh-llm/0.2.2-rc.1 。

实际目录经新原生模块读取，所测 gpt-6-astra 声明 image。这只是所测账号与目录观察，其他模型按各自声明决定，不从名称推断。

## 实现验证

Rust 目录测试覆盖可选 input_modalities 的保留；请求测试覆盖文字、两张图片、assistant 回复和后续用户消息的顺序，确认图片为 input_image、data URL 与 auto detail，历史不丢失。

真实 LlmRuntime 与 ChatGptAdapter 集成使用合成附件读取结果：视觉模型读取两张保留图片，已卸载图片只产生宿主占位；文字模型完全不读取附件。原始消息保持不变；取消时不读取，附件失败直接传播。图片服务通过正式依赖注入接入，插件挂载及设置偏好测试同步提供该服务。

真实公开请求通过同一宿主运行时、适配器和新原生模块，发送合成 PNG：白底、左侧红色矩形、右侧蓝色圆形。Astra 正确描述两者及左右位置，完成原因 stop。以实际输出块与重放资料构造后续消息，保留图片历史后询问圆形颜色，回答蓝色并正常完成。该验证以合成内存读取代替真实附件存储，未验证桌面拖拽、粘贴或磁盘附件流程；未发送私人图片或会话，未修改真实凭据。

初次在线断言过于依赖英文形状的精确措辞，随后放宽词形匹配；后续请求脚本遗漏 DSH assistant source，改用正式消息构造器与完整重放资料后通过。两项属于验证脚本问题，未据此修改产品协议。

## 构建与边界

25 项 Rust 测试、18 项 Node/宿主测试、Clippy、两套 tsrs 类型检查通过，官方 napi-rs release 及 Tailwind/tsdown 构建完成。现有构建提示未作为新的图片功能故障。新增依赖为目标宿主官方附件契约，无图片解码、上传或转换库。

本次实现用户消息原生图片输入，沿用宿主规范化与准入策略；不增加文件上传、图片生成、额外压缩策略或配置。已卸载图片仍是文字占位。插件尚未更新安装，桌面附件验收待完成。

## 合并更新安装

2026-11-07，用户确认 DSH 已完全退出，授权合并安装本项与 EVIDENCE-019 的三项修复。检查未发现桌面进程，通过桌面自带官方 CLI 更新 desktop 插件成功；不可变归档 SHA-256 前缀为 bd06eae985a0。

已安装包清单、宿主和浏览器入口、Cordis 补丁、原生加载器、声明与 Windows 模块的摘要均与当前构建产物一致。独立 Node 成功加载已安装原生模块并构造客户端。普通 Node 直接导入宿主入口时缺少由 DSH 加载器提供的宿主 peer，未将该方式作为宿主加载验收；安装器亦有 peer 提示，但更新命令成功。真实 DSH 加载与图片交互等待用户实测。安装未更改凭据。
