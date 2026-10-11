FROM node:24-bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git ripgrep ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.28.5 --activate
COPY . .
RUN pnpm install --frozen-lockfile
ARG RAILWAY_GIT_COMMIT_SHA
RUN DSH_CLIENT_COMMIT_HASH="$RAILWAY_GIT_COMMIT_SHA" pnpm run build:lib && DSH_CLIENT_COMMIT_HASH="$RAILWAY_GIT_COMMIT_SHA" pnpm run build:web

ENV NODE_ENV=production DSH_HOME=/data PORT=8080
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "start-original-web.mjs"]
