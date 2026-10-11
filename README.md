# Coden flow

English | [中文](README.zh.md)

Coden flow is a SaaS project for creating with AI. This repository includes the imported agent engine and a dedicated account portal.

## Current capabilities

The [portal](saas/README.md) provides Supabase registration, login, password recovery and private project briefs. Its isolated profile exposes no host execution capabilities. Hosted AI execution, user API key storage, usage credits and payments are still under development.

## Run

<a id="run-from-source"></a>

For the account portal, follow the [portal setup](saas/README.md). For the local agent interface, install Node 24 and run:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run start:web
```

The local agent uses `http://127.0.0.1:3080`; the account portal uses `http://127.0.0.1:3090`. Hosted configuration is declared in `Dockerfile` and `railway.toml`.

## Development

Read the [architecture](docs/architecture.md) and [contributor guide](CONTRIBUTING.md) for the plugin engine. Changes to the account portal live under `saas/`.

## Credits and license

The engine is derived from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Original attribution remains in the [MIT license](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md). The user-facing product is Coden flow.
