# One image runs all of pocket3d: nginx on :5000 in front of the
# backend (:3000) and the frontend (:4200), both kept alive by pm2.
#
#   /api/*      → backend (NestJS), prefix stripped
#   /uploads/*  → files on disk (STORAGE_PROVIDER=local)
#   /*          → frontend (Next.js)
FROM node:26-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    openssl \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm --no-update-notifier --no-fund --global install pnpm@10.28.2 pm2@6

WORKDIR /app

# Dependencies first, so code changes don't reinstall them
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY libraries/nestjs-libraries/src/database/prisma/schema.prisma libraries/nestjs-libraries/src/database/prisma/schema.prisma
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build:backend && pnpm run build:frontend

COPY var/docker/nginx.conf /etc/nginx/nginx.conf

# Runs as the unprivileged `node` user: nginx listens on 5000 and keeps its
# pid / temp files in /tmp, so the container works with a read-only root
# filesystem and every capability dropped
RUN mkdir -p /uploads && chown node:node /uploads
USER node

ENV NODE_ENV=production \
    HOME=/tmp \
    PM2_HOME=/tmp/.pm2 \
    CHECKPOINT_DISABLE=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    BACKEND_INTERNAL_URL=http://127.0.0.1:3000 \
    STORAGE_PROVIDER=local \
    UPLOAD_DIRECTORY=/uploads

EXPOSE 5000

CMD ["sh", "-c", "pnpm run prisma-migrate-deploy && nginx && exec pm2-runtime var/docker/ecosystem.config.cjs"]
