# Armazenamento: trocar o MinIO pelo RustFS

## Problem

O servidor de objetos da stack e dos testes é um fork da comunidade, `pgsty/minio` (AGPLv3), fixado por
digest (AD-042), porque a imagem oficial `minio/minio` deixou de ser publicada. Ninguém do projeto mantém
esse fork, e nada garante que ele siga recebendo correção; quem paga é quem sobe a stack e quem roda a
suíte de API, que dependem dele para cada foto, exportação e anonimização. O usuário decidiu trocá-lo pelo
RustFS (Apache 2.0, 1.0 em GA desde 2026-09-16). O brief não traz incidente nem número; o motivo é a
manutenção da imagem, não um defeito observado.

Quando isto entrar: `docker compose up` e a suíte de API sobem RustFS no lugar do MinIO, e a API não muda
uma linha de contrato - o mesmo bucket privado, as mesmas quatro variáveis `S3_*`, o mesmo `/health`.

## Flow

Reutiliza o cliente S3 da API (`PhotoStorage`, `@aws-sdk/client-s3` com `forcePathStyle`), as variáveis
`S3_*` e o desenho de três serviços da AD-042 (servidor, execução única que cria o bucket, API que só
inicia depois dela); só troca o servidor e o cliente da execução única.

**Subida da stack**

1. `docker compose up` -> serviço `storage` (exists, imagem trocada pela door 1) - RustFS na porta 9000, credenciais de `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY`, dados no volume da door 3, `healthy` quando `/health/ready` responde `200`
2. serviço `storage-init` (exists, imagem e comando trocados pela door 2) - `aws s3api` cria o bucket se ele não existe e termina com 0
3. serviço `api` (exists) - só inicia depois de `migrate` e `storage-init` saírem com 0; `PhotoStorage` (exists) fala S3 com `http://storage:9000`
4. out: `/health` com `checks.storage` lido por `HeadBucket`, como hoje

**Testes de API**

1. `startMinio()` em `apps/api/test/support/servers.ts` (exists, corpo trocado) - sobe a imagem da door 1 por `GenericContainer` de `testcontainers` (door 4), espera `/health/ready`, cria o bucket pelo cliente S3 do teste
2. `startPhotoStack` (exists) e as suítes (exist) - recebem o mesmo `{ endpoint, bucket, env, client, stop }` e não mudam

**Testes da stack**

1. `tests/stack/compose.test.ts` (exists) - lista o bucket por `docker compose run --rm --no-deps` sobre `storage-init` (door 2), no lugar de `exec storage mc ls`
2. `breakBucketInit` em `tests/stack/support.ts` (exists) - quebra o novo comando da execução única

## Impact

| Front | What changes |
| --- | --- |
| domain | nothing - nenhum termo muda; "armazenamento", "bucket" e a chave `storage` de `/health` seguem com o mesmo sentido |
| stored data | o volume nomeado do servidor de objetos: o formato em disco do RustFS não é o do MinIO (a leitura de disco do MinIO é preview no RustFS). Não há produção (Impact da `privacidade`); a stack local do usuário tem um volume `storage-data` gravado pelo MinIO, com as fotos do percurso de tela. O que acontece com ele é a door 3 |
| contrato da API | nothing - `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` e `/health` iguais; `apps/api/src` não muda |
| suporte de teste | `startMinio`, `Minio`, `MINIO_IMAGE` (renomeado `STORAGE_IMAGE`) e o campo `minio` de `PhotoStack`: os nomes de função, tipo e campo ficam, porque cerca de 25 arquivos os usam e são só nomes (fora do escopo); a constante muda de nome porque o valor deixa de ser MinIO |
| dependências | sai `@testcontainers/minio`; `testcontainers` `^12.2.0`, hoje transitivo na mesma versão do lockfile, passa a dependência direta de desenvolvimento de `apps/api` (door 4) |
| decisões | AD-042 passa a `superseded by` a AD nova da door 5 |
| documentos | `.env.example` (comentário "MinIO na stack"), a linha `**Branch**` do Handoff em `STATE.md`. Os `plan.md` e `checks.md` de features fechadas e o PRD ("S3 ou MinIO") não mudam: são histórico e a frase do PRD continua verdadeira |

## Relations

None - no stored-data shape change. Nenhuma tabela muda; o bucket e o formato das chaves (AD-041, AD-055)
seguem iguais.

## Surface

None - nothing consumed outside. Nenhuma rota muda. A superfície que muda é de linha de comando (os
serviços `storage` e `storage-init` do `compose.yaml`); suas decisões estão em `Observable`.

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. imagem do servidor de objetos | `rustfs/rustfs:1.0.1@sha256:1803faef57627e2d9c2e7d89d655d712ddded5389040054987163043fecb6a3c` (índice multiplataforma lido do registro em 2026-10-17; tag publicada em 2026-10-03T05:01Z), a mesma string no `compose.yaml` e em `STORAGE_IMAGE` de `servers.ts`; no compose: `RUSTFS_ACCESS_KEY: ${S3_ACCESS_KEY_ID:?}`, `RUSTFS_SECRET_KEY: ${S3_SECRET_ACCESS_KEY:?}`, `RUSTFS_CONSOLE_ENABLE: 'false'`, sem `command` (o `entrypoint.sh` da imagem usa `RUSTFS_VOLUMES=/data`), healthcheck `['CMD', 'curl', '-fs', 'http://127.0.0.1:9000/health/ready']` | `1.0.2` e `1.0.3` - publicadas em 2026-10-16 e 2026-10-17, menos de duas semanas; a variante `-glibc` - nada aqui pede glibc, e a padrão (Alpine 3.24) já traz `curl`; só tag, sem digest - a tag pode ser republicada (a AD-042 fixa por digest); `MINIO_ROOT_USER` mantido - o RustFS aceita como alias com aviso de obsoleto, e uma variável a menos de nome próprio não paga um aviso a cada subida; healthcheck em `/health` - é liveness, `200` com o processo de pé antes de o IAM estar pronto, e `storage-init` dispara na hora |
| 2. quem cria e quem lista o bucket | `storage-init` com `amazon/aws-cli:2.37.9@sha256:92de75724b6a746951f0e8b915d86bbccd7cb55aff96cd0cb4f7017272160780` (tag de 2026-10-02T22:39Z), `entrypoint: [sh, -c, 'aws s3api head-bucket --bucket "$$S3_BUCKET" \|\| aws s3api create-bucket --bucket "$$S3_BUCKET"']`, ambiente `AWS_ENDPOINT_URL: http://storage:9000`, `AWS_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID:?}`, `AWS_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY:?}`, `AWS_DEFAULT_REGION: us-east-1`, `S3_BUCKET: ${S3_BUCKET:?}`; a stack lista por `docker compose run --rm --no-deps --entrypoint aws storage-init s3 ls --recursive s3://<bucket>/<prefixo>` (pergunta 1 respondida pelo usuário no padrão recomendado: o `aws-cli` roda só contra o RustFS local, sem conta nem acesso à AWS) | a API criar o bucket na subida - dá à credencial da API a permissão de criar bucket e desfaz "a API só inicia se o bucket existir"; `curl --aws-sigv4` dentro da própria imagem do RustFS - uma imagem a menos, mas requisição S3 montada à mão em shell, com o erro lido do status HTTP; só `create-bucket` tolerando o erro pelo texto - depende da mensagem de "já existe" do servidor |
| 3. volume do servidor de objetos | volume nomeado novo `rustfs-data:/data`; `storage-data` sai de `volumes:` e o volume que já existe na máquina fica intocado, sem serviço que o monte (pergunta 2 respondida pelo usuário no padrão recomendado) | manter `storage-data` - o RustFS subiria sobre um diretório gravado pelo MinIO, com a leitura desse formato em preview, e o resultado (recusa, migração parcial ou leitura) não está documentado; obriga a `docker compose down -v`, que apaga também o banco local |
| 4. dependência de teste | `testcontainers` `^12.2.0` em `devDependencies` de `apps/api`; `@testcontainers/minio` sai do `package.json` e do lockfile | um módulo de RustFS para o Testcontainers - não existe; `@testcontainers/minio` apontado para a imagem do RustFS - o módulo passa `MINIO_ROOT_USER` e espera `/minio/health/live`, um alias de compatibilidade que o RustFS pode tirar |
| 5. decisão de projeto | AD nova em `STATE.md` que repete a AD-042 inteira (S3, as quatro variáveis, a API única leitora, a chave `storage`) com o RustFS da door 1 e o `aws-cli` da door 2 no lugar do MinIO; a AD-042 passa a `superseded by AD-<nova>` | só a parte da imagem numa AD nova, com a AD-042 `active` - duas linhas ativas para o mesmo armazenamento, e a que cita `pgsty/minio` continuaria valendo pela coluna de status |

- Nothing else in this change is hard to reverse

## Criteria

### S1: A suíte de API roda contra o RustFS (P1)

Todo teste que grava, lê, lista ou apaga no bucket passa contra o RustFS, sem mudar uma asserção.

**Acceptance Criteria**

1. WHEN `startMinio()` é chamado THEN the system SHALL subir um container da imagem `STORAGE_IMAGE` (door 1) com `RUSTFS_ACCESS_KEY` e `RUSTFS_SECRET_KEY` iguais a `STORAGE_ACCESS_KEY` e `STORAGE_SECRET_KEY`, esperar `GET /health/ready` responder `200` e devolver o bucket `photos-test` já criado, no mesmo formato `{ endpoint, bucket, env, client, stop }`
2. The system SHALL usar em `STORAGE_IMAGE` de `apps/api/test/support/servers.ts` a mesma string de imagem do serviço `storage` do `compose.yaml`
3. WHEN `pnpm verify` roda THEN the system SHALL sair com código 0, com as suítes de API que usam `startMinio` ou `startPhotoStack` executadas contra o RustFS
4. The system SHALL deixar sem diff, em relação à base da feature, todo arquivo `apps/api/test/*.test.ts` e todo arquivo de `apps/api/src`
5. IF a chave pedida não existe no bucket THEN `PhotoStorage.get` SHALL devolver `undefined`, porque o RustFS responde o código `NoSuchKey`
6. IF o bucket configurado não existe no RustFS THEN the system SHALL responder `GET /health` com `503` e `checks.storage` igual a `down`
7. WHILE o relógio da API está falso (`vi.useFakeTimers({ toFake: ['Date'] })`) num instante a dias do relógio do RustFS (o `NOON` de `test/support/plans.ts` é `2026-10-07T15:00:00Z`) THEN the system SHALL concluir a gravação e a remoção de objetos, porque o RustFS responde `RequestTimeTooSkewed` e o SDK corrige o desvio na segunda tentativa (`maxAttempts: 2`)
8. The system SHALL declarar `testcontainers` em `devDependencies` de `apps/api` e não ter `@testcontainers/minio` em nenhum `package.json` nem no `pnpm-lock.yaml`

**Independent test:** `pnpm --filter @academia/api test` com Docker de pé.

### S2: A stack sobe com o RustFS (P1)

`docker compose up --build --wait` sobe o RustFS, cria o bucket privado e só então inicia a API.

**Acceptance Criteria**

9. WHEN `docker compose up --build --wait` roda num clone limpo com `.env` copiado de `.env.example` THEN the system SHALL sair com código 0, com `postgres`, `api` e `web` em `healthy`, `storage` em `healthy` e `storage-init` em `exited` com código 0
10. The system SHALL usar no serviço `storage` a imagem, as variáveis e o healthcheck literais da door 1, e no serviço `storage-init` a imagem, o comando e as variáveis literais da door 2
11. WHEN `docker compose up --wait` roda de novo sobre a mesma stack, com o bucket já criado THEN `storage-init` SHALL sair com código 0 e a API SHALL ficar `healthy`
12. IF `storage-init` sai com código diferente de 0 THEN the system SHALL nunca iniciar o container `api` (estado `created`, `StartedAt` `0001-01-01T00:00:00Z`) e `docker compose up --wait` SHALL sair com código diferente de 0
13. WHEN um pedido sem credencial, de dentro do container `api`, pede um objeto ou a listagem do bucket em `http://storage:9000` THEN the system SHALL responder `403` aos dois
14. IF `S3_ACCESS_KEY_ID` ou `S3_SECRET_ACCESS_KEY` está ausente ou vazia no `.env` THEN `docker compose config` SHALL sair com código diferente de 0 citando o nome da variável, de modo que o RustFS nunca suba com a credencial padrão `rustfsadmin`
15. WHEN o serviço `storage` é parado com a API de pé THEN the system SHALL responder `GET /health` com `503` e `checks` igual a `{ database: 'up', storage: 'down' }`
16. WHEN a stack está de pé THEN uma conexão de dentro do container `api` a `storage:9001` SHALL ser recusada (console desligado) e nenhuma porta do serviço `storage` SHALL estar publicada fora de `127.0.0.1`
17. WHEN a stack está de pé THEN o diretório `/logs` do container `storage` SHALL estar vazio, com o log do RustFS na saída padrão do container (`docker compose logs storage`)
18. The system SHALL montar no serviço `storage` o volume da door 3 e não declarar `storage-data` em `volumes:`

**Independent test:** `pnpm test:stack` com Docker de pé.

### S3: Nada do MinIO sobra no código (P2)

O repositório não depende mais de nada do MinIO fora do histórico de `.specs`.

**Acceptance Criteria**

19. WHEN `git grep -i -E "pgsty|MinioContainer|@testcontainers/minio|MINIO_ROOT|minio/health"` roda THEN the system SHALL não ter resultado fora de `.specs/`
20. WHEN `git grep -E "\bmc (alias|mb|ls)\b"` roda THEN the system SHALL não ter resultado fora de `.specs/`
21. The system SHALL descrever o armazenamento da stack em `.env.example` como RustFS, sem citar MinIO
22. The system SHALL registrar em `.specs/STATE.md` a AD da door 5 como `active` e a AD-042 com status `superseded by` essa AD

**Independent test:** os dois `git grep` e a leitura de `STATE.md` e `.env.example`.

## Out of scope

| Excluded | Why |
| --- | --- |
| migrar objetos de um volume gravado pelo MinIO | não há instalação em produção; a stack local é de desenvolvimento |
| mudar o contrato da API, as variáveis `S3_*` ou o `@aws-sdk/client-s3` | a troca é do servidor, e o cliente S3 já é o contrato (AD-042) |
| renomear `startMinio`, `Minio` e o campo `minio` de `PhotoStack` | são nomes usados em cerca de 25 arquivos de teste; renomear é um diff grande sem efeito |
| console web do RustFS | ninguém o usa hoje; desligado (AC 16) |
| backup e versionamento do bucket (PRD §4) | é da `operacao` |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| tag do RustFS | `1.0.1`, a mais recente com ao menos duas semanas em 2026-10-17; `1.0.2` traz correções de multipart copy, replicação e SSE-C, nenhuma em operação que a API usa | regra do pedido: tag 1.x mais recente com duas semanas, digest lido do registro | n |
| tag do `aws-cli` | `2.37.9`, a mais recente com ao menos duas semanas (2.37.10 é de 2026-10-06) | mesma regra | n |
| log do RustFS | `RUSTFS_OBS_LOG_DIRECTORY: ''` no serviço `storage`, para o log ir à saída padrão como o do MinIO ia; a imagem define `/logs`. O `entrypoint.sh` trata vazio como "stdout"; que o binário faça o mesmo com a variável vazia não está documentado - se não fizer, a AC 17 reprova e a pergunta volta | `docker compose logs storage` é o único lugar que alguém olha na stack | n |
| ordem em relação à `privacidade` | o Build desta feature começa depois da rodada 2 do Verifier da `privacidade`, com a base no commit dela | as duas mexem nos testes de falha de armazenamento; um Verifier sobre dois servidores de objetos diferentes não prova nenhum dos dois (brief, "Antes de começar") | n |
| PRD | a linha "S3 ou MinIO (bucket privado)" fica | continua verdadeira: o RustFS é compatível com S3, e o PRD descreve o produto, não a imagem | n |
| credencial vazia | correção de fato do brief: o `entrypoint.sh` da 1.0.1 sai com 1 quando `RUSTFS_ACCESS_KEY` está **presente e vazia**, mas só avisa e cai em `rustfsadmin` quando está **ausente**; o `:?` do compose cobre os dois casos (AC 14) | lido do `entrypoint.sh` da revisão `6de965a`, a da imagem 1.0.1 | n |

**Open questions:** none - as duas perguntas do plano respondidas pelo usuário no padrão recomendado (door 2: `aws-cli` local; door 3: volume `rustfs-data` novo).

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| comando `docker compose up` | saída e código quando o bucket não é criado | AC 12 |
| comando `docker compose up` | rodar de novo sobre a stack existente | AC 11 |
| comando `docker compose up` | variável de credencial ausente ou vazia | AC 14 |
| comando `docker compose up` | flags e padrões | existing - `--build --wait`, como o `compose.yaml` documenta na primeira linha; nada muda |
| serviço `storage` | o que imprime quando falha | AC 17 - o log do RustFS em `docker compose logs storage` |
| serviço `storage` | portas expostas | AC 16 |
| serviço `storage-init` | o que imprime quando falha | existing - o `aws` escreve o erro na saída de erro do container, que `docker compose logs storage-init` mostra; não há texto nosso a fixar |
| documento `.env.example` | o que o leitor faz em seguida | AC 21 - nada muda no que ele preenche; só o nome do servidor no comentário |
| API `GET /health` | forma e códigos | AC 6 e AC 15 - os mesmos da AD-042 |
| todas as rotas da API | versionamento, limites | n/a - nenhuma rota muda |

## Sources

- `.specs/features/armazenamento-rustfs/brief.md` - inventário, as quatro decisões com a recomendação, o fora do escopo e como provar
- docs.rustfs.com, `reference/environment-variables` e `reference/ports` - `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY` (padrão `rustfsadmin`), `RUSTFS_CONSOLE_ENABLE` (padrão `true`), `RUSTFS_HEALTH_ENDPOINT_ENABLE` (padrão `true`), `/health` e `/health/ready` sem autenticação na porta 9000
- registro do Docker Hub, consultado em 2026-10-17 - digests de `rustfs/rustfs:1.0.1` e `amazon/aws-cli:2.37.9` (`Docker-Content-Digest` do índice), e a configuração da imagem 1.0.1 (Alpine 3.24 com `curl`, usuário `rustfs` 10001, `RUSTFS_VOLUMES=/data`, `RUSTFS_OBS_LOG_DIRECTORY=/logs`, sem `mc`)
