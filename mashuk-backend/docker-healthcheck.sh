#!/bin/sh
# Timeweb / Docker HEALTHCHECK. No curl/wget — they are not in node:22-slim.
# Invoke node by absolute path: healthcheck PATH often lacks /usr/local/bin.
set -u

if /usr/local/bin/node /app/healthcheck.cjs; then
  exit 0
fi

echo "healthcheck: node probe failed, checking if :8080 is bound" >&2
# 8080 = 0x1F90 in /proc/net/tcp
if grep -q ':1F90 ' /proc/net/tcp /proc/net/tcp6 2>/dev/null; then
  exit 0
fi

echo "healthcheck: nothing listening on 8080" >&2
exit 1
