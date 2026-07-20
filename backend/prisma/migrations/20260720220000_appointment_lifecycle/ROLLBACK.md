# Rollback manual da A3B

Este rollback nunca deve ser executado sem exportar antes `Appointment`,
`AppointmentHistoryEvent` e `AppointmentAccessToken`. Ele remove links públicos,
histórico e vínculos de reagendamento.

1. Interromper escrita na API.
2. Exportar as três tabelas e conferir a quantidade por tenant.
3. Mapear `NO_SHOW` para um estado terminal aceito pela versão anterior, de
   preferência `CANCELLED`, conforme decisão operacional registrada no momento.
4. Remover as FKs e tabelas `AppointmentAccessToken` e
   `AppointmentHistoryEvent`.
5. Remover a FK, índices e colunas `rescheduledFromId` e
   `cancellationReason` de `Appointment`.
6. Recriar `AppointmentStatus` sem `NO_SHOW`, mapear `PENDING` para `NEW` e
   restaurar o default `NEW`.
7. Restaurar a aplicação anterior e validar contagens, tenants e conflitos.

O rollback não deve apagar agendamentos originais ou novos criados por
reagendamento. A relação entre eles precisa permanecer no arquivo exportado
para reconciliação manual.
