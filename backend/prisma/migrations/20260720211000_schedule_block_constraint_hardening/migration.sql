ALTER TABLE "ScheduleBlock" DROP CONSTRAINT "ScheduleBlock_interval_check";

ALTER TABLE "ScheduleBlock"
ADD CONSTRAINT "ScheduleBlock_interval_check" CHECK (
    ("allDay" = true AND "startTime" IS NULL AND "endTime" IS NULL)
    OR
    ("allDay" = false
      AND "startTime" IS NOT NULL
      AND "endTime" IS NOT NULL
      AND "startTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "endTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "startTime" < "endTime")
);
