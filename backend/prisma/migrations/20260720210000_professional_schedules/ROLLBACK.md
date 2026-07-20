# Rollback A3A — agenda profissional e bloqueios

Este rollback é manual, destrutivo para dados criados após a A3A e não deve ser
executado sem exportar `ProfessionalSchedule` e `ScheduleBlock`. Ele não altera
`Appointment`, `BusinessHours` nem `BlockedDate`.

```sql
DROP TRIGGER IF EXISTS "ScheduleBlock_tenant_guard" ON "ScheduleBlock";
DROP FUNCTION IF EXISTS "validateScheduleBlockTenant"();
DROP TABLE IF EXISTS "ScheduleBlock";
DROP TABLE IF EXISTS "ProfessionalSchedule";
DROP INDEX IF EXISTS "Professional_id_demoId_key";
```

`btree_gist` não é removida porque pode ser compartilhada por outros objetos do
banco. Depois do rollback, o código deve voltar ao commit anterior à A3A antes
de iniciar a API.
