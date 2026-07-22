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

Feito no painel, não por Wrangler: o token OAuth do Wrangler não tem escopo de
Zero Trust, então criar a aplicação exige interação humana.

Em `workers.dev` o caminho é o atalho do próprio Worker, que dispensa domínio
próprio:

1. Dashboard → **Workers & Pages** → Overview → selecione o Worker
   **administrativo**. Nunca o público.
2. **Settings** → **Domains & Routes** → na linha `workers.dev`, clique em
   **Enable Cloudflare Access**.
3. **Manage Cloudflare Access** → policy **Allow** por e-mail individual. Não
   autorize domínio inteiro: qualquer identidade fora da lista é negada.
4. Copie o **Application Audience (AUD) Tag** da aplicação criada e o domínio de
   equipe em Zero Trust → Settings → Custom Pages (`<time>.cloudflareaccess.com`).
5. Preencha `ACCESS_TEAM_DOMAIN` e a AUD daquela vertical no `.env.staging`, rode
   `npm run staging:config` e republique aquele Worker administrativo.
6. Rode o bootstrap com os mesmos e-mails da policy.

Repita para cada painel. As aplicações são independentes e cada uma tem AUD
própria — é o que impede um token emitido para uma vertical de valer na outra.

A policy do Access decide quem entra no painel. A membership no D1 decide qual
tenant essa pessoa enxerga. As duas camadas são independentes de propósito: passar
pelo Access sem membership resulta em `403`, e é assim que deve ser.

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
