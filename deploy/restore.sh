#!/usr/bin/env bash
# Restauração validada (door 5): reconstrói a stack de uma cópia de backup num projeto Compose
# próprio, com volumes e portas próprios, sem parar a stack de produção. A chave de cifra do
# operador é exigida: sem ela a observação de saúde restaurada seria ilegível (door 7).
set -euo pipefail
cd "$(dirname "$0")/.."

project="${RESTORE_PROJECT:-academia-restore}"
dump=""
while [ $# -gt 0 ]; do
  case "$1" in
    --project)
      project="$2"
      shift 2
      ;;
    *)
      dump="$1"
      shift
      ;;
  esac
done

if [ -z "$dump" ] || [ ! -f "$dump" ]; then
  echo "uso: $0 <dump> --project <nome>" >&2
  echo "o <dump> é o arquivo academia-<AAAA-MM-DDTHHMMSSZ>.dump do diretório de backup" >&2
  exit 2
fi

# a chave do operador: não é lida do `.env`, que o restore não deve ter como única fonte (AC 42)
: "${DATA_ENCRYPTION_KEY:?DATA_ENCRYPTION_KEY do operador ausente}"

: "${RESTORE_POSTGRES_PORT:?defina RESTORE_POSTGRES_PORT}"
: "${RESTORE_API_PORT:?defina RESTORE_API_PORT}"
: "${RESTORE_WEB_PORT:?defina RESTORE_WEB_PORT}"
: "${RESTORE_STORAGE_PORT:?defina RESTORE_STORAGE_PORT}"

# o nome do dump carrega a data do backup; os objetos daquele dia estão em `objects/<data>`
day="$(basename "$dump" | sed -n 's/^academia-\([0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}\)T.*/\1/p')"
# `pwd -W` devolve o caminho do host como o Docker no Windows o entende; no Linux ele não existe
backup_dir="$(cd "$(dirname "$dump")/.." && { pwd -W 2>/dev/null || pwd; })"
: "${day:?o dump precisa do nome academia-<AAAA-MM-DDTHHMMSSZ>.dump}"
[ -d "$backup_dir/objects/$day" ] || {
  echo "objetos do dia $day ausentes em $backup_dir/objects" >&2
  exit 1
}

# as portas da stack restaurada não são as da produção, e o projeto é outro
export COMPOSE_PROJECT_NAME="$project"
export POSTGRES_PORT="$RESTORE_POSTGRES_PORT"
export PORT="$RESTORE_API_PORT"
export WEB_PORT="$RESTORE_WEB_PORT"
export STORAGE_PORT="$RESTORE_STORAGE_PORT"
export WEB_ORIGIN="${RESTORE_WEB_ORIGIN:-http://localhost:$RESTORE_WEB_PORT}"

compose() { docker compose -p "$project" -f compose.yaml "$@"; }

echo "restaurando $dump no projeto $project"
# 1. o banco e o armazenamento da stack nova, e o bucket de objetos
compose up -d --wait postgres storage
compose run --rm --no-deps storage-init

# 2. o banco restaurado, do dump inteiro: um dump truncado falha aqui
compose cp "$dump" postgres:/tmp/restore.dump
compose exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --exit-on-error /tmp/restore.dump'

# 3. os objetos do dia, do backup para o bucket da stack nova
compose run --rm --no-deps -v "$backup_dir:/backup:ro" --entrypoint sh storage-init -c \
  "aws s3 sync \"/backup/objects/$day\" \"s3://\$S3_BUCKET\""

# 4. a stack restaurada inteira: as migrações já estão aplicadas pelo dump
compose up -d --wait

echo "stack restaurada no projeto $project: a aplicação responde em $WEB_ORIGIN"
