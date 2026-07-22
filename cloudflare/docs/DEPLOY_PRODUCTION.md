# Publicação de produção no Cloudflare

## Recursos exclusivos

Produção usa o D1 `agendafacil-production-db` e quatro Workers independentes:

| Worker | Superfície | Tenant |
| --- | --- | --- |
| `studio-cut-public` | pública | `studio-cut` |
| `studio-cut-admin` | administrativa | `studio-cut` |
| `lumiere-public` | pública | `lumiere` |
| `lumiere-admin` | administrativa | `lumiere` |

Os arquivos `.env.production` e `wrangler.production.*.jsonc` são ignorados pelo Git. O ambiente não reutiliza D1, aplicação Access, AUD ou configuração de staging. Smart Placement permanece desativado.

## Preparação

Crie `cloudflare/.env.production` com o nome e o ID do D1 produtivo:

```text
CF_PRODUCTION_D1_NAME=agendafacil-production-db
CF_PRODUCTION_D1_ID=<id do D1 produtivo>
```

O token, o Account ID e os e-mails administrativos continuam apenas no ambiente local ignorado. Gere os arquivos remotos e aplique schema e seed:

```powershell
cd cloudflare
npm run production:config
npm run production:migrate
npm run production:seed
```

Antes do bootstrap, valide duas linhas em `tenants`, catálogo e horários dos dois tenants, além de zero linhas em `appointments`, `leads`, `admin_identities` e `admin_memberships`.

## Publicação pública

```powershell
cd frontend
npm run build:cf:verticals
cd ../cloudflare
npm run check:bundles:verticals
npm run production:dryrun
npm run production:deploy:public
```

As URLs públicas são:

- `https://studio-cut-public.sor-os-demos.workers.dev`
- `https://lumiere-public.sor-os-demos.workers.dev`

## Access e bootstrap

As aplicações Access são self-hosted, têm sessão de 24 horas e usam uma única policy `Allow configured admin email`, precedência 1, com apenas um e-mail individual. Cada aplicação tem AUD próprio.

```powershell
npm run production:access:configure
npm run production:access:verify
npm run production:config
```

Quando o mesmo e-mail opera os dois tenants, execute o bootstrap em uma única entrada:

```powershell
node scripts/bootstrap-admin.mjs --config wrangler.production.studio-cut.admin.jsonc --db agendafacil-production-db "email@dominio=studio-cut,lumiere"
```

O script é idempotente: mantém uma identidade ativa e uma membership ativa por tenant sem duplicar linhas.

## Publicação administrativa

```powershell
npm run production:dryrun
npm run production:deploy:admin
```

As URLs protegidas são:

- `https://studio-cut-admin.sor-os-demos.workers.dev`
- `https://lumiere-admin.sor-os-demos.workers.dev`

Toda visita anônima deve ser interceptada pelo Access. O Worker aceita somente JWT emitido pelo team domain e pela AUD específica da sua aplicação, e ainda exige identidade e membership ativas no D1.

## Gates

```powershell
npm run check
npm test
npm run access:test
npm run check:bundles:verticals
npm audit --omit=dev
git diff --check
```

Execute também `npm audit --omit=dev` em `frontend`, confira os quatro dry-runs, o smoke público e administrativo dos dois tenants, a integridade do staging e a ausência de arquivos sensíveis rastreados antes de commitar.
