#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PORT=${PORT:-4567}
# run detached
nohup node server.js > ./control-center.log 2>&1 &
echo $! > ./control-center.pid
echo "Brad Control Center started on http://localhost:${PORT} (pid $(cat ./control-center.pid))"