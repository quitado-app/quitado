# syntax=docker/dockerfile:1

# Quitado, one container. Build:  docker build -t quitado .
# Run:  see docker-compose.yml and docs/deploy.md
#
# The base image is pinned to an exact Node version on purpose: builds are reproducible and an
# upgrade is a visible change. node:sqlite is built into Node, so there is no native module to compile.
ARG NODE_IMAGE=node:24.22.3-slim

# ---- build: compile TypeScript with the dev dependencies ----------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app

# Manifests first, so the dependency layer is cached until a manifest changes. The spike package is
# part of the lockfile, so its manifest has to be present for `npm ci`; its source is not needed.
COPY package.json package-lock.json .npmrc tsconfig.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/spike-devnet/package.json packages/spike-devnet/
RUN npm ci --ignore-scripts --no-audit --no-fund --workspace=packages/server --include-workspace-root

COPY packages/core packages/core
COPY packages/server packages/server
# The build configs leave the tests out of the output. Building the server also builds
# @quitado/core, which it references.
RUN npx tsc -b packages/server/tsconfig.build.json

# ---- runtime: production dependencies and compiled output only ----------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/spike-devnet/package.json packages/spike-devnet/
# Only the server workspace's runtime dependencies: no dev tools, no spike packages.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund --workspace=packages/server \
  && npm cache clean --force

COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/server/dist packages/server/dist

# The database lives in /data, which must be a volume so it survives container upgrades: the
# compose file mounts one, Railway attaches its own. There is no VOLUME instruction on purpose,
# Railway rejects Dockerfiles that have one.
RUN mkdir -p /data && chown node:node /data
# The port is not set here: the app uses QUITADO_PORT, then PORT (set by hosting platforms), then 3000.
ENV QUITADO_DB_PATH=/data/quitado.db \
    QUITADO_HOST=0.0.0.0

LABEL org.opencontainers.image.title="Quitado" \
      org.opencontainers.image.description="Open-source, non-custodial USDC/USDT invoicing on Solana" \
      org.opencontainers.image.source="https://github.com/quitado-app/quitado" \
      org.opencontainers.image.licenses="Apache-2.0"

# Never run as root.
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.QUITADO_PORT||process.env.PORT||'3000')+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# Node is PID 1 and start.js handles SIGTERM, so `docker stop` shuts down cleanly.
CMD ["node", "packages/server/dist/start.js"]
