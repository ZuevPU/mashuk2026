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
RUN chmod +x docker-entrypoint.sh && mkdir -p /app/uploads

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=45s --retries=12 \
  CMD ["node", "/app/healthcheck.cjs"]

ENTRYPOINT ["./docker-entrypoint.sh"]
