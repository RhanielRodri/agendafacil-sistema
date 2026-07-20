ALTER TYPE "AppointmentStatus" RENAME VALUE 'NEW' TO 'PENDING';
ALTER TYPE "AppointmentStatus" ADD VALUE 'NO_SHOW';

CREATE TYPE "AppointmentHistoryType" AS ENUM (
  'CREATED',
  'CONFIRMED',
  'CANCELLED',
  'RESCHEDULED_FROM',
  'RESCHEDULED_TO',
  'COMPLETED',
  'NO_SHOW',
  'STATUS_CHANGED'
);

CREATE TYPE "AppointmentActorType" AS ENUM ('ADMIN', 'CUSTOMER', 'SYSTEM');
CREATE TYPE "AppointmentTokenPurpose" AS ENUM ('MANAGE');

ALTER TABLE "Appointment"
  ADD COLUMN "cancellationReason" VARCHAR(300),
  ADD COLUMN "rescheduledFromId" INTEGER;

ALTER TABLE "Appointment"
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE UNIQUE INDEX "Appointment_id_demoId_key"
  ON "Appointment"("id", "demoId");

CREATE UNIQUE INDEX "Appointment_rescheduledFromId_key"
  ON "Appointment"("rescheduledFromId");

CREATE INDEX "Appointment_demoId_status_date_idx"
  ON "Appointment"("demoId", "status", "date");

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_rescheduledFromId_fkey"
  FOREIGN KEY ("rescheduledFromId") REFERENCES "Appointment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AppointmentHistoryEvent" (
  "id" SERIAL NOT NULL,
  "tenantId" TEXT NOT NULL,
  "appointmentId" INTEGER NOT NULL,
  "type" "AppointmentHistoryType" NOT NULL,
  "fromStatus" "AppointmentStatus",
  "toStatus" "AppointmentStatus",
  "metadata" JSONB,
  "actorType" "AppointmentActorType" NOT NULL,
  "actorId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentHistoryEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppointmentHistoryEvent_metadata_size_check"
    CHECK ("metadata" IS NULL OR octet_length("metadata"::text) <= 2048)
);

CREATE INDEX "AppointmentHistoryEvent_tenantId_appointmentId_createdAt_idx"
  ON "AppointmentHistoryEvent"("tenantId", "appointmentId", "createdAt");

ALTER TABLE "AppointmentHistoryEvent"
  ADD CONSTRAINT "AppointmentHistoryEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AppointmentHistoryEvent"
  ADD CONSTRAINT "AppointmentHistoryEvent_appointmentId_tenantId_fkey"
  FOREIGN KEY ("appointmentId", "tenantId")
  REFERENCES "Appointment"("id", "demoId")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AppointmentAccessToken" (
  "id" SERIAL NOT NULL,
  "tenantId" TEXT NOT NULL,
  "appointmentId" INTEGER NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "purpose" "AppointmentTokenPurpose" NOT NULL DEFAULT 'MANAGE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentAccessToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppointmentAccessToken_tokenHash_key"
  ON "AppointmentAccessToken"("tokenHash");

CREATE INDEX "AppointmentAccessToken_tenantId_appointmentId_idx"
  ON "AppointmentAccessToken"("tenantId", "appointmentId");

CREATE INDEX "AppointmentAccessToken_expiresAt_idx"
  ON "AppointmentAccessToken"("expiresAt");

ALTER TABLE "AppointmentAccessToken"
  ADD CONSTRAINT "AppointmentAccessToken_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AppointmentAccessToken"
  ADD CONSTRAINT "AppointmentAccessToken_appointmentId_tenantId_fkey"
  FOREIGN KEY ("appointmentId", "tenantId")
  REFERENCES "Appointment"("id", "demoId")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "AppointmentHistoryEvent" (
  "tenantId",
  "appointmentId",
  "type",
  "toStatus",
  "metadata",
  "actorType"
)
SELECT
  "demoId",
  "id",
  'STATUS_CHANGED',
  "status",
  '{"source":"BACKFILL"}'::jsonb,
  'SYSTEM'
FROM "Appointment";
