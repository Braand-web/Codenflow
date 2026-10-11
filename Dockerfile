FROM node:24-bookworm-slim

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.28.5 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run build:lib && pnpm run build:web

ENV NODE_ENV=production DSH_HOME=/data PORT=8080
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "start-original-web.mjs"]
