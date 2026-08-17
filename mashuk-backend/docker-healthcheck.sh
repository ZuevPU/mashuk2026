#!/bin/sh
# Timeweb waits on Docker HEALTHCHECK (~105s). HTTP can miss while boot()
# loads Express/DB on the same event loop; the listen socket is already open.
set -u
PORT="${PORT:-8080}"

if [ -x /usr/local/bin/node ] && /usr/local/bin/node /app/healthcheck.cjs; then
  exit 0
fi

hex=$(printf '%04X' "$PORT")
if grep -q ":${hex} " /proc/net/tcp /proc/net/tcp6 2>/dev/null; then
  echo "healthcheck: HTTP pending, port ${PORT} is bound" >&2
  exit 0
fi

echo "healthcheck: nothing listening on ${PORT}" >&2
exit 1
