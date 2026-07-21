---
project: AgendaFácil
updated_at: 2026-07-21
review_at: 2026-07-24
status: active
current_phase: A5B_concluida
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
    - "A5B: 207/207 testes backend, sendo 169 preservados e 38 novos"
    - "A5B: booking público preservado nos dois tenants, sem overflow em 360, 768 e 1280 px e console limpo"
  not_validated:
    - "painel autenticado A5B exercitado no navegador — bloqueado por exigir digitação de senha"
    - "API, banco ou painel em produção"
    - "aplicação das migrations fora do PostgreSQL Docker local"
    - "uso operacional com múltiplas instâncias ou alto volume"
  evidence:
    - "node:test: 207/207 verdes contra o agendafacil_dev local"
    - "prisma migrate deploy aplicou 20260721120000_structural_management; 15 migrations em dia"
    - "migrate diff pós-aplicação: somente as 3 linhas do drift legado A3A"
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

## Validações confirmadas

- 207/207 testes: 169 preservados e 38 A5B.
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

## Validações não executadas

- Painel autenticado no navegador: bloqueado porque o acesso exige digitar senha,
  ação que o assistente não executa. Os módulos foram validados por suíte de
  testes contra a API real, não por jornada de tela.
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
- drift legado da A3A permanece: defaults de `updatedAt` em
  `ProfessionalSchedule` e `ScheduleBlock` e nome do índice de
  `ProfessionalSchedule`. Registrado de novo, não corrigido, e ainda exige plano
  próprio antes de rollout remoto;
- rollout de A0–A5B fora do Docker local continua não validado.

## Divergências documentais

`README.md` ainda descreve partes do modelo antigo. O estado vigente desta branch
está em `docs/a3a-agenda-profissional.md`, `docs/a3b-ciclo-agendamento.md`,
`docs/a4a-relacionamento.md`, `docs/a4b-operacao-pipeline.md`,
`docs/a5a-painel-operacional.md`, `docs/a5b-gestao-estrutural.md` e neste arquivo.

## Próxima ação registrada

Percorrer o painel autenticado no navegador com o usuário logado, cobrindo os
seis módulos novos, e só então definir e autorizar explicitamente a A6. A5B não
autoriza redesign público, relatório comercial, deploy, merge ou push.
