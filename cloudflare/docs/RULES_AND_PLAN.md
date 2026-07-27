# CF1A — Regras preservadas e plano seguinte

## Tenant

- Studio Cut nunca lê ou altera Lumière e vice-versa.
- Slug do tenant vem da rota.
- IDs do outro tenant retornam 404 depois de autorizada a rota, ou 403 quando falta membership.
- `demoId`, `tenantId` e headers customizados do cliente não trocam o contexto.
- Toda consulta e toda escrita de negócio inclui `tenant_id`.

## Agendamento

- Apenas um agendamento ativo ocupa cada unidade de slot.
- Cancelamento remove os slots e libera o período.
- A duração do serviço reserva todas as unidades necessárias e impede sobreposição parcial.
- Duas reservas concorrentes para o mesmo período resultam em 201 e 409, sem duplicidade.
- Cliente, profissional e serviço pertencem ao tenant da rota.
- A associação profissional-serviço precisa existir e pertencer ao mesmo tenant.
- Confirmação, cancelamento, reagendamento e histórico preservam as transições atuais.

## Disponibilidade

- Dia fechado produz zero slots e permite `00:00–00:00`.
- Dia aberto exige abertura anterior ao fechamento.
- Janelas separadas do profissional preservam pausas.
- Bloqueio parcial remove somente slots sobrepostos.
- Bloqueio integral e `blocked_dates` zeram o dia.
- Horário do negócio limita cada janela do profissional.
- Slot só é publicado se toda a duração do serviço couber e estiver livre.

## Alterações estruturais

- Prévia calcula impacto sem escrita.
- Cancelar a prévia não grava.
- Confirmar recalcula o impacto na operação de escrita.
- Agendamentos afetados continuam ativos e não são movidos.
- `appliedImpact` representa o recálculo no momento da confirmação.

## Administração

- JWT válido não basta: a identidade e a membership precisam estar ativas.
- Identidade sem membership recebe 403.
- Membership de um tenant não concede outro.
- Identidade com duas memberships pode acessar ambos.
- Tenant em body, query ou header é ignorado.
- Não existe senha, PBKDF2, `AdminPassword`, `AdminSession` ou sessão própria.
- Toda rota administrativa declara o módulo exigido e o backend rejeita ausência de permissão.
- `professional` acessa somente agendamentos vinculados ao seu `professional_id`.
- O último owner ativo não pode ser rebaixado, desativado ou removido.
- Mudanças de role, permissões e ativação são gravadas em auditoria tenant-scoped.

## Cobertura de fundação CF1A

Os testes da fase devem provar:

- migrations em D1 vazio e foreign keys ativas;
- seed e segunda aplicação idempotente;
- checks de status, dinheiro e datas;
- FKs compostas e isolamento cross-tenant;
- regras básicas de disponibilidade e bloqueios;
- conflito por duração e concorrência 201/409;
- JWT válido/inválido, issuer, audience, expiração e email ausente;
- identity/membership e tentativa de troca de tenant.

## Seed e bootstrap

O seed D1 cria somente dados sintéticos de demonstração: os dois tenants, serviços/tratamentos, profissionais, associações, horários, janelas, bloqueios e settings necessários. Não cria identity, membership, email administrativo, senha, token ou sessão.

O bootstrap remoto, quando autorizado em fase posterior, é manual e separado do seed:

1. aplicar migrations sem reset;
2. inserir ou ativar `admin_identities` com email normalizado obtido fora do Git;
3. inserir memberships específicas por tenant;
4. validar Access antes de expor qualquer rota administrativa;
5. apagar arquivos temporários locais que contenham o email.

Reset destrutivo é permitido apenas em D1 local descartável. Nunca executar `DROP`, reset ou seed destrutivo em produção ocupada.

## Incompatibilidades abertas após CF1B

- O frontend atual ainda envia `demoId`, converte IDs para número e lê erro no formato Express; CF1D precisa usar slug na rota, IDs string e o envelope Cloudflare.
- Login/logout local do frontend precisa ser removido e substituído pelo fluxo Access.
- A captura pública de leads não foi portada porque não pertence ao ciclo de booking da CF1B.
- Export CSV precisa decidir streaming/limites no Worker.
- Queries agregadas de overview/metrics precisam ser reescritas em SQL SQLite e comparadas com fixtures.
- Semântica de transações longas do Prisma precisa ser decomposta em `DB.batch` e operações idempotentes.
- A prévia estrutural precisa carregar um identificador ou snapshot suficiente para recalcular com segurança.
- Static Assets ainda não contém o build do frontend.
- Rotas finais podem exigir compatibilidade temporária, mas tenant do cliente nunca será autoridade.

## Estimativa CF1B–CF1D

Estimativa técnica após o inventário, em dias líquidos de implementação e validação:

| Fase | Escopo | Estimativa |
|---|---|---:|
| CF1C | Admin Access, overview/agenda/agendamentos, clientes, leads, follow-ups e indicadores | 6–9 dias |
| CF1D | gestão estrutural, settings, assets/frontend, regressão E2E e preparação de deploy sem produção | 5–8 dias |

Restante atualizado: 11–17 dias líquidos. CF1C continua sendo o maior bloco por causa das consultas administrativas e indicadores; CF1D concentra adaptação do frontend, assets e regressão E2E.

## Gate para CF1B

CF1C só pode iniciar após CF1B manter verdes migrations/seed locais, todos os testes Cloudflare, 209 testes originais, TypeScript, dry-run dos dois Workers, build Vite e integração pública local completa, sem D1 remoto, deploy ou alteração dos arquivos originais.
