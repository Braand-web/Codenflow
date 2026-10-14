# Coden flow 网关

[English](README.md) | 中文

Railway 通过此网关提供原有的 Coden flow 工作台。Supabase Auth 识别各个账户，网关在既有 Railway 卷的 `/data/gateway` 目录中保存不透明会话。每个 Supabase 用户 ID 映射到一个隔离的 E2B microVM。E2B 暂停空闲环境，以保留其文件系统和进程状态。

镜像需要 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`E2B_API_KEY` 和 `RAILWAY_PUBLIC_DOMAIN`。配置的 Supabase URL 必须为 `https://thtknxjmzpceqwegoobj.supabase.co`。Supabase URL 允许列表必须包含 Railway 根 URL，以便确认邮件返回 Coden flow。Supabase 服务密钥和 FAL/OpenRouter 主密钥均不进入 E2B 环境。

身份验证页面使用 `Referrer-Policy: same-origin`，使浏览器提交表单时保留来源；输入验证、登录或注册失败时返回表单，HTTP 状态码为 200，且不设置会话 cookie，而被拒绝的来源仍返回 HTTP 403。

E2B 项目的用量上限为 2 美元。网关为每次 900 秒的沙箱租期预留 1,020 秒；当持久化的月度计数器达到 36,000 秒时，网关停止接纳新的计算任务。按文档所列的 E2B 2 vCPU 和 4 GiB 费率，这相当于为运行时用量每月预留约 1.66 美元；E2B 的项目上限也涵盖构建和其他用量。Railway 使用既有服务和数据卷；不要添加副本或第二个卷。

```sh
npm ci --prefix infra/gateway
npm test --prefix infra/gateway
```

生产网关以既有 Node 容器用户运行。它在 `/data` 下创建私有网关目录；既有项目文件和工作区保留在原处。网关会话持续 7 天，转发 HTTP 和 WebSocket 流量前，网关通过 Supabase Auth 验证会话。尚未结束的 HTTP 响应和 WebSocket 连接每 2 分钟续期沙箱租期。网关将内部 DSH cookie 保存在同一仅所有者可访问的数据库中，使 Railway 重启后仍可访问沙箱。
