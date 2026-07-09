#!/usr/bin/env bash
set -e
cd /opt/code-ta
export COMPOSE_FILE=docker-compose.prod.yml:docker-compose.override.yml
# Build services separately to capture errors clearly
/usr/bin/docker compose build backend
/usr/bin/docker compose build frontend
# Bring up services
/usr/bin/docker compose up -d backend frontend redis
# Show status
/usr/bin/docker compose ps
