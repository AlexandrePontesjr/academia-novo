# PRD — Sistema de Gestão de Academia

**Versão:** 1.0 · **Data:** 01/10/2026 · **Status:** Rascunho para validação

---

## 1. Visão geral

### 1.1 Resumo

Plataforma web para gestão de academia com cadastro de **alunos** e **funcionários**, incluindo **foto 3×4**, controle de acesso por perfil, matrículas, presença e trilha de auditoria. O produto trata fotos e dados pessoais em conformidade com a **LGPD (Lei 13.709/2018)**.

### 1.2 Problema

Academias pequenas e médias controlam cadastros em planilhas ou sistemas legados, sem identificação visual confiável na recepção, sem controle de quem acessa dados pessoais e sem rastreabilidade. Isso gera risco de fraude (uso de matrícula por terceiros), exposição de dados e retrabalho.

### 1.3 Objetivos

1. Cadastrar e consultar alunos e funcionários em poucos segundos, com foto padronizada.
2. Garantir que fotos e dados pessoais só sejam acessados por quem tem permissão.
3. Registrar toda ação sensível (visualização, edição, exclusão) em auditoria.
4. Ser simples de operar na recepção (desktop e tablet).

### 1.4 Não objetivos (fora do MVP)

- App nativo para alunos, reconhecimento facial, catraca biométrica.
- Treinos/prescrição de exercícios, nutrição, marketplace.
- Multi-unidade/franquias (previsto para fase 3).

---

## 2. Perfis de usuário

| Perfil | Descrição | Permissões principais |
| --- | --- | --- |
| **Administrador** | Dono/gerente | Acesso total, gestão de usuários, auditoria, exportações |
| **Recepção** | Atendimento | Cadastrar/editar alunos, enviar fotos, registrar presença; sem acesso a dados de funcionários |
| **RH/Financeiro** | Gestão de pessoas | Cadastro de funcionários, matrículas, pagamentos |
| **Instrutor** | Professor | Consulta de alunos (nome, foto, status); sem dados sensíveis |
| **Aluno** *(fase 2)* | Portal do aluno | Ver/atualizar os próprios dados, solicitar exclusão |

---

## 3. Requisitos funcionais

### 3.1 Autenticação e autorização

- **RF-01** Login por e-mail e senha; 2FA opcional (TOTP) obrigatório para Administrador.
- **RF-02** Sessão com cookie `HttpOnly`, `Secure`, `SameSite=Lax`; expiração por inatividade.
- **RF-03** RBAC: permissões por perfil verificadas **no backend** em todo endpoint.
- **RF-04** Bloqueio temporário após tentativas falhas (rate limiting).

### 3.2 Cadastro de alunos

- **RF-05** Campos: nome completo, CPF (validado), data de nascimento, sexo, e-mail, telefone, endereço, contato de emergência, observações de saúde (opcional), status (ativo, inativo, suspenso).
- **RF-06** Menores de 18 anos exigem dados e consentimento do responsável legal.
- **RF-07** Busca por nome, CPF, telefone e status, com paginação e filtros.
- **RF-08** Inativação (soft delete) preservando histórico; exclusão definitiva apenas por Administrador, conforme política de retenção.

### 3.3 Cadastro de funcionários

- **RF-09** Campos: nome, CPF, cargo, setor, data de admissão, contato, status, perfil de acesso ao sistema (vínculo opcional com usuário).
- **RF-10** Dados de funcionários visíveis apenas para Administrador e RH.

### 3.4 Foto 3×4

- **RF-11** Upload por arquivo, arrastar e soltar ou **captura pela câmera** (webcam/tablet).
- **RF-12** Editor de recorte com proporção fixa **3:4**, zoom e rotação antes de enviar.
- **RF-13** Validações no servidor: tipos `image/jpeg`, `image/png`, `image/webp` conferidos por *magic bytes* (não só extensão); tamanho máximo 5 MB; dimensão mínima 300×400 px.
- **RF-14** Processamento (Sharp): remoção de metadados EXIF/GPS, correção de orientação, conversão para **WebP** e geração de variantes: `thumb` 96×128, `medium` 240×320, `large` 600×800.
- **RF-15** Arquivo original **não** é mantido por padrão (minimização de dados); opção configurável de reter por prazo curto.
- **RF-16** Substituição de foto mantém histórico de versões por período configurável (padrão 30 dias) e depois exclui definitivamente.
- **RF-17** Fotos servidas apenas por **URL assinada de curta duração** (ex.: 5 min) emitida após checagem de permissão; bucket privado.
- **RF-18** Placeholder com iniciais quando não há foto.

### 3.5 Planos e matrículas

- **RF-19** Cadastro de planos (nome, periodicidade, valor, regras de acesso).
- **RF-20** Matrícula vinculando aluno a plano, com início, vencimento, status e renovação.
- **RF-21** Registro manual de pagamentos e status (pago, pendente, atrasado). *Integração com gateway: fase 2.*

### 3.6 Presença / check-in

- **RF-22** Check-in na recepção por busca de nome/CPF; a tela exibe **foto 3×4**, nome e situação da matrícula (liberado/bloqueado) para conferência visual.
- **RF-23** Histórico de presença por aluno e relatório por período.

### 3.7 Auditoria

- **RF-24** Log imutável (append-only) de: login, falhas de login, criação/edição/exclusão de cadastros, upload/troca/exclusão de foto, **visualização de dados de funcionários** e exportações.
- **RF-25** Cada registro contém: usuário, ação, entidade, ID, IP, user-agent, data/hora e diff resumido (sem dados sensíveis em texto puro).
- **RF-26** Tela de consulta de auditoria com filtros (somente Administrador).

### 3.8 LGPD e privacidade

- **RF-27** Registro de **consentimento** para uso da imagem e dos dados (texto versionado, data, responsável).
- **RF-28** Exportação dos dados de um titular (portabilidade/acesso) em JSON/PDF.
- **RF-29** Anonimização/exclusão a pedido do titular, respeitando prazos legais de retenção (ex.: fiscais).
- **RF-30** Política de retenção configurável (ex.: exclusão automática de alunos inativos após X anos).
- **RF-31** Campos sensíveis (saúde) criptografados em nível de aplicação.

---

## 4. Requisitos não funcionais

| Área | Requisito |
| --- | --- |
| **Desempenho** | Listagens \< 500 ms (p95) até 20 mil alunos; thumbnail carrega \< 300 ms; upload + processamento \< 5 s |
| **Disponibilidade** | 99,5% no MVP; janela de manutenção fora do horário de pico |
| **Segurança** | HTTPS obrigatório (HSTS), CSP, proteção CSRF, validação de entrada (Zod), senhas com Argon2id, segredos fora do repositório |
| **Upload seguro** | Nome de arquivo gerado (UUID), sem path do cliente, limite de tamanho no proxy e na API, varredura antivírus opcional (ClamAV) |
| **Privacidade** | Bucket privado, criptografia em repouso e em trânsito, mínimo de dados necessários |
| **Backup** | PostgreSQL diário + bucket com versionamento; RPO 24 h, RTO 4 h; teste de restauração trimestral |
| **Observabilidade** | Logs estruturados, métricas (Prometheus/Grafana ou equivalente), alertas de erro |
| **Acessibilidade** | WCAG 2.1 AA nas telas principais; responsivo (desktop e tablet) |
| **Idioma** | pt-BR; datas, moeda e CPF formatados para o Brasil |
| **Manutenibilidade** | TypeScript strict, cobertura de testes ≥ 70% no domínio, CI com lint/testes/build |

---

## 5. Arquitetura e stack

**Decisão:** monolito modular (sem microsserviços), com worker separado para processamento assíncrono.

| Camada | Tecnologia |
| --- | --- |
| Frontend | Next.js 16 (App Router), TypeScript strict, Tailwind CSS, shadcn/ui |
| Formulários | React Hook Form + Zod |
| Backend | NestJS, REST + OpenAPI/Swagger |
| Banco | PostgreSQL |
| ORM | Drizzle ou Prisma |
| Arquivos | S3 ou MinIO (bucket privado) |
| Imagens | Sharp |
| Autenticação | Better Auth ou Auth.js |
| Filas/cache | Redis/Valkey (opcional; necessário se o processamento de imagem for assíncrono) |
| Deploy | Docker Compose + Caddy ou Traefik (HTTPS automático) |

```
Navegador ──HTTPS──► Next.js ──REST──► NestJS ──► PostgreSQL (dados)
                                          ├────► S3/MinIO   (fotos)
                                          └────► Redis      (jobs/cache)
                                                    ▲
                                                 Worker (Sharp)
```

**Estrutura do monorepo**

```
apps/
├── web/        # Next.js (painel)
├── api/        # NestJS (módulos: auth, students, staff, photos, plans, attendance, audit, privacy)
└── worker/     # processamento de imagens e jobs agendados
packages/
├── ui/         # componentes compartilhados
├── contracts/  # schemas Zod e tipos compartilhados
├── config/     # eslint, tsconfig
└── database/   # schema, migrations, seeds
```

### 5.1 Fluxo de upload de foto

1. Usuário recorta a imagem 3:4 no navegador.
2. Front solicita `POST /students/:id/photo` (multipart) ou URL pré-assinada de upload temporário.
3. API valida permissão, tamanho, tipo (magic bytes) e dimensões.
4. Worker/serviço: remove EXIF, corrige orientação, converte para WebP e gera `thumb`, `medium`, `large`.
5. Arquivos gravados em `photos/{tenant}/{studentId}/{versionId}/{variant}.webp`.
6. Metadados salvos no PostgreSQL; evento registrado em auditoria.
7. Para exibir, o front chama `GET /students/:id/photo?variant=thumb`; a API checa permissão, registra acesso (quando aplicável) e retorna URL assinada de 5 min.

---

## 6. Modelo de dados (resumo)

| Tabela | Campos principais |
| --- | --- |
| `users` | id, email, password_hash, role, two_factor_enabled, active |
| `students` | id, name, cpf (único), birth_date, email, phone, address, status, guardian_id, health_notes_enc, created_at, deleted_at |
| `staff` | id, name, cpf, position, department, hired_at, status, user_id |
| `photos` | id, owner_type (student/staff), owner_id, version, is_current, storage_key, width, height, size_bytes, checksum, created_by, created_at, expires_at |
| `consents` | id, subject_type, subject_id, purpose, text_version, granted_at, revoked_at, granted_by |
| `plans` | id, name, period, price, rules |
| `enrollments` | id, student_id, plan_id, starts_at, ends_at, status |
| `payments` | id, enrollment_id, amount, due_date, paid_at, status, method |
| `attendance` | id, student_id, checked_in_at, checked_in_by |
| `audit_logs` | id, user_id, action, entity, entity_id, ip, user_agent, diff, created_at |

Índices: `students(cpf)`, `students(name)` (trigram para busca), `photos(owner_type, owner_id, is_current)`, `audit_logs(created_at, user_id)`.

---

## 7. API (principais endpoints)

| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/auth/login` · `/auth/logout` | Sessão |
| GET/POST | `/students` | Listar/criar |
| GET/PATCH/DELETE | `/students/:id` | Detalhe/editar/inativar |
| POST/DELETE | `/students/:id/photo` | Enviar/remover foto |
| GET | `/students/:id/photo` | URL assinada da foto |
| GET/POST | `/staff` · `/staff/:id` | Funcionários |
| POST/DELETE | `/staff/:id/photo` | Foto de funcionário |
| GET/POST | `/plans` · `/enrollments` · `/payments` | Planos, matrículas, pagamentos |
| POST | `/attendance/check-in` | Registrar presença |
| GET | `/audit-logs` | Consulta de auditoria |
| GET | `/privacy/export/:subjectId` | Exportar dados do titular |
| POST | `/privacy/anonymize/:subjectId` | Anonimizar/excluir |

---

## 8. Experiência do usuário (telas do MVP)

1. Login (com 2FA quando exigido).
2. Dashboard: alunos ativos, vencimentos próximos, check-ins do dia.
3. Lista de alunos (busca, filtros, miniatura da foto).
4. Ficha do aluno: dados, foto, matrícula, pagamentos, presença, consentimentos.
5. Modal de captura/recorte de foto 3:4.
6. Lista e ficha de funcionários.
7. Check-in rápido (campo único + cartão com foto grande e status).
8. Planos e matrículas.
9. Auditoria e configurações de privacidade/retenção.

---

## 9. Métricas de sucesso

| Métrica | Meta (90 dias pós-lançamento) |
| --- | --- |
| Alunos com foto cadastrada | ≥ 90% |
| Tempo médio de check-in | \< 10 s |
| Tempo médio de cadastro completo com foto | \< 3 min |
| Incidentes de acesso indevido a fotos | 0 |
| Solicitações de titulares atendidas no prazo | 100% |
| Erros 5xx | \< 0,5% das requisições |

---

## 10. Roadmap

| Fase | Entregas |
| --- | --- |
| **MVP (8–10 semanas)** | Auth + RBAC, alunos, funcionários, foto 3×4 com processamento e URL assinada, matrículas/planos básicos, check-in, auditoria, consentimento, backup |
| **Fase 2** | Portal do aluno, integração com gateway de pagamento, notificações (e-mail/WhatsApp), relatórios avançados, exportações LGPD self-service |
| **Fase 3** | Multi-unidade, catraca/QR Code, app mobile (PWA/nativo), integração contábil |

---

## 11. Riscos e mitigações

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Vazamento de fotos | Alto (LGPD, reputação) | Bucket privado, URLs assinadas curtas, auditoria, criptografia, RBAC |
| Upload malicioso | Alto | Validação por magic bytes, reprocessamento com Sharp, limites, antivírus opcional |
| Falta de consentimento válido para menores | Alto | Fluxo obrigatório com responsável legal e versão do termo |
| Perda de dados | Alto | Backups diários, versionamento no bucket, teste de restauração |
| Fotos de baixa qualidade | Médio | Guia de enquadramento, validação de dimensão, recorte 3:4 obrigatório |
| Escopo crescente | Médio | MVP enxuto, backlog priorizado por fase |

---

## 12. Dependências e premissas

- Domínio, certificado TLS e servidor/VPS ou cloud definidos.
- Texto de consentimento e política de privacidade revisados por assessoria jurídica.
- Nomeação de **encarregado de dados (DPO)** pela academia.
- Dispositivos de recepção com câmera (webcam ou tablet).

## 13. Questões em aberto

1. Haverá uma única academia (single-tenant) ou várias desde o início?
2. Prazo de retenção de dados de alunos inativos e de fotos antigas?
3. Pagamentos: apenas controle manual no MVP ou integração imediata (Pix/cartão)?
4. Necessidade de integração com catraca ou leitor biométrico?
5. Hospedagem: VPS própria, AWS, Azure ou outro provedor?
6. Escolha final: Drizzle ou Prisma; Better Auth ou Auth.js?

## 14. Critérios de aceite do MVP

- Todos os requisitos RF-01 a RF-31 implementados e testados, exceto os marcados como fase 2.
- Nenhuma foto acessível por URL pública permanente.
- Toda ação sensível aparece em `audit_logs`.
- Backup e restauração validados em ambiente de homologação.
- Teste de segurança básico (OWASP Top 10) sem falhas críticas.