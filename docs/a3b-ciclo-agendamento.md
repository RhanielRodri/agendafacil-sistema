# A3B — ciclo de vida do agendamento

Atualizado em 2026-07-20. Implementação e validação executadas exclusivamente
no PostgreSQL Docker local `agendafacil_dev`, porta 5433. Nada foi aplicado em
Preview, Render, Vercel ou produção.

## Máquina de estados

```text
PENDING ──> CONFIRMED ──> COMPLETED
    │             ├────> CANCELLED
    │             └────> NO_SHOW
    └──────────────────> CANCELLED
```

`COMPLETED`, `CANCELLED` e `NO_SHOW` são terminais. Repetir o estado atual é
idempotente e não duplica o histórico. Qualquer outra transição retorna `409`;
nenhum estado terminal é reaberto. Confirmação e conclusão não exigem motivo.
Cancelamento e no-show aceitam motivo opcional, sanitizado e limitado a 300
caracteres.

## Modelo e histórico

`AppointmentHistoryEvent` registra eventos por tenant e agendamento com FK
composta, tipo, estados anterior/novo, ator, ator administrativo opcional,
metadados validados e data. A aplicação só possui operação de inserção para o
histórico; as APIs não expõem update ou delete. Metadados aceitam somente chaves
internas conhecidas, valores escalares e no máximo 2 KiB no banco.

Eventos disponíveis:

- `CREATED`, `CONFIRMED`, `CANCELLED`, `COMPLETED` e `NO_SHOW`;
- `RESCHEDULED_FROM` e `RESCHEDULED_TO`;
- `STATUS_CHANGED`, usado no snapshot de backfill e no seed.

As rotas públicas não retornam histórico, cliente, telefone, e-mail, motivos ou
metadados administrativos. O painel consulta o histórico em ordem de criação.

## Links públicos

`AppointmentAccessToken` usa um único propósito `MANAGE`. O token bruto tem 256
bits, é criado com `crypto.randomBytes(32)` e nunca é persistido. O banco guarda
somente SHA-256 em `tokenHash`, além de expiração, uso e revogação.

O link segue o formato:

```text
/studio-cut#agendamento=<token>
/lumiere#agendamento=<token>
```

O fragmento não é enviado ao servidor e, portanto, não aparece em access logs.
O frontend envia o token no header `X-Appointment-Token` para rotas genéricas,
sem token na URL da API. O backend nunca registra headers ou corpos, nunca
retorna `tokenHash` e usa respostas seguras para token inválido, expirado,
revogado ou usado.

A validade termina no mínimo 30 dias após a criação ou dois dias após a data do
agendamento, o que ocorrer por último. Agendamentos anteriores ao backfill não
recebem links automaticamente.

## Criação, confirmação e cancelamento

`POST /api/appointments` mantém o motor A3A e a transação `Serializable`. Na
mesma transação cria o agendamento `PENDING`, o evento `CREATED` e o token de
gestão. A resposta entrega o resumo e `managementPath`, sem hash.

O cliente pode confirmar somente `PENDING`. Pode cancelar `PENDING` ou
`CONFIRMED`; o cancelamento registra ator `CUSTOMER`, motivo opcional, evento e
revoga/consome o token. Uma repetição do mesmo cancelamento retorna o estado
`CANCELLED` sem criar novo evento.

O índice único de horário considera apenas registros não cancelados. Assim, o
motor volta a oferecer o slot e uma nova criação no mesmo horário funciona,
enquanto dois registros ativos com o mesmo início continuam bloqueados.

## Reagendamento

O reagendamento bloqueia a linha original com `FOR UPDATE` dentro de uma
transação `Serializable`. O motor A3A valida o novo profissional, data, horário,
duração, pausas, bloqueios e conflitos, excluindo apenas o registro original da
consulta. Reagendar sem mudar horário nem profissional é recusado.

Na mesma transação:

1. cria um novo agendamento `PENDING` com os mesmos cliente e serviço;
2. define `rescheduledFromId` no novo registro;
3. marca o original como `CANCELLED`, preservando data e horário;
4. registra `RESCHEDULED_FROM`, `CREATED` e `RESCHEDULED_TO`;
5. revoga e consome o token antigo;
6. cria um token novo.

Falha em qualquer etapa desfaz tudo. Uma disputa concorrente cria no máximo uma
substituição; a outra requisição recebe conflito controlado, nunca erro interno.

## API

Rotas públicas, todas com tenant resolvido pela vertical e rate limit:

- `GET /api/public/appointment`;
- `POST /api/public/appointment/confirm`;
- `POST /api/public/appointment/cancel`;
- `GET /api/public/appointment/reschedule-availability`;
- `POST /api/public/appointment/reschedule`.

Rotas administrativas, sempre com tenant derivado da sessão:

- `PATCH /api/appointments/:id/status`;
- `GET /api/appointments/:id/history`.

O painel mostra somente ações permitidas para o estado atual, aceita motivo
opcional, atualiza o card sem reload completo e exibe histórico e vínculos de
reagendamento. Não foi criado calendário novo.

## Migrations, backfill e rollback

- `20260720220000_appointment_lifecycle`: renomeia `NEW` para `PENDING`, adiciona
  `NO_SHOW`, histórico, tokens, motivo, vínculo, índices e FKs; cria um snapshot
  `STATUS_CHANGED` para cada agendamento existente, sem gerar token.
- `20260720221000_cancelled_slot_reuse`: substitui a unicidade antiga por índice
  único parcial para registros não cancelados.

Cada pasta contém `ROLLBACK.md`. A reversão exige exportar histórico, tokens e
vínculos, reconciliar `NO_SHOW` e eliminar duplicidades canceladas antes de
restaurar a constraint antiga. Nenhum rollback deve apagar agendamentos.

## Validação local

- 84/84 testes backend: 54 legados e 30 da A3B;
- criação/histórico/hash, token inválido/expirado/revogado, idempotência, reuso
  real do slot, reagendamento e concorrência, transições, isolamento, rate limit
  e ausência de token bruto em logs;
- Studio Cut com serviço de 30 minutos e Lumière com serviço de 60 minutos;
- criação pela UI, sucesso, gestão, confirmação, cancelamento, reagendamento,
  histórico/no-show e erro de token;
- 375, 768 e 1440 px sem overflow; zero erro de console;
- Prisma validado, migrations locais sem drift e build Vite concluído.

## Próxima ação e riscos para A4

A4 ainda precisa de escopo explícito antes de qualquer código. Esta fase não
autoriza CRM, `Lead`, `Client`, notificações, pagamentos ou deploy.

Riscos que precisam entrar no planejamento de A4:

- rollout das migrations A0–A3B em produção ainda não foi exercitado;
- sem e-mail/WhatsApp e sem recuperação, o cliente precisa guardar o link;
- o rate limit em memória não é compartilhado entre múltiplas instâncias;
- definir retenção de histórico, expiração/rotação e política de privacidade;
- agendamentos antigos seguem sem link até uma emissão administrativa futura;
- conflitos por duração continuam protegidos pelo motor serializável, não por
  uma exclusion constraint de intervalo no banco.
