# Rollback A4A

Esta migration é aditiva e preserva os campos legados de cliente em `Appointment`.

Antes do rollback, exporte `Client`, `Lead`, `FollowUp` e `RelationshipHistoryEvent`. Depois:

1. remova as constraints `Appointment_leadId_demoId_fkey` e `Appointment_clientId_demoId_fkey`;
2. remova `leadId` e `clientId` de `Appointment`;
3. remova, nesta ordem, `RelationshipHistoryEvent`, `FollowUp`, `Lead` e `Client`;
4. remova `Service_id_demoId_key` e os seis enums da A4A.

Os agendamentos, tokens, históricos A3B e campos legados `clientName`, `clientPhone` e `clientEmail` permanecem íntegros. Leads e histórico comercial criados após a migration não são recuperáveis sem o export prévio.
