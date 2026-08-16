# Stage 1: Builder
FROM node:22-slim AS builder

ENV NPM_CONFIG_FETCH_RETRIES=10 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_FETCH_TIMEOUT=300000 \
    NPM_CONFIG_PREFER_OFFLINE=true \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_MAXSOCKETS=3

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN set -e; \
  for attempt in 1 2 3 4 5; do \
    npm ci --prefer-offline --no-audit --no-fund && exit 0; \
    echo "npm ci failed (attempt ${attempt}/5), waiting before retry..."; \
    sleep $((attempt * 20)); \
  done; \
  exit 1

COPY tsconfig.json ./
COPY src ./src
COPY drizzle ./drizzle
COPY assets ./assets
COPY config ./config

RUN npm run build

# Stage 2: Runner
FROM node:22-slim AS runner

WORKDIR /app

ENV NPM_CONFIG_FETCH_RETRIES=10 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_FETCH_TIMEOUT=300000 \
    NPM_CONFIG_PREFER_OFFLINE=true \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_MAXSOCKETS=3

COPY package.json package-lock.json .npmrc ./
RUN set -e; \
  for attempt in 1 2 3 4 5; do \
    npm ci --omit=dev --prefer-offline --no-audit --no-fund && exit 0; \
    echo "npm ci failed (attempt ${attempt}/5), waiting before retry..."; \
    sleep $((attempt * 20)); \
  done; \
  exit 1

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY assets ./assets
COPY config ./config
COPY docker-entrypoint.sh ./docker-entrypoint.sh
COPY healthcheck.cjs ./healthcheck.cjs
COPY docker-healthcheck.sh ./docker-healthcheck.sh
RUN set -e; \
  for attempt in 1 2 3; do \
    apt-get update \
      && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends curl ca-certificates \
      && rm -rf /var/lib/apt/lists/* \
      && break; \
    echo "apt-get failed (attempt ${attempt}/3), waiting before retry..."; \
    sleep $((attempt * 15)); \
    if [ "${attempt}" = "3" ]; then exit 1; fi; \
  done; \
  chmod +x docker-entrypoint.sh docker-healthcheck.sh \
  && mkdir -p /app/uploads \
  && ln -sf /usr/local/bin/node /usr/bin/node \
  && ln -sf /usr/bin/curl /usr/local/bin/curl

# Do not set HOST=0.0.0.0: Timeweb probes localhost, often via IPv6 (::1).
ENV PORT=8080 \
    NODE_ENV=production \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

EXPOSE 8080

# Timeweb docs: Dockerfile HEALTHCHECK overrides the panel path and their
# example uses curl. node:22-slim has no curl unless we install it.
HEALTHCHECK --interval=5s --timeout=5s --start-period=20s --retries=12 \
  CMD curl -fsS http://127.0.0.1:8080/health || curl -fsS http://localhost:8080/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/usr/local/bin/node", "/app/dist/index.js"]
