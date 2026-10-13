#!/bin/sh
# serve   → start the API (default)
# migrate → apply pending Prisma migrations using DIRECT_URL (port 5432), then exit
set -e
case "$1" in
  migrate)
    cd /repo/packages/db
    exec node_modules/.bin/prisma migrate deploy
    ;;
  serve)
    cd /repo/apps/api
    exec node dist/main.js
    ;;
  *)
    exec "$@"
    ;;
esac
