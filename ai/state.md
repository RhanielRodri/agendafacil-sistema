---
project: AgendaFácil
updated_at: 2026-07-20
review_at: 2026-07-23
status: active
current_phase: A3B_concluida
technical_baseline:
  commit: 4aca9a9
  validation_status: partial
  validated_at: 2026-07-20
  validated:
    - "A0-A3A preservadas: tenant, autenticação, agenda individual, bloqueios e disponibilidade"
    - "A3B: máquina PENDING, CONFIRMED, COMPLETED, CANCELLED e NO_SHOW"
    - "A3B: histórico, tokens públicos por hash, confirmação, cancelamento e reagendamento"
    - "A3B: painel com transições válidas, motivo, histórico e vínculos de reagendamento"
    - "A3B: 84/84 testes backend, Prisma sem drift e builds backend/frontend verdes"
    - "A3B: Studio Cut 30 min e Lumière 60 min exercitados em 375, 768 e 1440 px"
    - "A3B: zero overflow, zero erro de console e isolamento entre tenants confirmado"
  not_validated:
    - "saúde da API e do banco em produção"
    - "aplicação das migrations A0-A3B fora do PostgreSQL Docker local"
    - "entrega real do link por e-mail ou WhatsApp, fora do escopo A3B"
  evidence:
    - "migrations 20260720220000 e 20260720221000 aplicadas somente em agendafacil_dev: 12 migrations sem drift"
    - "node:test: 84/84 verdes, sendo 54 legados e 30 casos A3B"
    - "Vite build: 49 módulos e três entradas geradas"
    - "Prisma validate, generate, migrate status e validação de sintaxe backend sem erro"
    - "navegador local: criação, sucesso, confirmação, cancelamento, reuso do slot, reagendamento, histórico, no-show e token inválido nos dois tenants"
    - "baseline A3B em 4aca9a9: feat: completa ciclo de vida do agendamento"
source: A3B executada na branch de preservação em 2026-07-20, somente no banco Docker local
source_of_truth: .
---

# Estado do projeto

## Último resultado confirmado

A fase A3B foi concluída na branch
`preserve/agendafacil-local-2026-07-20`, exclusivamente no PostgreSQL Docker
local `agendafacil_dev`, porta 5433. Nada foi publicado ou alterado em serviços
remotos.

O ciclo agora usa `PENDING`, `CONFIRMED`, `COMPLETED`, `CANCELLED` e `NO_SHOW`.
Transições permitidas ficam centralizadas; estados terminais não reabrem e a
repetição do mesmo estado é idempotente.

`AppointmentHistoryEvent` mantém eventos por tenant e ator.
`AppointmentAccessToken` guarda somente SHA-256 de token aleatório de 256 bits,
com expiração, uso e revogação. O link público leva o token em fragmento
`#agendamento=`, evitando envio ao servidor e access logs. Registros anteriores
ao backfill não recebem link automaticamente.

Cancelamento libera e permite reutilizar o slot. Reagendamento preserva o
original cancelado, cria novo registro pendente, mantém vínculo e eventos
cruzados, revoga o token antigo e emite outro, tudo em transação `Serializable`
com trava da linha original.

O painel atual mostra somente ações válidas, motivo opcional, histórico e
vínculos. A página pública permite visualizar, confirmar, cancelar e reagendar
sem login. Não houve redesign, calendário novo, notificação, pagamento ou CRM.

## Baseline técnica

`4aca9a9` — `feat: completa ciclo de vida do agendamento` — é a baseline A3B,
com `validation_status: partial`. Código, migrations, backfill, suíte, builds e
jornadas foram validados localmente. Permanece `partial`, não `validated`,
porque produção não foi alterada nem exercitada.

`ad95e6d` continua como último commit em `main` e como código publicado. A
branch de preservação não foi integrada nem enviada ao remoto.

## git_snapshot

```text
observed_at: 2026-07-20 (após commit de código A3B)
branch: preserve/agendafacil-local-2026-07-20
head_at_observation: 4aca9a9
technical_baseline: 4aca9a9
main: ad95e6d (intacta, sem merge)
origin_preservation_branch: inalterada
production: inalterada
```

O commit documental deste estado será o HEAD seguinte e não substitui a
baseline técnica.

## Banco local final

- 2 tenants;
- 6 profissionais;
- 35 intervalos profissionais;
- 6 `ScheduleBlock`;
- 2 `BlockedDate` legados preservados;
- 4 agendamentos fictícios do seed;
- 4 snapshots de histórico;
- 0 tokens para registros antigos;
- 0 dado temporário de QA;
- 0 histórico órfão, token cross-tenant ou duplicidade ativa de início.

## Validações confirmadas

- 84/84 testes backend: auth 20, A3A 27, A3B 30 e tenant 7.
- Criação gera histórico e token com hash; token bruto não persiste.
- Token inválido, expirado, revogado e usado recebe resposta segura.
- Confirmação idempotente; cancelamento pendente/confirmado e reuso real do
  horário.
- Reagendamento preserva original, vínculos e tokens, respeita duração e
  bloqueios e limita concorrência a uma substituição.
- Transições administrativas válidas/inválidas, conclusão, no-show e histórico
  ordenado.
- Token e admin não atravessam Studio Cut/Lumière; nenhuma resposta expõe
  `tokenHash`; logs HTTP não contêm token bruto.
- Studio Cut com serviço de 30 minutos e Lumière com serviço de 60 minutos:
  criação pela interface, sucesso, gestão, confirmação, cancelamento,
  reagendamento, histórico/no-show e erro de token.
- 375, 768 e 1440 px sem overflow; labels básicos presentes e zero erro de
  aplicação no console.
- Prisma schema válido; 12 migrations locais sem drift; Prisma Client e Vite
  build gerados sem erro.

## Validações não executadas

- Qualquer health check, migration ou smoke em Render/produção.
- Deploy ou Preview na Vercel.
- Entrega de link por WhatsApp, e-mail ou SMS.
- Recuperação de link perdido.

## Riscos para A4

- Rollout de A0-A3B em produção ainda precisa de backup, janela e validação na
  ordem das migrations.
- Sem mensageria e recuperação, o cliente precisa guardar o link recebido na
  tela de sucesso.
- O rate limit atual é em memória e não coordena múltiplas instâncias.
- Retenção do histórico, privacidade e política de expiração/rotação ainda
  precisam de decisão operacional.
- Agendamentos anteriores continuam sem link público.
- Conflitos por duração usam o motor serializável; não existe exclusion
  constraint de intervalo para agendamentos no banco.

## Divergências documentais

`README.md` ainda descreve partes do modelo antigo de rotas e status. O estado
vigente desta branch está em `docs/a3a-agenda-profissional.md`,
`docs/a3b-ciclo-agendamento.md` e neste arquivo.

## Próxima ação registrada

Definir e autorizar explicitamente a fase A4 antes de qualquer implementação.
A A3B não autoriza CRM, `Lead`, `Client`, notificações, pagamento, recuperação
de link, deploy, merge ou push.
