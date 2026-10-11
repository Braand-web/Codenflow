# Coden flow

[English](README.md) | 中文

Coden flow 是基于导入的 agent 引擎构建并采用自有品牌的 Web 工作台。

## 当前功能

产品直接打开 Coden flow 原有的 agent 界面，提供聊天会话、工作区、工具和模型设置。

## 运行

<a id="run"></a>
<a id="run-from-source"></a>

安装 Node 24，然后执行：

```sh
pnpm install --frozen-lockfile
pnpm run build:lib
pnpm run build:web
pnpm run start:web -- --no-open
```

请打开 `dsh web` 打印的已认证链接。Railway 将运行时目录保存在 `/data`；使用托管会话或文件前，请在该路径挂载持久卷。Web 界面是受信任的工作台，并使用 DSH 浏览器会话认证。

## 开发

插件引擎请参考[架构](docs/architecture.zh.md)和[贡献指南](CONTRIBUTING.zh.md)。

## 致谢和许可证

引擎基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。原始署名保留于 [MIT 许可证](LICENSE)和[第三方声明](THIRD_PARTY_NOTICES.md)。用户看到的产品品牌为 Coden flow。
