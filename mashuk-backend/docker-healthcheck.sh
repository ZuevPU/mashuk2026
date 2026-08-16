#!/bin/sh
# Timeweb / Docker HEALTHCHECK. Prefer curl (installed in the image).
# Fall back to node, then to "is 8080 bound".
set -u
PORT="${PORT:-8080}"

probe() {
  url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 3 "$url" >/dev/null 2>&1 && return 0
  fi
  return 1
}

if probe "http://127.0.0.1:${PORT}/health" \
  || probe "http://localhost:${PORT}/health" \
  || probe "http://127.0.0.1:${PORT}/" \
  || probe "http://[::1]:${PORT}/health"; then
  exit 0
fi

if [ -x /usr/local/bin/node ] && /usr/local/bin/node /app/healthcheck.cjs; then
  exit 0
fi

echo "healthcheck: HTTP probe failed, checking if :8080 is bound" >&2
# 8080 = 0x1F90 in /proc/net/tcp
if grep -q ':1F90 ' /proc/net/tcp /proc/net/tcp6 2>/dev/null; then
  exit 0
fi

echo "healthcheck: nothing listening on ${PORT}" >&2
exit 1
