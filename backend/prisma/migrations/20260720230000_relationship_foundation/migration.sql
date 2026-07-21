CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST');
CREATE TYPE "LeadSource" AS ENUM ('BOOKING', 'WAITLIST', 'EVALUATION', 'CONTACT', 'ABANDONED_BOOKING', 'MANUAL');
CREATE TYPE "FollowUpStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');
CREATE TYPE "FollowUpType" AS ENUM ('CONTACT', 'RETURN', 'EVALUATION', 'WAITLIST', 'OTHER');
CREATE TYPE "RelationshipHistoryType" AS ENUM ('CLIENT_CREATED', 'CLIENT_UPDATED', 'LEAD_CREATED', 'LEAD_STATUS_CHANGED', 'LEAD_CONVERTED', 'LEAD_LOST', 'FOLLOW_UP_CREATED', 'FOLLOW_UP_COMPLETED', 'APPOINTMENT_LINKED', 'NOTE_ADDED');
CREATE TYPE "RelationshipActorType" AS ENUM ('ADMIN', 'CUSTOMER', 'SYSTEM');

CREATE TABLE "Client" (
  "id" SERIAL NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "phone" VARCHAR(30) NOT NULL,
  "normalizedPhone" VARCHAR(15) NOT NULL,
  "email" VARCHAR(254),
  "normalizedEmail" VARCHAR(254),
  "notes" VARCHAR(2000),
  "firstContactAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastContactAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Client_normalizedPhone_check" CHECK ("normalizedPhone" ~ '^[0-9]{8,15}$')
);

ALTER TABLE "Appointment" ADD COLUMN "clientId" INTEGER;
ALTER TABLE "Appointment" ADD COLUMN "leadId" INTEGER;

WITH normalized AS (
  SELECT
    "id",
    "demoId" AS "tenantId",
    LEFT(TRIM("clientName"), 120) AS "name",
    LEFT(TRIM("clientPhone"), 30) AS "phone",
    RIGHT(REGEXP_REPLACE("clientPhone", '[^0-9]', '', 'g'), 15) AS "normalizedPhone",
    NULLIF(LEFT(LOWER(TRIM(COALESCE("clientEmail", ''))), 254), '') AS "normalizedEmail",
    NULLIF(LEFT(TRIM(COALESCE("clientEmail", '')), 254), '') AS "email",
    "createdAt"
  FROM "Appointment"
), representatives AS (
  SELECT DISTINCT ON ("tenantId", "normalizedPhone")
    "tenantId", "name", "phone", "normalizedPhone", "email", "normalizedEmail"
  FROM normalized
  WHERE LENGTH("normalizedPhone") BETWEEN 8 AND 15
  ORDER BY "tenantId", "normalizedPhone", LENGTH("name") DESC, "createdAt" ASC, "id" ASC
), contact_dates AS (
  SELECT "tenantId", "normalizedPhone", MIN("createdAt") AS "firstContactAt", MAX("createdAt") AS "lastContactAt"
  FROM normalized
  WHERE LENGTH("normalizedPhone") BETWEEN 8 AND 15
  GROUP BY "tenantId", "normalizedPhone"
)
INSERT INTO "Client" (
  "tenantId", "name", "phone", "normalizedPhone", "email", "normalizedEmail",
  "firstContactAt", "lastContactAt", "createdAt", "updatedAt"
)
SELECT
  r."tenantId", r."name", r."phone", r."normalizedPhone", r."email", r."normalizedEmail",
  d."firstContactAt", d."lastContactAt", d."firstContactAt", CURRENT_TIMESTAMP
FROM representatives r
JOIN contact_dates d USING ("tenantId", "normalizedPhone");

UPDATE "Appointment" a
SET "clientId" = c."id"
FROM "Client" c
WHERE c."tenantId" = a."demoId"
  AND c."normalizedPhone" = RIGHT(REGEXP_REPLACE(a."clientPhone", '[^0-9]', '', 'g'), 15);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Appointment" WHERE "clientId" IS NULL) THEN
    RAISE EXCEPTION 'Backfill de Client deixou Appointment sem vínculo';
  END IF;
END $$;

ALTER TABLE "Appointment" ALTER COLUMN "clientId" SET NOT NULL;

CREATE TABLE "Lead" (
  "id" SERIAL NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientId" INTEGER NOT NULL,
  "source" "LeadSource" NOT NULL,
  "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
  "serviceId" INTEGER,
  "professionalId" INTEGER,
  "interestSummary" VARCHAR(500),
  "dedupeKey" CHAR(64) NOT NULL,
  "lostReason" VARCHAR(300),
  "convertedAt" TIMESTAMP(3),
  "convertedAppointmentId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FollowUp" (
  "id" SERIAL NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientId" INTEGER NOT NULL,
  "leadId" INTEGER,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "type" "FollowUpType" NOT NULL,
  "status" "FollowUpStatus" NOT NULL DEFAULT 'OPEN',
  "note" VARCHAR(500),
  "completedAt" TIMESTAMP(3),
  "createdByUserId" INTEGER NOT NULL,
  "completedByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RelationshipHistoryEvent" (
  "id" SERIAL NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientId" INTEGER NOT NULL,
  "leadId" INTEGER,
  "appointmentId" INTEGER,
  "type" "RelationshipHistoryType" NOT NULL,
  "actorType" "RelationshipActorType" NOT NULL,
  "actorId" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RelationshipHistoryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Service_id_demoId_key" ON "Service"("id", "demoId");
CREATE UNIQUE INDEX "Client_tenantId_normalizedPhone_key" ON "Client"("tenantId", "normalizedPhone");
CREATE UNIQUE INDEX "Client_id_tenantId_key" ON "Client"("id", "tenantId");
CREATE INDEX "Client_tenantId_normalizedEmail_idx" ON "Client"("tenantId", "normalizedEmail");
CREATE INDEX "Client_tenantId_lastContactAt_idx" ON "Client"("tenantId", "lastContactAt");
CREATE UNIQUE INDEX "Lead_id_tenantId_key" ON "Lead"("id", "tenantId");
CREATE UNIQUE INDEX "Lead_convertedAppointmentId_tenantId_key" ON "Lead"("convertedAppointmentId", "tenantId");
CREATE UNIQUE INDEX "Lead_active_dedupe_key" ON "Lead"("tenantId", "clientId", "dedupeKey") WHERE "status" IN ('NEW', 'CONTACTED', 'QUALIFIED');
CREATE INDEX "Lead_tenantId_status_createdAt_idx" ON "Lead"("tenantId", "status", "createdAt");
CREATE INDEX "Lead_tenantId_source_createdAt_idx" ON "Lead"("tenantId", "source", "createdAt");
CREATE INDEX "Lead_tenantId_clientId_createdAt_idx" ON "Lead"("tenantId", "clientId", "createdAt");
CREATE UNIQUE INDEX "FollowUp_id_tenantId_key" ON "FollowUp"("id", "tenantId");
CREATE INDEX "FollowUp_tenantId_status_dueAt_idx" ON "FollowUp"("tenantId", "status", "dueAt");
CREATE INDEX "FollowUp_tenantId_clientId_createdAt_idx" ON "FollowUp"("tenantId", "clientId", "createdAt");
CREATE INDEX "FollowUp_tenantId_leadId_idx" ON "FollowUp"("tenantId", "leadId");
CREATE INDEX "Appointment_demoId_clientId_date_idx" ON "Appointment"("demoId", "clientId", "date");
CREATE INDEX "Appointment_demoId_leadId_idx" ON "Appointment"("demoId", "leadId");
CREATE INDEX "RelationshipHistoryEvent_tenantId_clientId_createdAt_id_idx" ON "RelationshipHistoryEvent"("tenantId", "clientId", "createdAt", "id");
CREATE INDEX "RelationshipHistoryEvent_tenantId_leadId_createdAt_idx" ON "RelationshipHistoryEvent"("tenantId", "leadId", "createdAt");
CREATE INDEX "RelationshipHistoryEvent_tenantId_appointmentId_idx" ON "RelationshipHistoryEvent"("tenantId", "appointmentId");

ALTER TABLE "Client" ADD CONSTRAINT "Client_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_demoId_fkey" FOREIGN KEY ("clientId", "demoId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_clientId_tenantId_fkey" FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_serviceId_tenantId_fkey" FOREIGN KEY ("serviceId", "tenantId") REFERENCES "Service"("id", "demoId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_professionalId_tenantId_fkey" FOREIGN KEY ("professionalId", "tenantId") REFERENCES "Professional"("id", "demoId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedAppointmentId_tenantId_fkey" FOREIGN KEY ("convertedAppointmentId", "tenantId") REFERENCES "Appointment"("id", "demoId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_leadId_demoId_fkey" FOREIGN KEY ("leadId", "demoId") REFERENCES "Lead"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_clientId_tenantId_fkey" FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_leadId_tenantId_fkey" FOREIGN KEY ("leadId", "tenantId") REFERENCES "Lead"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RelationshipHistoryEvent" ADD CONSTRAINT "RelationshipHistoryEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RelationshipHistoryEvent" ADD CONSTRAINT "RelationshipHistoryEvent_clientId_tenantId_fkey" FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RelationshipHistoryEvent" ADD CONSTRAINT "RelationshipHistoryEvent_leadId_tenantId_fkey" FOREIGN KEY ("leadId", "tenantId") REFERENCES "Lead"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RelationshipHistoryEvent" ADD CONSTRAINT "RelationshipHistoryEvent_appointmentId_tenantId_fkey" FOREIGN KEY ("appointmentId", "tenantId") REFERENCES "Appointment"("id", "demoId") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "RelationshipHistoryEvent" (
  "tenantId", "clientId", "type", "actorType", "metadata", "createdAt"
)
SELECT "tenantId", "id", 'CLIENT_CREATED', 'SYSTEM', '{"source":"BACKFILL"}'::jsonb, "createdAt"
FROM "Client";

INSERT INTO "RelationshipHistoryEvent" (
  "tenantId", "clientId", "appointmentId", "type", "actorType", "metadata", "createdAt"
)
SELECT "demoId", "clientId", "id", 'APPOINTMENT_LINKED', 'SYSTEM', '{"source":"BACKFILL"}'::jsonb, "createdAt"
FROM "Appointment";
