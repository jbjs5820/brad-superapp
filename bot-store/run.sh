#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PORT=${PORT:-4677}
nohup node src/server.js > ./bot-store.log 2>&1 &
echo $! > ./bot-store.pid
echo "Brad Bot Store started on http://localhost:${PORT} (pid $(cat ./bot-store.pid))"