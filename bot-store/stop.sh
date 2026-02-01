#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ -f ./bot-store.pid ]]; then
  PID=$(cat ./bot-store.pid)
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Stopped (pid $PID)"
  else
    echo "Not running (stale pid $PID)"
  fi
  rm -f ./bot-store.pid
else
  echo "No pid file."
fi