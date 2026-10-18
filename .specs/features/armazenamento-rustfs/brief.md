# Armazenamento: trocar o MinIO pelo RustFS - brief para o plano

Entrada para `tlc-spec-lean plan`, não o plano em si: o que já está decidido, o que o repositório mostra, as
decisões que o plano ainda tem de fechar e como provar a troca. Escrito em 2026-10-17, na sessão da `privacidade`.

## Problema

A imagem oficial `minio/minio` deixou de ser publicada, e o repositório usa hoje o fork da comunidade
`pgsty/minio` (AGPLv3), fixado por digest, no `compose.yaml` e nos testes (AD-042). O usuário decidiu trocar o
servidor de objetos pelo **RustFS** (Apache 2.0, 1.0 em GA desde 2026-09-16, API S3 na porta 9000). A API não
muda de contrato: ela fala S3 pelo `@aws-sdk/client-s3`, com `forcePathStyle: true`
(`apps/api/src/photos/photo-storage.ts:30`), e as variáveis `S3_*` seguem as mesmas.

## O que o repositório mostra (inventário)

O MinIO de verdade aparece em quatro lugares; o resto é o nome `minio` de um campo de teste.

| Onde | O que depende do MinIO |
| --- | --- |
| `compose.yaml:36-66` | serviço `storage` com `pgsty/minio`, `command: server /data`, `MINIO_ROOT_USER` e `MINIO_ROOT_PASSWORD`, healthcheck em `/minio/health/live`; `storage-init` usa a **mesma imagem** para rodar `mc alias set` e `mc mb --ignore-existing` |
| `apps/api/test/support/servers.ts:66-99` | `MINIO_IMAGE`, `MinioContainer` de `@testcontainers/minio` e `startMinio()`, que cria o bucket pelo cliente S3 |
| `apps/api/package.json:34` | dependência `@testcontainers/minio` |
| `tests/stack/compose.test.ts` (6 pontos) e `tests/stack/support.ts` (`breakBucketInit`) | `mc ls --recursive` dentro do container `storage`, e o texto `mc mb --ignore-existing` que o caso "bucket que não é criado" quebra |

Menções em texto: `.env.example:26`, AD-042 em `.specs/STATE.md:80` e a linha do Handoff em `STATE.md:127`, os
`plan.md` e `checks.md` de `fundacao`, `foto-pipeline`, `foto-captura`, `funcionarios` e `privacidade`, e o PRD.
Os testes de API usam `env.minio` (o campo `minio` de `PhotoStack`) em cerca de 25 arquivos: o nome pode ficar.

## O que muda de forma (para o plano conferir)

- **A imagem do RustFS não traz o `mc`.** O `storage-init` e os `mc ls` da stack precisam de outro cliente S3.
- **Credenciais**: `RUSTFS_ACCESS_KEY` e `RUSTFS_SECRET_KEY` no lugar de `MINIO_ROOT_USER` e
  `MINIO_ROOT_PASSWORD`; o container não sobe com a chave vazia.
- **Healthcheck**: `/health` (sem autenticação, `RUSTFS_HEALTH_ENDPOINT_ENABLE` ligado por padrão), e não
  `/minio/health/live`. Conferir se a imagem tem `curl`; se não tiver, o teste do healthcheck muda.
- **Testcontainers**: não há módulo de RustFS; `startMinio()` passa a um `GenericContainer` com a porta 9000,
  as duas variáveis e uma espera por `/health`.
- **Comportamento S3 que os testes já exercitam**: cliente com `forcePathStyle`, `HeadBucket` no `/health` da API,
  `DeleteObject` por chave, `ListObjectsV2`, o proxy `flakyStorage` (que só olha método e caminho) e o
  `RequestTimeTooSkewed` com o relógio falso. A cobertura S3 do RustFS é "das operações suportadas": a suíte de
  API inteira é a prova de que as usadas aqui existem.
- **Volume**: `storage-data` foi gravado pelo MinIO; o formato em disco não é o mesmo (a compatibilidade com
  disco do MinIO é preview no RustFS). Sem produção hoje (Impact da `privacidade`), o volume é recriado.

## Decisões que o plano tem de fechar (com a recomendação)

1. **Imagem do RustFS**: `rustfs/rustfs` numa versão 1.x fixada por tag **e digest**, como a AD-042 faz hoje.
   Recomendado: a última 1.0.x publicada há pelo menos duas semanas; o digest lido do registro, nunca inventado.
2. **Quem cria o bucket**: (a) um container de execução única com `amazon/aws-cli` fixado por digest,
   `aws s3api create-bucket` com `--endpoint-url http://storage:9000` e tolerância a "já existe"; (b) a própria
   API criar o bucket na subida. Recomendado (a): mantém a regra de hoje, "a API só inicia se o bucket existir",
   e não dá à API a permissão de criar bucket.
3. **Como a stack lista o bucket**: o mesmo `aws-cli`, por `docker compose run --rm` sobre o serviço de init, no
   lugar de `exec storage mc ls`. Recomendado, pelo mesmo motivo do item 2.
4. **AD nova**: uma AD que supersede a parte "MinIO pela imagem `pgsty/minio`" da AD-042, que fica `superseded by`.
   O resto da AD-042 (S3, as quatro variáveis, a API como única leitora, a chave `storage` do `/health`) não muda.

## Fora do escopo

- Migrar objetos de um volume MinIO existente (não há instalação em produção).
- Mudar o contrato da API, as variáveis `S3_*` ou o `@aws-sdk/client-s3`.
- Renomear o campo `minio` de `PhotoStack` nos testes de API (é só um nome).

## Como provar (o que os checks vão pedir)

- `pnpm verify` verde com o `startMinio()` subindo RustFS: as suítes de API que usam `startPhotoStack` tocam o
  bucket real (upload, troca, variantes, URLs assinadas, expurgo, falha de armazenamento pelo proxy, privacidade).
- A stack inteira (`pnpm test:stack`) verde, inclusive `up_wait_exits_zero_with_three_healthy`, o caso
  "bucket que não é criado" (com `breakBucketInit` trocando o novo comando) e `health_storage_up_then_down_when_storage_stops`.
- `git grep -i "pgsty\|MinioContainer\|@testcontainers/minio\|MINIO_ROOT"` sem resultado, e `mc ` só em histórico de `.specs`.

## Antes de começar

A `privacidade` está com o Verifier em **FAIL na rodada 1** (`334b2ce`): a linha de `Test policy` da operação
destrutiva não é cumprida por C21 e C34, e isso espera uma decisão do usuário. As duas mudanças tocam os mesmos
testes de falha de armazenamento (`flakyStorage`, `privacy-anonymize.test.ts`, `staff-privacy.test.ts`). Fechar a
rodada 2 da `privacidade` antes, e começar esta com a base depois dela, evita conflito nesses arquivos e um
Verifier rodando sobre dois servidores de objetos diferentes.
