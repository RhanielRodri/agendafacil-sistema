# Plano de reversão — `20260720130000_admin_auth`

Migration aplicada **somente no banco Docker local** (`agendafacil_dev`, porta
5433). Nunca aplicada em Render, Preview, staging remoto ou produção.

## O que a migration faz

Cria `AdminUser` (usuário administrativo nomeado, vinculado a `Tenant(slug)`,
único por `(tenantId, email)`) e `AdminSession` (sessão opaca: guarda apenas o
hash do token, com expiração e revogação). Nenhuma alteração em tabelas
existentes; sem backfill.

## Reversão em ambiente local descartável (recomendada)

Como os dados são fictícios, recrie o banco a partir das migrations anteriores:

```bash
npx prisma migrate reset --skip-seed
# remova a pasta 20260720130000_admin_auth de prisma/migrations
npx prisma migrate deploy
npx prisma db seed
```

## Reversão manual (SQL)

```sql
BEGIN;
DROP TABLE "AdminSession";
DROP TABLE "AdminUser";
COMMIT;
```

`AdminSession` é removida antes de `AdminUser` por causa da FK
`AdminSession_userId_fkey` (ON DELETE CASCADE). Após a reversão, remova a pasta
desta migration e sincronize o `schema.prisma` com o estado anterior antes de
`prisma generate`. Reverter a autenticação também exige restaurar o código de
login por `ADMIN_SECRET`, removido nesta fase.
