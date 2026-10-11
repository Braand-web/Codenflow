# Coden flow

[English](README.md) | 中文

Coden flow 是一个利用 AI 进行创作的 SaaS 项目。仓库包含导入的 agent 引擎及独立的账户门户。

## 当前功能

[门户](saas/README.zh.md)提供 Supabase 注册、登录、密码找回和私有项目简介。它的独立 profile 不提供主机执行能力。托管 AI 执行、用户 API 密钥存储、用量额度和支付仍在开发中。

## 运行

<a id="run"></a>
<a id="run-from-source"></a>

账户门户请参考[门户设置](saas/README.zh.md)。本地 agent 界面需要安装 Node 24，然后执行：

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run start:web
```

本地 agent 使用 `http://127.0.0.1:3080`，账户门户使用 `http://127.0.0.1:3090`。托管配置在 `Dockerfile` 和 `railway.toml` 中声明。

## 开发

插件引擎请参考[架构](docs/architecture.zh.md)和[贡献指南](CONTRIBUTING.zh.md)。账户门户的变更位于 `saas/`。

## 致谢和许可证

引擎基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。原始署名保留于 [MIT 许可证](LICENSE)和[第三方声明](THIRD_PARTY_NOTICES.md)。用户看到的产品品牌为 Coden flow。
