DROP INDEX "Appointment_professionalId_date_time_key";

CREATE UNIQUE INDEX "Appointment_active_professional_date_time_key"
  ON "Appointment"("professionalId", "date", "time")
  WHERE "status" <> 'CANCELLED';

CREATE INDEX "Appointment_professionalId_date_time_idx"
  ON "Appointment"("professionalId", "date", "time");
