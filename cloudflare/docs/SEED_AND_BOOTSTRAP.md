# CF1A — Seed local e bootstrap administrativo

## Seed local

O seed `seed/0001_demo.sql` é aditivo e idempotente. Ele usa IDs sintéticos estáveis e `INSERT ... ON CONFLICT DO UPDATE`. Pode ser reaplicado em um D1 local já migrado sem duplicar linhas.

Fluxo local previsto:

```powershell
npm.cmd run db:migrate:local
npm.cmd run db:seed:local
```

O seed não apaga dados. Para recriar um banco local descartável, remova somente o estado local do Wrangler após confirmar o caminho e reaplique migrations/seed. Não versionar `.wrangler`, SQLite, logs ou dumps.

## Conteúdo sintético

- tenants Studio Cut e Lumière;
- serviços/tratamentos e preços em centavos;
- profissionais e associações;
- horários do negócio;
- janelas de profissionais com pausas;
- bloqueios demonstrativos gerais e individuais;
- settings públicos mínimos.

Não há clientes, leads, agendamentos, emails, identities, memberships, senhas, hashes, tokens ou dados pessoais no seed CF1A.

## Bootstrap administrativo remoto futuro

O bootstrap não faz parte do seed e não deve ser automatizado em CI. Quando houver autorização explícita para criar/configurar o D1 remoto:

1. obter o email autorizado diretamente do responsável;
2. normalizar com `trim().toLowerCase()` fora do repositório;
3. gerar um UUID de identity fora do Git;
4. no console autenticado do D1, inserir `admin_identities` e apenas as memberships necessárias;
5. não salvar SQL preenchido, screenshot, histórico exportado ou log no repositório;
6. testar 403 para tenant sem membership e acesso para tenant permitido;
7. remover qualquer arquivo temporário usado.

Modelo conceitual, deliberadamente sem email real:

```sql
INSERT INTO admin_identities (id, email, active, created_at, updated_at)
VALUES (:identity_id, :normalized_email, 1, :now, :now);

INSERT INTO admin_memberships (identity_id, tenant_id, role, active, created_at, updated_at)
VALUES (:identity_id, :tenant_id, 'ADMIN', 1, :now, :now);
```

Nunca colocar valores reais em migrations, seed, `.dev.vars`, exemplos, comandos versionados ou relatórios.

## Proibição de reset remoto

Não executar reset, `DROP TABLE`, exclusão em massa ou seed destrutivo em D1 remoto com dados. Correções remotas futuras devem usar migration nova, revisada e reversível no nível permitido pelo SQLite.
