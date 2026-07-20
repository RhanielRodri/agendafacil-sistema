---
project: AgendaFácil
updated_at: 2026-07-20
review_at: 2026-07-23
status: active
current_phase: A3A_concluida
technical_baseline:
  commit: b80ce5c
  validation_status: partial
  validated_at: 2026-07-20
  validated:
    - "npm ci reproduzível, sem alteração de lockfile (frontend e backend)"
    - "vite build sem erro nem aviso; 48 módulos; três entradas: raiz, studio-cut e lumiere"
    - "backend prisma generate sem erro"
    - "rotas /, /studio-cut e /lumiere; redirecionamentos legados /demo/<slug> e /admin"
    - "metadados por negócio: título, descrição, canonical e og"
    - "ausência visual da marca AgendaFácil no corpo das páginas"
    - "responsividade básica em 375 px e 1280 px"
    - "A1: entidade Tenant criada; studio-cut e lumiere ativos"
    - "A1: migration versionada tenant_foundation aplicada só no banco Docker local; migrate status sem drift"
    - "A1: backfill preservou 6 agendamentos (ids 1-6); duplicou 7 horários e 1 bloqueio por tenant; sem órfãos de FK; tenant de cada agendamento coerente com o serviço"
    - "A1: horários independentes por tenant (Studio abre segunda; Lumière fechada segunda)"
    - "A1: bloqueios independentes por tenant (Studio bloqueado numa quarta → 0 slots; Lumière na mesma data → 17 slots)"
    - "A1: serviços e profissionais isolados por tenant"
    - "A1: criação de agendamento com tenantId explícito e consistente"
    - "A1: rejeição de serviço/profissional de tenants distintos (404)"
    - "A1: leitura por ID cruzada bloqueada (404 sem vazar existência)"
    - "A1: alteração de status por ID cruzada bloqueada (404; registro permanece NEW)"
    - "A1: prevenção de sobreposição mantida (409)"
    - "A1: suíte de integração node:test com 10 casos, todos verdes, contra banco local"
    - "A1: ausência de efeitos remotos (sem push, merge, deploy ou escrita em produção)"
    - "A2: modelos AdminUser (único por tenant+email) e AdminSession (só hash do token, com expiração/revogação); migration admin_auth aplicada só no banco local; migrate status sem drift"
    - "A2: senha com scrypt nativo (salt por usuário, parâmetros versionados, timingSafeEqual); hash não determinístico entre usuários com a mesma senha"
    - "A2: login por vertical (email+senha); tenant derivado da sessão; rotas admin ignoram demoId/tenantId do cliente"
    - "A2: sessão opaca só no cookie HttpOnly; logout revoga no servidor; sessão expirada e revogada rejeitadas"
    - "A2: resposta genérica para usuário inexistente/inativo/senha errada; rate limit de login por IP+email"
    - "A2: isolamento autenticado — admin de um tenant não lista, lê nem altera ID do outro (404); CSV só do tenant da sessão"
    - "A2: nenhuma resposta expõe passwordHash ou tokenHash"
    - "A2: autenticação antiga removida (ADMIN_SECRET, HMAC admin-session-v1, tenant admin por query param)"
    - "A2: suíte de integração de auth com 20 casos + 7 de isolamento público, 27/27 verdes"
    - "A3A: ProfessionalSchedule com múltiplos intervalos por dia, validação e constraint anti-sobreposição"
    - "A3A: ScheduleBlock global ou por profissional, parcial ou dia inteiro, com proteção cross-tenant no banco"
    - "A3A: disponibilidade centralizada por negócio, profissional, bloqueios, duração e agendamentos"
    - "A3A: rotas admin isoladas pela sessão e painel mínimo validado em Studio Cut e Lumière"
    - "A3A: 54/54 testes, prisma generate, migrate status e vite build verdes"
  not_validated:
    - "saúde da API e do banco em produção (validação A3A foi exclusivamente local)"
    - "aplicação das migrations A0-A3A em produção (feitas só no local)"
    - "confirmação, cancelamento e reagendamento públicos (escopo A3B)"
  evidence:
    - "A2 em 2026-07-20: prisma migrate deploy (admin_auth) no banco Docker local; seed criou 1 admin por tenant (scrypt, hashes distintos)"
    - "A2: npm test → 27/27 verdes (tests/auth.test.js 20 + tests/tenant.test.js 7)"
    - "A2: prova ao vivo por curl — login Studio 200 (cookie HttpOnly, Path=/, SameSite=Lax, sem Secure em dev); /admin/me=studio; leitura/alteração de ID Lumière → 404; ?demoId=lumiere ignorado; CSV só Studio; sem cookie → 401; senha errada → 401; logout revoga (reuso → 401)"
    - "A2: vite build (3 entradas) e prisma generate sem erro; migrate status sem drift"
    - "A2 baseline em 35182e9 — feat: implementa autenticação por tenant"
    - "A3A: migrations professional_schedules + hardenings aplicadas só no PostgreSQL Docker local; 35 intervalos, 6 bloqueios novos e 2 legados; zero órfãos, sobreposições, intervalos inválidos ou dados cross-tenant"
    - "A3A: npm test → 54/54; painel Studio Cut e Lumière em 1280 px e 375 px, sem overflow ou erro de console; criar/remover bloqueio pela UI funcionou"
    - "A3A: jornadas ao vivo — pausas e bloqueios específicos respeitados, outro profissional disponível, criações 201 persistidas e conflito por duração 409"
    - "A3A baseline em b80ce5c — feat: implementa agenda individual e bloqueios"
source: A3A executada na branch de preservação em 2026-07-20 (banco local Docker isolado)
source_of_truth: .
---

# Estado do projeto

## Último resultado confirmado

Fase A3A — agenda individual, bloqueios por intervalo e disponibilidade —
concluída em 2026-07-20, na branch
`preserve/agendafacil-local-2026-07-20`, exclusivamente no banco Docker local
(`agendafacil_dev`, porta 5433), sem qualquer efeito remoto.

`ProfessionalSchedule` passou a representar múltiplos intervalos por
profissional e dia, sempre vinculados ao mesmo tenant. Constraints validam dia,
horas, duplicidade e sobreposição, inclusive em intervalos inativos.
`ScheduleBlock` representa bloqueio do tenant ou de um profissional, parcial ou
de dia inteiro; a API valida o intervalo e o banco impede vínculo cross-tenant.

O motor de disponibilidade foi centralizado e agora calcula a interseção entre
`BusinessHours` e a agenda individual, descontando `ScheduleBlock`,
`BlockedDate` legado e agendamentos não cancelados. A mesma lógica protege a
consulta pública e a criação transacional do agendamento, incluindo duração,
pausas e fechamento. A operação de primeira disponibilidade agrega os
profissionais ativos sem alterar o contrato atual de `available-slots`.

O painel atual ganhou somente os controles necessários para listar, criar,
editar e remover horários, além de listar, criar e remover bloqueios globais ou
individuais. As rotas administrativas derivam tenant exclusivamente de
`req.auth.tenantId`; IDs e profissionais de outro tenant retornam `404`.

As três migrations A3A foram aplicadas somente no banco local. O seed final tem
6 profissionais, 35 intervalos, 6 bloqueios novos, 2 bloqueios legados e 4
agendamentos. Não há órfãos, sobreposições, intervalos inválidos ou dados
cross-tenant. Studio Cut e Lumière foram percorridos por API e navegador; o
painel passou em 1280 px e 375 px, sem overflow ou erro de console.

Nada foi publicado. `main` permanece em `ad95e6d`, sem merge e sem push.

## Baseline técnica

`b80ce5c` — `feat: implementa agenda individual e bloqueios` —, com
`validation_status: partial`. Substitui `35182e9` para o escopo listado no
frontmatter: migrations, backfill, motor, APIs, painel, 54 testes, builds e
jornadas Studio Cut/Lumière foram exercitados no ambiente local isolado. Segue
`partial`, não `validated`, porque nada da A3A foi aplicado ou validado em
produção.

`ad95e6d` continua sendo o último commit em `main` e o único código publicado
em produção.

## git_snapshot

```text
observed_at: 2026-07-20 (fase A3A)
branch: preserve/agendafacil-local-2026-07-20
head_at_observation: b80ce5c (feat A3A; o commit documental deste estado será o HEAD seguinte)
base: ad95e6d
main: ad95e6d (intacta, sem merge)
working_tree: limpa após o commit feat A3A, antes do commit documental
producao: inalterada
```

Observação datada. Ficará anterior ao `HEAD` assim que o commit documental
deste estado for criado, e isso é correto.

## Trabalho em andamento

Nenhum. A A3A está concluída e validada localmente. A próxima fase é A3B —
confirmação, cancelamento e reagendamento públicos — e só começa sob pedido
explícito.

## Bloqueios

Nenhum bloqueio de ambiente: o banco local isolado está saudável e semeado, e
`backend/.env` aponta para ele. Permanecem abertos, para produção e não para a
evolução local:

- Saúde da API e do banco em produção não foi validada nesta fase.
- As migrations A0-A3A **não** foram aplicadas em Render/produção; ao promover,
  aplicar na ordem com os planos de reversão em
  `backend/prisma/migrations/*/ROLLBACK.md`. Em produção, criar os `AdminUser`
  reais por variável de ambiente (nunca senha versionada).

## Riscos

Resolvidos pela A3A (não são mais bloqueadores):

- ~~Ausência de bloqueio por intervalo~~ — `ScheduleBlock` global ou por
  profissional, parcial ou de dia inteiro.
- ~~Ausência de agenda individual por profissional~~ — múltiplos intervalos por
  dia, sem duplicidade ou sobreposição.
- ~~Disponibilidade duplicada entre consulta e criação~~ — motor centralizado.

Resolvidos pela A2 (não são mais bloqueadores):

- ~~Senha administrativa compartilhada~~ — cada tenant tem `AdminUser` próprio,
  com senha por hash `scrypt`.
- ~~`ADMIN_SECRET` como chave HMAC~~ — autenticação por `ADMIN_SECRET` removida.
- ~~Token determinístico~~ — token aleatório opaco; servidor guarda só o hash.
- ~~Token aceito após logout~~ — logout revoga no servidor (`revokedAt`).
- ~~Ausência de expiração e revogação no servidor~~ — `AdminSession.expiresAt` +
  `revokedAt`, verificados a cada requisição.
- ~~Tenant administrativo por query param~~ — tenant vem só da sessão; `demoId`
  do cliente é ignorado nas rotas admin.

Resolvidos antes, pela A1:

- ~~`BusinessHours`/`BlockedDate` globais~~ — agora por tenant.
- ~~Leitura/alteração cruzada de agendamento por ID~~ — filtram `id+tenantId`.

Pendências de fases posteriores:

- **Ausência de `Lead`, `Client`** no schema (fases futuras).
- **Ausência de confirmação, cancelamento e reagendamento públicos.**
- **Ausência de `NO_SHOW`** no enum de status.
- **Recuperação de senha / convite de admin** — fora do escopo A2; hoje admins
  só existem via seed/variável local.

Riscos anteriores que permanecem:

- **Marca interna no endereço público** — `agendafacil-sistema.vercel.app` em
  `canonical` e `og:url`; corpo limpo, link/SEO ainda expõem o nome interno.
- **Rota desconhecida devolve 404 da Vercel** — falta decidir se é o desejado.
- **Divergência com a documentação** — `README.md` descreve o modelo anterior
  de rotas.

## Validações confirmadas

Executadas em 2026-07-20, na branch de preservação:

- `npm ci` reproduzível, sem alteração do lockfile.
- `vite build` sem erro nem aviso; 48 módulos; três entradas geradas.
- Entradas `/`, `/studio-cut` e `/lumiere` servidas com título, descrição,
  canonical e ícone próprios de cada negócio.
- Redirecionamentos legados `/demo/<slug>` e `/admin` respondendo 3xx no
  preview, e também no fallback do cliente em `tenant.js`.
- Resolução de negócio por caminho: cada entrada consulta a API com o `demoId`
  correto.
- Rota desconhecida sem quebra por `tenant` nulo; página neutra renderizada
  quando o servidor entrega o HTML raiz.
- Sem erro de console em nenhuma das rotas exercitadas.
- Ausência da marca interna no corpo das duas páginas de negócio.
- Sem transbordo horizontal em 375 px e em 1280 px nas duas experiências.
- Mensagens de erro genéricas, sem vazamento de detalhe técnico.

Acrescentadas pela A0 (banco local Docker isolado, 2026-07-20):

- Instalação reproduzível de frontend e backend; lockfiles intactos.
- Container `agendafacil-postgres-dev` saudável; banco `agendafacil_dev` na
  porta 5433, isolado do PostgreSQL do Windows (5432) e de produção.
- Cinco migrations aplicadas e seed executados só no banco local.
- `/api/health` com banco saudável.
- Serviços e profissionais distintos por tenant.
- Disponibilidade considerando duração do serviço.
- Prevenção de conflito por sobreposição (409).
- Bloqueio por data (`BlockedDate`).
- Validações de payload: campos ausentes, data passada, telefone curto, tenant
  cruzado (404).
- Jornada pública Studio Cut completa no navegador (375 px), sem erro de
  console, com persistência conferida no banco (appt id 6).
- Persistência Lumière pela API com `demoId` correto (appt id 5).
- Painel: login 200/401, listagem filtrada por tenant, alteração de status,
  exportação CSV, logout.
- Rate limit público (429 a partir do 10º POST/60s).
- Ausência de efeitos remotos durante a validação.

Acrescentadas pela A1 (fundação de tenant, banco local Docker, 2026-07-20):

- Entidade `Tenant` criada; `studio-cut` e `lumiere` ativos e referenciados por
  FK em todas as tabelas tenantizadas.
- Migration `tenant_foundation` aplicada só no banco local; `migrate status`
  sem drift; `prisma generate` e `vite build` sem erro.
- Backfill: 6 agendamentos preservados (ids 1-6); 7 horários e 1 bloqueio
  duplicados por tenant; nenhum FK órfão; tenant coerente com o serviço.
- Horários independentes por tenant (segunda aberta no Studio, fechada na
  Lumière).
- Bloqueios independentes por tenant (bloqueio só no Studio em 2026-07-22 →
  Studio `[]`, Lumière 17 slots).
- Serviços e profissionais isolados por tenant.
- Criação de agendamento com `tenantId` explícito e consistente.
- Serviço/profissional de tenants distintos recusados (404).
- Leitura por ID cruzada bloqueada (404 sem vazar existência).
- Alteração de status por ID cruzada bloqueada (404; registro segue `NEW`).
- Prevenção de sobreposição mantida (409).
- Suíte de integração `node:test` (`tests/tenant.test.js`) 10/10 verde.

Acrescentadas pela A2 (autenticação por tenant, banco local Docker, 2026-07-20):

- Modelos `AdminUser` e `AdminSession`; migration `admin_auth` só no banco
  local; `migrate status` sem drift; `prisma generate` e `vite build` sem erro.
- Seed idempotente: um admin por tenant, senha `scrypt`, hashes distintos.
- Login por vertical (email+senha) 200; senha errada, usuário inexistente e
  usuário inativo → 401 genérico; rate limit de login (429).
- Sessão válida acessa; sem cookie → 401; sessão expirada → 401; sessão
  revogada → 401; logout revoga (reuso do cookie → 401).
- Cookie `HttpOnly`, `Path=/`, `SameSite=Lax`, sem `Secure` em dev.
- Tenant da sessão não substituível por `?demoId=`; admin de um tenant não
  lista, lê nem altera ID do outro (404); CSV só do tenant autenticado.
- Nenhuma resposta expõe `passwordHash` nem `tokenHash`.
- Suíte de integração 27/27 verde (`tests/auth.test.js` 20 + `tests/tenant.test.js` 7).

Acrescentadas pela A3A (agenda e disponibilidade, banco local Docker, 2026-07-20):

- Migrations A3A aplicadas somente no banco local; `migrate status` sem drift.
- Backfill de agenda por profissional e compatibilidade de leitura com
  `BlockedDate`; bloqueios antigos preservados como dia inteiro.
- Banco final: 6 profissionais, 35 intervalos, 6 `ScheduleBlock`, 2
  `BlockedDate` legados e 4 agendamentos; zero órfãos, dados cross-tenant,
  sobreposições ou bloqueios inválidos.
- Motor único respeitando horário geral, agenda individual, pausas, bloqueios,
  duração, agendamentos existentes e fechamento.
- CRUD administrativo de horários e bloqueios protegido por sessão; IDs
  cross-tenant retornam `404`; tenant enviado no body não substitui a sessão.
- `available-slots` compatível e `first-availability` agregado por data.
- Suíte completa `node:test` 54/54 verde; `prisma generate`, validação de sintaxe
  e `vite build` sem erro.
- Studio Cut e Lumière exercitados com jornadas distintas, bloqueio global e
  específico, criação persistida e conflito por duração `409`.
- Painel validado em 1280 px e 375 px nas duas verticais: horários visíveis,
  criar/remover bloqueio pela UI, sem overflow ou erro de console.

## Validações não executadas

- Saúde da API e do banco em produção.
- Aplicação das migrations A0-A3A em produção (feitas só no local).
- Confirmação, cancelamento e reagendamento públicos (A3B).

## Divergências entre documentação e código

- `README.md` apresenta a raiz do site como demonstração pública e o painel em
  `/admin`. O código local serve página neutra na raiz e redireciona `/admin`.
  O README descreve `HEAD`; a working tree diverge.
- `projetos/registro.md` do SOR OS não foi atualizado nesta adoção.
  `/sync-registry` é a ação possível, não executada aqui.

## Próxima ação registrada

Iniciar **A3B — confirmação, cancelamento e reagendamento públicos**,
sob pedido explícito, evoluindo na branch `preserve/agendafacil-local-2026-07-20`,
sem integrar em `main`. A A3B deve reutilizar o motor da A3A, preservar a
transação serializável e definir transições de status e autoridade dos links
públicos sem expor dados administrativos. Uma fase por vez: concluir a A3A não
autoriza a A3B.
