# Stage 1: Builder
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY drizzle ./drizzle

RUN npm run build

# Stage 2: Runner
FROM node:22-slim AS runner

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 8080

# Health check is configured in Timeweb Apps panel (path /health, port 8080).
# Do not add HEALTHCHECK here — Timeweb ignores panel settings when Dockerfile defines one.

ENTRYPOINT ["./docker-entrypoint.sh"]
