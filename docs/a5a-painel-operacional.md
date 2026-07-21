# A5A — painel operacional diário

## Resultado

A5A substitui o painel administrativo fragmentado por uma experiência
operacional modular, validada localmente na branch
`preserve/agendafacil-local-2026-07-20`, exclusivamente no PostgreSQL Docker
`agendafacil_dev` (porta 5433). Nenhum serviço remoto foi alterado.

A fase não inclui gestão estrutural de serviços, profissionais e configurações
— isso é A5B. Também não inclui relatórios financeiros, automação,
notificações, drag-and-drop, gráficos decorativos, redesign público ou deploy.

## Arquitetura do painel

O painel deixou de ser uma página única longa. `Admin.jsx` passou a ser um shell
que resolve sessão e tenant e monta um módulo por vez:

| Módulo | Arquivo | Responsabilidade |
| --- | --- | --- |
| Visão geral | `pages/admin/Overview.jsx` | resumo do dia, atenção necessária, próximos atendimentos, pipeline |
| Agenda | `pages/admin/Agenda.jsx` | dia operacional, filtros, disponibilidade, ações de estado |
| Leads | `pages/admin/Leads.jsx` | pipeline, lista compacta, fila de atenção e ficha completa |
| Clientes | `pages/admin/Clients.jsx` | busca, listagem e ficha com histórico comercial separado |
| Follow-ups | `pages/admin/FollowUps.jsx` | vencidos, hoje, próximos, concluídos e cancelados |
| Horários e bloqueios | `pages/admin/Schedules.jsx` | módulos A3A preservados, sem redesenho profundo |

O módulo ativo é refletido em `?m=<modulo>` por `history.replaceState`, então
recarregar a página mantém o contexto sem reload completo entre módulos. A
navegação entre módulos passa parâmetros (`clientId`, `leadId`, `status`,
`bucket`), o que liga visão geral → agenda → cliente → lead → follow-up sem
busca manual.

`RelationshipPanel.jsx` e `relationship.css` foram removidos: a A5A absorve todas
as capacidades da A4B no módulo de Leads, com organização visual diferente.

## Endpoints agregados

Dois endpoints administrativos novos, ambos com autoridade em `req.auth.tenantId`
e nenhum parâmetro de tenant aceito do cliente.

### `GET /admin/overview?date=YYYY-MM-DD`

Agrega em consultas contadas, sem carregar tabelas inteiras:

- `day.byStatus` e `occupancy` saem de um único `groupBy([professionalId, status])`;
- `pipeline` de um `groupBy(status)` sobre `Lead`;
- `attention.activeLeadsBySource` de um `groupBy(source)` sobre leads ativos;
- `overdueFollowUps`, `followUpsToday`, `leadsWithoutNextAction`,
  `leadsWithoutOwner` e `pendingUpcoming` de `count`;
- `upcoming` é um `findMany` limitado a 8 registros `PENDING`/`CONFIRMED` do dia.

Convenções de recorte: o dia é o dia UTC (mesma convenção de `Appointment.date`);
`overdueFollowUps` é `OPEN` com `dueAt < agora`; `followUpsToday` é `OPEN` com
`dueAt` entre agora e o fim do dia — as duas faixas não se sobrepõem;
`pendingUpcoming` cobre 7 dias a partir do dia consultado.

### `GET /admin/agenda?date=&professionalId=&status=`

Devolve `summary` (respeita o filtro de profissional, ignora o de status para o
resumo continuar descrevendo o dia), `items` limitados a 100 horários ordenados
por horário, `blocks` do dia e `availability` por profissional, com minutos
abertos, ocupados e livres calculados sobre `ProfessionalSchedule` menos
bloqueios e menos duração agendada.

Índices já existentes cobrem as consultas: `[tenantId, status, date]` e
`[tenantId, date]` em `Appointment`, `[tenantId, status, createdAt]` e
`[tenantId, ownerUserId, status, createdAt]` em `Lead`, `[tenantId, status, dueAt]`
em `FollowUp`. Nenhuma camada analítica genérica foi criada.

### Ajustes aditivos em endpoints existentes

- `GET /admin/leads` aceita `unassigned=true` e `attention=true`. `attention`
  devolve leads ativos sem próxima ação, com follow-up vencido ou sem responsável,
  em um único `AND/OR` que não colide com a busca textual.
- `PATCH /admin/follow-ups/:id/owner` atribui ou remove responsável de um
  follow-up aberto, validando usuário ativo do mesmo tenant.

## Payloads

`appointmentRow` monta a resposta por lista branca. O painel recebe nome, telefone
e nomes de serviço e profissional; não recebe `normalizedPhone`, `normalizedEmail`,
`clientEmail`, notas, `qualification`, `dedupeKey`, `tenantId` nem os objetos
relacionais completos.

## Diferenças por vertical

`config/verticals.js` mantém o núcleo visual compartilhado e muda apenas a
ordem e o vocabulário da operação. A autoridade de tenant continua no backend.

| | Studio Cut | Lumière |
| --- | --- | --- |
| Título do dia | Movimento de hoje | Atendimentos de hoje |
| Primeiro destaque | encaixes aguardando contato (`WAITLIST`) | avaliações aguardando contato (`EVALUATION`) |
| Ocupação por profissional | exibida | não exibida |
| Atalhos de lead | Encaixes, Prioridade alta, Vencidos, Sem próxima ação, Sem responsável, Novos hoje | Avaliações, Qualificados, Vencidos, Sem próxima ação, Sem responsável, Prioridade alta |

Nenhum dado clínico é exibido na Lumière.

## Estados de interface

Cada módulo tem loading (esqueleto), vazio, sem resultados (com ação de limpar
filtros), erro com nova tentativa localizada, sucesso por mensagem dispensável e
sessão expirada. `usePanelData` centraliza esses estados: `401` promove a sessão
expirada para o shell, que volta à tela de login com aviso; qualquer outro erro
fica no módulo e refaz apenas a própria consulta, sem reload total. A tela de
tenant incorreto da A2 foi preservada.

## Design e responsividade

Superfície clara e densa para a operação, telas de sessão em fundo escuro. Sem
glow, glassmorphism, sombra decorativa ou animação supérflua; raio de borda
continua zero. Movimento apenas no esqueleto de carregamento, desligado por
`prefers-reduced-motion`.

Validado em 375 px, 768 px e 1440 px, sem overflow horizontal em nenhum deles. No
mobile as linhas viram blocos com horário fixo à esquerda, a navegação quebra em
linhas em vez de rolar e os alvos de toque sobem para 40–44 px.

Os tokens `--bg-light`, `--border-light`, `--text-on-dark` e afins passaram a ser
definidos em `tokens.css`. Antes da A5A o CSS do admin já os usava sem que
existissem, o que deixava o painel sem superfície própria.

## Dados de demonstração

O seed local passou a montar um dia realista e explicitamente fictício:

- Studio Cut: seis horários hoje cobrindo confirmado, pendente, concluído,
  cancelado e não comparecimento; cliente recorrente com atendimento no dia
  anterior; encaixe de lista de espera com prioridade alta, sem responsável e com
  follow-up vencido; pausa de almoço como bloqueio parcial.
- Lumière: quatro horários hoje incluindo cancelamento por reagendamento;
  avaliação aguardando contato com follow-up para hoje; lead qualificado com
  interesse em pacote e follow-up vencido.

Nenhum dado sugere receita, volume real, crescimento, conversão comprovada ou
depoimento. Follow-ups exigem um `AdminUser`; sem credencial local no `.env` o
bloco é ignorado com aviso, sem quebrar o seed.

## Migrations e drift legado

A5A não exigiu mudança de schema. As 14 migrations continuam em dia no banco
local e nenhuma migration nova foi criada. `prisma migrate diff` global continua
apontando o mesmo drift legado da A3A, inalterado e não corrigido nesta fase:

- `ProfessionalSchedule.updatedAt` com default no banco;
- `ScheduleBlock.updatedAt` com default no banco;
- índice `ProfessionalSchedule_tenantId_professionalId_dayOfWeek_startTim` com
  nome divergente do esperado.

Nenhuma migration aplicada foi editada e o drift não foi resolvido por reset. Ele
continua exigindo plano próprio antes de qualquer rollout remoto.

## Limitações conhecidas

- Paginação continua por offset, não por cursor.
- O rate limit em memória segue sem coordenação entre instâncias.
- A agenda não tem drag-and-drop nem criação de agendamento direto pelo dia.
- A lista de clientes mostra contadores e último contato; próximo agendamento e
  último atendimento aparecem na ficha, não na linha.
- `booking.css` ainda aplica `input, select { width: 100% }` globalmente; o painel
  reverte isso no próprio escopo, mas a regra global continua sendo drift visual.
- Nada foi exercitado fora do Docker local.

## Testes

169 testes verdes: os 149 preservados e 20 casos A5A em `tests/overview.test.js`,
cobrindo isolamento do resumo por tenant, contagem por status, próximos
atendimentos, pipeline por etapa, leads sem responsável e sem próxima ação,
follow-ups vencidos e de hoje, filtros por profissional e status, ordenação da
agenda, isolamento cruzado nas duas direções, preservação da máquina de estados,
paginação, busca de clientes, sessão inválida, payload sem dados internos,
idempotência do seed e preservação das rotas anteriores.
