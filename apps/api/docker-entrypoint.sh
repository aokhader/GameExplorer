#!/bin/sh
# Container entrypoint: start a colocated Redis, then the API in the same image.
#
# Redis here is EPHEMERAL working memory for live multiplayer state only
# (matchmaking queues, in-progress game + clock state). All durable data lives
# in Supabase, so losing Redis on a container restart/redeploy is acceptable.
# Persistence is therefore disabled (--save "" --appendonly no) so nothing ever
# touches disk. maxmemory-policy is `noeviction` so queued matchmaking entries
# are never silently dropped under memory pressure (they'd just fail loudly).
set -e

redis-server \
  --daemonize yes \
  --save "" \
  --appendonly no \
  --maxmemory 100mb \
  --maxmemory-policy noeviction \
  --bind 127.0.0.1 \
  --port 6379

# Block until Redis answers PING. The API connects to Redis at startup
# (enableReadyCheck) and exits if Redis/DB are unreachable, so we must not start
# it before Redis is accepting commands.
echo "Waiting for colocated Redis..."
until redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -q PONG; do
  sleep 0.2
done
echo "Redis ready; starting API."

exec node apps/api/dist/index.js
