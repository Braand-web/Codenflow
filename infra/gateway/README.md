# Coden flow gateway

English | [中文](README.zh.md)

Railway serves the original Coden flow workbench through this gateway. Supabase Auth identifies each account, and the gateway keeps an opaque session in the existing Railway volume at `/data/gateway`. Each Supabase user ID maps to one isolated E2B microVM. E2B pauses idle environments to preserve their filesystem and process state.

The image needs `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `E2B_API_KEY`, and `RAILWAY_PUBLIC_DOMAIN`. The configured Supabase URL must be `https://thtknxjmzpceqwegoobj.supabase.co`. Keep the Supabase URL allow list configured to include the Railway root URL so confirmation emails can return to Coden flow. No Supabase service key or FAL/OpenRouter master key enters an E2B environment.

Authentication pages use `Referrer-Policy: same-origin` so browser form posts retain their origin; validation and sign-in/signup failures return the form with HTTP 200 and no session cookie, while rejected origins still return HTTP 403.

The E2B project has a $2 usage limit. The gateway reserves 1,020 seconds for each 900-second sandbox lease and stops admitting new compute when its durable monthly counter reaches 36,000 seconds. At the documented 2 vCPU and 4 GiB E2B rates this reserves about $1.66/month for runtime use; E2B's project limit covers builds and other usage too. Railway uses the existing service and data volume; do not add replicas or a second volume.

```sh
npm ci --prefix infra/gateway
npm test --prefix infra/gateway
```

The production gateway runs as the existing Node container user. It creates a private gateway directory below `/data`; the existing project files and workspaces remain in place. Gateway sessions last seven days and are checked against Supabase Auth before forwarding HTTP and WebSocket traffic. Open HTTP responses and WebSocket connections renew their sandbox lease every two minutes. The gateway stores its internal DSH cookie in the same owner-only database so Railway restarts do not invalidate sandbox access.
