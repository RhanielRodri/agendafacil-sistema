# A4A — fundação de relacionamento

Atualizado em 2026-07-20. Implementação e validação executadas somente na branch
`preserve/agendafacil-local-2026-07-20` e no PostgreSQL Docker local
`agendafacil_dev`, porta 5433. Nenhuma migration ou alteração foi enviada a
Preview, Render, Vercel ou produção.

## Separação do domínio

- `Client` representa a pessoa identificada dentro de um tenant, mesmo sem
  agendamento concluído.
- `Lead` representa uma intenção comercial declarada e pode existir sem
  agendamento.
- `Appointment` representa uma reserva e sempre aponta para um `Client`.
- `FollowUp` representa uma próxima ação manual com data e responsável.
- `RelationshipHistoryEvent` mantém a sequência comercial separada de
  `AppointmentHistoryEvent`.

Não há diagnóstico, prontuário, prescrição, conclusão clínica ou campo médico.
Tokens de gestão de agendamento não são copiados para nenhuma tabela do CRM.

## Client e deduplicação

`Client` guarda nome, telefone original, telefone normalizado, e-mail opcional,
e-mail normalizado, notas internas, primeiro/último contato e timestamps. Os
limites são: nome 120, telefone original 30, telefone normalizado entre 8 e 15
dígitos, e-mail 254 e notas internas 2.000 caracteres.

A identidade principal é `tenantId + normalizedPhone`, protegida por índice
único. O mesmo número pode existir em tenants diferentes. E-mail é informação
de apoio e nunca faz merge cross-tenant.

Fluxo de merge:

1. remove caracteres não numéricos do telefone e valida 8–15 dígitos;
2. busca somente no tenant resolvido;
3. cria a pessoa quando não existe;
4. quando existe, atualiza `lastContactAt`, preenche e-mail apenas se o atual
   estiver vazio e aceita somente diferenças cosméticas de nome/telefone;
5. nunca substitui valor preenchido por vazio nem troca silenciosamente nome ou
   e-mail conflitante;
6. mudança explícita pelo admin valida novamente e bloqueia colisão de telefone.

Criações e merges rodam dentro da transação `Serializable`. A constraint única
e as tentativas controladas em conflito impedem duplicação concorrente.

## Appointment

`Appointment.clientId` foi adicionado progressivamente: a migration cria a
coluna anulável, faz o backfill, verifica órfãos e só então aplica `NOT NULL`.
Os campos legados `clientName`, `clientPhone` e `clientEmail` permanecem para
compatibilidade.

Novo agendamento localiza ou cria o `Client`, vincula a reserva, atualiza o
último contato e registra `APPOINTMENT_LINKED` na mesma transação do
agendamento, histórico A3B e token. Reagendamento preserva `clientId` e o lead
de origem, além de criar um novo evento comercial para a reserva substituta.

## Lead

Estados: `NEW`, `CONTACTED`, `QUALIFIED`, `CONVERTED` e `LOST`.

Fontes: `BOOKING`, `WAITLIST`, `EVALUATION`, `CONTACT`,
`ABANDONED_BOOKING` e `MANUAL`.

Um lead aponta para `Client`, pode ter serviço/profissional de interesse e pode
existir sem reserva. A conversão registra data e `convertedAppointmentId`,
mantém o lead e vincula o agendamento por `leadId`. Cancelar o agendamento
depois não desfaz a conversão.

Leads ativos são `NEW`, `CONTACTED` ou `QUALIFIED`. A política de duplicidade
reutiliza o lead ativo com a mesma pessoa, origem, serviço, profissional e
resumo normalizado. Um hash SHA-256 interno forma a chave de deduplicação; um
índice parcial garante a regra no banco. O hash não é retornado por API.

## Follow-up

Estados: `OPEN`, `COMPLETED` e `CANCELLED`. Tipos: `CONTACT`, `RETURN`,
`EVALUATION`, `WAITLIST` e `OTHER`.

Todo follow-up pertence a tenant e cliente; lead é opcional e, quando presente,
deve pertencer ao mesmo cliente/tenant. A data é obrigatória e a nota é limitada
a 500 caracteres. A API marca `overdue` quando o item está aberto e `dueAt` já
passou. Conclusão registra `completedAt` e `completedByUserId`.

Na captura pública, o follow-up inicial é opcional e fica atribuído ao primeiro
admin ativo do tenant; se não houver responsável ativo, o lead permanece válido
e nenhum follow-up é criado.

## Histórico comercial

`RelationshipHistoryEvent` é append-only pela aplicação e não possui endpoint
de alteração ou exclusão. Eventos disponíveis:

- `CLIENT_CREATED`, `CLIENT_UPDATED` e `NOTE_ADDED`;
- `LEAD_CREATED`, `LEAD_STATUS_CHANGED`, `LEAD_CONVERTED` e `LEAD_LOST`;
- `FOLLOW_UP_CREATED` e `FOLLOW_UP_COMPLETED`;
- `APPOINTMENT_LINKED`.

Cada evento guarda tenant, cliente, referências opcionais a lead/agendamento,
tipo, ator, ator administrativo opcional, metadata limitada e data. Metadata
aceita somente chaves escalares conhecidas e até 2 KiB. Notas internas não são
copiadas para metadata nem expostas em rotas públicas.

## Captura pública

`POST /api/public/leads` resolve o tenant pelo `demoId` da vertical e exige
nome, telefone válido, intenção, resumo e consentimento para retorno.

- Studio Cut: `WAITLIST` e `CONTACT`.
- Lumière: `EVALUATION` e `CONTACT`.

O payload pode indicar serviço e solicitar follow-up inicial. Há body global de
16 KiB, limites por campo, rate limit de cinco requisições/minuto por IP e
honeypot `website`. Honeypot preenchido recebe resposta genérica sem persistir.
Navegação anônima não cria lead. A resposta pública não retorna IDs, notas,
chave de deduplicação ou qualquer dado interno.

## API administrativa

Todas as rotas usam `req.auth.tenantId`; IDs de outro tenant retornam `404`.

Clientes:

- `GET /api/admin/clients` e `GET /api/admin/clients/:id`;
- `PATCH /api/admin/clients/:id`;
- `POST /api/admin/clients/:id/notes`;
- `GET /api/admin/clients/:id/history`.

Leads:

- `GET/POST /api/admin/leads` e `GET /api/admin/leads/:id`;
- `PATCH /api/admin/leads/:id/status`;
- `POST /api/admin/leads/:id/lost`;
- `POST /api/admin/leads/:id/appointment`;
- `POST /api/admin/leads/:id/convert`.

Follow-ups:

- `GET/POST /api/admin/follow-ups`;
- `POST /api/admin/follow-ups/:id/complete`;
- `POST /api/admin/follow-ups/:id/cancel`.

## Interface mínima

A página pública possui formulário configurado por vertical com loading,
sucesso, erro, consentimento e honeypot. O painel atual ganhou uma seção isolada
com lista/detalhe de clientes, leads, transição de status, perda, conversão por
agendamento, criação/conclusão de follow-up, notas e histórico comercial.

Não foram criados Kanban, drag-and-drop, dashboard novo, gráficos, scoring,
filtros avançados, notificação automática ou redesign das verticais.

## Migration, backfill e rollback

`20260720230000_relationship_foundation` cria os seis enums, quatro entidades,
índices, FKs compostas e `clientId/leadId` em `Appointment`.

O backfill:

1. normaliza telefones dos agendamentos existentes;
2. escolhe um representante por tenant/telefone sem perder datas de contato;
3. cria `Client` deduplicado;
4. vincula todos os agendamentos e aborta a migration se houver órfão;
5. preserva status, tokens, histórico A3B e campos legados;
6. cria `CLIENT_CREATED` e `APPOINTMENT_LINKED` com ator `SYSTEM`;
7. não cria leads retroativos.

O rollback está em `ROLLBACK.md`. Ele exige exportar primeiro as quatro tabelas
A4A. Remover a fundação não apaga os campos legados nem os agendamentos, mas
leads/follow-ups/histórico comercial não são recuperáveis sem export.

## Privacidade e retenção

- o ambiente local usa somente dados fictícios;
- dados pessoais e relacionamentos pertencem ao tenant;
- notas são internas e não aparecem publicamente;
- tokens e secrets permanecem fora do CRM e do Git;
- não há exclusão automática nesta fase;
- retenção definitiva, consentimentos especiais e dados sensíveis precisam ser
  decididos antes de deploy público, dentro da fase A7.

## Validação local

- 114/114 testes backend: 84 preservados e 30 A4A;
- Prisma válido, Client gerado e 13 migrations locais aplicadas;
- build backend e Vite concluídos, com 51 módulos e três entradas;
- Studio Cut: encaixe, Client, WAITLIST, follow-up, qualificação, agendamento,
  conversão e sequência de histórico;
- Lumière: avaliação, Client, EVALUATION, interesse não clínico, follow-up,
  qualificação, agendamento, conversão e histórico;
- navegador real em 375, 768 e 1440 px, sem overflow, erro de aplicação ou HTTP
  inesperado;
- nenhuma leitura/escrita cross-tenant e nenhum efeito remoto.

## Próxima ação A4B

A4B deve ser autorizada separadamente. Recomendação: transformar esta fundação
em uma operação diária simples, com filas filtráveis de leads/follow-ups,
responsável explícito, busca/paginação e UX própria de lista de espera e
avaliação, sem introduzir métricas ou automação antes de validar o uso manual.

Riscos para A4B:

- rate limit em memória não coordena múltiplas instâncias;
- listas limitadas a 100 itens ainda não têm cursor/paginação;
- notas usam um campo acumulado; volume maior pode exigir entidade própria;
- follow-up público depende de existir admin ativo para receber atribuição;
- a chave ativa considera resumo textual normalizado, então textos diferentes
  podem representar interesses semanticamente iguais;
- retenção, exportação e exclusão por solicitação ainda não têm política final;
- rollout de A0–A4A fora do Docker local continua não validado.
