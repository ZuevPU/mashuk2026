#!/bin/sh
# Port bind is enough for Timeweb's Docker HEALTHCHECK. Do not wait on node:
# a hung HTTP probe would eat the 8s timeout and never reach this check.
PORT="${PORT:-8080}"
h=$(printf '%04X' "$PORT")
if grep -q ":$h " /proc/net/tcp /proc/net/tcp6 2>/dev/null; then
  exit 0
fi
exec /usr/local/bin/node /app/healthcheck.cjs
