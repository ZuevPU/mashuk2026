# Timeweb App Platform: deploy as type "Dockerfile", project path mashuk-admin.
# Type "Frontend / React" always apt-get install curl and hangs/fails when
# Debian mirrors are unreachable.
#
# Stage 1: build (Vite static admin)
#
# npm network tuning for restricted build environments (e.g. Timeweb Cloud Apps):
#   NPM_CONFIG_FETCH_RETRIES          — default 10 (see also .npmrc fetch-retries)
#   NPM_CONFIG_FETCH_TIMEOUT          — per-request timeout ms (default 300000)
#   NPM_CONFIG_FETCH_RETRY_MINTIMEOUT / NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT
#   NPM_CONFIG_REGISTRY               — optional mirror if registry.npmjs.org is blocked
#
FROM node:22-alpine AS builder

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

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Stage 2: serve static files
FROM nginx:1.27-alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
