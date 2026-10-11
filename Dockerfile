FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY saas/package.json saas/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY saas/ ./
RUN npm run check && npm run test && npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production CODENFLOW_HOST=0.0.0.0 PORT=8080
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/start.mjs /app/server.mjs ./
USER node
ENV CODENFLOW_HOME=/tmp/codenflow
EXPOSE 8080
CMD ["node", "start.mjs"]
