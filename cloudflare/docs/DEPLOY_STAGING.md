# CF2 — Publicação controlada em staging

Staging usa a mesma base de código de CF1D. O que muda é o ambiente, e o
ambiente nunca entra no Git: IDs de banco, domínio de equipe e audience do
Access moram em `cloudflare/.env.staging`, que é ignorado.

## Ambiente local não versionado

Crie `cloudflare/.env.staging`:

```
CF_STAGING_D1_NAME=agendafacil-staging-db
CF_STAGING_D1_ID=<id devolvido por wrangler d1 create>
CF_STAGING_PUBLIC_NAME=agendafacil-staging-public
CF_STAGING_ADMIN_NAME=agendafacil-staging-admin
CF_STAGING_STUDIO_CUT_PREFIX=agendafacil-staging-studio-cut
CF_STAGING_LUMIERE_PREFIX=agendafacil-staging-lumiere
ACCESS_TEAM_DOMAIN=
STUDIO_CUT_ACCESS_POLICY_AUD=
LUMIERE_ACCESS_POLICY_AUD=
```

`ACCESS_TEAM_DOMAIN` e `ACCESS_POLICY_AUD` vazios são deliberados: sem eles o
Worker administrativo não valida nenhum token e responde `401` em todas as
rotas. O padrão é falhar fechado, nunca abrir.

## Sequência

```bash
npm run staging:config
npm run staging:migrate
npm run staging:seed
npm run build:cf         # em frontend/, os dois destinos
npm run check:bundles
npm run staging:deploy:public
npm run staging:deploy:admin
```

`staging:config` regenera `wrangler.staging.*.jsonc`, também ignorados. Rode-o
de novo sempre que mudar qualquer valor do `.env.staging` — inclusive ao
preencher o Access.

## Deployments por vertical

Quatro Workers, um por combinação de demo e superfície, sobre o mesmo D1:

```bash
npm run staging:config
cd ../frontend && npm run build:cf:verticals && cd ../cloudflare
npm run check:bundles:verticals
npm run staging:dryrun:verticals
npm run staging:deploy:studio-cut
npm run staging:deploy:lumiere
```

O build por vertical remove a configuração da outra demo do pacote; o
`check:bundles:verticals` falha se ela reaparecer. `TENANT_SLUG` fixa o tenant em
tempo de execução, e o slug do caminho passa a ser conferido contra ele.

## Identidades administrativas

O seed não cria nenhuma identidade: um e-mail administrativo é dado de ambiente,
não de repositório. Depois que o Access existir:

```bash
node scripts/bootstrap-admin.mjs --config wrangler.staging.admin.jsonc \
  --db agendafacil-staging-db pessoa@dominio.com=studio-cut,lumiere
```

O script monta o SQL num arquivo temporário fora da árvore do projeto e o apaga
ao terminar. Use `--dry-run` para conferir o SQL antes. O `ON CONFLICT` preserva
o id existente, então rodar de novo reativa a identidade sem quebrar memberships,
follow-ups ou histórico que já apontem para ela.

## Cloudflare Access

A configuração usa exclusivamente um API Token com `Access: Apps and Policies
Write`. Coloque as quatro variáveis abaixo no ambiente do processo ou em arquivo
local ignorado. Nunca use Global API Key.

```bash
CLOUDFLARE_ACCESS_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
STUDIO_CUT_ADMIN_EMAIL=
LUMIERE_ADMIN_EMAIL=
```

O script lista as aplicações antes de criar, localiza cada uma pelo domínio exato,
falha diante de duplicidade ou policy conflitante e mantém uma única policy
`Allow` por e-mail individual. Ao final, recupera os AUDs reais e o domínio da
organização Zero Trust, grava somente em `.env.staging` e não exibe valores
sensíveis.

```bash
npm run access:test
npm run access:configure
npm run access:verify
npm run staging:config
```

As aplicações são independentes e cada uma tem AUD própria. Para auditar sem
alterar o estado remoto ou o arquivo local, use somente `npm run access:verify`.

A policy do Access decide quem entra no painel. A membership no D1 decide qual
tenant essa pessoa enxerga. As duas camadas são independentes de propósito: passar
pelo Access sem membership resulta em `403`, e é assim que deve ser.

### Branding da tela de login (neutro, compartilhado)

A tela de código do Access (One-Time PIN) é servida pela Cloudflare e pertence à
**organização** Zero Trust — é a mesma para todas as verticais e para staging e
produção. Por isso o branding é neutro **AgendaFácil / SOR ONE**, nunca a
identidade de uma vertical. O desenho (fundo claro, título "Acesso seguro ao
painel" e a instrução do código por e-mail) vive em
`scripts/configure-access-branding.mjs`; o logo neutro está em
`scripts/access-branding/agendafacil-sor-one.svg`.

```bash
npm run access:brand         # dry-run: imprime o login_design que seria enviado
npm run access:brand:apply   # aplica (afeta a organização inteira, inclusive produção)
```

O `apply` é uma ação humana e única: muta a organização compartilhada, então fica
fora do fluxo de deploy por vertical. Para o logo, defina `ACCESS_BRAND_LOGO_URL`
com a URL pública do SVG ou envie-o pelo painel Zero Trust.

## Verificação mínima após publicar

| Verificação | Esperado |
|---|---|
| `GET /studio-cut` e `/lumiere` no Worker público | `200`, HTML `max-age=0, must-revalidate` |
| `GET /assets/<nome>-<hash>.js` | `max-age=31536000, immutable` |
| `GET /api/tenants/inexistente/services` | `404` JSON, nunca o HTML da SPA |
| Rota inexistente sem `/api/` | `200` com o HTML da SPA |
| `GET /api/admin/context` sem Access | `401` |
| Qualquer resposta do Worker administrativo | `no-store` e `X-Robots-Tag: noindex, nofollow` |
| Rede do painel | nenhuma chamada ao Render/Express e nenhuma rota pública |
