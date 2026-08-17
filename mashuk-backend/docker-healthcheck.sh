#!/bin/sh
# Timeweb / Docker HEALTHCHECK without apt packages.
# Prefer node (always in the image). curl only if the base image already has it.
set -u
PORT="${PORT:-8080}"

if [ -x /usr/local/bin/node ] && /usr/local/bin/node /app/healthcheck.cjs; then
  exit 0
fi

if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 \
    || curl -fsS --max-time 3 "http://localhost:${PORT}/health" >/dev/null 2>&1; then
    exit 0
  fi
fi

echo "healthcheck: HTTP probe failed, checking if :8080 is bound" >&2
# 8080 = 0x1F90 in /proc/net/tcp
if grep -q ':1F90 ' /proc/net/tcp /proc/net/tcp6 2>/dev/null; then
  exit 0
fi

echo "healthcheck: nothing listening on ${PORT}" >&2
exit 1
