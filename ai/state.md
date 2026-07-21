---
project: AgendaFácil
updated_at: 2026-07-20
review_at: 2026-07-23
status: active
current_phase: A4A_concluida
technical_baseline:
  commit: b730b55
  validation_status: partial
  validated_at: 2026-07-20
  validated:
    - "A0-A3B preservadas: tenant, autenticação, agenda individual, bloqueios e ciclo do agendamento"
    - "A4A: Client deduplicado por tenant e telefone normalizado"
    - "A4A: Appointment obrigatoriamente vinculado a Client após backfill"
    - "A4A: Lead, FollowUp e RelationshipHistoryEvent separados do histórico de agendamento"
    - "A4A: captura pública configurada para Studio Cut e Lumière"
    - "A4A: APIs e interface administrativa mínimas com isolamento por tenant"
    - "A4A: 114/114 testes backend, Prisma e builds backend/frontend verdes"
    - "A4A: jornadas reais em 375, 768 e 1440 px sem overflow ou erro inesperado"
  not_validated:
    - "API, banco ou interface A4A em produção"
    - "aplicação das migrations A0-A4A fora do PostgreSQL Docker local"
    - "retenção definitiva, exclusão por solicitação e consentimentos especiais"
    - "uso operacional com volume, paginação ou múltiplas instâncias"
  evidence:
    - "migration 20260720230000 aplicada somente em agendafacil_dev: 13 migrations em dia"
    - "node:test: 114/114 verdes, sendo 84 preservados e 30 casos A4A"
    - "Vite build: 51 módulos e três entradas geradas"
    - "Prisma validate, generate, migrate status, sintaxe backend, diff e segredos sem erro"
    - "navegador local: captura, qualificação, follow-up e histórico nos dois tenants"
    - "baseline A4A em b730b55: feat: cria fundação de clientes e leads"
source: A4A executada na branch de preservação em 2026-07-20, somente no banco Docker local
source_of_truth: .
---

# Estado do projeto

## Último resultado confirmado

A fase A4A foi concluída na branch
`preserve/agendafacil-local-2026-07-20`, exclusivamente no PostgreSQL Docker
local `agendafacil_dev`, porta 5433. Nenhum serviço remoto foi alterado.

`Client` agora representa a pessoa por tenant, com identidade principal em
`tenantId + normalizedPhone`, limites explícitos e merge conservador. Novo
agendamento localiza ou cria o cliente, atualiza o último contato e mantém a
transação `Serializable`. `Appointment.clientId` é obrigatório depois do
backfill; os campos legados permanecem por compatibilidade.

`Lead` guarda intenção declarada, origem e estado comercial. Lead ativo
equivalente é reutilizado por uma chave de interesse protegida também por índice
parcial. Conversão mantém o lead e aponta para o agendamento. Cancelamento
posterior não apaga a conversão.

`FollowUp` registra próxima ação manual, data, tipo, estado e atores. A API
identifica vencidos, conclui ou cancela sem notificação automática.
`RelationshipHistoryEvent` é separado de `AppointmentHistoryEvent` e append-only
pela aplicação.

Studio Cut aceita `WAITLIST`/`CONTACT`; Lumière aceita
`EVALUATION`/`CONTACT`. A captura pública exige contato, intenção, consentimento,
payload válido, deduplicação, rate limit e honeypot. Navegação anônima não cria
lead. Respostas públicas não expõem IDs, notas ou chave interna.

O painel atual possui seção funcional de clientes, leads, follow-ups e histórico
com loading, vazio, erro e sucesso. Não houve Kanban, métricas, gráficos,
drag-and-drop, automação ou redesign.

## Baseline técnica

`b730b55` — `feat: cria fundação de clientes e leads` — é a baseline A4A, com
`validation_status: partial`. Código, migration/backfill, suíte, builds, banco e
jornadas foram validados localmente. Permanece `partial`, não `validated`, porque
produção não foi alterada nem exercitada.

`ad95e6d` continua como último commit em `main` e como código publicado. A
branch de preservação não foi integrada nem enviada ao remoto.

## git_snapshot

```text
observed_at: 2026-07-20 (após commit de código A4A)
branch: preserve/agendafacil-local-2026-07-20
head_at_observation: b730b55267cdadca801dfd7b019745885986d459
technical_baseline: b730b55267cdadca801dfd7b019745885986d459
main: ad95e6d7083f188860f1026cd15f15715050dea0 (intacta, sem merge)
origin_preservation_branch: ecae405b071cd96122217c20ffc586233995a805 (inalterada)
production: inalterada
```

O commit documental deste estado será o HEAD seguinte e não substitui a
baseline técnica.

## Banco local final

- 2 tenants;
- 6 profissionais;
- 35 intervalos profissionais;
- 6 `ScheduleBlock` e 2 `BlockedDate` legados;
- 4 agendamentos fictícios e 4 `Client` vinculados;
- 4 eventos de histórico de agendamento;
- 8 eventos comerciais de seed;
- 0 lead, follow-up, token ou admin temporário de QA;
- 0 agendamento órfão, vínculo cross-tenant ou lead ativo duplicado.

## Validações confirmadas

- 114/114 testes: auth 20, A3A 27, A3B 30, A4A 30 e tenant 7.
- Criação e reuso de `Client`, mesmo telefone entre tenants e concorrência.
- Vínculo obrigatório com `Appointment`, reagendamento e backfill sem órfão.
- Lead sem agendamento, deduplicação ativa, perda, vínculo e conversão.
- Follow-up criado, vencido, concluído e isolado por tenant.
- Histórico append-only pela aplicação, ordenado e sem nota interna pública.
- Studio Cut: encaixe, WAITLIST, follow-up, qualificação, agendamento, conversão
  e sequência comercial.
- Lumière: avaliação, EVALUATION, interesse não clínico, follow-up,
  qualificação, agendamento, conversão e sequência comercial.
- Admin e IDs não atravessam Studio Cut/Lumière; respostas públicas não expõem
  identificadores internos desnecessários.
- 375, 768 e 1440 px sem overflow; zero erro de aplicação ou HTTP inesperado.
- Prisma válido; 13 migrations locais em dia; builds backend/frontend e sintaxe
  concluídos; diff limpo e varredura de segredos sem achado.

## Validações não executadas

- Health check, migration ou smoke no Render/produção.
- Deploy ou Preview na Vercel.
- Retenção, exportação ou exclusão de dados pessoais por solicitação.
- Notificação por WhatsApp, e-mail ou SMS.
- Operação com múltiplas instâncias ou volume acima de 100 registros por lista.

## Riscos para A4B

- O rate limit é em memória e não coordena múltiplas instâncias.
- Listas administrativas ainda não possuem paginação por cursor.
- Notas usam um campo acumulado limitado; volume maior pode exigir entidade
  própria.
- Follow-up público depende de admin ativo para receber atribuição.
- A deduplicação de interesse é textual e não une descrições semanticamente
  equivalentes.
- Retenção definitiva, exportação e exclusão ainda precisam de decisão antes do
  deploy público.
- O rollout de A0-A4A fora do Docker local continua não validado.

## Divergências documentais

`README.md` ainda descreve partes do modelo antigo. O estado vigente desta
branch está em `docs/a3a-agenda-profissional.md`,
`docs/a3b-ciclo-agendamento.md`, `docs/a4a-relacionamento.md` e neste arquivo.

## Próxima ação registrada

Definir e autorizar explicitamente A4B: operação diária simples para filas de
leads/follow-ups, responsável, paginação/busca e UX própria de lista de espera e
avaliação. A4A não autoriza Kanban avançado, métricas, automação, notificação,
pagamento, dados clínicos, deploy, merge ou push.
