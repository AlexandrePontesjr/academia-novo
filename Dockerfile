# syntax=docker/dockerfile:1
# Uma imagem por alvo (`migrate`, `api`, `web`), todas a partir do mesmo código do monorepo.

FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY . .

FROM base AS migrate
RUN pnpm install --frozen-lockfile --filter "@academia/database..."
USER node
CMD ["pnpm", "db:migrate"]

FROM base AS api
RUN pnpm install --frozen-lockfile --filter "@academia/api..." \
  && pnpm --filter @academia/api build
ENV NODE_ENV=production
USER node
CMD ["node", "apps/api/dist/main.js"]

FROM base AS web
RUN pnpm install --frozen-lockfile --filter "@academia/web..." \
  && pnpm --filter @academia/web build \
  && chown -R node:node apps/web/.next
ENV NODE_ENV=production
USER node
WORKDIR /repo/apps/web
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
