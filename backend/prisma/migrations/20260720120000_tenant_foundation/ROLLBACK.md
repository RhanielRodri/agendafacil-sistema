# Plano de reversão — `20260720120000_tenant_foundation`

Migration aplicada **somente no banco Docker local** (`agendafacil_dev`, porta
5433). Nunca aplicada em Render, staging remoto ou produção.

## O que a migration faz

1. Cria a tabela `Tenant` e insere `studio-cut` e `lumiere`.
2. Adiciona a coluna física `demoId` (exposta como `tenantId` no Prisma) em
   `Appointment`, `BusinessHours` e `BlockedDate`; `Service` e `Professional` já
   a possuíam.
3. Backfill: agendamentos herdam o `demoId` do serviço vinculado; horários e
   datas bloqueadas globais são atribuídos a `studio-cut` e **duplicados** para
   `lumiere`, preservando o comportamento anterior.
4. Troca as unicidades globais `BusinessHours.dayOfWeek` e `BlockedDate.date`
   pelas compostas `(demoId, dayOfWeek)` e `(demoId, date)`.
5. Adiciona o índice `Appointment(demoId, date)` e as chaves estrangeiras de
   todas as tabelas tenantizadas para `Tenant(slug)`.

## Reversão em ambiente local descartável (recomendada)

O caminho mais seguro é recriar o banco a partir das migrations anteriores, já
que os dados são fictícios e descartáveis:

```bash
# Aponte para o banco local (porta 5433) e reconstrua até a migration anterior
npx prisma migrate reset --skip-seed        # limpa o banco
# edite prisma/migrations removendo a pasta 20260720120000_tenant_foundation
npx prisma migrate deploy                   # reaplica só até add_demo_presets
npx prisma db seed                          # semeia o modelo anterior
```

## Reversão manual (SQL), se for preciso preservar linhas

Só é segura enquanto os dois tenants **não divergirem**: se `studio-cut` e
`lumiere` passarem a ter horários ou bloqueios diferentes, colapsar para o
modelo global gera colisão nas unicidades `dayOfWeek`/`date`. Nesse caso,
escolha as linhas de um tenant antes de recriar a unicidade global.

```sql
BEGIN;

ALTER TABLE "Service"       DROP CONSTRAINT "Service_demoId_fkey";
ALTER TABLE "Professional"  DROP CONSTRAINT "Professional_demoId_fkey";
ALTER TABLE "Appointment"   DROP CONSTRAINT "Appointment_demoId_fkey";
ALTER TABLE "BusinessHours" DROP CONSTRAINT "BusinessHours_demoId_fkey";
ALTER TABLE "BlockedDate"   DROP CONSTRAINT "BlockedDate_demoId_fkey";

DROP INDEX "Appointment_demoId_date_idx";

-- BusinessHours: manter só um tenant e restaurar unicidade global
DELETE FROM "BusinessHours" WHERE "demoId" <> 'studio-cut';
DROP INDEX "BusinessHours_demoId_dayOfWeek_key";
CREATE UNIQUE INDEX "BusinessHours_dayOfWeek_key" ON "BusinessHours"("dayOfWeek");
ALTER TABLE "BusinessHours" DROP COLUMN "demoId";

-- BlockedDate: idem
DELETE FROM "BlockedDate" WHERE "demoId" <> 'studio-cut';
DROP INDEX "BlockedDate_demoId_date_key";
CREATE UNIQUE INDEX "BlockedDate_date_key" ON "BlockedDate"("date");
ALTER TABLE "BlockedDate" DROP COLUMN "demoId";

ALTER TABLE "Appointment" DROP COLUMN "demoId";

DROP TABLE "Tenant";

COMMIT;
```

Após a reversão manual, remova a pasta desta migration e sincronize o
`schema.prisma` com o estado anterior antes de rodar `prisma generate`.
