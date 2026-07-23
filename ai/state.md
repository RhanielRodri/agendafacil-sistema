---
project: AgendaFácil
updated_at: 2026-07-22
review_at: 2026-07-25
status: frozen
current_phase: AGENDAFACIL_FINALIZADO_E_CONGELADO
technical_baseline:
  commit: 349185754a761319e50b6f4762f9306e91b9e5db
  validation_status: complete
  validated_at: 2026-07-22
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

## CF2 — Staging publicado (2026-07-22)

Branch `codex/cf1-cloudflare-migration` empurrada para `origin` a partir de
`0968d08`. `main` não foi tocada e continua sem nenhum commit da migração.

Ambiente remoto criado: D1 `agendafacil-staging-db` (região ENAM), migrations
`0001_full_schema` e `0002_public_rate_limits` aplicadas e seed executado —
2 tenants, 6 serviços, 4 profissionais, 14 faixas de horário, 0 identidades
administrativas. Workers `agendafacil-staging-public` e
`agendafacil-staging-admin` publicados, compartilhando o mesmo D1.

Nada do ambiente foi versionado: `.env.staging` e os `wrangler.staging.*.jsonc`
gerados são ignorados; o repositório guarda apenas `scripts/staging-config.mjs`,
`scripts/bootstrap-admin.mjs` e `docs/DEPLOY_STAGING.md`.

Provado contra o D1 remoto, nas duas verticais: catálogo, profissionais,
disponibilidade, criação `201`, conflito de mesmo slot `409`, slot removido da
disponibilidade, consulta por token `200`, token de outro tenant `404`,
cancelamento `200`, slot devolvido à disponibilidade, token revogado `410`,
rate limit de 10 por minuto seguido de `429`, serviço de outro tenant `404`,
`/api/*` respondendo JSON e nunca o HTML da SPA, rota inexistente caindo no
fallback, HTML público `max-age=0, must-revalidate`, asset versionado
`immutable`, resposta administrativa `no-store` com `X-Robots-Tag`.

Interface conferida no navegador contra staging: landings das duas verticais com
terminologia e identidade próprias, deep link `#agendamento=<token>` abrindo a
gestão do agendamento pelo fallback da SPA, console limpo e nenhuma requisição
ao Render em nenhuma das duas superfícies.

Sem Access configurado o Worker administrativo falha fechado: `401` em toda rota
de API e a tela "Sessão expirada" no lugar de qualquer formulário de senha.

Pendente de decisão humana, não de código: domínio de equipe do Zero Trust,
aplicação e policy do Access, AUD, e-mails administrativos para o bootstrap,
domínio próprio e a autorização do corte de produção.

Alerta de latência: D1 não tem região na América do Sul. Com o primário em ENAM,
o TTFB a partir do Brasil fica em ~0,34 s nas rotas que tocam o banco contra
~0,11 s nas puramente estáticas. Avaliar Smart Placement antes do corte.

## CF2 — Staging separado por vertical (2026-07-22)

Quatro superfícies independentes publicadas em `workers.dev`, sobre o mesmo
código, o mesmo D1 `agendafacil-staging-db` e o mesmo schema:

| Worker | Tenant fixo | Bundle |
| --- | --- | --- |
| `agendafacil-staging-studio-cut-public` | `studio-cut` | público |
| `agendafacil-staging-studio-cut-admin` | `studio-cut` | administrativo |
| `agendafacil-staging-lumiere-public` | `lumiere` | público |
| `agendafacil-staging-lumiere-admin` | `lumiere` | administrativo |

O tenant efetivo vem de `TENANT_SLUG`. Provado nos Workers reais: a rota da outra
vertical responde 404 em todas as rotas públicas e administrativas, e no painel
o 404 precede a autorização. `/api/admin/context` lista apenas a membership do
tenant do ambiente.

A separação também é de bundle: o pacote de cada demo não contém a configuração
da outra, verificado por `check:bundles --tenant`. Continua compartilhado o mapa
de terminologia por vertical, que são rótulos de interface, não identidade.

Smoke público completo nas duas verticais contra o D1 remoto: landing na raiz,
catálogo, profissionais, disponibilidade, booking 201, conflito 409, slot
removido, consulta por token 200, token na outra vertical 404, cancelamento 200,
slot devolvido, consulta após cancelar 410 `TOKEN_USED`, rota da outra vertical
404, `/api/*` sempre JSON, fallback de SPA 200. Nenhuma chamada ao Render em
nenhuma das quatro superfícies.

Os dois painéis falham fechados: 401 sem Access configurado, sem formulário de
senha, `no-store` e `X-Robots-Tag` em toda resposta.

Bloqueio real: criar a aplicação do Access exige interação humana. O token OAuth
do Wrangler não tem escopo de Zero Trust — o caminho é o botão **Enable
Cloudflare Access** em Settings → Domains & Routes de cada Worker administrativo,
que dispensa domínio próprio. Faltam a AUD de cada painel e os e-mails
autorizados; sem eles não existe smoke administrativo com JWT real nem
identidade no D1 (`admin_identities` = 0).

Latência estabilizada nos novos Workers: API 0,30–0,42 s, HTML 0,08–0,10 s. Sem
alteração frente aos Workers compartilhados, então o piso continua sendo a ida e
volta ao D1 em ENAM. Smart Placement não foi ativado: não há ganho medido que o
justifique nesta etapa.

Os dois Workers compartilhados de CF2, o Render e o Vercel continuam publicados
e intactos.

## CF2 — Cloudflare Access automatizado (2026-07-22)

As duas aplicações self-hosted do Access foram criadas pela API oficial, uma por
Admin Worker, com sessão de 24 horas e policy exclusiva `Allow configured admin
email`. Cada policy contém somente o e-mail individual da vertical, precedência
1 e nenhuma regra ampla. Os AUDs são distintos e foram gravados apenas em
`cloudflare/.env.staging`, junto do team domain; nenhum valor sensível entrou no
Git.

O fluxo idempotente ficou em `cloudflare/scripts/configure-access.mjs`, com
preflight de token, conta, duplicidade de domínio, tipo de aplicação e policies
conflitantes. O script falha fechado diante de estado ambíguo, usa somente
`CLOUDFLARE_ACCESS_API_TOKEN` para Access, recupera os AUDs reais, atualiza o
arquivo local ignorado e oferece modos de configurar e verificar. Se o token não
tem leitura de Organizations, o team domain é preservado do ambiente ou obtido
pelo desafio real do Access.

Os dois Admin Workers verticais foram republicados sem tocar os Workers públicos.
Ambos usam o D1 `agendafacil-staging-db`, `TENANT_SLUG` fixo, team domain e AUD
próprio. O bootstrap resultou em uma identidade ativa para o e-mail único
configurado e duas memberships independentes, uma para `studio-cut` e outra para
`lumiere`, sem duplicação.

Smoke autenticado real concluído por código de e-mail: desafio do Access, JWT
aceito pelo Worker, identidade, membership, refresh, deep links e os 11 módulos
de cada vertical. A ausência temporária da membership do Lumière produziu a tela
segura de acesso negado e a membership foi restaurada imediatamente pelo
bootstrap idempotente. O painel voltou sem erros ou avisos no console.

O smoke reversível de impacto alterou temporariamente a duração de um serviço do
Studio Cut com dois agendamentos futuros. A prévia não escreveu no D1; a
confirmação recalculou dois impactos no servidor; os dois agendamentos e horários
permaneceram ativos. A duração original foi restaurada e o D1 foi conferido ao
final. Logout encerrou a sessão e uma nova visita voltou ao desafio do Access.

Gates: 152/152 testes existentes, 6/6 testes do script de Access, TypeScript,
builds, dry-runs dos Admin Workers, `check:bundles` compartilhado e vertical,
`git diff --check` e auditoria de secrets. `npm audit --omit=dev` encontrou zero
vulnerabilidades em Cloudflare e frontend; o backend mantém uma vulnerabilidade
baixa já existente em `body-parser`, fora do escopo da CF2.

Produção não foi iniciada. Continuam pendentes domínio/cutover de produção,
configuração equivalente do Access no ambiente produtivo e decisão sobre Smart
Placement. Workers públicos, Workers compartilhados antigos, Render e Vercel
permanecem intactos.

## CF3 — Produção separada publicada (2026-07-22)

Produção foi criada sem domínio próprio e sem reutilizar recursos de staging. O
D1 exclusivo `agendafacil-production-db` recebeu as duas migrations e o seed dos
dois tenants. Antes do bootstrap havia zero agendamentos, leads, identidades e
memberships. O bootstrap idempotente convergiu para uma identidade ativa e duas
memberships ativas.

Workers definitivos publicados: `studio-cut-public`, `studio-cut-admin`,
`lumiere-public` e `lumiere-admin`. Cada Worker fixa o tenant por
`TENANT_SLUG`; os públicos permanecem abertos e os administrativos são
interceptados pelo Cloudflare Access. Smart Placement continua desativado.

As aplicações `AgendaFácil Production — Studio Cut Admin` e `AgendaFácil
Production — Lumière Admin` são self-hosted, cobrem somente seus domínios
exatos, usam sessão de 24 horas, uma policy individual de precedência 1 e AUDs
produtivos distintos entre si e de staging.

Smoke público real aprovado nas duas verticais: branding, catálogo,
profissionais, disponibilidade, booking 201, conflito 409, token, isolamento
404, cancelamento 200, token revogado 410, reutilização de slot, fallback de SPA
e rate limit 429. No navegador, as duas landings ficaram sem erro de console.

Smoke administrativo real aprovado por código de e-mail: desafio do Access,
JWT, identidade, membership filtrada, deep links e os 11 módulos de cada
vertical, sem erro de console. O logout pelo endpoint da aplicação encerrou a
sessão e restaurou o desafio do Access.

Staging, Workers compartilhados antigos, Vercel, Render e `main` não foram
alterados. O procedimento idempotente ficou documentado em
`cloudflare/docs/DEPLOY_PRODUCTION.md`.

## A6 — Sistema visual validado em staging (2026-07-22)

A A6 foi concluída nos cinco commits locais `b36ef02`, `d3b0660`, `98f2db0`,
`d83893a` e `3e972b4`. O escopo permaneceu restrito ao sistema visual
compartilhado, painel, foco, CTA da Lumière, rodapé e eyebrow. Nenhuma regra de
negócio, schema, migration ou configuração de produção foi alterada.

Os quatro Workers de staging foram republicados a partir do HEAD `3e972b4`:

| Worker | Version ID |
| --- | --- |
| `agendafacil-staging-studio-cut-public` | `7b6bda48-9239-4c1f-a3f9-e65203320b9b` |
| `agendafacil-staging-studio-cut-admin` | `7c1b7288-1de6-4fc2-a7e1-1684c57ee841` |
| `agendafacil-staging-lumiere-public` | `60378093-f28f-4b98-9165-cb17dd297ff1` |
| `agendafacil-staging-lumiere-admin` | `545251d4-bc57-4863-a0ef-5860da7fc5b1` |

Smoke visual real aprovado em 1280, 768 e 360 px nas duas superfícies públicas
e nos dois painéis autenticados pelo Cloudflare Access. Os 11 módulos de cada
painel abriram contra o D1 remoto com dados reais. Botões primários, cards,
inputs, CTA da Lumière, foco por teclado, rodapé e eyebrow permaneceram legíveis.
Estados vazios reais, loading real do painel e do agendamento e erro real de
token inválido foram conferidos. Não houve overflow horizontal, clipping de
conteúdo ativo, erro ou aviso de console, falha visual de rede nem chamada ao
Render. Nenhuma regressão exigiu correção adicional.

Gates finais: `staging:dryrun:verticals`, 152/152 testes do Cloudflare, 7/7 testes
de Access, TypeScript, quatro builds Vite, quatro dry-runs, quatro bundle checks
verticais e `git diff --check`. Artefatos, configs Wrangler e arquivos de ambiente
continuam ignorados.

Os quatro Workers produtivos conservaram os mesmos deployments publicados antes
da A6. Não houve push nem deploy de produção. A6 aprovada em staging e pronta
para push e autorização separada de publicação produtiva.

## A7 — Productização comercial (2026-07-22) — AGENDAFÁCIL FINALIZADO E CONGELADO

Oito commits locais sobre a baseline `480fc10`, sem push, migration remota ou
alteração de produção:

| # | Commit | Conteúdo |
| --- | --- | --- |
| 1 | `226bf45` | Contrato versionado do Client Pack (schema fail-closed, packs reais, template, fixture não publicável). |
| 2 | `dcee3d8` | Runtime pack-driven por projeção, com gate de equivalência. |
| 3 | `d84212f` | CLI de ciclo de vida (`validate/plan/provision/update/smoke/decommission-plan`) + seed idempotente/reconciliador. |
| 4 | `efe4c87` | Backup, export (JSON + CSV por domínio, mascaramento, período) e restore com checksum e proteção cross-tenant. |
| 5 | `1a37be6` | WhatsApp manual: núcleo `wa.me`/templates + ações no painel (agenda, clientes, leads, follow-ups). |
| 6 | `bf21917` | `cloudflare/docs/CLIENT_LIFECYCLE.md` — onboarding e operação do que está implementado. |
| 7 | `5749914` | Teste de ciclo de vida ponta a ponta. |
| 8 | `3491857` | Configs Wrangler locais, builds da fixture e operação manual completa de WhatsApp. |

**Contrato**: `cloudflare/client-packs/schema.mjs` valida identidade, conteúdo,
terminologia, catálogo, agenda e configurações; recusa campo desconhecido,
segredo, AUD, HTML/CSS, URL insegura e referência quebrada. Packs reais
`studio-cut.json` e `lumiere.json` derivados do estado vigente; `template.json` e
`fixture-neutra.json` marcados `publishable: false`.

**Runtime pack-driven sem regressão**: o front usa deployment fixado por vertical,
então o pack não é lido em runtime — é a fonte de build que projeta
`demos/<slug>.js` e a terminologia. Um gate de igualdade (`compile.mjs` +
`client-compile.test.mjs`) prova que Studio Cut e Lumière permanecem idênticos
(zero diff no runtime das verticais). Hardcodes de identidade/conteúdo/catálogo
passam a ter o pack como fonte única.

**CLI segura**: dry-run por padrão, escrita só com `--apply`, produção exige
`--confirm <slug>`, non-publicável recusa provisão remota, saída resumida/JSON,
códigos de saída estáveis, logs sanitizados. A CLI nunca faz deploy nem toca D1
remoto — gera artefatos (ignorados pelo Git) e imprime os comandos wrangler.

**Reconciliação e dados**: seed idempotente (upsert por chave estável) escopado
por tenant; a reconciliação **inativa** (nunca apaga) serviços/profissionais
removidos e nunca referencia tabelas operacionais — provado em SQLite real com
FKs de que o atendimento é preservado. Export/backup excluem tokens, identidades
e memberships do Access; restore valida checksum e recusa alvo de outro tenant.

**Gates (todos verdes)**: 152/152 testes Cloudflare; 7/7 Access; **38/38 testes
A7 preservados + 5/5 novos testes contratuais** (43/43 no total: contrato,
projeção, seed/idempotência/reconciliação, backup/export/restore, provisionamento,
WhatsApp e ciclo de vida ponta a ponta em SQLite real); TypeScript; builds Studio
Cut e Lumière público e admin (73 módulos) e fixture público/admin (72 módulos);
`check:bundles`
verticais sem vazamento; `git diff --check` limpo; `npm audit --omit=dev` zero
em Cloudflare e frontend; nenhuma chamada ao Render; nenhum artefato/segredo
versionado; árvore de trabalho limpa. Nenhum arquivo de `backend/` alterado.

**Regressão das duas verticais**: preservada e provada pelo gate de equivalência
e pelos builds; identidade e comportamento intactos.

### Fechamento das pendências contratuais

- `client provision` gera configs Wrangler público/admin ignoradas pelo Git,
  com tenant, D1, assets, placeholders seguros de Access, dry-run padrão,
  escrita só com `--apply`, idempotência e recusa de conflitos incompatíveis.
- A fixture neutra gerou os dois configs e completou builds Vite e dry-runs dos
  Workers público/admin sem deploy nem criação remota.
- O painel usa os templates do Client Pack e oferece, em agenda, clientes, leads
  e follow-ups, somente ações manuais: abrir `wa.me`, registrar contato realizado,
  registrar opt-out/não contatar e agendar o próximo follow-up. Não há envio
  automático, fila, cron ou integração com Cloud API.
- Os quatro Workers de staging existentes foram republicados. Smoke autenticado
  com D1 real aprovou Studio Cut e Lumière, público/admin, em 1280, 768 e 360 px,
  sem overflow ou erro de console. Nenhuma ação de escrita foi disparada no smoke.

Versões de staging publicadas:

| Worker | Version ID |
| --- | --- |
| `agendafacil-staging-studio-cut-public` | `c5d1c83a-b803-48c1-9868-3222b522526c` |
| `agendafacil-staging-studio-cut-admin` | `7c95b80d-be18-46f0-8f4d-f89a7fec8a55` |
| `agendafacil-staging-lumiere-public` | `65a2c0b1-a296-48c0-b391-8ec79ae170b6` |
| `agendafacil-staging-lumiere-admin` | `0cad1350-f3e8-4dd4-afcd-00713590dcbe` |

Sem push ou alteração de produção, schema, APIs centrais, Render/Neon ou SOR ONE.
AgendaFácil encerrado no escopo contratado: **AGENDAFÁCIL FINALIZADO E CONGELADO**.
