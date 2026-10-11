# Coden flow 门户

[English](README.md) | 中文

门户通过 Supabase Auth 和行访问策略提供邮箱注册、登录、密码找回及私有项目简介。它作为 Cordis 插件运行在独立的 `codenflow` profile 中，不包含 agent、shell、terminal、插件管理器或 Harness RPC。导入的 Harness 仍可用于本地开发。

## 本地预览

使用 Node 24。将 `.env.example` 复制为 `.env`，填入已有的 Supabase publishable key，然后执行：

```sh
npm ci --ignore-scripts
npm run check
npm run test
npm run build
npm start
```

打开 `http://127.0.0.1:3090`。服务器拒绝缺失配置和特权 Supabase 密钥。`/api/config` 仅公开 Supabase URL 与 publishable key。固定版本的 `dsh` 依赖启动命名 profile；`start.mjs` 初始化门户独立的运行目录。

## Supabase

将 [schema.sql](schema.sql) 在目标项目上执行一次。已认证用户只能查询和插入 `owner_id` 与其已验证 Supabase 身份相同的项目。未登录客户端没有表权限。客户端没有项目更新、删除或额度变更权限。

将认证 Site URL 设置为部署后的门户 URL，并将完整的部署 URL 与本地预览 URL 加入邮件跳转允许名单。保留邮件确认。生产邮件需要配置 SMTP 提供商。

## Railway

根目录的 [Dockerfile](../Dockerfile) 仅构建和检查此门户。设置 `SUPABASE_URL` 与 `SUPABASE_PUBLISHABLE_KEY`。Railway 提供 `PORT`；容器监听其网络接口，并以非特权用户运行。`/health` 用作部署健康检查。购买域名前可使用 Railway 临时 HTTPS 域名。

OpenRouter、FAL 和 E2B 密钥保留在服务器变量中。此门户不会调用这些提供商或公开其密钥。托管 agent 执行、用户 API 密钥加密、用量计费和支付需要各自的服务器实现完成后才能开放付费访问。项目简介是元数据，并非可执行工作区。

## 许可证

仓库保留上游 [MIT 许可证](../LICENSE)及[第三方声明](../THIRD_PARTY_NOTICES.md)。运行时依赖保留打包的许可证；内部上游包名是技术标识符。
