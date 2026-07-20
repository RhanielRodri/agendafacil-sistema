-- Tenant foundation: fundação estrutural de isolamento por tenant.
-- Mantém a coluna física "demoId" em todas as tabelas tenantizadas (exposta como
-- "tenantId" no Prisma) e a transforma em chave estrangeira para Tenant(slug).
-- Backfill preserva o comportamento global atual, duplicando presets por tenant.

-- 1. Tabela Tenant
CREATE TABLE "Tenant" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- 2. Os dois tenants conhecidos precisam existir antes das chaves estrangeiras
INSERT INTO "Tenant" ("slug", "name", "active", "updatedAt") VALUES
    ('studio-cut', 'Studio Cut', true, CURRENT_TIMESTAMP),
    ('lumiere', 'Lumière Estética', true, CURRENT_TIMESTAMP);

-- 3. Appointment: coluna de tenant, backfill a partir do serviço vinculado
ALTER TABLE "Appointment" ADD COLUMN "demoId" TEXT;
UPDATE "Appointment" a SET "demoId" = s."demoId" FROM "Service" s WHERE a."serviceId" = s."id";
ALTER TABLE "Appointment" ALTER COLUMN "demoId" SET NOT NULL;

-- 4. BusinessHours: linhas globais viram Studio Cut e são duplicadas para Lumière
ALTER TABLE "BusinessHours" ADD COLUMN "demoId" TEXT;
UPDATE "BusinessHours" SET "demoId" = 'studio-cut';
DROP INDEX "BusinessHours_dayOfWeek_key";
INSERT INTO "BusinessHours" ("demoId", "dayOfWeek", "openTime", "closeTime", "isOpen")
    SELECT 'lumiere', "dayOfWeek", "openTime", "closeTime", "isOpen"
    FROM "BusinessHours" WHERE "demoId" = 'studio-cut';
ALTER TABLE "BusinessHours" ALTER COLUMN "demoId" SET NOT NULL;
CREATE UNIQUE INDEX "BusinessHours_demoId_dayOfWeek_key" ON "BusinessHours"("demoId", "dayOfWeek");

-- 5. BlockedDate: linhas globais viram Studio Cut e são duplicadas para Lumière
ALTER TABLE "BlockedDate" ADD COLUMN "demoId" TEXT;
UPDATE "BlockedDate" SET "demoId" = 'studio-cut';
DROP INDEX "BlockedDate_date_key";
INSERT INTO "BlockedDate" ("demoId", "date", "reason", "createdAt")
    SELECT 'lumiere', "date", "reason", "createdAt"
    FROM "BlockedDate" WHERE "demoId" = 'studio-cut';
ALTER TABLE "BlockedDate" ALTER COLUMN "demoId" SET NOT NULL;
CREATE UNIQUE INDEX "BlockedDate_demoId_date_key" ON "BlockedDate"("demoId", "date");

-- 6. Índice de consulta e chaves estrangeiras para Tenant(slug)
CREATE INDEX "Appointment_demoId_date_idx" ON "Appointment"("demoId", "date");

ALTER TABLE "Service" ADD CONSTRAINT "Service_demoId_fkey" FOREIGN KEY ("demoId") REFERENCES "Tenant"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_demoId_fkey" FOREIGN KEY ("demoId") REFERENCES "Tenant"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_demoId_fkey" FOREIGN KEY ("demoId") REFERENCES "Tenant"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessHours" ADD CONSTRAINT "BusinessHours_demoId_fkey" FOREIGN KEY ("demoId") REFERENCES "Tenant"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BlockedDate" ADD CONSTRAINT "BlockedDate_demoId_fkey" FOREIGN KEY ("demoId") REFERENCES "Tenant"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
