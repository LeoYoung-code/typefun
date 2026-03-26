# syntax=docker/dockerfile:1
# 单容器：Fastify API + Vue 静态（STATIC_ROOT）。语料在镜像内 /data（与 apps/api 中 data 路径约定一致）。
FROM node:20-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
COPY public ./public
COPY data ./data
RUN pnpm install --frozen-lockfile
RUN pnpm run build
RUN pnpm --filter @typefun/api deploy --prod /deploy/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
ENV STATIC_ROOT=/app/web-dist
COPY --from=build /deploy/api /app
COPY --from=build /repo/apps/web/dist /app/web-dist
COPY --from=build /repo/data /data
EXPOSE 8787
USER node
CMD ["node", "dist/index.js"]
