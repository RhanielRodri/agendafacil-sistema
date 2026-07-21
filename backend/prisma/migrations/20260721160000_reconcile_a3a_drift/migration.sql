-- Reconcilia o drift legado de 20260720210000_professional_schedules, escrita à
-- mão e divergente do modelo em dois pontos: DEFAULT CURRENT_TIMESTAMP nos
-- updatedAt, que o Prisma não gera para @updatedAt, e o nome do índice único,
-- truncado pelo PostgreSQL em 63 caracteres de forma diferente da do Prisma.
-- Nenhuma linha aqui altera dado, tipo, nullability ou unicidade.

ALTER TABLE "ProfessionalSchedule" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "ScheduleBlock" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- O rename só se aplica a banco que passou pela A3A. Onde o índice já tiver o
-- nome esperado, esta migration precisa ser inerte em vez de falhar.
DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM pg_class
        WHERE relkind = 'i'
          AND relname = 'ProfessionalSchedule_tenantId_professionalId_dayOfWeek_startTim'
     ) AND NOT EXISTS (
        SELECT 1 FROM pg_class
        WHERE relkind = 'i'
          AND relname = 'ProfessionalSchedule_tenantId_professionalId_dayOfWeek_star_key'
     )
  THEN
    ALTER INDEX "ProfessionalSchedule_tenantId_professionalId_dayOfWeek_startTim"
      RENAME TO "ProfessionalSchedule_tenantId_professionalId_dayOfWeek_star_key";
  END IF;
END $$;
