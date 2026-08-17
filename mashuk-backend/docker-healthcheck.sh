#!/bin/sh
# Timeweb waits on Docker HEALTHCHECK (~105s). Do not HTTP-probe the app:
# boot() loads Express on the same event loop, so GET /health hangs and the
# check is killed by --timeout before any fallback runs.
PORT="${PORT:-8080}"
h=$(printf '%04X' "$PORT")

if grep -q ":$h " /proc/net/tcp /proc/net/tcp6 2>/dev/null; then
  exit 0
fi

exec /usr/local/bin/node /app/healthcheck.cjs
