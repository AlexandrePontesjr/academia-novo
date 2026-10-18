#!/usr/bin/env bash
# Sobe a stack de produção (door 3): o overlay do compose.yaml com a borda e a observabilidade.
# É o mesmo comando no servidor e nas provas de stack.
set -euo pipefail
cd "$(dirname "$0")/.."

# o `.env` do servidor é 0600 (door 7): criado a partir do `.env.example`, nunca versionado
[ -f .env ] && chmod 600 .env

bash deploy/render.sh
docker compose -f compose.yaml -f compose.prod.yaml up -d --wait
