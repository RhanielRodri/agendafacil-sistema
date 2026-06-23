-- AddUniqueConstraint: prevents double-booking at the exact same slot (second-layer defense after transaction)
CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_professionalId_date_time_key"
  ON "Appointment"("professionalId", "date", "time");
