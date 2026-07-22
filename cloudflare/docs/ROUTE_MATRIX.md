# CF1A — Matriz completa de rotas

## Convenções

- Os caminhos atuais abaixo já incluem o mount `/api` de `backend/app.js`.
- `P` = `/api/tenants/:tenantSlug` no Public Worker.
- `A` = `/api/admin/tenants/:tenantSlug` no Admin Worker.
- Público atual: tenant derivado de `demoId` em query/body; isso é legado e não será autoridade no destino.
- Administrativo atual: tenant derivado da sessão Express; no destino será rota + JWT Access + `AdminIdentity` + `AdminMembership`.
- “Nenhuma” em frontend significa rota existente sem consumidor encontrado em `frontend/src`.

## Público

| Método | Caminho atual | Classe | Tenant atual | Autenticação | Tabelas lidas/escritas | Efeito de escrita | Resposta esperada | Consumidor atual | Destino |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/health` | pública/infra | nenhum | nenhuma | consulta de conexão | nenhum | 200 `{status, service, database}` ou 503 | monitor/nenhum componente | Public `/api/live` e Admin `/api/live` |
| GET | `/api/services` | pública | query `demoId` | nenhuma | `Tenant`, `Service` | nenhum | serviços ativos ordenados | `App`, `Home`, `BookingFlow` | `P/services` |
| GET | `/api/professionals` | pública | query `demoId` | nenhuma | `Tenant`, `Professional` | nenhum | profissionais ativos ordenados | `App`, `Home`, `BookingFlow` | `P/professionals` |
| GET | `/api/available-slots` | pública | query `demoId` | nenhuma | `Tenant`, `TenantSettings`, `Service`, `Professional`, `ProfessionalService`, `BusinessHours`, `BlockedDate`, `ProfessionalSchedule`, `ScheduleBlock`, `Appointment` | nenhum | array de horários `HH:MM` | `BookingFlow` | `P/available-slots` |
| GET | `/api/first-availability` | pública auxiliar | query `demoId` | nenhuma | mesmas tabelas de disponibilidade | nenhum | primeira data/profissional/slot disponível ou vazio | nenhuma | `P/first-availability` |
| GET | `/api/business-hours` | pública | query `demoId` | nenhuma | `Tenant`, `BusinessHours` | nenhum | horários semanais | método `api.getBusinessHours`, sem chamada encontrada | `P/business-hours` |
| GET | `/api/settings` | pública | query `demoId` | nenhuma | `Tenant`, `TenantSettings` | nenhum | recorte público de settings | nenhuma | `P/settings` |
| POST | `/api/appointments` | pública | body `demoId` | nenhuma; rate limit | `Tenant`, `TenantSettings`, `Service`, `Professional`, `ProfessionalService`, disponibilidade, `Client`, `Appointment`, `AppointmentHistoryEvent`, `RelationshipHistoryEvent`, `AppointmentAccessToken` | cria/atualiza cliente, cria agendamento, históricos e token hash | 201 agendamento + `managementPath`; 409 conflito | `BookingFlow` | `P/appointments` |
| POST | `/api/public/leads` | pública | body `demoId` | nenhuma; rate limit | `Tenant`, `Client`, `Lead`, `FollowUp`, `RelationshipHistoryEvent`, referências de serviço/profissional | cria/reutiliza cliente/lead e follow-up quando aplicável | 200/201/202 resposta pública sem dados internos | `LeadCapture` | `P/leads` |
| GET | `/api/public/appointment` | pública com capability token | query `demoId` | `X-Appointment-Token`; rate limit | `Tenant`, `AppointmentAccessToken`, `Appointment`, `Service`, `Professional` | atualiza último uso quando aplicável | resumo público do agendamento | `ManageAppointment` | `P/appointment` |
| POST | `/api/public/appointment/confirm` | pública com capability token | query `demoId` | `X-Appointment-Token`; rate limit | token, `Appointment`, `AppointmentHistoryEvent` | confirma e registra histórico | resumo público confirmado | `ManageAppointment` | `P/appointment/confirm` |
| POST | `/api/public/appointment/cancel` | pública com capability token | query `demoId` | `X-Appointment-Token`; rate limit | token, `Appointment`, `AppointmentHistoryEvent` | cancela, registra motivo/histórico, revoga/usa token; destino libera slots | resumo público cancelado | `ManageAppointment` | `P/appointment/cancel` |
| GET | `/api/public/appointment/reschedule-availability` | pública com capability token | query `demoId` | `X-Appointment-Token`; rate limit | token, agendamento e tabelas de disponibilidade | nenhum | array de novos slots | `ManageAppointment` | `P/appointment/reschedule-availability` |
| POST | `/api/public/appointment/reschedule` | pública com capability token | query `demoId` | `X-Appointment-Token`; rate limit | token, disponibilidade, `Appointment`, históricos, novo token | cancela original, cria substituto, históricos e token | 201 resumo + novo `managementPath` | `ManageAppointment` | `P/appointment/reschedule` |
| GET | `/studio-cut`, `/lumiere` | página pública | slug do caminho | nenhuma | assets; APIs públicas subsequentes | nenhum | SPA/HTML da vertical | navegador | Public Worker Static Assets |
| GET | assets e demais páginas públicas | página/asset | contexto da página, quando houver | nenhuma | assets | nenhum | arquivo estático ou fallback SPA permitido | navegador | Public Worker Static Assets |

## Autenticação e identidade administrativa

| Método | Caminho atual | Classe | Tenant atual | Autenticação | Tabelas lidas/escritas | Efeito de escrita | Resposta esperada | Consumidor atual | Destino |
|---|---|---|---|---|---|---|---|---|---|
| POST | `/api/admin/session` | administrativa | body `demoId` | email + PBKDF2; rate limit | `Tenant`, `AdminUser`, `AdminSession` | cria sessão local | 200 `{ok:true}` + cookie | `Admin` login | removida; login é Cloudflare Access |
| DELETE | `/api/admin/session` | administrativa | sessão | cookie local | `AdminSession` | revoga sessão e limpa cookie | 200 `{ok:true}` | `Admin` logout | removida; logout é Cloudflare Access |
| GET | `/api/admin/me` | administrativa | sessão | cookie local | `AdminSession`, `AdminUser` | atualiza uso de sessão | identidade/tenant | `Admin` | `A/context` via JWT + identity/membership |
| GET | `/api/admin/users` | administrativa auxiliar | sessão | cookie local | `AdminUser` | nenhum | admins ativos do tenant | `Admin`, owners de leads/follow-ups | `A/identities` com recorte de memberships |

## Agenda e agendamentos administrativos

| Método | Caminho atual | Classe | Tenant atual | Autenticação | Tabelas lidas/escritas | Efeito de escrita | Resposta esperada | Consumidor atual | Destino |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/appointments` | administrativa | sessão | cookie local | `Appointment`, `Service`, `Professional`, `Client`, `Lead` | nenhum | lista completa | método `api.getAppointments`, sem página direta encontrada | `A/appointments` |
| GET | `/api/appointments/export.csv` | administrativa | sessão | cookie local | `Appointment`, `Service`, `Professional` | nenhum | CSV com agendamentos | `Agenda` | `A/appointments/export.csv` |
| GET | `/api/appointments/:id` | administrativa | sessão | cookie local | `Appointment`, `Service`, `Professional`, `Client`, `Lead` | nenhum | detalhe ou 404 | auxiliar/sem chamada encontrada | `A/appointments/:id` |
| PATCH | `/api/appointments/:id/status` | administrativa | sessão | cookie local | `Appointment`, `AppointmentHistoryEvent`, `AppointmentAccessToken` | transição, motivo, histórico e revogação quando aplicável | agendamento atualizado | `Agenda`, `Overview` | `A/appointments/:id/status` |
| GET | `/api/appointments/:id/history` | administrativa | sessão | cookie local | `Appointment`, `AppointmentHistoryEvent` | nenhum | histórico cronológico | `Agenda` | `A/appointments/:id/history` |
| GET | `/api/admin/overview` | administrativa | sessão | cookie local | `Appointment`, `Lead`, `FollowUp`, `Professional` | nenhum | KPIs, agenda e alertas | `Overview` | `A/overview` |
| GET | `/api/admin/agenda` | administrativa | sessão | cookie local | `Appointment`, `Service`, `Professional`, `Client`, `ProfessionalSchedule`, `ScheduleBlock` | nenhum | dia filtrado, profissionais, bloqueios e capacidade | `Agenda` | `A/agenda` |

## Clientes

| Método | Caminho atual | Classe | Tenant atual | Autenticação | Tabelas lidas/escritas | Efeito de escrita | Resposta esperada | Consumidor atual | Destino |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/admin/clients` | administrativa | sessão | cookie local | `Client` + contagens/relações | nenhum | lista/paginação | `Clients` | `A/clients` |
| GET | `/api/admin/clients/:id` | administrativa | sessão | cookie local | `Client`, `Appointment`, `Lead`, `FollowUp` | nenhum | detalhe agregado ou 404 | `Clients`, `Leads` | `A/clients/:id` |
| PATCH | `/api/admin/clients/:id` | administrativa | sessão | cookie local | `Client`, `RelationshipHistoryEvent` | atualiza dados e histórico | cliente atualizado | API disponível; UI parcial | `A/clients/:id` |
| POST | `/api/admin/clients/:id/notes` | administrativa | sessão | cookie local | `Client`, `RelationshipHistoryEvent` | adiciona nota de histórico | 201 evento | `Clients` | `A/clients/:id/notes` |
| GET | `/api/admin/clients/:id/history` | administrativa | sessão | cookie local | `Client`, `RelationshipHistoryEvent` | nenhum | histórico cronológico | `Clients` | `A/clients/:id/history` |

## Leads

| Método | Caminho atual | Classe | Tenant atual | Autenticação | Tabelas lidas/escritas | Efeito de escrita | Resposta esperada | Consumidor atual | Destino |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/admin/leads` | administrativa | sessão | cookie local | `Lead`, `Client`, `Service`, `Professional`, memberships/admin atual | nenhum | lista/paginação filtrada | `Leads` | `A/leads` |
| POST | `/api/admin/leads` | administrativa | sessão | cookie local | `Client`, `Lead`, `FollowUp`, `RelationshipHistoryEvent`, referências | cria/reutiliza cliente e lead, follow-up opcional | 200/201 lead | API/fluxos do painel | `A/leads` |
| GET | `/api/admin/leads/:id` | administrativa | sessão | cookie local | `Lead`, `Client`, `Service`, `Professional`, `Appointment`, `FollowUp`, históricos | nenhum | detalhe agregado | `Leads` | `A/leads/:id` |
| PATCH | `/api/admin/leads/:id/status` | administrativa | sessão | cookie local | `Lead`, `FollowUp`, `RelationshipHistoryEvent` | muda etapa e cria follow-up opcional | lead atualizado | `Leads` | `A/leads/:id/status` |
| PATCH | `/api/admin/leads/:id/priority` | administrativa | sessão | cookie local | `Lead`, `RelationshipHistoryEvent` | altera prioridade | lead atualizado | `Leads` | `A/leads/:id/priority` |
| PATCH | `/api/admin/leads/:id/owner` | administrativa | sessão | cookie local | `Lead`, `AdminUser`, `RelationshipHistoryEvent` | atribui/remove owner do mesmo tenant | lead atualizado | `Leads` | `A/leads/:id/owner` |
| PATCH | `/api/admin/leads/:id/qualification` | administrativa | sessão | cookie local | `Lead`, referências, `RelationshipHistoryEvent` | grava qualificação versionada | lead atualizado | `Leads` | `A/leads/:id/qualification` |
| POST | `/api/admin/leads/:id/notes` | administrativa | sessão | cookie local | `Lead`, `RelationshipHistoryEvent` | adiciona nota | 201 evento | `Leads` | `A/leads/:id/notes` |
| POST | `/api/admin/leads/:id/lost` | administrativa | sessão | cookie local | `Lead`, `FollowUp`, `RelationshipHistoryEvent` | marca perdido e fecha follow-ups | lead atualizado | `Leads` | `A/leads/:id/lost` |
| POST | `/api/admin/leads/:id/convert` | administrativa | sessão | cookie local | `Lead`, `Client`, `Appointment`, `FollowUp`, históricos e disponibilidade quando cria agendamento | vincula/cria agendamento, converte lead e fecha follow-ups | lead convertido | `Leads` | `A/leads/:id/convert` |
| POST | `/api/admin/leads/:id/appointment` | administrativa | sessão | cookie local | `Lead`, `Appointment`, `RelationshipHistoryEvent` | vincula agendamento existente do tenant | lead atualizado | `Leads` | `A/leads/:id/appointment` |

## Follow-ups

| Método | Caminho atual | Classe | Tenant atual | Autenticação | Tabelas lidas/escritas | Efeito de escrita | Resposta esperada | Consumidor atual | Destino |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/admin/follow-ups` | administrativa | sessão | cookie local | `FollowUp`, `Client`, `Lead`, `AdminUser` | nenhum | lista/paginação com atraso calculado | `FollowUps`, `Leads` | `A/follow-ups` |
| POST | `/api/admin/follow-ups` | administrativa | sessão | cookie local | `FollowUp`, `Client`, `Lead`, `AdminUser`, `RelationshipHistoryEvent` | cria follow-up | 201 follow-up | `Leads` | `A/follow-ups` |
| POST | `/api/admin/follow-ups/:id/complete` | administrativa | sessão | cookie local | `FollowUp`, `Lead`, `RelationshipHistoryEvent` | conclui e pode criar próximo | concluído + próximo | `FollowUps`, `Leads` | `A/follow-ups/:id/complete` |
| POST | `/api/admin/follow-ups/:id/cancel` | administrativa | sessão | cookie local | `FollowUp`, `RelationshipHistoryEvent` | cancela | follow-up atualizado | `FollowUps`, `Leads` | `A/follow-ups/:id/cancel` |
| PATCH | `/api/admin/follow-ups/:id/owner` | administrativa | sessão | cookie local | `FollowUp`, `AdminUser` | atribui/remove owner do tenant | follow-up atualizado | `FollowUps` | `A/follow-ups/:id/owner` |

## Serviços/procedimentos

| Método | Caminho atual | Classe | Tenant atual | Autenticação | Tabelas lidas/escritas | Efeito de escrita | Resposta esperada | Consumidor atual | Destino |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/admin/services` | administrativa | sessão | cookie local | `Service`, `Appointment`, `ProfessionalService`, `Lead` | nenhum | lista/paginação + dependências | `Admin`, `Services` | `A/services` |
| POST | `/api/admin/services` | administrativa | sessão | cookie local | `Service` | cria | 201 serviço | `Services` | `A/services` |
| PATCH | `/api/admin/services/order` | administrativa | sessão | cookie local | `Service` | reordena em lote | lista ordenada | `Services` | `A/services/order` |
| GET | `/api/admin/services/:id/dependencies` | administrativa | sessão | cookie local | `Service`, `Appointment`, `ProfessionalService`, `Lead` | nenhum | contagens + agendamentos futuros | `Services` | `A/services/:id/dependencies` |
| PATCH | `/api/admin/services/:id/active` | administrativa estrutural | sessão | cookie local | `Service` e dependências | prévia sem escrita ou ativação/desativação com `appliedImpact` | serviço + impacto ou 422 | `Services` | `A/services/:id/active` |
| PATCH | `/api/admin/services/:id` | administrativa estrutural | sessão | cookie local | `Service`, `Appointment` | atualiza; duração pode exigir confirmação | serviço + `appliedImpact` | `Services` | `A/services/:id` |

## Profissionais e associações

| Método | Caminho atual | Classe | Tenant atual | Autenticação | Tabelas lidas/escritas | Efeito de escrita | Resposta esperada | Consumidor atual | Destino |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/admin/professionals` | administrativa | sessão | cookie local | `Professional`, `ProfessionalService`, `Service`, `Appointment`, `ProfessionalSchedule` | nenhum | lista/paginação + associações/dependências | `Admin`, `Professionals` | `A/professionals` |
| POST | `/api/admin/professionals` | administrativa | sessão | cookie local | `Professional` | cria | 201 profissional | `Professionals` | `A/professionals` |
| PATCH | `/api/admin/professionals/order` | administrativa | sessão | cookie local | `Professional` | reordena em lote | lista ordenada | `Professionals` | `A/professionals/order` |
| GET | `/api/admin/professionals/:id/dependencies` | administrativa | sessão | cookie local | `Professional`, `Appointment`, `ProfessionalSchedule`, `ScheduleBlock`, `ProfessionalService`, `Lead` | nenhum | contagens + agendamentos futuros | `Professionals` | `A/professionals/:id/dependencies` |
| PUT | `/api/admin/professionals/:id/services` | administrativa | sessão | cookie local | `Professional`, `Service`, `ProfessionalService` | substitui associações no tenant | associações salvas | `Professionals` | `A/professionals/:id/services` |
| PATCH | `/api/admin/professionals/:id/active` | administrativa estrutural | sessão | cookie local | `Professional` e dependências | prévia sem escrita ou ativação/desativação | profissional + impacto ou 422 | `Professionals` | `A/professionals/:id/active` |
| PATCH | `/api/admin/professionals/:id` | administrativa | sessão | cookie local | `Professional` | atualiza dados internos/públicos | profissional atualizado | `Professionals` | `A/professionals/:id` |

## Horários, agendas e bloqueios

| Método | Caminho atual | Classe | Tenant atual | Autenticação | Tabelas lidas/escritas | Efeito de escrita | Resposta esperada | Consumidor atual | Destino |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/admin/business-hours` | administrativa | sessão | cookie local | `BusinessHours` | nenhum | sete dias, ausentes preenchidos como fechados | `Availability` | `A/business-hours` |
| PUT | `/api/admin/business-hours` | administrativa estrutural | sessão | cookie local | `BusinessHours`, `Appointment` | prévia/recalcula e upsert em lote | dias + `appliedImpact` ou 422 | `Availability` | `A/business-hours` |
| POST | `/api/admin/professional-schedules/copy` | administrativa estrutural | sessão | cookie local | `Professional`, `BusinessHours`, `ProfessionalSchedule`, `Appointment` | substitui janelas alvo após prévia/recalculo | agendas copiadas + impacto | `Availability` | `A/professional-schedules/copy` |
| GET | `/api/admin/professional-schedules` | administrativa | sessão | cookie local | `ProfessionalSchedule`, `Professional` | nenhum | janelas filtradas | `Availability` | `A/professional-schedules` |
| POST | `/api/admin/professional-schedules` | administrativa estrutural | sessão | cookie local | `Professional`, `ProfessionalSchedule` | cria janela sem sobreposição | 201 janela | `Availability` | `A/professional-schedules` |
| PATCH | `/api/admin/professional-schedules/:id` | administrativa estrutural | sessão | cookie local | `ProfessionalSchedule`, `Appointment` | prévia/recalcula e atualiza janela | janela + impacto | `Availability` | `A/professional-schedules/:id` |
| DELETE | `/api/admin/professional-schedules/:id` | administrativa estrutural | sessão | cookie local | `ProfessionalSchedule`, `Appointment` | prévia/recalcula e exclui | 204 ou 422 | `Availability` | `A/professional-schedules/:id` |
| GET | `/api/admin/schedule-blocks` | administrativa | sessão | cookie local | `ScheduleBlock`, `Professional` | nenhum | bloqueios filtrados | `Blocks` | `A/schedule-blocks` |
| POST | `/api/admin/schedule-blocks` | administrativa estrutural | sessão | cookie local | `Professional`, `ScheduleBlock`, `Appointment` | prévia/recalcula e cria | 201 bloqueio + impacto | `Blocks` | `A/schedule-blocks` |
| PATCH | `/api/admin/schedule-blocks/:id` | administrativa estrutural | sessão | cookie local | `ScheduleBlock`, `Professional`, `Appointment` | prévia/recalcula e atualiza | bloqueio + impacto | `Blocks` | `A/schedule-blocks/:id` |
| DELETE | `/api/admin/schedule-blocks/:id` | administrativa | sessão | cookie local | `ScheduleBlock` | exclui | 204 | `Blocks` | `A/schedule-blocks/:id` |

## Configurações e indicadores

| Método | Caminho atual | Classe | Tenant atual | Autenticação | Tabelas lidas/escritas | Efeito de escrita | Resposta esperada | Consumidor atual | Destino |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/admin/settings` | administrativa | sessão | cookie local | `TenantSettings` | nenhum | settings completos/defaults | `Settings` | `A/settings` |
| PATCH | `/api/admin/settings` | administrativa | sessão | cookie local | `TenantSettings` | upsert de campos válidos | settings salvos | `Settings` | `A/settings` |
| GET | `/api/admin/metrics` | administrativa | sessão | cookie local | `BusinessHours`, `ProfessionalSchedule`, `ScheduleBlock`, `Professional`, `Appointment`, `Lead`, `FollowUp`, `Client`, `RelationshipHistoryEvent` | nenhum | indicadores por período, funil, SLA e capacidade | `Metrics` | `A/metrics` |

## Destino por fase

- CF1A: somente `/api/live`, resolução segura de tenant, contexto público mínimo e contexto administrativo autorizado.
- CF1B: rotas públicas e lifecycle público.
- CF1C: agenda, relacionamento, pipeline e indicadores administrativos.
- CF1D: gestão estrutural, settings, CSV, Static Assets e adaptação final do frontend.

Nenhuma linha desta matriz, exceto a fundação explicitamente listada para CF1A, representa endpoint já implementado no Worker.
