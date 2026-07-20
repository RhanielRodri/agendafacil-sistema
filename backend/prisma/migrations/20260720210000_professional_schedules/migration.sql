CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE UNIQUE INDEX "Professional_id_demoId_key" ON "Professional"("id", "demoId");

CREATE TABLE "ProfessionalSchedule" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "professionalId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfessionalSchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProfessionalSchedule_day_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6),
    CONSTRAINT "ProfessionalSchedule_time_check" CHECK (
        "startTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
        AND "endTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
        AND "startTime" < "endTime"
    )
);

CREATE TABLE "ScheduleBlock" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "professionalId" INTEGER,
    "date" DATE NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "reason" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScheduleBlock_interval_check" CHECK (
        ("allDay" = true AND "startTime" IS NULL AND "endTime" IS NULL)
        OR
        ("allDay" = false
          AND "startTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
          AND "endTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
          AND "startTime" < "endTime")
    )
);

CREATE UNIQUE INDEX "ProfessionalSchedule_tenantId_professionalId_dayOfWeek_startTime_endTime_key"
ON "ProfessionalSchedule"("tenantId", "professionalId", "dayOfWeek", "startTime", "endTime");

CREATE INDEX "ProfessionalSchedule_tenantId_professionalId_dayOfWeek_idx"
ON "ProfessionalSchedule"("tenantId", "professionalId", "dayOfWeek");

CREATE INDEX "ScheduleBlock_tenantId_date_idx" ON "ScheduleBlock"("tenantId", "date");
CREATE INDEX "ScheduleBlock_tenantId_professionalId_date_idx"
ON "ScheduleBlock"("tenantId", "professionalId", "date");

ALTER TABLE "ProfessionalSchedule"
ADD CONSTRAINT "ProfessionalSchedule_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProfessionalSchedule"
ADD CONSTRAINT "ProfessionalSchedule_professionalId_tenantId_fkey"
FOREIGN KEY ("professionalId", "tenantId") REFERENCES "Professional"("id", "demoId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduleBlock"
ADD CONSTRAINT "ScheduleBlock_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScheduleBlock"
ADD CONSTRAINT "ScheduleBlock_professionalId_fkey"
FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProfessionalSchedule"
ADD CONSTRAINT "ProfessionalSchedule_no_overlap"
EXCLUDE USING gist (
    "tenantId" WITH =,
    "professionalId" WITH =,
    "dayOfWeek" WITH =,
    (int4range(
        substring("startTime", 1, 2)::INTEGER * 60 + substring("startTime", 4, 2)::INTEGER,
        substring("endTime", 1, 2)::INTEGER * 60 + substring("endTime", 4, 2)::INTEGER,
        '[)'
    )) WITH &&
) WHERE ("active");

CREATE FUNCTION "validateScheduleBlockTenant"() RETURNS trigger AS $$
BEGIN
    IF NEW."professionalId" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Professional"
        WHERE "id" = NEW."professionalId" AND "demoId" = NEW."tenantId"
    ) THEN
        RAISE EXCEPTION 'professional does not belong to tenant' USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ScheduleBlock_tenant_guard"
BEFORE INSERT OR UPDATE ON "ScheduleBlock"
FOR EACH ROW EXECUTE FUNCTION "validateScheduleBlockTenant"();

INSERT INTO "ProfessionalSchedule" (
    "tenantId", "professionalId", "dayOfWeek", "startTime", "endTime", "active", "createdAt", "updatedAt"
)
SELECT
    professional."demoId",
    professional."id",
    hours."dayOfWeek",
    hours."openTime",
    hours."closeTime",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Professional" professional
JOIN "BusinessHours" hours ON hours."demoId" = professional."demoId"
WHERE hours."isOpen" = true AND hours."openTime" < hours."closeTime"
ON CONFLICT DO NOTHING;

INSERT INTO "ScheduleBlock" (
    "tenantId", "professionalId", "date", "allDay", "startTime", "endTime", "reason", "createdAt", "updatedAt"
)
SELECT
    "demoId",
    NULL,
    "date",
    true,
    NULL,
    NULL,
    LEFT(NULLIF(BTRIM("reason"), ''), 200),
    "createdAt",
    CURRENT_TIMESTAMP
FROM "BlockedDate";
