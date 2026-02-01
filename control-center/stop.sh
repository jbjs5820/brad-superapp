#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ -f ./control-center.pid ]]; then
  PID=$(cat ./control-center.pid)
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Stopped (pid $PID)"
  else
    echo "Not running (stale pid $PID)"
  fi
  rm -f ./control-center.pid
else
  echo "No pid file."
fi