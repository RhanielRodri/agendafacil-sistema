# Rollback — endurecimento do intervalo de bloqueio

O rollback restaura somente a versão anterior da constraint. Não remove dados.

```sql
ALTER TABLE "ScheduleBlock" DROP CONSTRAINT "ScheduleBlock_interval_check";

ALTER TABLE "ScheduleBlock"
ADD CONSTRAINT "ScheduleBlock_interval_check" CHECK (
    ("allDay" = true AND "startTime" IS NULL AND "endTime" IS NULL)
    OR
    ("allDay" = false
      AND "startTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "endTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "startTime" < "endTime")
);
```
