# Rollback A4B

Esta migration adiciona dados operacionais e preserva integralmente os registros da A4A. Antes do rollback, exporte os campos `priority`, `ownerUserId`, `qualification`, `qualificationVersion`, `lostReasonNote`, `lostAt` e `lostByUserId` de `Lead`, além de `ownerUserId` de `FollowUp`.

Para reverter localmente:

1. remova os três índices adicionados pela A4B;
2. remova as constraints `Lead_qualification_size_check`, `Lead_active_loss_fields_check` e `Lead_structured_loss_check`;
3. remova as três foreign keys de responsável e ator da perda;
4. remova as colunas adicionadas em `FollowUp` e `Lead`;
5. remova `AdminUser_id_tenantId_key` e o enum `LeadPriority`.

Os valores adicionados a `RelationshipHistoryType` são mantidos no rollback para não reescrever o enum em uso. Eventos A4B e qualificações não são recuperáveis sem o export prévio. Nenhum rollback deve ser executado fora do PostgreSQL Docker local sem uma autorização separada.
