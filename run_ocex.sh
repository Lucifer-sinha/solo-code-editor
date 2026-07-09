#!/usr/bin/env bash
set -e
cd /opt/code-ta
# Use both prod compose and override with envs
/usr/bin/docker compose -f docker-compose.prod.yml -f docker-compose.override.yml up -d backend frontend redis
/usr/bin/docker compose ps
