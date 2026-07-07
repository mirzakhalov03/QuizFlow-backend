#!/usr/bin/env bash
#
# Provision Redis for QuizFlow on a single EC2 host.
#
# Redis backs the feedback dedup lock and the analytics cache. Both fail open
# (the app keeps working if Redis is down), and the API + worker are co-located
# on this one box — so Redis runs locally, bound to localhost, rather than as
# managed ElastiCache. It's installed under systemd (auto-start on boot,
# auto-restart on crash) with a bounded, LRU-evicting cache so it can't OOM the
# host.
#
# Idempotent: safe to re-run. Run once per box (and after an OS re-image).
#
#   bash provision-redis.sh
#
set -euo pipefail

MARKER="# quizflow-managed"
MAXMEMORY="256mb"

echo "==> Detecting package manager"
if command -v dnf >/dev/null 2>&1; then PKG=dnf; else PKG=yum; fi

echo "==> Installing Redis (via $PKG)"
# Amazon Linux ships Redis as 'redis6'; fall back to 'redis' elsewhere.
if ! sudo "$PKG" install -y redis6 2>/dev/null; then
  sudo "$PKG" install -y redis
fi

echo "==> Locating systemd unit"
SERVICE=""
for s in redis6 redis redis-server; do
  if systemctl list-unit-files | grep -q "^${s}\.service"; then SERVICE="$s"; break; fi
done
[ -n "$SERVICE" ] || { echo "ERROR: no redis systemd unit found"; exit 1; }

echo "==> Locating config file"
CONF=""
for c in /etc/redis6/redis6.conf /etc/redis/redis.conf /etc/redis.conf; do
  if [ -f "$c" ]; then CONF="$c"; break; fi
done
[ -n "$CONF" ] || { echo "ERROR: redis config not found"; exit 1; }

echo "    service=$SERVICE  config=$CONF"

echo "==> Applying config overrides"
# Appended overrides win (Redis honours the last occurrence of a directive).
# Guarded by a marker so re-runs don't duplicate the block.
if sudo grep -q "$MARKER" "$CONF"; then
  echo "    overrides already present, skipping"
else
  sudo tee -a "$CONF" >/dev/null <<EOF

$MARKER
bind 127.0.0.1
protected-mode yes
maxmemory $MAXMEMORY
maxmemory-policy allkeys-lru
EOF
fi

echo "==> Enabling + (re)starting $SERVICE"
sudo systemctl enable "$SERVICE"
sudo systemctl restart "$SERVICE"

echo "==> Verifying"
if redis-cli -h 127.0.0.1 -p 6379 ping | grep -q PONG; then
  echo "==> OK — Redis is up on 127.0.0.1:6379"
else
  echo "ERROR: Redis did not respond to PING"; exit 1
fi
