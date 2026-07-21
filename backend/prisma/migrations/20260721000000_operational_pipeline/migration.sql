CREATE TYPE "LeadPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

ALTER TYPE "RelationshipHistoryType" ADD VALUE 'LEAD_PRIORITY_CHANGED';
ALTER TYPE "RelationshipHistoryType" ADD VALUE 'LEAD_OWNER_CHANGED';
ALTER TYPE "RelationshipHistoryType" ADD VALUE 'LEAD_QUALIFICATION_UPDATED';
ALTER TYPE "RelationshipHistoryType" ADD VALUE 'FOLLOW_UP_CANCELLED';

ALTER TABLE "AdminUser"
ADD CONSTRAINT "AdminUser_id_tenantId_key" UNIQUE ("id", "tenantId");

ALTER TABLE "Lead"
ADD COLUMN "priority" "LeadPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN "ownerUserId" INTEGER,
ADD COLUMN "qualification" JSONB,
ADD COLUMN "qualificationVersion" INTEGER,
ADD COLUMN "lostReasonNote" VARCHAR(300),
ADD COLUMN "lostAt" TIMESTAMP(3),
ADD COLUMN "lostByUserId" INTEGER;

ALTER TABLE "FollowUp"
ADD COLUMN "ownerUserId" INTEGER;

ALTER TABLE "Lead"
ADD CONSTRAINT "Lead_ownerUserId_tenantId_fkey"
FOREIGN KEY ("ownerUserId", "tenantId") REFERENCES "AdminUser"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Lead"
ADD CONSTRAINT "Lead_lostByUserId_tenantId_fkey"
FOREIGN KEY ("lostByUserId", "tenantId") REFERENCES "AdminUser"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FollowUp"
ADD CONSTRAINT "FollowUp_ownerUserId_tenantId_fkey"
FOREIGN KEY ("ownerUserId", "tenantId") REFERENCES "AdminUser"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Lead"
ADD CONSTRAINT "Lead_qualification_size_check"
CHECK ("qualification" IS NULL OR pg_column_size("qualification") <= 4096);

ALTER TABLE "Lead"
ADD CONSTRAINT "Lead_active_loss_fields_check"
CHECK (
  "status" = 'LOST'
  OR (
    "lostReason" IS NULL
    AND "lostReasonNote" IS NULL
    AND "lostAt" IS NULL
    AND "lostByUserId" IS NULL
  )
);

ALTER TABLE "Lead"
ADD CONSTRAINT "Lead_structured_loss_check"
CHECK (
  "lostAt" IS NULL
  OR (
    "lostReason" IN ('NO_RESPONSE', 'PRICE', 'NO_AVAILABILITY', 'CHANGED_MIND', 'NOT_A_FIT', 'DUPLICATE', 'OTHER')
    AND ("lostReason" <> 'OTHER' OR NULLIF(BTRIM("lostReasonNote"), '') IS NOT NULL)
  )
);

CREATE INDEX "Lead_tenantId_priority_status_createdAt_idx"
ON "Lead"("tenantId", "priority", "status", "createdAt");

CREATE INDEX "Lead_tenantId_ownerUserId_status_createdAt_idx"
ON "Lead"("tenantId", "ownerUserId", "status", "createdAt");

CREATE INDEX "FollowUp_tenantId_ownerUserId_status_dueAt_idx"
ON "FollowUp"("tenantId", "ownerUserId", "status", "dueAt");
