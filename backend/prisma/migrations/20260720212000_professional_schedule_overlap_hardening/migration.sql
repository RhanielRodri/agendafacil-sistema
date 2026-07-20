ALTER TABLE "ProfessionalSchedule" DROP CONSTRAINT "ProfessionalSchedule_no_overlap";

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
);
