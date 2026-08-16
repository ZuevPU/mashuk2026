#!/bin/sh
set -e
echo "Starting server (HTTP listen first, then app boot)..."
exec "$@"
