# Coden flow portal

English | [中文](README.zh.md)

The portal provides email registration, login, password recovery and private project briefs using Supabase Auth and row access policies. It runs as a Cordis plugin in a dedicated `codenflow` profile with no agent, shell, terminal, plugin manager or Harness RPC. The imported Harness remains available for local development.

## Local preview

Use Node 24. Copy `.env.example` to `.env`, set the existing Supabase publishable key, then run:

```sh
npm ci --ignore-scripts
npm run check
npm run test
npm run build
npm start
```

Open `http://127.0.0.1:3090`. The server rejects missing configuration and privileged Supabase keys. `/api/config` publishes only the Supabase URL and publishable key. The pinned `dsh` dependency launches the named profile; `start.mjs` initializes the portal's own runtime home.

## Supabase

Apply [schema.sql](schema.sql) once to the intended project. Authenticated users may select and insert only projects whose `owner_id` matches their verified Supabase identity. Signed-out clients have no table privileges. Project updates, deletion and credit changes have no client grant.

Set the authentication Site URL to the deployed portal URL and allow the exact deployed URL plus the local preview URL as email redirects. Email confirmation remains enabled. Production email requires a configured SMTP provider.

## Railway

The root [Dockerfile](../Dockerfile) builds and checks only this portal. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Railway supplies `PORT`; the container binds the portal listener on its container interface and runs as an unprivileged user. `/health` is the deployment health check. A temporary Railway HTTPS domain can be used before buying a domain.

OpenRouter, FAL and E2B keys stay in server variables. This portal does not call these providers or expose their keys. Hosted agent execution, encrypted user API keys, usage accounting and payments require their dedicated server implementation before paid access opens. A project brief is metadata; it is not an executable workspace.

## License

The repository retains its upstream [MIT license](../LICENSE) and [third-party notices](../THIRD_PARTY_NOTICES.md). Runtime dependencies retain their packaged licenses; internal upstream package names are technical identifiers.
