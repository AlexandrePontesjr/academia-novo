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
| 7 | `foto-captura` | capturar pela câmera, recortar em 3:4 e trocar a foto mantendo versões | RF-11, RF-12, RF-16 | 6 | Build concluído (65 checks, `pnpm verify` verde); Verifier rodada 1 FAIL (`14f0e07`), conserto de testes em `def23e5`, rodada 2 em curso |
| 8 | `funcionarios` | RH cadastra funcionários com foto; ninguém mais os vê, e cada visualização é auditada | RF-09, RF-10 | 3, 6 | não iniciada |
| 9 | `planos-matriculas` | criar planos e matricular um aluno com início, vencimento e renovação | RF-19, RF-20 | 4 | não iniciada |
| 10 | `pagamentos` | registrar pagamento manual e ver o que está pendente ou atrasado | RF-21 | 9 | não iniciada |
| 11 | `check-in` | a recepção busca o aluno, confere a foto e registra a presença | RF-22, RF-23 | 6, 9 | não iniciada |
| 12 | `dashboard` | ver alunos ativos, vencimentos próximos e check-ins do dia | §8 tela 2 | 9, 11 | não iniciada |
| 13 | `privacidade` | exportar, anonimizar ou excluir os dados de um titular e configurar retenção | RF-28 a RF-30, RF-08 (exclusão definitiva) | 5, 7, 8, 10, 11 | não iniciada |
| 14 | `operacao` | rodar em homologação com HTTPS, backup restaurado e alertas | §4 disponibilidade, backup, observabilidade; §14 | 1; hospedagem definida | não iniciada |

RF-01 a RF-31 estão todos atribuídos a exatamente uma feature (RF-08 é dividido entre `alunos` e
`privacidade`). `operacao` pode subir na ordem assim que a hospedagem for decidida - quanto mais
cedo houver homologação, menos surpresa no fim.

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
| Retenção de inativos e de fotos antigas (§13.2) | configurável, com o padrão de 30 dias da RF-16 para versões de foto | o prazo de inativos é decisão jurídica da academia | go-live de `privacidade` |
| Hospedagem (§13.5) | VPS com Docker Compose + Caddy, como o §5 descreve | o provedor em si não muda o código | `operacao` |
| Pagamentos (§13.3) | resolvida pelo próprio PRD: só registro manual (RF-21) | - | - |
| Catraca ou biometria (§13.4) | resolvida pelo próprio PRD: fora do MVP (§1.4) | - | - |

## Lacunas do PRD a resolver no plano de cada feature

| Lacuna | Feature |
| --- | --- |
| O contrato de erro declara `validation_failed` com `errors[]`, mas a `fundacao` não tem rota com entrada: falta fixar o status dessa resposta e prová-la | fechada em `auth-rbac`: `422` (AD-021); a prova é a C17 de `features/auth-rbac/checks.md` |
| `students.guardian_id` aponta para uma tabela que o §6 não lista | `consentimento` |
| RF-01 diz "2FA opcional (TOTP) obrigatório para Administrador": opcional para os demais perfis, obrigatório para Administrador | fechada em `auth-rbac`: essa leitura foi confirmada (AC 24 e AC 25 do plano) |
| `users.role` guarda um perfil só; RF-09 fala em "vínculo opcional com usuário" - um funcionário pode ter mais de um perfil? | fechada em `auth-rbac`: um perfil por usuário (AD-018); o vínculo com funcionário segue em `funcionarios` |
| O fluxo do §5.1 e as RF-11 a RF-18 falam de aluno; a rota `/staff/:id/photo` existe - mesmas regras? | `foto-pipeline` |
| O diagrama do §5 mostra navegador → Next.js → NestJS; upload multipart de 5 MB passa pelo Next ou vai direto à API na mesma origem? | a parte de `auth-rbac` está fechada: o upload entra pela origem do web (AD-019). Segue aberta em `foto-pipeline` e `operacao`: quem o encaminha, o Next ou o proxy |
| Processamento de imagem síncrono na API ou em fila no worker (o §5 deixa o Redis como opcional) | `foto-pipeline` |
| "Regras de acesso" de um plano (RF-19) não têm formato definido | `planos-matriculas` |
| Dependências externas do §12: termo de consentimento revisado por jurídico e DPO nomeado | go-live de `consentimento` |
