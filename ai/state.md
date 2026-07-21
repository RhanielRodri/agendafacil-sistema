---
project: AgendaFácil
updated_at: 2026-07-20
review_at: 2026-07-23
status: active
current_phase: A4B_concluida
technical_baseline:
  commit: 944a39cab23c555fc2634a2a5acdc9be6b4d7415
  validation_status: partial
  validated_at: 2026-07-20
  validated:
    - "A0-A3B preservadas: tenant, autenticação, agenda individual, bloqueios e ciclo do agendamento"
    - "A4A preservada: Client, Lead, FollowUp e RelationshipHistoryEvent isolados por tenant"
    - "A4B: máquina de estados, prioridade, responsável e qualificação por vertical"
    - "A4B: próxima ação, perda estruturada, conversão transacional e notas append-only"
    - "A4B: paginação, busca, filtros, pipeline administrativo e ficha do Lead"
    - "A4B: 149/149 testes backend, sendo 114 preservados e 35 novos"
    - "A4B: Studio Cut e Lumière validadas no navegador, mobile sem overflow e console limpo"
  not_validated:
    - "API, banco ou interface A4B em produção"
    - "aplicação das migrations A0-A4B fora do PostgreSQL Docker local"
    - "retenção definitiva, exclusão por solicitação e consentimentos especiais"
    - "uso operacional com múltiplas instâncias ou alto volume"
  evidence:
    - "migration 20260721000000 aplicada somente em agendafacil_dev: 14 migrations em dia e checksum conferido"
    - "node:test: 149/149 verdes, sendo 114 preservados e 35 casos A4B"
    - "Vite build: 51 módulos e três entradas geradas"
    - "Prisma validate/generate, sintaxe backend, diff e segredos sem erro"
    - "navegador local: pipeline e ficha completos nos dois tenants, rollback real e console limpo"
    - "baseline A4B em 944a39c: feat: operacionaliza pipeline comercial"
source: A4B executada na branch de preservação em 2026-07-20, somente no banco Docker local
source_of_truth: .
---

# Estado do projeto

## Último resultado confirmado

A fase A4B foi aprovada localmente na branch
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

O painel agora possui pipeline paginado em cinco estados e ficha operacional do
Lead. Prioridade, responsável, qualificação por vertical, próxima ação, perda,
conversão e notas são auditáveis. Não houve métricas, gráficos, drag-and-drop,
automação, notificação ou redesign fora da fase.

## Baseline técnica

`944a39cab23c555fc2634a2a5acdc9be6b4d7415` —
`feat: operacionaliza pipeline comercial` — é a baseline A4B, com
`validation_status: partial`. Código, migration/backfill, suíte, builds, banco e
jornadas foram validados localmente. Permanece `partial`, não `validated`, porque
produção não foi alterada nem exercitada.

`ad95e6d` continua como último commit em `main` e como código publicado. A
branch de preservação não foi integrada nem enviada ao remoto.

## git_snapshot

```text
observed_at: 2026-07-20 (após commit de código A4B)
branch: preserve/agendafacil-local-2026-07-20
head_at_observation: 944a39cab23c555fc2634a2a5acdc9be6b4d7415
technical_baseline: 944a39cab23c555fc2634a2a5acdc9be6b4d7415
main: ad95e6d7083f188860f1026cd15f15715050dea0 (intacta, sem merge)
origin_preservation_branch: ecae405b071cd96122217c20ffc586233995a805 (inalterada)
production: inalterada
```

O commit documental deste estado será o HEAD seguinte e não substitui a
baseline técnica.

## Banco e migration local

- 14 migrations em dia no Docker local;
- `20260721000000_operational_pipeline` concluída, sem rollback e com checksum
  idêntico ao arquivo versionado;
- enum, oito campos, sete constraints e três índices A4B conferidos;
- nenhum banco remoto recebeu migration;
- um dump de recuperação da validação interrompida permanece fora do repositório.

## Validações confirmadas

- 149/149 testes: 114 preservados e 35 A4B.
- Criação e reuso de `Client`, mesmo telefone entre tenants e concorrência.
- Vínculo obrigatório com `Appointment`, reagendamento e backfill sem órfão.
- Máquina de estados sem regressão ou reabertura terminal.
- Prioridade, responsável ativo do mesmo tenant e qualificação por vertical.
- Próxima ação obrigatória para avanço operacional e conclusão encadeada.
- Perda estruturada, conversão `Serializable`, idempotência e rollback integral.
- Paginação, busca e filtros combinados com ordem determinística.
- Histórico append-only pela aplicação, ordenado e sem nota interna pública.
- Studio Cut: `WAITLIST`, urgência, prioridade alta, responsável, qualificação,
  nota, avanço de etapa e conversão criando Appointment.
- Lumière: `EVALUATION`, qualificação não clínica, sequência de estados,
  rollback de slot inválido e conversão por Appointment válido.
- Admin e IDs não atravessam Studio Cut/Lumière; respostas públicas não expõem
  identificadores internos desnecessários.
- Mobile sem overflow e console final sem erro ou warning de aplicação.
- Prisma válido e Client gerado; 14 migrations locais em dia; build frontend,
  sintaxe backend, diff e varredura de segredos aprovados.

## Validações não executadas

- Health check, migration ou smoke no Render/produção.
- Deploy ou Preview na Vercel.
- Retenção, exportação ou exclusão de dados pessoais por solicitação.
- Notificação por WhatsApp, e-mail ou SMS.
- Operação com múltiplas instâncias ou volume acima de 100 registros por lista.

## Riscos resolvidos na A4B

- listas administrativas deixaram o limite fixo e receberam paginação/filtros;
- notas comerciais deixaram o campo acumulado e viraram eventos append-only;
- Lead recebeu responsável explícito, prioridade e qualificação por vertical;
- conversão passou a ser transacional, idempotente e com rollback comprovado;
- filas sem próxima ação, vencidas e não atribuídas ficaram identificáveis.

## Riscos remanescentes para A5

- rate limit em memória não coordena múltiplas instâncias;
- paginação ainda é por offset, não cursor;
- follow-up público depende de admin ativo e entra sem responsável;
- não há métricas, drag-and-drop, automação ou notificações;
- retenção, exportação e exclusão por solicitação não têm política final;
- `prisma migrate diff` global aponta drift legado de A3A em defaults de
  `updatedAt` e nome de índice; os objetos A4B coincidem com a migration aplicada;
- rollout de A0–A4B fora do Docker local continua não validado.

## Divergências documentais

`README.md` ainda descreve partes do modelo antigo. O estado vigente desta
branch está em `docs/a3a-agenda-profissional.md`,
`docs/a3b-ciclo-agendamento.md`, `docs/a4a-relacionamento.md`,
`docs/a4b-operacao-pipeline.md` e neste arquivo.

## Próxima ação registrada

Definir e autorizar explicitamente A5. Antes de ampliar o produto, decidir se o
próximo ganho validável será produtividade manual ou automação e tratar o drift
legado sem editar migrations já aplicadas. A4B não autoriza métricas,
drag-and-drop, automação, notificação, pagamento, deploy, merge ou push.
