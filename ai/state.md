---
project: AgendaFácil
updated_at: 2026-07-21
review_at: 2026-07-24
status: active
current_phase: A5A_concluida
technical_baseline:
  commit: 5b69d9f1a2f6ae69cb831cc58f311cc24b271238
  validation_status: partial
  validated_at: 2026-07-21
  validated:
    - "A0-A4B preservadas: tenant, autenticação, agenda individual, bloqueios, ciclo do agendamento e pipeline comercial"
    - "A5A: painel modular com visão geral, agenda, leads, clientes, follow-ups e horários"
    - "A5A: endpoints agregados /admin/overview e /admin/agenda com autoridade em req.auth.tenantId"
    - "A5A: diferenças por vertical entre Studio Cut e Lumière sem alterar autoridade de tenant"
    - "A5A: estados de loading, vazio, sem resultados, erro, sucesso e sessão expirada por módulo"
    - "A5A: 169/169 testes backend, sendo 149 preservados e 20 novos"
    - "A5A: jornadas nos dois tenants no navegador, 375/768/1440 sem overflow e console limpo"
  not_validated:
    - "API, banco ou painel A5A em produção"
    - "aplicação das migrations A0-A4B fora do PostgreSQL Docker local"
    - "gestão estrutural de serviços, profissionais e configurações (escopo A5B)"
    - "uso operacional com múltiplas instâncias ou alto volume"
  evidence:
    - "node:test: 169/169 verdes, sendo 149 preservados e 20 casos A5A"
    - "14 migrations em dia no agendafacil_dev; nenhuma migration nova na A5A"
    - "Vite build: 60 módulos e três entradas geradas"
    - "navegador local: confirmar, concluir, atribuir responsável, concluir follow-up e abrir ficha nos dois tenants"
    - "isolamento conferido em tela: Studio Cut e Lumière com números, destaques e atalhos próprios"
    - "baseline A5A em 5b69d9f: feat: cria painel operacional diário"
source: A5A executada na branch de preservação em 2026-07-21, somente no banco Docker local
source_of_truth: .
---

# Estado do projeto

## Último resultado confirmado

A fase A5A foi aprovada localmente na branch
`preserve/agendafacil-local-2026-07-20`, exclusivamente no PostgreSQL Docker
local `agendafacil_dev`, porta 5433. Nenhum serviço remoto foi alterado.

O painel administrativo deixou de ser uma página única longa. `Admin.jsx` virou
um shell que resolve sessão e tenant e monta um módulo por vez: Visão geral,
Agenda, Leads, Clientes, Follow-ups e Horários e bloqueios. O módulo ativo vive
em `?m=<modulo>`, então recarregar mantém o contexto e a troca de módulo não
recarrega a página. A navegação leva parâmetros entre módulos, ligando visão
geral, agenda, cliente, lead e follow-up sem busca manual.

A visão geral responde às seis perguntas do dia: o que está marcado, o que
precisa de ação, quais leads aguardam, quais follow-ups venceram, quais
oportunidades estão sem responsável ou sem próxima ação e quais encaixes ou
avaliações precisam de contato. A agenda opera o dia com navegação entre datas,
filtro por profissional e status, ordenação por horário, resumo de
disponibilidade, bloqueios e ações respeitando a máquina de estados.

Dois endpoints agregados novos, `/admin/overview` e `/admin/agenda`, derivam tudo
de `req.auth.tenantId`, usam `groupBy` e `count` com limites explícitos e índices
já existentes, e devolvem payload por lista branca. `RelationshipPanel` e
`relationship.css` foram removidos: o módulo de Leads absorveu todas as
capacidades da A4B com organização visual diferente.

## Baseline técnica

`5b69d9f1a2f6ae69cb831cc58f311cc24b271238` — `feat: cria painel operacional
diário` — é a baseline A5A, com `validation_status: partial`. Código, suíte,
build, banco local e jornadas de navegador foram validados. Permanece `partial`,
não `validated`, porque produção não foi alterada nem exercitada.

`ad95e6d` continua como último commit em `main` e como código publicado. A branch
de preservação não foi integrada nem enviada ao remoto.

## git_snapshot

```text
observed_at: 2026-07-21 (após commit de código A5A)
branch: preserve/agendafacil-local-2026-07-20
head_at_observation: 5b69d9f1a2f6ae69cb831cc58f311cc24b271238
technical_baseline: 5b69d9f1a2f6ae69cb831cc58f311cc24b271238
main: ad95e6d7083f188860f1026cd15f15715050dea0 (intacta, sem merge)
origin_preservation_branch: ecae405b071cd96122217c20ffc586233995a805 (inalterada)
production: inalterada
```

O commit documental deste estado será o HEAD seguinte e não substitui a baseline
técnica.

## Banco e migration local

- 14 migrations em dia no Docker local, as mesmas da A4B;
- A5A **não** exigiu mudança de schema e não criou migration nova;
- nenhuma migration aplicada foi editada e nenhum reset foi executado;
- nenhum banco remoto recebeu migration.

## Validações confirmadas

- 169/169 testes: 149 preservados e 20 A5A.
- Resumo do dia isolado por tenant e contagem correta por status.
- Próximos atendimentos limitados ao que está em aberto, em ordem cronológica.
- Pipeline por etapa, leads sem responsável e leads sem próxima ação.
- Follow-ups vencidos ordenados do mais antigo e follow-ups de hoje sem
  sobreposição com os vencidos.
- Agenda filtrada por profissional e por status, ordenada por horário, com status
  inválido recusado.
- Isolamento cruzado nas duas direções: nenhuma métrica atravessa os tenants.
- Ações do painel preservam a máquina de estados do agendamento.
- Paginação com limite máximo, busca de clientes por nome e telefone.
- Sessão ausente ou inválida bloqueada nos dois endpoints novos.
- Payload sem `normalizedPhone`, `qualification`, `dedupeKey` ou `passwordHash`.
- Seed local idempotente e rotas anteriores preservadas.
- Navegador: Studio Cut com confirmar, concluir, encaixe, responsável do lead,
  follow-up concluído e ficha de cliente; Lumière com visão própria, avaliação
  aguardando, agenda, lead qualificado, follow-up e ausência de dados Studio Cut.
- 375, 768 e 1440 px sem overflow horizontal, foco visível, navegação por teclado
  e console sem erro ou warning de aplicação.

## Validações não executadas

- Health check, migration ou smoke no Render/produção.
- Deploy ou Preview na Vercel.
- Gestão estrutural de serviços, profissionais e configurações.
- Relatórios, receita, pagamento, notificação ou automação.
- Operação com múltiplas instâncias ou volume acima de 100 registros por lista.

## Riscos resolvidos na A5A

- o painel deixou de ser uma página única longa e ganhou módulos previsíveis;
- métricas do dia deixaram de ser calculadas no frontend sobre a lista inteira de
  agendamentos e passaram a vir de agregados limitados no backend;
- filas de atenção (vencidos, sem próxima ação, sem responsável) ficaram visíveis
  na entrada, não escondidas atrás de filtros;
- os tokens de superfície do admin, antes usados sem nunca terem sido definidos,
  passaram a existir em `tokens.css`.

## Riscos remanescentes para A5B

- gestão estrutural de serviços, profissionais e configurações continua no CRUD
  antigo e é o próprio escopo da A5B;
- paginação ainda é por offset, não cursor;
- rate limit em memória não coordena múltiplas instâncias;
- `booking.css` ainda aplica `input, select { width: 100% }` globalmente; o painel
  reverte no próprio escopo, mas a regra global segue como drift visual;
- drift legado da A3A permanece: defaults de `updatedAt` em `ProfessionalSchedule`
  e `ScheduleBlock` e nome do índice de `ProfessionalSchedule`. Registrado de
  novo, não corrigido, e ainda exige plano próprio antes de rollout remoto;
- rollout de A0–A5A fora do Docker local continua não validado.

## Divergências documentais

`README.md` ainda descreve partes do modelo antigo. O estado vigente desta branch
está em `docs/a3a-agenda-profissional.md`, `docs/a3b-ciclo-agendamento.md`,
`docs/a4a-relacionamento.md`, `docs/a4b-operacao-pipeline.md`,
`docs/a5a-painel-operacional.md` e neste arquivo.

## Próxima ação registrada

Definir e autorizar explicitamente a A5B: gestão estrutural de serviços,
profissionais e configurações, aproveitando a arquitetura modular e os estados de
interface criados na A5A. A5A não autoriza relatórios, receita, automação,
notificação, deploy, merge ou push.
