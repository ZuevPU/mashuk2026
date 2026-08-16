#!/bin/sh
# Always start the API. Timeweb may append extra args after it recreates
# the container with discovered ports — ignore them.
set -e
cd /app
export PORT="${PORT:-8080}"
echo "Starting mashuk-backend on PORT=${PORT}"
exec /usr/local/bin/node /app/dist/index.js
