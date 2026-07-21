# A5B — gestão estrutural do negócio

## Resultado

A5B completa a administração estrutural de Studio Cut e Lumière dentro do shell
criado na A5A. Serviços, profissionais, disponibilidade, bloqueios, configurações
e indicadores passaram a ser módulos do painel novo; os CRUDs antigos deixaram de
existir como interface.

Validado localmente na branch `preserve/agendafacil-local-2026-07-20`,
exclusivamente no PostgreSQL Docker `agendafacil_dev` (porta 5433). Nenhum serviço
remoto foi alterado.

Fora do escopo, e não implementado: redesign público das duas verticais (A6 e A7),
receita, pagamento, comissão, estoque, notificação, WhatsApp, e-mail, webhooks,
login de profissional, múltiplos administradores e qualquer deploy.

## Arquitetura administrativa final

O shell resolve sessão e tenant e monta um módulo por vez. A navegação é a mesma
da A5A — `?m=<modulo>` por `history.replaceState`, sem reload entre módulos e com
parâmetros preservados na troca.

| Módulo | Arquivo | Responsabilidade |
| --- | --- | --- |
| Visão geral | `pages/admin/Overview.jsx` | resumo do dia e filas de atenção |
| Agenda | `pages/admin/Agenda.jsx` | dia operacional, filtros, disponibilidade |
| Leads | `pages/admin/Leads.jsx` | pipeline e ficha comercial |
| Clientes | `pages/admin/Clients.jsx` | busca, listagem e histórico |
| Follow-ups | `pages/admin/FollowUps.jsx` | vencidos, hoje, próximos |
| Serviços | `pages/admin/Services.jsx` | catálogo, ordem, ativação, dependências |
| Profissionais | `pages/admin/Professionals.jsx` | equipe, serviços associados, carga |
| Disponibilidade | `pages/admin/Availability.jsx` | horário do negócio e agenda individual |
| Bloqueios | `pages/admin/Blocks.jsx` | pausas e indisponibilidades |
| Indicadores | `pages/admin/Metrics.jsx` | agendamentos, capacidade, leads, clientes |
| Configurações | `pages/admin/Settings.jsx` | dados públicos e regras operacionais |

`Schedules.jsx` foi removido: Disponibilidade e Bloqueios cobrem tudo o que ele
fazia, com organização própria. A remoção só aconteceu depois de confirmar que
nenhuma rota, import ou navegação apontava mais para ele.

O catálogo administrativo (serviços e profissionais, incluindo inativos) passou a
ser carregado pelo shell e repassado aos módulos, com `onCatalogChange` para que
uma alteração estrutural reflita imediatamente nos filtros dos outros módulos.

## Serviços

Campos: nome, descrição curta, duração, preço opcional, ativo, ordem de exibição
e indicação de avaliação prévia (exibida apenas onde a vertical usa).

Regras aplicadas:

- serviço pertence ao tenant autenticado, sempre por `req.auth.tenantId`;
- duração inteira entre 5 e 480 minutos;
- **preço zero é diferente de preço não informado** — a coluna virou nullable e o
  painel tem um controle explícito "informar preço". `formatCurrency` devolve
  `null` para ausência, e as páginas públicas mostram "Sob consulta" em vez de
  "R$ 0,00";
- nome duplicado no mesmo tenant devolve 409; o mesmo nome em outro tenant é livre;
- serviço inativo some de `/services` e do agendamento público, e continua
  aparecendo no histórico e no painel;
- não há exclusão destrutiva: com histórico ou lead ativo, a saída é inativar;
- ID de outro tenant devolve 404.

Alterar a duração de um serviço com agendamentos futuros exige confirmação
explícita, porque muda o horário final de tudo que já está marcado.

## Profissionais

Campos: nome, especialidade, foto, contato interno opcional, ativo, ordem de
exibição, serviços realizados, agenda individual e carga semanal.

O vínculo profissional↔serviço passou a existir de fato, na tabela
`ProfessionalService`, com chave composta `(id, tenantId)` nas duas pontas — um
serviço de outro tenant não pode ser associado nem por engano: a rota devolve 404.

`PUT /admin/professionals/:id/services` substitui a lista inteira, o que torna a
operação idempotente. Inativar profissional com agendamento futuro exige
confirmação e nunca cancela nada.

## Horário geral do negócio

`BusinessHours` **manteve a estrutura de um intervalo por dia**. A avaliação foi
feita e a limitação está documentada aqui de propósito: pausas dentro do
expediente já são resolvidas por `ProfessionalSchedule` (que aceita múltiplos
intervalos) e por `ScheduleBlock`. Quebrar a unicidade `(tenantId, dayOfWeek)`
custaria migration destrutiva sem ganho operacional comprovado nesta fase.

O painel edita a semana inteira, valida abertura menor que fechamento, oferece
"copiar para os outros dias" no cliente e salva por upsert. Se o novo expediente
deixar agendamentos futuros fora da janela, a API recusa e devolve a lista de
conflitos até haver confirmação.

## Agenda individual e cópia de horários

`POST /admin/professional-schedules/copy` cobre as três cópias pedidas, por
`source`:

- `business` — copia o expediente do negócio para o profissional;
- `professional` — copia a semana de outro profissional;
- `day` — replica um dia do próprio profissional nos dias escolhidos.

`targetDays` limita o alcance; ausente, vale a semana inteira. A operação
substitui os dias alvo por completo e preserva os demais.

Regras preservadas: janela do profissional limitada pelo horário do negócio na
hora de calcular slots, sem sobreposição, múltiplos intervalos por dia e nenhum
recurso cross-tenant.

## Conflitos com agendamento futuro

Toda operação estrutural que pode descobrir um agendamento futuro monta a agenda
proposta inteira antes de gravar e compara com o que já está marcado. Havendo
impacto, a API responde **409** com:

```json
{ "message": "...", "code": "CONFLICT_REQUIRES_CONFIRMATION", "conflicts": [...] }
```

Nada é gravado nessa primeira resposta — ela é a própria prévia de impacto. Com
`confirm: true`, a alteração é aplicada e **os agendamentos continuam intactos**:
nenhuma operação cancela, move ou apaga agendamento, em nenhum caminho.

O impacto nunca vem do frontend. Cada requisição — prévia ou confirmação —
recalcula os agendamentos afetados a partir do banco naquele instante; `confirm`
só decide se o resultado vira 409 ou vira gravação. Por isso a resposta da
confirmação traz `appliedImpact`, o impacto recalculado no momento da aplicação,
que pode ser maior que o da prévia se um agendamento tiver entrado no meio. O
painel mostra essa diferença na mensagem de sucesso, em vez de absorvê-la em
silêncio. Operações com mais de uma escrita — horário do negócio e cópia de
agenda — gravam em `prisma.$transaction`.

`DELETE /admin/professional-schedules/:id` confirma por `?confirm=true` e responde
`204`, sem corpo e portanto sem `appliedImpact`.

Cobrem esse contrato: inativação de serviço e de profissional, mudança de duração
de serviço, edição e remoção de janela de agenda, cópia de horários, alteração do
horário do negócio e criação/edição de bloqueio.

O recorte de `conflicts` é deliberado — data, horário, fim, status, nome do
cliente, serviço e profissional. Não sai telefone, e-mail, `clientId` nem
qualquer campo interno.

## Bloqueios

Bloqueio geral do tenant ou de um profissional, dia inteiro ou intervalo parcial,
com motivo interno de até 200 caracteres. O filtro aceita `scope=future|past|all`
ou `from`/`to` explícitos, e filtro por profissional.

O motivo continua fora de qualquer rota pública: a disponibilidade pública usa o
bloqueio só para subtrair minutos. `BlockedDate` permanece como compatibilidade
legada, ainda respeitada pelo cálculo de slots, e deixou de ser interface.

## Configurações

`TenantSettings` tem relação 1:1 com `Tenant` e guarda nome público, telefone,
WhatsApp, endereço curto, timezone, duração de slot, antecedência mínima, limite
futuro, política de cancelamento, texto de confirmação e status de agendamento.

Validações: telefone com 10 a 13 dígitos, timezone de uma lista fechada, duração
de slot entre valores conhecidos, textos com limite e recusa de `<` e `>` para
impedir marcação. Nenhum segredo é armazenado, e não existe editor genérico de
site.

O recorte público (`GET /settings`) devolve só o que é do cliente final —
`slotDurationMinutes` e `minAdvanceMinutes` não saem.

**As configurações só passam a valer quando o tenant realmente as define.** Sem
registro em `TenantSettings`, a disponibilidade se comporta exatamente como antes
da A5B. Havendo registro, o agendamento público respeita duração de slot,
antecedência mínima, limite futuro e o status de agendamento (409 quando
desligado).

## Indicadores

`GET /admin/metrics?period=today|7d|30d|custom&from=&to=`, com período
personalizado limitado a 92 dias.

- **Agendamentos** — total, por status, reagendados, taxa de comparecimento
  (concluídos ÷ encerrados), taxa de cancelamento (cancelados ÷ total) e taxa de
  não comparecimento (no-show ÷ encerrados). As bases aparecem na tela.
- **Capacidade** — expediente aberto por dia e por profissional, menos bloqueios,
  comparado à duração agendada. Ocupação por profissional e por serviço, e
  estimativa de horários pela duração de slot configurada. Não existe tabela de
  capacidade: tudo é derivado do que já está no banco.
- **Leads** — criados, etapa atual, conversão total e por origem, sem responsável,
  sem próxima ação e tempo médio até a primeira ação. Esse tempo só é calculado
  com até 500 leads no período; acima disso o campo volta `null` em vez de virar
  estimativa.
- **Follow-ups** — criados, concluídos, vencidos e atraso médio dos concluídos.
- **Clientes** — novos, com atendimento no período, com mais de um agendamento e
  sem retorno recente. "Sem retorno recente" é regra fechada e exposta na tela:
  tem atendimento concluído e o mais recente é anterior a 90 dias.

Não há receita, lucro, ticket médio, ROI, crescimento ou projeção — o sistema não
tem base para afirmar nada disso.

## Diferenças por vertical

O core é o mesmo; muda o vocabulário e o destaque.

| | Studio Cut | Lumière |
| --- | --- | --- |
| Serviço | Serviços | Procedimentos |
| Profissional | Barbeiros | Profissionais |
| Avaliação prévia | não exibida | campo disponível no serviço |
| Destaques dos indicadores | ocupação por barbeiro, serviços mais agendados, encaixes, recorrência, no-show | avaliações, duração ocupada, leads qualificados, interesse em pacote, reagendamentos |

Nenhum dado clínico é armazenado ou exibido. A autoridade de tenant continua
inteiramente no backend.

## APIs

Todas as rotas abaixo derivam o tenant de `req.auth.tenantId` e devolvem 404 para
ID de outro tenant.

```text
GET    /admin/services                      listar paginado, buscar, filtrar por situação
POST   /admin/services
PATCH  /admin/services/order                reordenar
PATCH  /admin/services/:id
PATCH  /admin/services/:id/active
GET    /admin/services/:id/dependencies
GET    /admin/professionals
POST   /admin/professionals
PATCH  /admin/professionals/order
PATCH  /admin/professionals/:id
PATCH  /admin/professionals/:id/active
PUT    /admin/professionals/:id/services
GET    /admin/professionals/:id/dependencies
GET    /admin/business-hours
PUT    /admin/business-hours
POST   /admin/professional-schedules/copy
GET    /admin/settings
PATCH  /admin/settings
GET    /admin/metrics
GET    /settings                            recorte público, tenant por demoId
```

Paginação com limite máximo de 50, ordenação determinística
(`displayOrder`, depois `name`), payload por lista branca e agregações em vez de
consultas por linha: a listagem de serviços resolve agendamentos futuros de toda
a página em um `groupBy`, e a de profissionais faz o mesmo para agendamentos e
carga semanal.

## Migration e drift legado

Migration `20260721120000_structural_management`, **estritamente aditiva**:

- `ProfessionalService` e `TenantSettings` criadas;
- `Service.displayOrder`, `Service.requiresEvaluation` e `Professional.displayOrder`,
  `Professional.internalContact` adicionados com default;
- `Service.price` passou a aceitar `NULL`;
- dois índices novos para a ordenação do painel.

Foi escrita à mão a partir do diff do Prisma, com as três instruções do drift
legado removidas, e aplicada com `prisma migrate deploy` — nunca `migrate dev`,
nunca reset, nenhuma migration antiga editada e nada aplicado remotamente.

O drift da A3A **permanece inalterado e não corrigido**:

- `ProfessionalSchedule.updatedAt` com default no banco;
- `ScheduleBlock.updatedAt` com default no banco;
- índice `ProfessionalSchedule_tenantId_professionalId_dayOfWeek_startTim` com
  nome divergente.

Conferido antes e depois: o diff entre banco e schema continua apontando
exatamente essas três linhas, e nenhuma outra. As tabelas novas foram criadas sem
default em `updatedAt`, para não repetir a origem do problema. O drift continua
exigindo fase própria de reconciliação antes de qualquer rollout remoto.

## Compatibilidade pública

Preservados: booking público, listagem de serviços e profissionais ativos,
disponibilidade, criação, cancelamento, reagendamento e gestão por link.

Mudanças no público, todas necessárias para refletir dados estruturais reais:

- ordenação por `displayOrder` em `/services` e `/professionals`;
- preço ausente exibido como "Sob consulta";
- disponibilidade respeitando as configurações do tenant, quando existem;
- `GET /settings` para o recorte público das configurações.

Nenhum redesign público foi feito.

## Dados de demonstração

O seed continua fictício e idempotente. A A5B acrescentou ordem de exibição, um
serviço inativo por vertical ("Pezinho" no Studio Cut, "Peeling de diamante" na
Lumière, ambos sem preço), avaliação prévia na harmonização facial, a associação
profissional↔serviço com combinações diferentes por profissional e as
configurações dos dois negócios — com antecedência mínima de 1 hora no Studio Cut
e 3 horas na Lumière.

Nada sugere receita, número real de clientes, depoimento, certificação ou
resultado comercial.

## Limitações conhecidas

- `BusinessHours` segue com um intervalo por dia.
- Paginação continua por offset, não por cursor.
- Rate limit em memória segue sem coordenação entre instâncias.
- Ordenação é feita por botões de subir/descer, sem drag-and-drop.
- Capacidade é calculada em memória sobre o período, com o teto de 92 dias.
- Tempo médio até a primeira ação não é calculado acima de 500 leads no período.
- `booking.css` ainda aplica `input, select { width: 100% }` globalmente.
- Nada foi exercitado fora do Docker local.

## Rollback

A fase é revertível em duas camadas independentes:

1. **Código** — voltar ao commit de baseline da A5A (`5b69d9f`) restaura o painel
   sem os módulos estruturais. As colunas e tabelas novas ficam no banco sem uso,
   porque todas são opcionais ou têm default.
2. **Banco** — reverter a migration exige apenas remover `ProfessionalService`,
   `TenantSettings`, as quatro colunas novas e os dois índices, e devolver
   `Service.price` a `NOT NULL` depois de preencher os nulos. Nenhum dado
   pré-existente foi alterado, movido ou apagado pela migration.

Não existe caminho de rollback pendente em produção: nada foi publicado.

## Testes

204 testes verdes: os 169 preservados e 35 casos A5B em `tests/structural.test.js`,
cobrindo criação e duplicidade de serviço, inativação com histórico, dependências,
criação e associação de profissional, 404 cross-tenant, conflito com agendamento
futuro, horário geral válido e inválido, múltiplos intervalos, cópia de horários,
bloqueio parcial e geral, bloqueio sobre agendamento marcado, configurações por
tenant, timezone, antecedência mínima, limite futuro, agendamento desativado,
indicadores de agendamento, taxas, ocupação, leads por etapa, conversão por
origem, follow-ups vencidos, clientes recorrentes, período personalizado,
isolamento entre tenants, paginação, ordenação, rotas anteriores preservadas,
ausência de dado interno no payload, sessão inválida e idempotência do seed.
