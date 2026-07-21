-- A5B: gestão estrutural. Migration estritamente aditiva.
-- O drift legado da A3A (defaults de updatedAt em ProfessionalSchedule e
-- ScheduleBlock e nome do índice de ProfessionalSchedule) NÃO é tocado aqui:
-- ele exige fase própria de reconciliação antes de qualquer rollout remoto.

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "internalContact" VARCHAR(60);

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requiresEvaluation" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "price" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ProfessionalService" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "professionalId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionalService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSettings" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicName" VARCHAR(120),
    "publicPhone" VARCHAR(30),
    "publicWhatsapp" VARCHAR(30),
    "addressLine" VARCHAR(160),
    "timezone" VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
    "slotDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "minAdvanceMinutes" INTEGER NOT NULL DEFAULT 0,
    "maxFutureDays" INTEGER NOT NULL DEFAULT 90,
    "cancellationPolicy" VARCHAR(500),
    "confirmationMessage" VARCHAR(300),
    "bookingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfessionalService_tenantId_serviceId_idx" ON "ProfessionalService"("tenantId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalService_tenantId_professionalId_serviceId_key" ON "ProfessionalService"("tenantId", "professionalId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSettings_tenantId_key" ON "TenantSettings"("tenantId");

-- CreateIndex
CREATE INDEX "Professional_demoId_active_displayOrder_name_idx" ON "Professional"("demoId", "active", "displayOrder", "name");

-- CreateIndex
CREATE INDEX "Service_demoId_active_displayOrder_name_idx" ON "Service"("demoId", "active", "displayOrder", "name");

-- AddForeignKey
ALTER TABLE "ProfessionalService" ADD CONSTRAINT "ProfessionalService_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalService" ADD CONSTRAINT "ProfessionalService_professionalId_tenantId_fkey" FOREIGN KEY ("professionalId", "tenantId") REFERENCES "Professional"("id", "demoId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalService" ADD CONSTRAINT "ProfessionalService_serviceId_tenantId_fkey" FOREIGN KEY ("serviceId", "tenantId") REFERENCES "Service"("id", "demoId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
