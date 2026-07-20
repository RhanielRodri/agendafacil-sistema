# Rollback manual do reuso de slot cancelado

Antes de reverter, verificar se há mais de um agendamento no mesmo conjunto
`professionalId + date + time`. A versão anterior não aceita duplicidade nem
mesmo quando os registros antigos estão cancelados.

1. Exportar os grupos duplicados e decidir qual registro preservar.
2. Remover `Appointment_active_professional_date_time_key` e
   `Appointment_professionalId_date_time_idx`.
3. Recriar `Appointment_professionalId_date_time_key` como índice único sem
   filtro somente depois de eliminar todas as duplicidades.

Reverter sem a reconciliação bloqueia a criação do índice anterior e pode
impedir a restauração da versão antiga.
