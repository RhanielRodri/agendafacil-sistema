# CF1A — Arquitetura e contratos Cloudflare

## Escopo e base

- Base imutável do sistema original: `e4881e495ca8b909a3b5f8328ae16a2f95b4952b`.
- Branch de migração: `codex/cf1-cloudflare-migration`.
- O backend Express/Prisma/PostgreSQL e o frontend Vite continuam sendo a referência funcional durante CF1A.
- CF1A cria contratos, schema/seed D1 e a fundação dos Workers. Os endpoints de produto permanecem para CF1B–CF1D.

## Topologia

```text
Navegador público
  -> Public Worker
     -> Static Assets
     -> D1 compartilhado

Navegador administrativo
  -> Cloudflare Access
     -> Admin Worker
        -> validação interna do Cf-Access-Jwt-Assertion
        -> AdminIdentity + AdminMembership
        -> D1 compartilhado
```

Os Workers são projetos separados. O Access protege o Admin Worker inteiro. Ambos recebem o mesmo binding `DB`, mas apenas o Admin Worker recebe `ACCESS_TEAM_DOMAIN` e `ACCESS_POLICY_AUD`. Nenhum Worker usa Express, Prisma, PBKDF2, senha administrativa ou cookie de sessão próprio.

## Estrutura definitiva

```text
cloudflare/
├── public-worker/
│   ├── assets/
│   └── src/
├── admin-worker/
│   └── src/
├── shared/
│   └── src/
├── migrations/
├── seed/
├── tests/
├── docs/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── wrangler.admin.jsonc
└── wrangler.public.jsonc
```

`shared` contém apenas tipos, validação, respostas HTTP, resolução de tenant, regras de disponibilidade/conflito e utilitários D1 pequenos. SQL de produto continuará visível nos handlers; não haverá ORM, container, repository genérico, framework interno ou pacote publicado.

## Resolução de tenant

### Worker público

O contrato de destino usa `/api/tenants/:tenantSlug/...`. O slug extraído do caminho é normalizado e consultado em `tenants` com `active = 1`. IDs de recursos são sempre consultados junto com `tenant_id`.

Nunca são autoridade:

- `demoId` enviado pelo cliente;
- `tenantId` em query ou body;
- `tenant` em header customizado.

Se esses campos existirem por compatibilidade temporária, são ignorados. Um slug inexistente ou inativo retorna 404. As páginas públicas usam os caminhos permitidos `/studio-cut` e `/lumiere`; os demais assets são servidos pelo binding de Static Assets.

### Worker administrativo

O contrato de destino usa `/api/admin/tenants/:tenantSlug/...`. O fluxo obrigatório é:

```text
rota -> slug -> JWT Access -> email normalizado
     -> AdminIdentity ativa -> AdminMembership ativa
     -> tenant ativo -> autorização ou 403
```

O tenant vem exclusivamente do caminho. Query, body e headers customizados não alteram o contexto. Um recurso válido de outro tenant retorna 404 depois da autorização da rota; falta de membership retorna 403.

## Autenticação e autorização

- Header aceito: `Cf-Access-Jwt-Assertion`.
- Algoritmo aceito: somente `RS256`.
- Assinatura: JWKS oficial em `<issuer>/cdn-cgi/access/certs`.
- Claims obrigatórias: `exp` e `email`.
- Validações: assinatura, issuer HTTPS terminado em `.cloudflareaccess.com`, audience exata, expiração e email normalizado.
- A identidade precisa existir e estar ativa em `admin_identities`.
- A membership `(identity_id, tenant_id)` precisa existir, estar ativa e ter role `ADMIN`.
- Ausência ou invalidade do JWT retorna 401 genérico; identidade válida sem autorização retorna 403 genérico.
- O frontend não recebe dados internos do token nem detalhes sobre qual etapa falhou.

## Contrato de erros

Todos os erros JSON usam:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Recurso não encontrado"
  }
}
```

| HTTP | Código | Uso |
|---|---|---|
| 400 | `INVALID_REQUEST` | payload, data, horário ou estado inválido |
| 401 | `UNAUTHORIZED` | JWT ausente ou inválido no Admin Worker |
| 403 | `FORBIDDEN` | identidade sem membership ativa para a rota |
| 404 | `NOT_FOUND` | rota, tenant ou recurso não encontrado no tenant autorizado |
| 409 | `CONFLICT` | slot ocupado, transição ou conflito estrutural |
| 422 | `IMPACT_CONFIRMATION_REQUIRED` | prévia estrutural requer confirmação |
| 429 | `RATE_LIMITED` | limite de uso excedido |
| 500 | `INTERNAL_ERROR` | falha interna sem detalhes sensíveis |
| 503 | `DATABASE_UNAVAILABLE` | D1 indisponível no health check que o consulta |

Respostas 500 não expõem SQL, stack, binding, token, issuer, audience ou email.

## Datas, horários e dinheiro

- Timestamps: `TEXT` UTC ISO-8601 com milissegundos, por exemplo `2026-07-21T14:30:00.000Z`.
- Datas civis de agenda: `TEXT` `YYYY-MM-DD`, interpretadas no timezone de `tenant_settings`.
- Horários civis: `TEXT` `HH:MM` em relógio de 24 horas.
- A API não mistura epoch e ISO-8601.
- Valores monetários: `INTEGER` em centavos; `NULL` continua significando preço não informado.
- IDs: UUID compatível gerado no Worker com `crypto.randomUUID()`; slugs de tenant continuam estáveis.

## Status

- Appointment: `PENDING`, `CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`.
- Lead: `NEW`, `CONTACTED`, `QUALIFIED`, `CONVERTED`, `LOST`.
- Lead priority: `LOW`, `NORMAL`, `HIGH`.
- Follow-up: `OPEN`, `COMPLETED`, `CANCELLED`.
- Follow-up type: `CONTACT`, `RETURN`, `EVALUATION`, `WAITLIST`, `OTHER`.
- Roles iniciais: somente `ADMIN`.

Todos são `TEXT` com `CHECK`; valores desconhecidos são rejeitados pelo D1.

## Regras de conflito e atomicidade

Um agendamento ativo ocupa uma linha por unidade de slot em `appointment_slots`. A chave primária `(tenant_id, professional_id, appointment_date, slot_time)` transforma duas reservas concorrentes no resultado comprovado 201/409. A criação usa um único `DB.batch`: cliente, agendamento, histórico, token e slots entram juntos. O cancelamento usa um único `DB.batch` para alterar o status, registrar histórico/revogação e remover slots.

A disponibilidade faz interseção entre horário do negócio e janelas do profissional, remove pausas entre janelas, `blocked_dates`, `schedule_blocks` e `appointment_slots`, e testa a duração inteira do serviço.

Operações estruturais seguem duas fases:

1. prévia calcula `currentImpact` sem escrita;
2. confirmação recalcula dentro da operação atômica e grava esse segundo resultado em `appliedImpact`.

Agendamentos afetados permanecem ativos e não são movidos automaticamente.

## Static Assets

O Public Worker encaminha caminhos não API ao binding `ASSETS`. CF1A mantém somente a pasta e a configuração do binding; o frontend original não é copiado nem alterado. O Admin Worker não publica assets nesta fase.

## Configuração e segredos

Os arquivos versionados usam nomes e IDs locais sintéticos. Valores reais de `ACCESS_TEAM_DOMAIN`, `ACCESS_POLICY_AUD`, IDs de conta/banco, tokens e emails administrativos nunca entram no Git. O bootstrap administrativo é descrito em `SEED_AND_BOOTSTRAP.md`.

## Limites desta fase

- Nenhum Worker é publicado.
- Nenhum D1 remoto é criado.
- Nenhum endpoint funcional além da fundação e live/context é considerado migrado.
- Nenhuma configuração de Render, Vercel ou produção é alterada.
