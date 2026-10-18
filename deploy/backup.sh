#!/usr/bin/env bash
# Backup diário (door 5): `pg_dump -Fc` do Postgres e `s3 sync` do bucket de fotos para um
# diretório do host, fora dos volumes do Docker; grava o marcador que o node-exporter lê. Em
# qualquer falha o script sai diferente de 0, apaga o parcial e deixa o marcador como estava.
set -euo pipefail
cd "$(dirname "$0")/.."

# o operador roda com o `.env` exportado; a suíte passa parte dos valores pelo ambiente. O que não
# veio do ambiente é completado pelo `.env`, sem sobrescrever o que o operador já exportou.
if [ -f .env ]; then
  while IFS= read -r line; do
    case "$line" in
      '' | '#'*) continue ;;
    esac
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      *[!A-Z0-9_]* | '') continue ;;
    esac
    eval "present=\${$key+x}"
    if [ -z "$present" ]; then
      export "$key=$value"
    fi
  done < .env
fi
: "${BACKUP_DIR:?BACKUP_DIR ausente no .env de producao}"
: "${POSTGRES_USER:?POSTGRES_USER ausente no .env de producao}"
: "${POSTGRES_DB:?POSTGRES_DB ausente no .env de producao}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
COMPOSE="docker compose -f compose.yaml -f compose.prod.yaml"

umask 077
# o modo é 0700 no servidor; o Git Bash do Windows não consegue aplicar modo em diretório e cai no mkdir
install -d -m 700 "$BACKUP_DIR" "$BACKUP_DIR/db" "$BACKUP_DIR/objects" "$BACKUP_DIR/metrics" 2>/dev/null ||
  mkdir -p "$BACKUP_DIR" "$BACKUP_DIR/db" "$BACKUP_DIR/objects" "$BACKUP_DIR/metrics"

now="$(date -u +%Y-%m-%dT%H%M%SZ)"
day="$(date -u +%Y-%m-%d)"
dump="$BACKUP_DIR/db/academia-$now.dump"

fail() {
  rm -f "$dump.partial"
  echo "backup falhou: $*" >&2
  exit 1
}

# o dump do banco: o parcial só vira o arquivo do dia depois de o pg_dump terminar com 0
install -m 600 /dev/null "$dump.partial" 2>/dev/null || : > "$dump.partial"
$COMPOSE exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$dump.partial" \
  || fail "pg_dump"
mv "$dump.partial" "$dump"

# a cópia dos objetos do bucket, pelo serviço `aws-cli` (o mesmo cliente do storage-init)
$COMPOSE --profile backup run --rm --no-deps --entrypoint sh aws-cli -c \
  "aws s3 sync \"s3://\$S3_BUCKET\" /backup/objects/$day" \
  || fail "copia dos objetos"

# o marcador lido pelo textfile collector do node-exporter, trocado de forma atômica
timestamp="$(date -u +%s)"
bytes="$(wc -c < "$dump" | tr -d ' ')"
marker="$BACKUP_DIR/metrics/backup.prom"
install -m 600 /dev/null "$marker.tmp" 2>/dev/null || : > "$marker.tmp"
{
  printf '# HELP backup_last_success_timestamp_seconds Instante do ultimo backup bem-sucedido.\n'
  printf '# TYPE backup_last_success_timestamp_seconds gauge\n'
  printf 'backup_last_success_timestamp_seconds %s\n' "$timestamp"
  printf '# HELP backup_dump_bytes Tamanho do dump do banco.\n'
  printf '# TYPE backup_dump_bytes gauge\n'
  printf 'backup_dump_bytes %s\n' "$bytes"
} > "$marker.tmp"
mv "$marker.tmp" "$marker"

# retenção: apaga o que passou de BACKUP_RETENTION_DAYS dias, e mantém os mais recentes
find "$BACKUP_DIR/db" -maxdepth 1 -type f -name 'academia-*.dump' -mtime "+$RETENTION" -delete
find "$BACKUP_DIR/objects" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETENTION" -exec rm -rf {} +
