# Roadmap do MVP

Fonte: `PRD — Sistema de Gestão de Academia.md` v1.0. Cada linha é uma feature com seu próprio
ciclo Plan → Checks → Build → Verify em `.specs/features/<feature>/`. O plano de uma feature só é
escrito quando ela começa; aqui ficam a ordem, o que cada uma entrega e o que ainda precisa de
decisão.

## Ordem

| # | Feature | O que alguém consegue fazer quando ela entra | Requisitos | Depende de | Estado |
| --- | --- | --- | --- | --- | --- |
| 1 | `fundacao` | subir web + API + banco com um comando e saber, por um comando, se o repositório está são | §4 manutenibilidade, logs, segredos | - | concluída; verificação 33/33 na rodada 4 (`d060517`) |
| 2 | `auth-rbac` | entrar com e-mail e senha (2FA para Administrador), e cada perfil só alcança o que pode | RF-01 a RF-04, gestão de usuários, CSRF, Argon2id | 1 | concluída; verificação 102/102 na rodada 4 (`8789baf`) |
| 3 | `auditoria` | o Administrador consulta quem fez o quê; toda feature seguinte já nasce auditada | RF-24 a RF-26 | 2 | verificada (PASS, 73/73) |
| 4 | `alunos` | cadastrar, buscar, editar e inativar alunos | RF-05, RF-07, RF-08 (inativação), RF-31 | 3 | verificada (PASS, 94/94) |
| 5 | `consentimento` | registrar consentimento versionado e o responsável legal de menores | RF-06, RF-27 | 4 | verificada (PASS, 88/88) |
| 6 | `foto-pipeline` | enviar um arquivo de foto e vê-lo servido só por URL assinada | RF-13, RF-14, RF-15, RF-17, RF-18 | 4 | verificada (PASS, 81/81) |
| 7 | `foto-captura` | capturar pela câmera, recortar em 3:4 e trocar a foto mantendo versões | RF-11, RF-12, RF-16 | 6 | verificada (PASS, 65/65) |
| 8 | `funcionarios` | RH cadastra funcionários com foto; ninguém mais os vê, e cada visualização é auditada | RF-09, RF-10 | 3, 6 | verificada (PASS, 114/114, rodada 2 em `368106c`) |
| 9 | `planos-matriculas` | criar planos e matricular um aluno com início, vencimento e renovação | RF-19, RF-20 | 4 | plano aprovado e checks escritos em 2026-10-08; Build em três batches: A (S0 a S2, banco, contrato e rotas de plano) verde em `03246e5`, B (S3 a S7, matrículas e trilha) verde em `c146268` e C (S8 a S10, telas e stack) verde em `f21018e`: os 112 checks fechados; Verifier rodada 1 FAIL em `9836853` (um mutante sobrevivente no limite de 365 dias de `startsAt` na virada do dia e um membro da door 1 sem prova), consertado só em testes (`dfc24b8`, `ef953fd`, `0bd43d3`; nenhum check editado) e **rodada 2 PASS em `0bd43d3`** (`features/planos-matriculas/verification.md`, `Profile: standard`, 112/112 checks, 115/115 provas, as duas falhas reinjetadas mortas; `validate_verification.py` sai com 0): concluída e verificada |
| 10 | `pagamentos` | confirmar e desfazer o pagamento de um período e ver o que está pendente ou atrasado | RF-21 | 9 | versão simples (confirmar e desfazer o pagamento do período inteiro, sem valor digitado, parcial nem forma): plano aprovado em 2026-10-09 e doors 1 a 3 registradas como AD-067 a AD-069 (AD-064 a AD-066, da versão com saldo em `v1-parcial/`, `superseded`); `features/pagamentos/checks.md` reescrito (74 checks, `Profile: standard`); mecanismo `handoff` em dois batches: **A (S0 a S5 e C67 a C70: banco, contrato, conta, as quatro rotas e a trilha) construído e verde em `593c6c3`** (C1 a C38 e C60 a C70; `pnpm verify` verde), **B (S6, S7, C71 e C72 a C74: telas e stack) construído e verde em `41b66a6`** (C39 a C59 e C71 a C74); **Verifier rodada 1 PASS em `d6cedcd`** (`features/pagamentos/verification.md`, `Profile: standard`, 74/74 checks, os 5 mutantes mortos, 783 testes verdes): concluída e verificada |
| 11 | `check-in` | a recepção busca o aluno, confere a foto e registra a presença (uma por dia, só de aluno liberado); o histórico na ficha e o relatório por período; acrescenta ao painel da #12 o card "Check-ins de hoje", a chave nova `checkIns` de `GET /api/dashboard` (AD-070), que só `admin` e `reception` recebem (AD-074) | RF-22, RF-23; §8 telas 2 e 7 | 6, 9 | plano aprovado como escrito em 2026-10-16 (pagamento atrasado não bloqueia; desfazer presença fica fora) e doors 1 a 4 registradas como AD-071 a AD-074; `features/check-in/checks.md` escrito (107 checks, `Profile: standard`); mecanismo `handoff` em dois batches sobre a base `c2f2e9f`: **A (S0 a S5: banco, contrato, as rotas e o card do painel) verde em `2fb19b9`**, **B (S6 a S10: telas e stack) verde em `1eaf7b2`**; **Verifier rodada 1 PASS em `467f7c1`** (`features/check-in/verification.md`, `Profile: standard`, 107/107 checks, os 5 mutantes mortos, nenhum membro de `Coverage` sem prova, a linha de `Test policy` atendida, 115 provas verdes): concluída e verificada |
| 12 | `dashboard` | ver alunos ativos e vencimentos próximos | §8 tela 2 (sem os check-ins do dia, que entram com a #11) | 9 | verificada (PASS, 58/58, rodada 1 em `baacd2b`); door 1 registrada como AD-070 |
| 13 | `privacidade` | exportar, anonimizar ou excluir os dados de um titular e configurar retenção | RF-28 a RF-30, RF-08 (exclusão definitiva) | 5, 7, 8, 10, 11 | plano aprovado como escrito em 2026-10-17 (a exclusão a pedido anonimiza no lugar e mantém matrículas, pagamentos e presenças sem nome; a retenção automática de inativos é um temporizador que começa desligado; aluno e funcionário são titulares; só `admin` exporta e anonimiza) e doors 1 a 7 registradas como AD-075 a AD-081 (AD-051 `superseded`); `features/privacidade/checks.md` escrito (111 checks, `Profile: standard`); mecanismo `handoff` em três batches: A verde em `2ef3ea1`, B em `363dd9b`, C em `592ad70`; concluída e verificada (PASS, 111/111, rodada 2 em `5cf5d86`). Go-live depende do prazo de anos (decisão jurídica, "Decisões em aberto") |
| 14 | `operacao` | rodar em homologação com HTTPS, backup restaurado e alertas | §4 disponibilidade, backup, observabilidade; §14 | 1; hospedagem definida | concluída e verificada (PASS, 56/56, rodada 1 sobre `4fcc4ad..68953ac`, registro em `c455a78`). Go-live depende do provedor e do domínio, do webhook de alerta, da cópia off-site e do monitor externo |
| 15 | `pre-cadastro` | o visitante envia nome, e-mail e telefone em `/matricula` e confirma o e-mail (ou entra com Google, quando ligado); a equipe vê "Interessados" e converte em aluno | fora do PRD (pedido do usuário em 2026-10-22) | 4, 5 | plano aprovado como escrito em 2026-10-22 e doors 1 a 11 registradas como AD-107 a AD-117; `features/pre-cadastro/checks.md` escrito (108 checks, `Profile: standard`); estimativa de 227k contra 150k, mecanismo `handoff` em dois batches: **A (S0 a S4 e S9) verde em `6c9b247`**, **B (S5 a S8 e S10) verde em `bc7aa67`**; quem converte passou a `admin` e `reception` (correção do usuário em 2026-10-23); **Verifier rodada 1 FAIL** (C96 sem as rotas públicas), corrigida em `a60d180`, **rodada 2 PASS em `053c864`** (`features/pre-cadastro/verification.md`, 108/108, 6 mutantes mortos): concluída e verificada. Go-live depende das credenciais de SMTP e Google e do texto jurídico do termo |

| 17 | `portal-aluno` | o aluno adulto com ficha pede o primeiro acesso com CPF e e-mail e define a senha pelo link enviado ao e-mail da ficha; entra em `/minha-conta`, vê perfil e pagamentos, altera telefone, endereço e contato de emergência (e-mail e CPF fixos) e envia foto que a recepção aprova; "esqueci minha senha"; inativar ou anonimizar corta o acesso (suspender não) | fora do PRD (pedido do usuário em 2026-10-28; adendo §15 do PRD) | 2, 4, 7, 10, 13, 15 | plano aprovado como escrito em 2026-10-28 (primeiro acesso pelo próprio aluno com CPF e e-mail; e-mail e CPF fixos no portal; suspenso mantém o acesso) e doors 1 a 7 registradas como AD-119 a AD-125; `features/portal-aluno/checks.md` escrito (92 checks, `Profile: standard`); mecanismo `handoff` em dois batches (escolha do usuário em 2026-10-28); batch A (S0 a S4) verde em `1777b98`, C1 a C42 fechados (a C6 com a catraca das duas ações de foto para o batch B), a C26 e a C91 reescritas com a aprovação do usuário; próximo: o batch B (S5 a S9) em sessão nova, depois o Verifier. Go-live depende das credenciais de SMTP, as mesmas da `pre-cadastro` |

RF-01 a RF-31 estão todos atribuídos a exatamente uma feature (RF-08 é dividido entre `alunos` e
`privacidade`). As linhas 1 a 15 estão concluídas e verificadas; o que resta é go-live, que
depende das decisões listadas em cada linha e em "Decisões em aberto" (a hospedagem, inclusive).

## Critérios de aceite do MVP (PRD §14)

| Critério | Onde é provado |
| --- | --- |
| RF-01 a RF-31 implementados e testados | o `verification.md` de cada feature |
| Nenhuma foto por URL pública permanente | `foto-pipeline` |
| Toda ação sensível em `audit_logs` | `auditoria`, e um check de auditoria em cada feature seguinte |
| Backup e restauração validados em homologação | `operacao` |
| Teste de segurança básico (OWASP Top 10) | `operacao`, sobre o MVP completo |

## Decisões em aberto

As questões do PRD §13, com a recomendação e o ponto em que cada uma passa a travar.

| Questão | Recomendação | Por quê | Trava |
| --- | --- | --- | --- |
| Uma academia ou várias (§13.1) | resolvida: uma instalação por academia, sem `tenant_id` nas tabelas (AD-016) | ver door 1 em `features/auth-rbac/plan.md` | - |
| Drizzle ou Prisma (§13.6) | resolvida: Drizzle (AD-008) | ver door 2 em `features/fundacao/plan.md` | - |
| Better Auth ou Auth.js (§13.6) | resolvida: Better Auth, usado como biblioteca (AD-017) | ver door 2 em `features/auth-rbac/plan.md`; o limite de tentativas e o CSRF são código da aplicação (doors 8 e 11) | - |
| Retenção de inativos e de fotos antigas (§13.2) | mecanismo resolvido em `privacidade`: os dois prazos ficam em `privacy_settings`, numa tela só do Administrador (AD-078); a anonimização automática de inativos começa desligada e as versões de foto em 30 dias. Segue aberto só o número de anos | o prazo de inativos é decisão jurídica da academia, com o DPO (§12); nada no Build depende dele | go-live de `privacidade` |
| Hospedagem (§13.5) | VPS com Docker Compose + Caddy, como o §5 descreve | o provedor em si não muda o código | `operacao` |
| Pagamentos (§13.3) | resolvida pelo próprio PRD: só registro manual (RF-21) | - | - |
| Catraca ou biometria (§13.4) | resolvida pelo próprio PRD: fora do MVP (§1.4) | - | - |

## Lacunas do PRD a resolver no plano de cada feature

| Lacuna | Feature |
| --- | --- |
| O contrato de erro declara `validation_failed` com `errors[]`, mas a `fundacao` não tem rota com entrada: falta fixar o status dessa resposta e prová-la | fechada em `auth-rbac`: `422` (AD-021); a prova é a C17 de `features/auth-rbac/checks.md` |
| `students.guardian_id` aponta para uma tabela que o §6 não lista | `consentimento` |
| RF-01 diz "2FA opcional (TOTP) obrigatório para Administrador": opcional para os demais perfis, obrigatório para Administrador | fechada em `auth-rbac`: essa leitura foi confirmada (AC 24 e AC 25 do plano) |
| `users.role` guarda um perfil só; RF-09 fala em "vínculo opcional com usuário" - um funcionário pode ter mais de um perfil? | fechada em `auth-rbac`: um perfil por usuário (AD-018); o vínculo com funcionário fecha em `funcionarios`: `staff.user_id` anulável e único, o perfil é o `role` do usuário vinculado, lido na hora, e só o Administrador vincula (AD-053) |
| O fluxo do §5.1 e as RF-11 a RF-18 falam de aluno; a rota `/staff/:id/photo` existe - mesmas regras? | fechada em `funcionarios`: as mesmas regras do aluno (tipos, 5 MiB, 300×400, três variantes, par `POST` e `PUT`, retenção e expurgo), com o funcionário como segundo dono de `photos` (AD-054, AD-055); só `admin` e `hr_finance` |
| O diagrama do §5 mostra navegador → Next.js → NestJS; upload multipart de 5 MB passa pelo Next ou vai direto à API na mesma origem? | a parte de `auth-rbac` está fechada: o upload entra pela origem do web (AD-019). Segue aberta em `foto-pipeline` e `operacao`: quem o encaminha, o Next ou o proxy |
| Processamento de imagem síncrono na API ou em fila no worker (o §5 deixa o Redis como opcional) | `foto-pipeline` |
| "Regras de acesso" de um plano (RF-19) não têm formato definido | fechada em `planos-matriculas`: texto livre opcional de até 500 caracteres, que as pessoas leem e o sistema não interpreta (AD-058); regra que o `check-in` aplique sozinho será coluna nova ao lado do texto |
| Dependências externas do §12: termo de consentimento revisado por jurídico e DPO nomeado | go-live de `consentimento` |
