# Chatwork++

当前项目目录：`F:\Projects\DCG\DCG_Doc\ChatworkPlusPlus`。旧 `ChatworkTranslator` 目录保留为历史副本，后续修改和打包使用当前目录。

为 Chatwork 提供消息翻译、成员消息导航和关联消息 Thread 侧栏的浏览器扩展。

## 两个版本

| 版本 | 翻译方式 | 最新安装包 |
| --- | --- | --- |
| [Chrome](chatwork-translator-chrome/) | Google 翻译；待翻译正文会发送给 Google | [v1.15.0 ZIP](ChatworkPlusPlus-chrome-v1.15.0.zip) |
| [Edge](chatwork-translator-edge/) | Edge 本地翻译模型；需要浏览器支持对应语言对并下载模型 | [v1.15.0 ZIP](ChatworkPlusPlus-edge-v1.15.0.zip) |

## 功能

- 在聊天原文下方显示译文，保留换行、姓名、TO/RE 标记和链接。
- 自动翻译前判断是否已经是目标语言，避免重复翻译。
- 手动输入翻译，并复制译文。
- 按成员及最近天数查找 TO、RE、SEND 消息，支持上下跳转。
- 关联回复链上下跳转、独立 Thread 入口，以及覆盖原生信息栏、支持拖动调宽、显示原文并独立触发自动翻译的 Thread 侧栏（支持仅显示译文，并记住开关状态）。已知关联消息少于 10 条时自动补载缺失内容，10 条及以上手动刷新。
- Thread 全部内容可复制为长图或下载 PNG，包含滚动区域外的消息，并遵循“仅显示译文”设置。
- 界面自动适配简体中文、繁体中文、英语、日语、韩语，其他界面语言回退英语。
- 首次安装默认“日语 → 浏览器当前语言”；日语环境默认关闭自动翻译，其他环境默认开启。已有设置会保留。

## 安装

1. 下载对应浏览器的 ZIP 安装包并解压到固定目录。
2. 打开扩展管理页：Chrome 为 `chrome://extensions`，Edge 为 `edge://extensions`。
3. 开启开发者模式，选择“加载解压缩的扩展”，选中包含 `manifest.json` 的文件夹。
4. 刷新 Chatwork，打开插件面板设置翻译方向。Edge 首次使用需要通过“模型 / 语言设置”检查并初始化模型。

升级时，用新版文件更新原插件目录，在扩展管理页重新加载插件，再刷新 Chatwork。

也可以克隆本仓库，然后直接加载 `chatwork-translator-chrome` 或 `chatwork-translator-edge` 子目录。

## 使用范围

消息导航和预览受 Chatwork 当前账号权限及历史记录可见范围限制；“无人回复”指当前已加载记录中没有发现明确关联。语言识别和翻译可能不准确，重要内容请结合原文确认。

## 开发与测试

在对应版本的目录中执行：

```sh
npm install
npm test
```

测试使用 Node.js 和 jsdom；模拟翻译服务与页面结构，不需要真实聊天记录或翻译密钥。

两个版本的详细功能、变更历史和限制见各自目录的 README。根目录保留已有版本安装包和中文使用文档。

## 许可证

[MIT](LICENSE)
