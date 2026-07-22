# CF1B — Contratos da API pública

## Autoridade e formato comum

Todas as rotas de produto usam `/api/tenants/:tenantSlug`. O slug do caminho é a única autoridade de tenant. `demoId`, `tenantId` e headers customizados são ignorados. Tenant desconhecido, recurso de outro tenant e token pertencente a outro tenant retornam 404 sem confirmar existência.

Erros usam `{ "error": { "code": string, "message": string } }`. JSON inválido, payload acima de 8 KiB, campos ausentes ou formatos inválidos retornam 400. Conflito de agenda retorna 409. Rate limit retorna 429. Falhas inesperadas retornam 500 sem SQL, stack ou nomes internos.

IDs D1 são strings opacas. A CF1D precisa remover as conversões numéricas do frontend legado. `demoId` deixa de ser enviado e o consumidor passa a construir a rota com o slug da vertical.

## Rotas de leitura

| Express original | Cloudflare | Request | Response | Tabelas | Consumidor | Compatibilidade |
|---|---|---|---|---|---|---|
| `GET /api/services?demoId=` | `GET /api/tenants/:slug/services` | sem body | serviços ativos com `id`, `name`, `description`, `duration`, `price`, `priceLabel`, `requiresEvaluation` | `services` | `App`, `Home`, `BookingFlow` | campos usados pela UI preservados; campos internos removidos; ID vira string |
| `GET /api/professionals?demoId=` | `GET /api/tenants/:slug/professionals` | sem body | profissionais ativos com `id`, `name`, `specialty`, `photo`, `serviceIds` | `professionals`, `professional_services` | `App`, `Home`, `BookingFlow` | campos usados preservados; associações tornam-se explícitas; contato interno removido |
| `GET /api/business-hours?demoId=` | `GET /api/tenants/:slug/business-hours` | sem body | sete entradas `dayOfWeek`, `openTime`, `closeTime`, `isOpen` | `business_hours` | método existente, sem chamada atual | nomes públicos preservados; tenant e timestamps removidos |
| `GET /api/settings?demoId=` | `GET /api/tenants/:slug/settings` | sem body | lista branca pública | `tenant_settings` | sem chamada atual | mesma lista branca; nenhum parâmetro operacional interno |
| contexto implícito | `GET /api/tenants/:slug/context` | sem body | tenant, terminologia e settings públicos | `tenants`, `tenant_settings` | preparação CF1D | novo contrato necessário porque o slug passa a ser autoridade |
| `GET /api/available-slots` | `GET /api/tenants/:slug/available-slots` | query `date`, `serviceId`, `professionalId` | array `HH:MM` | catálogo, settings, horários, agendas, bloqueios e slots | `BookingFlow` | array preservado; `demoId` removido; IDs string |

Preço nulo permanece `price: null` e recebe `priceLabel: "Sob consulta"`. A terminologia é configurada por contexto, sem duplicar handlers: Studio Cut usa serviços/barbeiros; Lumière usa procedimentos/profissionais.

## Criação

`POST /api/tenants/:slug/appointments`

Request:

```json
{
  "serviceId": "service-studio-cut",
  "professionalId": "professional-studio-1",
  "clientName": "Cliente sintético",
  "clientPhone": "27999990000",
  "clientEmail": "cliente@example.test",
  "date": "2026-08-03",
  "time": "09:00"
}
```

Response 201 mantém os campos usados por `Success`: agendamento, serviço, profissional, cliente, data, hora, status e `managementPath`. O token bruto aparece somente dentro de `managementPath`; o D1 armazena apenas SHA-256.

A operação usa um único `DB.batch`: cria ou reutiliza o cliente por telefone normalizado, cria o agendamento, registra `CLIENT_CREATED` quando aplicável, `APPOINTMENT_LINKED`, `CREATED`, token hash e todas as unidades de `appointment_slots`. Uma violação de slot reverte o lote inteiro e retorna 409.

## Gestão por capability token

O token é enviado em `X-Appointment-Token`.

| Express original | Cloudflare | Método | Resultado |
|---|---|---|---|
| `/api/public/appointment` | `/api/tenants/:slug/appointment` | GET | resumo com serviço, profissional, data, hora e status |
| `/api/public/appointment/confirm` | `/api/tenants/:slug/appointment/confirm` | POST | confirma `PENDING`, idempotente em `CONFIRMED` |
| `/api/public/appointment/cancel` | `/api/tenants/:slug/appointment/cancel` | POST | cancela, registra motivo/histórico, revoga token e libera slots |
| `/api/public/appointment/reschedule-availability` | `/api/tenants/:slug/appointment/reschedule-availability` | GET | slots do serviço original para `date` e `professionalId` |
| `/api/public/appointment/reschedule` | `/api/tenants/:slug/appointment/reschedule` | POST | cancela original, cria substituto e devolve novo `managementPath` |

Token malformado, inexistente ou cross-tenant usa a mesma resposta genérica 404. Token expirado, revogado ou usado retorna 410 com o código já consumido pelo frontend. Consulta não expõe ID, telefone, e-mail, hash ou metadados internos.

Cancelamento é atômico e preserva o `Appointment` para auditoria. A segunda chamada retorna o mesmo resumo cancelado sem duplicar histórico. Reagendamento remove os slots antigos e reserva os novos no mesmo lote; conflito reverte toda a operação.

## Disponibilidade

O cálculo faz a interseção entre horário do negócio e todas as janelas ativas do profissional. Depois remove `blocked_dates`, bloqueios gerais ou individuais, pausas entre janelas e `appointment_slots` ativos. Cada candidato precisa acomodar toda a duração do serviço.

Regras aplicadas:

- dia fechado ou bloqueio integral retorna zero slots;
- `00:00–00:00` só existe em dia fechado por check do D1;
- horário profissional é limitado pelo negócio;
- bloqueio parcial remove qualquer candidato sobreposto;
- agendamento cancelado não ocupa slot;
- data passada retorna zero slots;
- antecedência mínima usa o timezone do tenant;
- data acima do horizonte retorna 400;
- serviço, profissional ou associação fora do tenant retorna 404.

## Proteção contra abuso

`public_rate_limits` mantém somente SHA-256 de tenant, ação e IP fornecido pelo runtime. Quando esse sinal não existe no desenvolvimento local, usa User-Agent truncado como fallback. IP bruto, token, nome, telefone e e-mail não são persistidos. A janela é de 60 segundos:

- criação: 10;
- consulta: 60;
- confirmação, cancelamento e reagendamento: 10 por ação;
- consulta de disponibilidade de reagendamento: 30.

O contador é atômico no D1, expira por janela e remove buckets antigos. Não usa `Map`, memória do isolate, Durable Object, KV ou configuração remota.

## Rotas não portadas na CF1B

- `/api/first-availability`: nenhum consumidor encontrado no frontend atual;
- `/api/public/leads`: pertence à captura comercial, não ao ciclo de booking e cancelamento aceito para CF1B;
- rotas administrativas: reservadas para CF1C.

Nenhuma aplicação pública foi publicada e nenhum D1 remoto foi criado.
