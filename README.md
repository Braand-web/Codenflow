# Coden flow

English | [中文](README.zh.md)

Coden flow is the branded web workbench built from the imported agent engine.

## Current capabilities

The product opens directly into the original Coden flow agent interface. It includes chat sessions, workspaces, tools and model settings.

## Run

<a id="run-from-source"></a>

Install Node 24 and run:

```sh
pnpm install --frozen-lockfile
pnpm run build:lib
pnpm run build:web
pnpm run start:web -- --no-open
```

Open the authenticated URL printed by `dsh web`. Railway stores the runtime home at `/data`; attach a persistent volume there before using hosted sessions or files. The Web interface is a trusted workbench and uses DSH browser-session authentication.

## Development

Read the [architecture](docs/architecture.md) and [contributor guide](CONTRIBUTING.md) for the plugin engine.

## Credits and license

The engine is derived from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Original attribution remains in the [MIT license](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md). The user-facing product is Coden flow.
