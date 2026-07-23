# A7 — Ciclo de vida de um cliente (Client Pack + CLI)

Guia executável para implantar, atualizar, exportar, salvar, restaurar e planejar
a desativação de uma operação real, sem duplicar frontend/Workers nem criar
condicionais por cliente. Documenta apenas o que está implementado.

## Conceitos

- **Client Pack**: artefato versionado em `cloudflare/client-packs/<slug>.json` que
  descreve identidade, conteúdo público, terminologia, catálogo, agenda e
  configurações de uma operação. Contrato e validação em `client-packs/schema.mjs`.
- **Fonte de verdade**: o pack. O front consome uma projeção do pack
  (`compile.mjs`) e o D1 recebe um seed idempotente gerado do pack (`seed.mjs`).
  Um gate de testes garante que Studio Cut e Lumière permanecem fiéis ao pack.
- **CLI**: `cloudflare/scripts/client.mjs` (atalho `npm run client -- <cmd>`).
  Dry-run por padrão; escreve só com `--apply`; produção exige `--confirm <slug>`.
  Esta CLI **nunca** faz deploy nem toca o D1 remoto — ela gera artefatos e
  imprime os comandos wrangler para você revisar e executar.

Todos os comandos abaixo rodam a partir de `cloudflare/`.

## Comandos

| Comando | O que faz |
| --- | --- |
| `client validate <slug>` | Valida o pack (fail-closed). |
| `client plan <slug>` | Mostra o que a provisão faria (dry-run). |
| `client provision <slug> [--apply] [--env]` | Gera seed + config do tenant. |
| `client update <slug> [--apply] [--env]` | SQL de reconciliação idempotente. |
| `client backup <slug> --source <sqlite>` | Snapshot JSON com checksum. |
| `client export <slug> --source <sqlite> [--mask]` | JSON restaurável + CSV por domínio. |
| `client restore <backup.json> --target <slug>` | SQL de restauração (recusa cross-tenant). |
| `client smoke <slug>` | Checks locais (contrato, seed, config). |
| `client decommission-plan <slug>` | Planeja a desativação (nada é executado). |

## Onboarding de um novo cliente

1. Copie `client-packs/template.json` para `client-packs/<slug>.json` e preencha.
   Sem segredos, sem AUD, sem HTML/CSS — só conteúdo. Fotos: caminho em
   `/assets/...` ou URL https.
2. `npm run client -- validate <slug>` até passar.
3. `npm run client -- plan <slug>` e confira os números (serviços, profissionais,
   associações, agenda).
4. `npm run client -- provision <slug> --env local --apply` para materializar
   `seed/generated/<slug>.sql`, `frontend/src/config/demos/<slug>.js` e os configs
   `wrangler.local.<slug>.public.jsonc` / `wrangler.local.<slug>.admin.jsonc`.
   Commite o `demos/<slug>.js` (é o runtime do tenant); o seed gerado é ignorado
   pelo Git. Os configs Wrangler também são ignorados e usam placeholders de
   Access que não autenticam até serem substituídos.
5. Revise os configs gerados. A CLI recusa sobrescrever conteúdo incompatível e
   aceita reexecução idempotente de configs compatíveis.
6. Aplique o seed no D1 do ambiente com wrangler e rode o smoke.

**Tempo observado** para preparar um pack válido a partir do template e provisionar
localmente: ~15–25 min (a maior parte é redigir o conteúdo). Configs wrangler +
Access + smoke em staging: mais ~20–30 min manuais.

## Staging

1. `npm run client -- provision <slug> --env staging` (dry-run) e leia o plano
   Cloudflare impresso.
2. Aplique o seed no D1 de staging com wrangler (comando impresso pela CLI).
3. `npm run staging:dryrun:verticals` para validar os bundles.
4. Deploy manual dos Workers de staging do tenant (scripts `staging:deploy:*`).

## Access

- Configure a aplicação/policy do tenant com `npm run access:configure` e
  verifique com `npm run access:verify`.
- **Ponto de parada**: produção usa AUD e identidades próprias. Nunca reutilize a
  AUD de staging em produção.

## Smoke

- Local: `npm run client -- smoke <slug>` (contrato, seed escopado, config).
- Ambiente: abra público e painel do tenant, confira booking, um serviço, um
  profissional e o link de WhatsApp num agendamento. Sem republicar produção.

## WhatsApp manual

- O painel oferece os templates definidos em `whatsapp.templates` no Client Pack.
- A pessoa abre o `wa.me`, revisa e envia fora do sistema; não existe envio
  automático, fila, cron ou Cloud API.
- Depois do contato, registra o evento no histórico e pode criar o próximo
  follow-up. “Não contatar” grava um opt-out no mesmo histórico e bloqueia novas
  ações de WhatsApp quando a ficha é reaberta.

## Produção

1. `npm run client -- provision <slug> --env production` (dry-run) — revise o plano
   e os avisos.
2. Aplique o seed no D1 de produção com wrangler.
3. Deploy manual dos Workers de produção do tenant.
4. **Confirmação extra**: qualquer `--apply` de produção exige `--confirm <slug>`.

## Atualização

1. Edite `client-packs/<slug>.json`, `validate`.
2. `npm run client -- update <slug>` (dry-run) — a reconciliação preserva dados
   operacionais e **inativa** (nunca apaga) serviços/profissionais removidos.
3. **Backup obrigatório** antes de qualquer apply remoto (seção Backup).
4. Aplique o SQL de reconciliação revisado com wrangler.

## Export

- `npm run client -- export <slug> --source <d1.sqlite> --out <pasta>`: gera
  `backup.json` (restaurável) e um CSV por domínio (catálogo, profissionais,
  horários, bloqueios, clientes, agendamentos, follow-ups, histórico,
  configurações). `--mask` mascara dados pessoais; `--from/--to` filtram período.
- Tokens de acesso, identidades e memberships do Access **nunca** são exportados.

## Backup

- `npm run client -- backup <slug> --source <d1.sqlite> --out <arquivo.json>`:
  snapshot com `checksum`, versão de formato e timestamp. Guarde fora do repo
  (a pasta `backups/` é ignorada pelo Git por conter PII).

## Restore

- `npm run client -- restore <backup.json> --target <slug>`: valida formato e
  checksum, recusa se o backup for de outro tenant, e gera o SQL de restauração
  escopado ao alvo. `--apply` (local) escreve o SQL; remoto imprime o comando
  wrangler para revisão.

## Rollback

- Deploy: mantenha a versão anterior dos Workers; reverter é redeploy da versão
  prévia + revalidar Access.
- Dados: restaure o último backup íntegro (checksum confere) com `restore`.

## Offboarding

- `npm run client -- decommission-plan <slug>` imprime o plano (export → backup →
  desligar booking → remover Access → remover Workers → soltar D1 → remover
  configs e pack). **Nada é executado**; cada passo é manual e confirmado.

## Incidentes básicos

- Booking travado: confira `settings.bookingEnabled` no pack e reprovisione.
- Painel sem dados / erro: cheque Access (AUD do ambiente) e o binding D1 da config.
- Suspeita de dado corrompido: gere um `backup` imediato antes de qualquer
  correção; compare checksums.
