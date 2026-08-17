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
# Do not apt-get: Timeweb builders often cannot reach deb.debian.org (IPv6 down, IPv4 timeout).
# node:22-slim already has node, which is enough for HEALTHCHECK.
RUN chmod +x docker-entrypoint.sh docker-healthcheck.sh \
  && mkdir -p /app/uploads \
  && ln -sf /usr/local/bin/node /usr/bin/node

# Do not set HOST=0.0.0.0: Timeweb probes localhost, often via IPv6 (::1).
ENV PORT=8080 \
    NODE_ENV=production \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

EXPOSE 8080

# Timeweb waits on this Docker HEALTHCHECK (panel path is ignored).
# Probe with node over IPv4+IPv6; if boot still blocks the event loop, the
# shell script still passes while port 8080 is bound.
HEALTHCHECK --interval=5s --timeout=8s --start-period=25s --retries=18 \
  CMD /app/docker-healthcheck.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/usr/local/bin/node", "/app/dist/index.js"]
