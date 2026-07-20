# A3A — agenda profissional, bloqueios e disponibilidade

Atualizado em 2026-07-20. Escopo validado exclusivamente no PostgreSQL Docker
local `agendafacil_dev`, porta 5433.

## Modelo

`ProfessionalSchedule` guarda um ou mais intervalos por profissional e dia da
semana. O vínculo composto `professionalId + tenantId` impede agenda de
profissional pertencente a outro tenant. A migration também aplica validação de
dia, formato de hora, ordem do intervalo, duplicidade e sobreposição ativa.

`ScheduleBlock` representa bloqueio do tenant inteiro ou de um profissional.
`allDay=true` exige início e fim nulos; bloqueios parciais exigem os dois horários
e `startTime < endTime`. O motivo é opcional, normalizado e limitado a 200
caracteres. Uma trigger impede vínculo cross-tenant direto no banco.

## Compatibilidade com BlockedDate

`BlockedDate` permanece temporariamente como compatibilidade de leitura e não
recebe novas escritas da API ou do seed. A migration copia cada registro legado
para um `ScheduleBlock` global de dia inteiro. O motor consulta os dois modelos,
evitando perda de bloqueio caso alguma instalação ainda contenha um registro
legado. A remoção de `BlockedDate` deve ocorrer somente depois de confirmar o
backfill em todos os ambientes numa fase posterior.

## Motor de disponibilidade

A lógica está centralizada em `backend/services/availabilityService.js` e é
usada tanto pela consulta pública quanto pela criação do agendamento.

```text
horário do negócio
∩ intervalos ativos do profissional
− bloqueios do tenant
− bloqueios do profissional
− agendamentos não cancelados
```

Os slots avançam em passos de 30 minutos a partir do início de cada intervalo.
A duração do serviço deve caber integralmente no mesmo intervalo resultante;
portanto nenhum slot atravessa pausa ou fechamento. A operação pública de
primeira disponibilidade agrega os profissionais ativos e retorna o slot mais
cedo para a data consultada.

## API administrativa

Todas as rotas abaixo exigem sessão e usam exclusivamente
`req.auth.tenantId`:

- `GET|POST /api/admin/professional-schedules`
- `PATCH|DELETE /api/admin/professional-schedules/:id`
- `GET|POST /api/admin/schedule-blocks`
- `PATCH|DELETE /api/admin/schedule-blocks/:id`

A listagem de bloqueios exige `from` e `to`. Recursos e profissionais de outro
tenant retornam `404` sem revelar sua existência.

## API pública

- `GET /api/available-slots` mantém o contrato atual de array de horários.
- `GET /api/first-availability` aceita `demoId`, `date` e `serviceId` e retorna
  `{ date, time, professionalId }` ou `null`.
- `POST /api/appointments` usa o mesmo motor antes da gravação serializável.

Motivos dos bloqueios e observações administrativas nunca são retornados pelas
rotas públicas.

## Migration e backfill

As migrations versionadas da fase são:

- `20260720210000_professional_schedules`: tabelas, índices, constraints,
  trigger, agenda inicial a partir de `BusinessHours` e cópia de `BlockedDate`.
- `20260720211000_schedule_block_constraint_hardening`: exige explicitamente
  início e fim não nulos em todo bloqueio parcial.
- `20260720212000_professional_schedule_overlap_hardening`: impede sobreposição
  também entre intervalos inativos.

Nenhuma delas foi aplicada em Render, Preview ou produção. Os planos manuais de
reversão ficam nos respectivos arquivos `ROLLBACK.md`. O rollback da migration
principal exige exportar previamente os dados novos e nunca remove
agendamentos, horários gerais ou bloqueios legados.

## Próxima fase

A3B deve tratar confirmação, cancelamento e reagendamento públicos sem duplicar
o motor de disponibilidade. Os principais riscos são preservar a transação
serializável durante reagendamento, definir transições de status e impedir que
links públicos revelem tenant, cliente ou observações administrativas.
