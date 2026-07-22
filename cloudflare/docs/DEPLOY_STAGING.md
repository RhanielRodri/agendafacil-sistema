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
ACCESS_TEAM_DOMAIN=
ACCESS_POLICY_AUD=
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

Feito no painel Zero Trust, não por Wrangler:

1. Zero Trust → Settings → Custom Pages: anote o domínio de equipe
   (`<time>.cloudflareaccess.com`).
2. Access → Applications → Add → Self-hosted, apontando para o hostname do
   Worker administrativo. **Somente ele.** O Worker público nunca entra.
3. Policy: Allow, por e-mail ou domínio, com os endereços que vão administrar.
4. Copie o **Application Audience (AUD) Tag**.
5. Preencha `ACCESS_TEAM_DOMAIN` e `ACCESS_POLICY_AUD` no `.env.staging`, rode
   `npm run staging:config` e publique o Worker administrativo de novo.
6. Rode o bootstrap acima com os mesmos e-mails da policy.

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
