---
project: AgendaFácil
updated_at: 2026-07-22
review_at: 2026-07-25
status: active
current_phase: CF1D_local_concluida
technical_baseline:
  commit: 194932c2f88110cc57d25fc1388c0db0cde5a682
  validation_status: partial
  validated_at: 2026-07-21
  validated:
    - "A0-A5A preservadas: tenant, autenticação, agenda individual, bloqueios, ciclo do agendamento, pipeline comercial e painel modular"
    - "A5B: serviços, profissionais, associação profissional-serviço, horário do negócio, agenda individual, cópia de agenda, bloqueios, configurações e indicadores"
    - "A5B: autoridade exclusiva em req.auth.tenantId e ID de outro tenant respondendo 404"
    - "A5B: contrato CONFLICT_REQUIRES_CONFIRMATION com prévia que não grava e confirmação que recalcula o impacto no banco"
    - "A5B: nenhum agendamento é cancelado ou movido por alteração estrutural"
    - "A5B: 209/209 testes backend, sendo 169 preservados e 40 novos"
    - "A5B: booking público preservado nos dois tenants, sem overflow em 360, 768 e 1280 px e console limpo"
    - "A5B: painel autenticado percorrido nas duas verticais, seis módulos cada, com dados temporários criados e removidos"
  not_validated:
    - "API, banco ou painel em produção"
    - "aplicação das migrations fora do PostgreSQL Docker local"
    - "uso operacional com múltiplas instâncias ou alto volume"
  evidence:
    - "node:test: 209/209 verdes contra o agendafacil_dev local"
    - "prisma migrate deploy aplicou 20260721120000_structural_management; 15 migrations em dia"
    - "R1: 20260721160000_reconcile_a3a_drift zerou o migrate diff no clone do banco atual, em banco virgem e no banco local"
    - "Vite build: 66 módulos e três entradas geradas"
    - "navegador: serviços públicos ordenados por displayOrder, serviço inativo ausente, GET /api/settings sem campos internos"
    - "baseline A5B em 194932c: feat: add structural management backend and data model"
source: A5B executada na branch de preservação em 2026-07-21, somente no banco Docker local
source_of_truth: .
---

# Estado do projeto

## Último resultado confirmado

A fase A5B — gestão estrutural — foi concluída na branch
`preserve/agendafacil-local-2026-07-20`, exclusivamente no PostgreSQL Docker
local `agendafacil_dev`, porta 5433. Nenhum serviço remoto foi alterado.

Cada negócio passou a administrar a própria estrutura dentro do shell criado na
A5A: serviços com preço opcional, ordem de exibição e marcação de avaliação;
profissionais com ordem, contato interno e associação a serviços; horário geral
do negócio; agenda individual com cópia por negócio, por profissional e por dia;
bloqueios com resumo de impacto; configurações operacionais por tenant; e
indicadores de capacidade e estrutura por período. Os CRUDs antigos saíram —
`Schedules.jsx` foi removido após conferência de que nenhuma referência restava.

Toda autoridade vem de `req.auth.tenantId`. ID de outro tenant responde 404, por
chave composta `(id, tenantId)` nas relações novas.

## Contrato de conflito

Operação estrutural que descobriria agendamento futuro responde **409** com
`code: "CONFLICT_REQUIRES_CONFIRMATION"` e a lista de agendamentos afetados.
Nada é gravado nessa resposta — ela é a própria prévia. Com `confirm: true` a
alteração é aplicada e **nenhum agendamento é cancelado ou movido**.

O impacto nunca vem do frontend: cada requisição recalcula os afetados a partir
do banco naquele instante, e `confirm` só decide entre 409 e gravação. A resposta
da confirmação traz `appliedImpact`, o impacto recalculado no momento da
aplicação — que pode ser maior que o da prévia se uma reserva entrar no meio. O
painel mostra essa diferença na mensagem de sucesso em vez de absorvê-la em
silêncio. Horário do negócio e cópia de agenda gravam em `prisma.$transaction`.

## Baseline técnica

`194932c2f88110cc57d25fc1388c0db0cde5a682` — `feat: add structural management
backend and data model` — é a baseline A5B, com `validation_status: partial`.
Permanece `partial` porque produção não foi alterada nem exercitada e porque o
painel autenticado não foi percorrido no navegador.

`ad95e6d` continua como último commit em `main` e como código publicado. A branch
de preservação não foi integrada nem enviada ao remoto.

## git_snapshot

```text
observed_at: 2026-07-21 (após commit de código A5B)
branch: preserve/agendafacil-local-2026-07-20
head_at_observation: 194932c2f88110cc57d25fc1388c0db0cde5a682
technical_baseline: 194932c2f88110cc57d25fc1388c0db0cde5a682
main: ad95e6d7083f188860f1026cd15f15715050dea0 (intacta, sem merge)
production: inalterada
```

O commit de frontend e documentação desta fase é o HEAD seguinte e não substitui
a baseline técnica.

## Banco e migration local

- 15 migrations em dia no Docker local;
- `20260721120000_structural_management` é estritamente aditiva: duas colunas em
  `Service`, duas em `Professional`, `price` passou a aceitar nulo, e as tabelas
  `ProfessionalService` e `TenantSettings` foram criadas;
- aplicada com `prisma migrate deploy`, sem `migrate dev` e sem reset;
- nenhuma migration antiga foi editada;
- nenhum banco remoto recebeu migration.

## Smoke autenticado

Os dois painéis foram percorridos logados, em sessões sequenciais: o cookie
`admin_session` é host-only em `localhost`, path `/`, HttpOnly e SameSite Lax no
ambiente local, então existe **uma sessão por perfil de navegador** e o segundo
login substitui o primeiro. Isso é da arquitetura, não defeito: as duas verticais
compartilham origem e o tenant nunca vem da URL. Abrir o painel da outra vertical
com a sessão errada mostra "Painel incorreto", sem vazar dado.

Percorridos nas duas verticais: serviços/procedimentos, profissionais,
disponibilidade, bloqueios, indicadores e configurações — seis módulos cada, em
1280, 768 e 360 px, com `scrollWidth === clientWidth` em todos, console sem erro
e rede só com 200/204. Dados temporários `SMOKE-A5B` criados e removidos ao final;
o seed foi reexecutado e as duas demos voltaram ao estado original.

Conflito validado em tela nas duas verticais: prévia lista os agendamentos,
cancelar não grava nada, confirmar aplica e informa o impacto recalculado. No
Studio Cut a corrida foi provada com uma reserva pública criada **entre** a
prévia e a confirmação: a prévia mostrou 1 e a confirmação reportou 2, com os
dois agendamentos intactos em data, hora e status.

## Validações confirmadas

- 209/209 testes: 169 preservados e 40 A5B.
- Prévia de conflito não grava nada — horário e agendamento permanecem como estavam.
- Impacto recalculado muda quando um agendamento entra entre prévia e confirmação.
- Confirmação aplica a mudança, devolve o impacto recalculado e preserva status,
  data e horário de todos os agendamentos.
- Isolamento cruzado nas duas direções em serviços, profissionais, horários,
  bloqueios, configurações e indicadores.
- `TenantSettings` opt-in: sem registro, a disponibilidade se comporta exatamente
  como antes da A5B — é por isso que os 169 testes anteriores seguiram verdes sem
  alteração.
- `GET /api/settings` público devolve lista branca, sem `slotDurationMinutes`,
  `minAdvanceMinutes` ou `id`.
- Payload de conflito sem telefone, e-mail ou `clientId`.
- Seed local idempotente com as tabelas novas, conferido rodando duas vezes.
- Booking público nos dois tenants: serviços ordenados por `displayOrder`,
  serviço inativo ausente, preço ausente exibido como "Sob consulta".
- 360, 768 e 1280 px sem overflow horizontal e console sem erro.

## Correções vindas do smoke

- `normalizeDays` exigia `openTime < closeTime` mesmo em dia fechado. Como o seed
  grava domingo — e, na Lumière, também segunda — em `00:00–00:00`, qualquer
  salvamento de horário retornava 400 e o módulo ficava inutilizável. A ordem
  passou a ser exigida só quando `isOpen === true`; o formato `HH:MM` continua
  obrigatório sempre. Casos 39 e 40 cobrem dia fechado aceito, dia fechado sem
  gerar slot, dia aberto inválido recusado e ausência de gravação parcial.
- Quatro rótulos do painel ignoravam o vocabulário da vertical e diziam "Serviço"
  na Lumière. Passaram a usar `vertical.serviceNoun` / `servicePlural`.

## Validações não executadas

- Health check, migration ou smoke no Render/produção.
- Deploy ou Preview na Vercel.
- Receita, pagamento, notificação, automação ou relatório comercial.

## Limitações mantidas por decisão de escopo

- `BusinessHours` continua com um intervalo por dia; a unicidade
  `(tenantId, dayOfWeek)` não foi quebrada. Pausa e jornada fracionada seguem
  resolvidas por `ProfessionalSchedule` e bloqueio.
- `TenantSettings` continua opt-in, sem default persistido automaticamente.
- Nenhuma operação estrutural cancela, move ou reagenda atendimento.
- `DELETE /admin/professional-schedules/:id` confirma por `?confirm=true` e
  responde 204, portanto sem `appliedImpact`.
- Indicadores não incluem receita, ticket, ROI ou projeção: o sistema não tem
  base para afirmar esses números.

## Riscos remanescentes

- paginação ainda é por offset, não cursor;
- rate limit em memória não coordena múltiplas instâncias;
- `booking.css` ainda aplica `input, select { width: 100% }` globalmente;
- rollout de A0–A5B fora do Docker local continua não validado;
- dez migrations de A1 a A5B, mais a de reconciliação, seguem acumuladas sem
  publicação: `main` tem só as cinco primeiras;
- `render.yaml` roda `prisma migrate deploy` dentro do `buildCommand`, então um
  push para a branch de produção aplica todas elas de uma vez, sem gate.

## R1 — reconciliação do drift legado A3A

O drift eram três diferenças entre o banco e o schema: `DEFAULT CURRENT_TIMESTAMP`
em `ProfessionalSchedule.updatedAt` e `ScheduleBlock.updatedAt`, e o nome do
índice único de `ProfessionalSchedule`.

Origem: `20260720210000_professional_schedules` foi escrita à mão. Ela declarou o
default nas duas colunas, enquanto o schema usa `@updatedAt` sem
`@default(now())`; e criou o índice único com 76 caracteres, que o PostgreSQL
truncou em 63 de forma diferente da truncagem do Prisma. Colunas e unicidade do
índice sempre foram equivalentes — só o nome divergia.

`20260721160000_reconcile_a3a_drift` remove os dois defaults e renomeia o índice
dentro de um bloco condicional, que só age quando o nome antigo existe e o novo
não. Nenhuma migration antiga foi tocada, nenhum dado alterado, nenhum reset.

Provado em três bancos, todos com `migrate diff` vazio ao final:

- cópia do banco de desenvolvimento: só a migration nova foi aplicada, segunda
  execução sem pendência, contagens idênticas antes e depois em `Service`,
  `Professional`, `ProfessionalSchedule`, `ScheduleBlock`, `BusinessHours` e
  `Appointment`, e nenhuma tabela recriada;
- banco virgem com replay das 16 migrations desde o início, seed rodado duas
  vezes com o mesmo resultado, domingo fechado em `00:00–00:00` nas duas
  verticais, agendas, bloqueios e associações profissional-serviço presentes;
- banco local de desenvolvimento, com 209/209 testes, build Vite e seed
  idempotente depois da aplicação.

Smoke curto pós-migration: dia fechado não gera slot e dia aberto gera 18;
bloqueio temporário zerou a disponibilidade do profissional e a devolveu ao ser
removido; `updatedAt` continua sendo preenchido pelas escritas do Prisma nas duas
tabelas, agora sem default no banco; ID de outra vertical segue invisível nas
duas direções. Dados temporários removidos.

Produção **não** foi reconciliada nem tocada. O banco remoto tem apenas as cinco
migrations presentes em `main` e nunca recebeu a A3A, então lá não existe drift a
corrigir — existe um rollout inteiro pendente.

## Divergências documentais

`README.md` ainda descreve partes do modelo antigo. O estado vigente desta branch
está em `docs/a3a-agenda-profissional.md`, `docs/a3b-ciclo-agendamento.md`,
`docs/a4a-relacionamento.md`, `docs/a4b-operacao-pipeline.md`,
`docs/a5a-painel-operacional.md`, `docs/a5b-gestao-estrutural.md` e neste arquivo.

## Melhoria registrada para a próxima fase

A navegação do painel chegou a onze módulos numa lista única. Não foi alterado
agora, de propósito: é assunto da fase de shell administrativo profissional, com
agrupamento ou hierarquia, não um remendo no meio da A5B.

## Próxima ação registrada

A5B está fechada e validada localmente, e o drift legado da A3A está reconciliado
no ambiente local. Definir e autorizar explicitamente a A6.
Nada disso autoriza redesign público, relatório comercial, deploy, merge ou push.

## CF1B — Worker público e ciclo D1 local

CF1B foi implementada e validada somente na branch `codex/cf1-cloudflare-migration`, sem deploy, push, D1 remoto ou alteração de Render/Vercel. O Worker público resolve o tenant exclusivamente pelo slug da rota e porta contexto, catálogo, profissionais compatíveis, horários, settings públicos, disponibilidade, criação, consulta por token, confirmação, cancelamento e reagendamento.

A reserva usa `DB.batch` para cliente, agendamento, históricos, token hash e `appointment_slots`. A chave composta dos slots manteve a corrida em 201/409 sem cliente ou histórico órfão. Cancelamento preserva o agendamento, registra evento, revoga o token e libera somente os slots desse agendamento. O token bruto aparece apenas no `managementPath`; D1 armazena SHA-256.

O rate limit público usa buckets persistentes no D1, janela de 60 segundos e chave SHA-256 derivada de sinais minimizados. Não usa memória do isolate e não persiste IP bruto ou dados pessoais.

Validação local confirmada:

- 58/58 testes Cloudflare, 30 novos na CF1B;
- 209/209 testes do backend original;
- TypeScript e dry-run dos Workers público e administrativo verdes;
- Vite original com 66 módulos;
- D1 local novo com migrations `0001` e `0002`, seed, ciclo completo nas duas verticais, cancelamento/rebooking, isolamento 404 e concorrência 201/409;
- D1 temporário, processo local e porta de desenvolvimento removidos ao final;
- 0 vulnerabilidades de produção no pacote Cloudflare e no frontend;
- o backend original mantém 1 vulnerabilidade baixa preexistente em `body-parser` e não foi alterado.

Permanecem para as fases seguintes: rotas administrativas e Cloudflare Access na CF1C; adaptação do frontend para slug na rota, IDs string, envelope de erro, Static Assets e regressão E2E na CF1D. `/api/public/leads` e `/api/first-availability` não foram portadas na CF1B pelas razões registradas em `cloudflare/docs/PUBLIC_API.md`.

## CF1C — Operação administrativa no Admin Worker e D1 local

CF1C foi implementada e validada somente na branch `codex/cf1-cloudflare-migration`, sem deploy, push, D1 remoto, migration nova ou alteração de backend PostgreSQL, Prisma, frontend, Render e Vercel. O Admin Worker ganhou roteador próprio sob `/api/admin/tenants/:slug/`, com identidade exclusiva do Cloudflare Access — sem senha, PBKDF2, JWT próprio ou sessão local — e tenant vindo só do slug da rota, autorizado por `AdminMembership` ativa. `tenant`, `tenantId` e `demoId` enviados em query, corpo, cookie ou header são ignorados.

Domínios portados: identidade e memberships; agenda, agendamentos, histórico, overview e indicadores do dia; clientes, leads e follow-ups com pipeline completo; serviços, profissionais, associações e dependências; horário do negócio, agendas profissionais, cópia de agenda e bloqueios; configurações e indicadores consolidados.

`DB.batch` é usado só onde a operação é composta e precisa ser atômica: transição de status com histórico, revogação de token e liberação de slots; criação de lead com follow-up e eventos; perda e conversão com fechamento de follow-ups; substituição de associações; upsert da semana de expediente; cópia de agenda. Prévia estrutural continua somente leitura e responde `409` com `code: "CONFLICT_REQUIRES_CONFIRMATION"`; a confirmação recarrega o estado e recalcula o impacto, ignorando qualquer `appliedImpact` enviado pelo cliente. Nenhuma operação estrutural cancela ou move agendamento existente.

Validação local confirmada:

- 125/125 testes Cloudflare, 67 novos na CF1C sobre os 58 anteriores;
- TypeScript e dry-run dos Workers público e administrativo verdes;
- Vite original com 66 módulos e três entradas;
- `git diff --check` limpo e árvore de trabalho limpa;
- nenhuma migration D1 nova e nenhum artefato local versionado.

Não validado nesta fase: a suíte do backend original não pôde ser executada porque o PostgreSQL local depende do Docker Desktop, que estava parado. O gate foi executado na CF1D e o resultado está registrado abaixo.

Correção: a nota de CF1C afirmava que a suíte coletava 217 testes. Isso nunca foi observado — foi estimativa registrada como fato. O número real, medido na CF1D, é 209. Não havia nada a reconciliar.

## CF1D — Finalização local (2026-07-22)

Aplicação completa e integrada localmente nos dois Workers, com o frontend adaptado sem duplicar a aplicação por vertical.

Público (Public Worker + D1): landings Studio Cut e Lumière, catálogo, profissionais, disponibilidade, criação, token, cancelamento, conflito, rate limit, reutilização de horário, captura pública de lead e fallback de SPA.

Administrativo (Admin Worker + D1): painéis das duas verticais, identidade e memberships exclusivamente pelo Cloudflare Access, overview, agenda, agendamentos, clientes, leads, follow-ups, catálogo, profissionais, associações, horários, agendas, cópia, bloqueios, configurações, indicadores, CSV e fallback de SPA administrativo.

Gate do backend original, executado em PostgreSQL isolado na porta 5433 (contêiner `postgres:16-alpine`, 16 migrations aplicadas com `prisma migrate deploy`): **209 testes coletados, 208 passando**. As falhas não são de regra de negócio: são sempre os primeiros testes de `pipeline.test.js`, sempre com `Transaction API error: Unable to start a transaction in the given time`. A causa foi medida — a primeira transação de um processo frio contra o Docker Desktop no Windows leva ~2071 ms, acima do `maxWait` de 2000 ms do Prisma, enquanto as seguintes levam 2 ms. `node --test` usa um processo por arquivo, então cada arquivo paga esse custo. Nenhum arquivo de `backend/` foi alterado em CF1A–CF1D.

Defeito real encontrado no smoke e corrigido: na superfície administrativa o `App.jsx` ainda pré-carregava o catálogo público (`/api/tenants/:slug/services` e `/professionals`), que responde 404 no Admin Worker. A correção veio com guarda permanente: `cloudflare/scripts/check-bundles.mjs` falha se o bundle público contiver rota administrativa ou asserção do Access, ou se o administrativo contiver rota pública, `admin_session`, campo de senha ou `demoId`.

Validado: 144 testes Cloudflare (125 anteriores + 19 de CF1D), TypeScript, dry-run dos dois Workers com `ASSETS` ligado, três builds Vite (Vercel, cf-public, cf-admin), guarda de bundles, `git diff --check` limpo, `npm audit --omit=dev` sem vulnerabilidades em `cloudflare/` e `frontend/`, e smoke em navegador nos dois Workers a 1280, 768 e 360 px com console limpo.

Não corrigido por estar fora do escopo: `npm audit --omit=dev` em `backend/` aponta 1 vulnerabilidade baixa em `body-parser`, transitiva do Express. Alterar dependências do backend não é permitido nesta fase.

Permanece para CF2, tudo ato remoto: publicar os dois Workers, criar o D1 remoto e aplicar as migrations, configurar o Access definitivo e apontar os domínios. O repositório não tem runner de teste de frontend; a validação do frontend em CF1D foi por build e smoke em navegador.

O rollout remoto continua bloqueado — não mais pelo drift, e sim pelas onze
migrations acumuladas, que exigem fase própria com backup, janela e smoke de
produção antes de qualquer aplicação fora do Docker local.
