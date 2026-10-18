#!/usr/bin/env sh
# Renderiza o `alertmanager.yml` a partir do `alertmanager.yml.tmpl`, substituindo o webhook que vem
# do `.env` de produção (door 6, AC 33). O arquivo renderizado é o que o container monta.
set -eu
cd "$(dirname "$0")/.."
: "${ALERT_WEBHOOK_URL:?ALERT_WEBHOOK_URL ausente no .env de producao}"
sed "s|__ALERT_WEBHOOK_URL__|${ALERT_WEBHOOK_URL}|g" \
  deploy/monitoring/alertmanager.yml.tmpl > deploy/monitoring/alertmanager.yml.tmp
mv deploy/monitoring/alertmanager.yml.tmp deploy/monitoring/alertmanager.yml
