# CF1A — Modelo D1 e equivalências PostgreSQL

## Inventário do schema D1

| D1 | Origem PostgreSQL | Observação |
|---|---|---|
| `tenants` | `Tenant` | slug público único e flag ativa |
| `services` | `Service` | `price` vira `price_cents` inteiro |
| `professionals` | `Professional` | contato interno permanece administrativo |
| `professional_services` | `ProfessionalService` | FKs compostas impedem associação cross-tenant |
| `tenant_settings` | `TenantSettings` | uma linha por tenant |
| `business_hours` | `BusinessHours` | dia fechado aceita `00:00–00:00` |
| `professional_schedules` | `ProfessionalSchedule` | múltiplas janelas preservam pausas |
| `schedule_blocks` | `ScheduleBlock` | bloqueio geral ou por profissional |
| `blocked_dates` | `BlockedDate` | compatibilidade com bloqueio integral legado |
| `clients` | `Client` | telefone normalizado único por tenant |
| `appointments` | `Appointment` | serviço, profissional e cliente por FK composta |
| `appointment_slots` | auxiliar novo | trava atômica de cada slot ativo |
| `appointment_access_tokens` | `AppointmentAccessToken` | somente hash, nunca token bruto |
| `appointment_history_events` | `AppointmentHistoryEvent` | JSON guardado como TEXT validado |
| `leads` | `Lead` | referências e owners isolados por tenant |
| `follow_ups` | `FollowUp` | atores administrativos via membership |
| `relationship_history_events` | `RelationshipHistoryEvent` | trilha por cliente/lead/agendamento |
| `admin_identities` | substitui parte de `AdminUser` | email global normalizado; sem senha |
| `admin_memberships` | substitui vínculo de `AdminUser` com tenant | role inicial `ADMIN`; sem sessão |

`AdminSession` não tem equivalente D1. `AdminUser.passwordHash` não é migrado. Cloudflare Access substitui autenticação local; `AdminIdentity` e `AdminMembership` armazenam somente autorização da aplicação.

## Isolamento estrutural

Todas as entidades de negócio têm `tenant_id NOT NULL`. Entidades referenciadas expõem `UNIQUE(id, tenant_id)` e os filhos usam FKs compostas. Assim, um ID real de Studio Cut não pode ser associado a uma linha Lumière mesmo se houver erro no Worker.

Casos importantes:

- `professional_services` referencia `(professional_id, tenant_id)` e `(service_id, tenant_id)`;
- `appointments` referencia serviço, profissional e cliente com tenant;
- `appointment_slots` referencia profissional e agendamento com tenant;
- `leads` referencia cliente, serviço, profissional e agendamento convertido com tenant;
- owners e atores administrativos operacionais referenciam `(identity_id, tenant_id)` em `admin_memberships`.

## Enums

Enums PostgreSQL viram `TEXT NOT NULL CHECK (...)`. O schema contém checks para status/tipos de agendamento, lead, follow-up, histórico, ator, propósito de token e role. Isso mantém rejeição no banco e tipos TypeScript no Worker.

## Decimal

`Service.price Decimal(10,2)` vira `services.price_cents INTEGER`.

- `45.00` vira `4500`.
- `1200.00` vira `120000`.
- `NULL` permanece `NULL`.
- Escrita aceita somente inteiro não negativo.
- O limite documentado é `0..999999999999` centavos; apresentação divide por 100 sem persistir ponto flutuante.

## DateTime, datas e horários

- `created_at`, `updated_at`, `due_at`, `expires_at` e demais instantes: UTC ISO-8601 `TEXT`.
- Datas de agenda: `YYYY-MM-DD` `TEXT`.
- Horários: `HH:MM` `TEXT`.
- Checks com `GLOB` verificam o formato estrutural; o Worker valida calendário real e converte usando o timezone do tenant.
- `datetime(...)` é usado somente para validar/ordenar instantes ISO, não para interpretar datas civis do tenant.

## UUID

IDs novos são UUIDs gerados por `crypto.randomUUID()` no Worker. O seed usa IDs determinísticos legíveis para ser idempotente. APIs tratam IDs como strings opacas.

## Índices parciais

SQLite/D1 suporta índices parciais. O índice de deduplicação de leads ativos é reproduzido com `WHERE status IN ('NEW','CONTACTED','QUALIFIED')`. A antiga unicidade de agendamento ativo por horário é substituída por `appointment_slots`, que cobre também serviços com duração maior que um slot.

## `btree_gist`, `EXCLUDE`, triggers e funções

D1 não oferece `btree_gist` nem `EXCLUDE`. A equivalência é explícita:

- agenda profissional: consulta de sobreposição `start_time < new_end AND end_time > new_start` antes da escrita;
- bloqueios: mesma consulta por tenant, data e escopo;
- agendamentos: linhas de `appointment_slots` inseridas no mesmo `DB.batch` da reserva;
- concorrência: a chave primária dos slots produz exatamente um sucesso e um conflito;
- tenant de bloqueio: FK composta substitui o trigger PostgreSQL `ScheduleBlock_tenant_guard`.

Não há trigger de negócio no D1 nesta fase. Atualização de `updated_at`, histórico e liberação de slots ficam explícitos e testáveis no Worker.

## Transações

Operações com múltiplas escritas usam `DB.batch`. Nenhum fluxo atômico é implementado como chamadas independentes. Para reservas, cada statement do batch é preparado antes da chamada; falha de constraint desfaz o lote. Erros `SQLITE_CONSTRAINT` de slots são mapeados para HTTP 409.

## Índices orientados às consultas atuais

- serviços/profissionais: `(tenant_id, active, display_order, name)`;
- agendas: `(tenant_id, professional_id, day_of_week, active, start_time)`;
- bloqueios: `(tenant_id, date)` e `(tenant_id, professional_id, date)`;
- agendamentos: `(tenant_id, date, status)`, `(tenant_id, professional_id, date, start_time)` e `(tenant_id, client_id, date)`;
- clientes: `(tenant_id, normalized_email)` e `(tenant_id, last_contact_at)`;
- leads: por status, source, priority, owner e client;
- follow-ups: por status/due, client, lead e owner;
- históricos: por tenant/recurso/data;
- identities/memberships: email único e `(tenant_id, active)`.

## Diferenças deliberadas

- IDs inteiros autoincrementais viram texto UUID/determinístico.
- `AdminUser`/`AdminSession` são substituídos, não copiados.
- `appointment_slots` torna a exclusão por duração explícita e portável.
- JSON permanece texto com `json_valid` e limite de tamanho; o Worker serializa/deserializa.
- O schema D1 fortalece FKs compostas em pontos onde o schema Prisma ainda usa FK simples.
