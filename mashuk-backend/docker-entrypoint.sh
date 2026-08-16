#!/bin/sh
set -e
echo "Starting server on 8080..."
exec /usr/local/bin/node dist/index.js
