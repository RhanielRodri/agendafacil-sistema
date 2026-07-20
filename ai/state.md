---
project: AgendaFácil
updated_at: 2026-07-20
review_at: 2026-07-23
status: active
current_phase: null
technical_baseline:
  commit: b12610a
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
  not_validated:
    - "autenticação real e sessões (senha compartilhada, token determinístico, sem expiração/revogação) — escopo A2"
    - "conclusão visual da jornada Lumière pelo navegador (harness instável; validada por API e testes)"
    - "saúde da API e do banco em produção (validação A1 foi exclusivamente local)"
  evidence:
    - "A1 em 2026-07-20: prisma migrate deploy no banco Docker local (5433); backfill conferido por psql (Tenant=2, appts ids 1-6 preservados, BusinessHours 7/tenant, BlockedDate 1/tenant, sem FK órfã)"
    - "A1: npm test → 10/10 testes de integração verdes (tests/tenant.test.js)"
    - "A1: prova ao vivo por curl — bloqueio só no Studio em 2026-07-22 (quarta) → Studio [] e Lumière 17 slots; segunda aberta no Studio e fechada na Lumière; leitura/alteração cruzada por ID → 404"
    - "A1: vite build (48 módulos, 3 entradas) e prisma generate sem erro; prisma migrate status sem drift"
    - "A1 baseline em b12610a — feat: fundamenta isolamento por tenant"
source: A1 executada na branch de preservação em 2026-07-20 (banco local Docker isolado)
source_of_truth: .
---

# Estado do projeto

## Último resultado confirmado

Fase A1 — fundação de tenant — concluída em 2026-07-20, na branch
`preserve/agendafacil-local-2026-07-20`, exclusivamente no banco Docker local
(`agendafacil_dev`, porta 5433), sem qualquer efeito remoto.

O tenancy embrionário por `demoId` virou uma fundação estrutural. Foi criada a
entidade `Tenant` (`studio-cut` e `lumiere`, ativos). A coluna física `demoId`
foi preservada e passou a ser exposta como `tenantId` (via `@map`), agora com
chave estrangeira para `Tenant(slug)` em `Service`, `Professional`,
`Appointment`, `BusinessHours` e `BlockedDate`. `BusinessHours` e `BlockedDate`
saíram da unicidade global para composta por tenant (`tenantId+dayOfWeek` e
`tenantId+date`); `Appointment` ganhou tenant explícito e consistente com o
serviço e o profissional.

A migration versionada `20260720120000_tenant_foundation` foi aplicada só no
banco local, com backfill idempotente: os 6 agendamentos existentes (ids 1-6)
foram preservados, os 7 horários e 1 bloqueio globais foram atribuídos ao
Studio Cut e duplicados para a Lumière, sem órfãos de FK. `prisma migrate
status` não acusa drift.

A resolução e validação de tenant foram centralizadas em
`backend/config/tenant.js` e `backend/middleware/tenant.js` (aceita só tenant
registrado e ativo; rejeita slug inválido). As rotas administrativas por ID
passaram a filtrar `id + tenantId`: ler ou alterar um agendamento da Lumière no
contexto Studio Cut agora devolve `404`, sem vazar a existência do registro.

Isolamento provado por suíte de integração (`node:test`, 10/10) e por checagem
ao vivo com curl: bloqueio só no Studio numa quarta zera os slots do Studio e
mantém 17 slots na Lumière; a segunda-feira aberta no Studio permanece fechada
na Lumière; serviço/profissional de tenants distintos é recusado (404);
sobreposição continua bloqueada (409).

Nada foi publicado. `main` permanece em `ad95e6d`, sem merge e sem push.

### Ressalva — jornada Lumière

A conclusão visual da jornada Lumière segue sem exercício pelo navegador por
instabilidade do harness, não por defeito do app. Na A1 ela foi coberta pela
API e pelos testes de integração: dados próprios e isolados, criação com tenant
correto e ausência de leitura/alteração cruzada.

## Baseline técnica

`b12610a` — `feat: fundamenta isolamento por tenant` —, com
`validation_status: partial`. Substitui `256a996` para o escopo listado no
frontmatter: a fundação de tenant foi exercitada em banco local isolado
(migration, backfill, isolamento de dados, rotas por ID, testes). Segue
`partial`, não `validated`, por lacunas reais: autenticação e sessões reais são
escopo da A2, e nada foi validado em produção — a A1 foi exclusivamente local.

`ad95e6d` continua sendo o último commit em `main` e o único código publicado
em produção.

## git_snapshot

```text
observed_at: 2026-07-20 (fase A1)
branch: preserve/agendafacil-local-2026-07-20
head_at_observation: b12610a (feat A1; o commit documental deste estado será o HEAD seguinte)
base: ad95e6d
main: ad95e6d (intacta, sem merge)
working_tree: limpa após o commit feat A1, antes do commit documental
producao: inalterada
```

Observação datada. Ficará anterior ao `HEAD` assim que o commit documental
deste estado for criado, e isso é correto.

## Trabalho em andamento

Nenhum. A A1 está concluída e validada localmente. A próxima fase é A2 —
autenticação e sessões reais — e só começa sob pedido explícito.

## Bloqueios

Nenhum bloqueio de ambiente: o banco local isolado está saudável e semeado, e
`backend/.env` aponta para ele. Permanecem abertos, para produção e não para a
evolução local:

- Saúde da API e do banco em produção não foi validada nesta fase.
- A migration `tenant_foundation` **não** foi aplicada em Render/produção; ao
  promover, aplicar com o backfill e o plano de reversão documentados em
  `backend/prisma/migrations/20260720120000_tenant_foundation/ROLLBACK.md`.

## Riscos

Resolvidos pela A1 (não são mais bloqueadores):

- ~~`BusinessHours` global~~ — agora por tenant (`tenantId+dayOfWeek`).
- ~~`BlockedDate` global~~ — agora por tenant (`tenantId+date`).
- ~~Leitura cruzada de agendamento por ID~~ — `getAppointment` filtra
  `id+tenantId` (404 no contexto cruzado).
- ~~Alteração cruzada de status por ID~~ — `updateAppointmentStatus` filtra
  `id+tenantId` (404 no contexto cruzado).

Confirmados como **bloqueadores da A2** (autenticação e sessões):

- **Senha administrativa compartilhada** — o mesmo cookie abre os dois tenants;
  a A1 impede o vazamento *acidental* por ID, mas um admin com a senha ainda
  escolhe o tenant via `demoId`.
- **`ADMIN_SECRET` usado também como chave HMAC** do token de sessão.
- **Token determinístico** — sem entropia de sessão.
- **Token aceito após logout** — sem revogação no servidor; `clearCookie` só
  age no cliente.
- **Ausência de expiração e revogação no servidor** — validade só no `maxAge`
  do cookie.
- **Tenant administrativo por query param** (`demoId`) — aceitável na A1 por
  decisão de escopo; a A2 substitui pelo tenant da sessão autenticada.

Pendências de fases posteriores (fora do escopo A1/A2):

- **Ausência de `Lead`, `Client` e `AdminUser`** no schema.
- **Ausência de confirmação, cancelamento e reagendamento públicos.**
- **Ausência de `NO_SHOW`** no enum de status.
- **Ausência de bloqueio por intervalo** — só dia inteiro (A3).
- **Ausência de agenda individual por profissional.**

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

## Validações não executadas

- Autenticação e sessões reais (senha compartilhada, token determinístico, sem
  expiração/revogação) — escopo A2.
- Conclusão visual da jornada Lumière pelo navegador (harness instável;
  coberta por API e testes na A1).
- Saúde da API e do banco em produção.
- Aplicação da migration `tenant_foundation` em produção (feita só no local).

## Divergências entre documentação e código

- `README.md` apresenta a raiz do site como demonstração pública e o painel em
  `/admin`. O código local serve página neutra na raiz e redireciona `/admin`.
  O README descreve `HEAD`; a working tree diverge.
- `projetos/registro.md` do SOR OS não foi atualizado nesta adoção.
  `/sync-registry` é a ação possível, não executada aqui.

## Próxima ação registrada

Iniciar **A2 — autenticação e sessões reais**, sob pedido explícito, evoluindo
na branch `preserve/agendafacil-local-2026-07-20`, sem integrar em `main`. A2
deve introduzir `AdminUser`, sessão com expiração e revogação no servidor, fim
da senha administrativa compartilhada e do token determinístico, e derivar o
tenant administrativo da sessão autenticada em vez do query param `demoId`.
A fundação de tenant da A1 é o pré-requisito atendido. Uma fase por vez:
concluir a A1 não autoriza a A2.
