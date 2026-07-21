# A4B — operação do pipeline comercial

## Resultado

A4B foi aprovada localmente na branch
`preserve/agendafacil-local-2026-07-20`. A baseline técnica é exclusivamente o
commit `944a39cab23c555fc2634a2a5acdc9be6b4d7415` —
`feat: operacionaliza pipeline comercial`.

A fase transforma a fundação A4A em uma operação diária manual para leads e
follow-ups. Não inclui automação, métricas, notificações, pagamento, deploy ou
recursos da A5.

## Máquina de estados do Lead

Transições permitidas:

| Estado atual | Próximos estados |
| --- | --- |
| `NEW` | `CONTACTED`, `QUALIFIED`, `CONVERTED`, `LOST` |
| `CONTACTED` | `QUALIFIED`, `CONVERTED`, `LOST` |
| `QUALIFIED` | `CONVERTED`, `LOST` |
| `CONVERTED` | terminal |
| `LOST` | terminal |

`CONVERTED` e `LOST` só são alcançados pelas ações próprias de conversão e
perda. Reabertura de estado terminal e regressão de etapa retornam conflito. Uma
mudança operacional de estado ativo exige ao menos um `FollowUp` aberto; quando
necessário, a próxima ação pode ser criada na mesma transação.

## Prioridade e responsável

`LeadPriority` possui `LOW`, `NORMAL` e `HIGH`, com padrão `NORMAL`. Mudanças de
prioridade geram `LEAD_PRIORITY_CHANGED`. No Studio Cut, um pedido público com
urgência `TODAY` nasce com prioridade alta.

O responsável é um `AdminUser` ativo do mesmo tenant. IDs de outro tenant
retornam `404` e usuário inativo retorna conflito. Lead e follow-up podem ficar
sem responsável para formar uma fila explícita de não atribuídos. Alterações de
responsável geram `LEAD_OWNER_CHANGED`.

## Qualificação por vertical

A qualificação é JSON limitado a 4 KiB, validado por allowlist e registrado com
versão de schema.

Studio Cut aceita:

- primeira visita;
- serviço de interesse;
- profissional preferido;
- disponibilidade;
- nota comercial;
- aceite de qualquer profissional;
- melhor período de contato;
- interesse em encaixe imediato;
- urgência `TODAY`, `THIS_WEEK` ou `FLEXIBLE`.

Lumière aceita:

- primeira visita;
- procedimento de interesse;
- profissional preferido;
- disponibilidade;
- nota comercial;
- melhor período de contato;
- solicitação de avaliação;
- objetivo declarado;
- interesse em pacote.

Campos desconhecidos, profissional inativo/cross-tenant e termos clínicos ou
médicos são rejeitados. A atualização gera `LEAD_QUALIFICATION_UPDATED`.

## Próxima ação

`FollowUp` guarda vencimento, tipo, estado, responsável, criador, concluidor e
nota operacional. A lista identifica vencidos e não atribuídos. Concluir um
follow-up pode criar o próximo na mesma transação. Conversão ou perda cancela
todos os follow-ups abertos do Lead e registra `FOLLOW_UP_CANCELLED`.

## Motivos de perda

Os motivos estruturados são:

- `NO_RESPONSE`;
- `PRICE`;
- `NO_AVAILABILITY`;
- `CHANGED_MIND`;
- `NOT_A_FIT`;
- `DUPLICATE`;
- `OTHER`.

`OTHER` exige observação. A perda registra data, ator, motivo, observação,
transição de estado e quantidade de próximas ações encerradas.

## Conversão transacional

A conversão roda em transação `Serializable` com lock do Lead. Pode vincular um
agendamento existente ou criar um agendamento usando o motor de disponibilidade
vigente. Lead, Client e Appointment precisam pertencer ao mesmo tenant e ao
mesmo cliente; agendamento cancelado ou já vinculado a outro Lead é rejeitado.

Em sucesso, a operação vincula o Appointment, marca o Lead como `CONVERTED`,
encerra follow-ups abertos e grava a sequência de histórico. A repetição com o
mesmo agendamento é idempotente. Qualquer falha causa rollback integral.

## Notas append-only

Notas comerciais são eventos `NOTE_ADDED` no histórico de relacionamento. Não
há rota de edição ou exclusão. Conteúdo é sanitizado, limitado a 500 caracteres,
associado ao ator e não aparece em resposta pública. O histórico é ordenado por
data e ID.

## Paginação, busca e filtros

Leads, clientes e follow-ups aceitam paginação por `page`/`limit`, limite máximo
de 50 e ordem determinística. A API preserva a resposta legada em array quando
paginação não é solicitada.

O pipeline filtra por busca de nome/telefone/interesse, estado, origem,
prioridade, responsável, serviço, período de criação, follow-up vencido e falta
de próxima ação. Follow-ups também filtram por estado, tipo, responsável,
atribuição, vencimento, criação e texto.

## Pipeline e ficha do Lead

O painel apresenta cinco colunas (`NEW`, `CONTACTED`, `QUALIFIED`, `CONVERTED` e
`LOST`) sobre a página atual. Cada card permite ajustar prioridade e responsável,
mostra origem, interesse e próxima ação e abre a ficha completa.

A ficha reúne dados do cliente, etapa, prioridade, responsável, qualificação,
follow-ups, agendamentos relacionados, conversão, perda, notas e histórico com
ator. Não há drag-and-drop, métricas ou automação.

## Migration e rollback

A migration `20260721000000_operational_pipeline` foi aplicada somente no
PostgreSQL Docker local `agendafacil_dev`, porta 5433. O checksum persistido no
banco coincide com o SHA-256 do `migration.sql`:
`b452095798184c6ef61fd1d977608d2b44a8315d1799fd19cf6078477eb82b42`.

Os três valores de prioridade, oito campos, sete constraints e três índices da
A4B foram conferidos no banco. O procedimento manual e as perdas de dados
possíveis estão em `backend/prisma/migrations/20260721000000_operational_pipeline/ROLLBACK.md`.
Nenhum rollback foi executado.

## Validação local

- 149/149 testes backend: 114 preservados e 35 A4B;
- `prisma validate` e `prisma generate` aprovados;
- 14 migrations aplicadas e migration A4B sem drift;
- sintaxe válida em 34 arquivos JavaScript do backend;
- build Vite aprovado com 51 módulos e três entradas;
- `git diff --check` e varredura de segredos aprovados;
- Studio Cut: `WAITLIST`, urgência, prioridade alta, responsável, qualificação,
  nota, avanço de etapa e conversão com novo agendamento;
- Lumière: `EVALUATION`, qualificação sem dado clínico, sequência
  `NEW -> CONTACTED -> QUALIFIED`, rollback de slot inválido e conversão com
  Appointment válido;
- busca e filtros combinados retornaram somente o Lead esperado;
- isolamento de tenant confirmado na suíte e na troca de painel;
- mobile sem overflow e console final sem erros ou warnings de aplicação.

O `prisma migrate diff` global também aponta duas divergências anteriores à A4B:
defaults de `updatedAt` em `ProfessionalSchedule`/`ScheduleBlock` e o nome de um
índice de `ProfessionalSchedule`. A4B não altera essas tabelas; a correção exige
autorização separada para não reescrever migration aplicada nem ampliar o escopo.

## Limitações e riscos para A5

- paginação ainda é por offset, não cursor;
- rate limit em memória não coordena múltiplas instâncias;
- follow-up público depende de existir admin ativo e entra sem responsável;
- qualificação é validada pela aplicação, sem schema JSON no banco;
- não há drag-and-drop, métricas, automação ou notificações;
- retenção, exportação e exclusão por solicitação continuam sem política final;
- o drift legado de A3A precisa de decisão específica;
- rollout de A0–A4B fora do Docker local não foi validado;
- produção, Vercel, Render, `main` e remotos permaneceram inalterados.

## Próxima ação A5

A5 deve ser definida e autorizada separadamente. Antes de ampliar o produto,
recomenda-se decidir se o próximo ganho validável será produtividade operacional
manual ou automação, e tratar o drift legado sem editar migrations já aplicadas.
