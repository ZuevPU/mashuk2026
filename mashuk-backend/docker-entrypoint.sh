#!/bin/sh
set -e
echo "Starting server (migrations run after HTTP listen)..."
exec node dist/index.js
