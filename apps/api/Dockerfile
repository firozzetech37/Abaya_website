# API image. Build from the REPO ROOT so workspace packages are available:
#   docker build -f apps/api/Dockerfile -t abaya-api .
# Release step (before the new version serves traffic):
#   docker run --rm --env-file .env abaya-api migrate
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

# Install only what the API (and its workspace packages) need; cached until a manifest changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY apps/mobile/package.json apps/mobile/
RUN pnpm install --frozen-lockfile --filter "@abaya/api..."

COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @abaya/db generate && pnpm --filter @abaya/api build

FROM node:22-bookworm-slim AS runtime
# Fonts: the visible watermark on AI previews and try-ons draws its text with a serif font
# (watermark/domain/visible-mark.ts); without any fonts every letter would be a box.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini fontconfig fonts-liberation fonts-dejavu-core \
  && fc-cache -f && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo /repo
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R node:node /repo
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "docker-entrypoint.sh"]
CMD ["serve"]
