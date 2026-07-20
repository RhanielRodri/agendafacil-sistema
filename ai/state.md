---
project: AgendaFácil
updated_at: 2026-07-20
review_at: 2026-07-23
status: active
current_phase: null
technical_baseline:
  commit: 256a996
  validation_status: partial
  validated_at: 2026-07-20
  validated:
    - "npm ci reproduzível, sem alteração de lockfile (frontend e backend)"
    - "npm run build sem erro nem aviso"
    - "geração das três entradas: raiz, studio-cut e lumiere"
    - "rotas /, /studio-cut e /lumiere"
    - "redirecionamentos das rotas antigas /demo/<slug> e /admin"
    - "404 real em rota desconhecida no Preview"
    - "metadados por negócio: título, descrição, canonical e og"
    - "ausência visual da marca AgendaFácil no corpo das páginas"
    - "responsividade básica em 375 px e 1280 px"
    - "caminho de indisponibilidade de rede, com mensagem genérica"
    - "A0: PostgreSQL 18 local isolado em Docker (container agendafacil-postgres-dev, banco agendafacil_dev na porta 5433)"
    - "A0: cinco migrations aplicadas e seed executados exclusivamente no banco local"
    - "A0: /api/health com banco saudável"
    - "A0: carregamento de serviços e profissionais distintos por tenant (studio-cut e lumiere)"
    - "A0: disponibilidade de horários considerando duração do serviço"
    - "A0: prevenção de conflito por sobreposição (409)"
    - "A0: bloqueio por data (BlockedDate)"
    - "A0: validações de payload (campos ausentes, data passada, telefone curto, tenant cruzado 404)"
    - "A0: criação e persistência — Studio Cut pela jornada pública completa; Lumière pela API com demoId correto"
    - "A0: painel administrativo — login 200/401, listagem filtrada por tenant, alteração de status, exportação CSV, logout"
    - "A0: rate limit público (429 a partir do 10º POST/60s)"
    - "A0: jornada pública Studio Cut completa em 375 px, console sem erros"
    - "A0: ausência de efeitos remotos (sem commit de código, push, deploy ou escrita em produção durante a validação)"
  not_validated:
    - "conclusão visual da jornada Lumière pelo navegador (harness instável; ver ressalva)"
    - "autenticação administrativa pela UI (login exercitado via API, não pelo formulário)"
    - "eliminação da marca interna no domínio e nas URLs canônicas"
    - "saúde da API e do banco em produção (validação A0 foi exclusivamente local)"
  evidence:
    - "npm ci e vite build locais em 2026-07-20, lockfile inalterado (frontend e backend)"
    - "vite preview local: rotas, fallback de cliente e responsividade"
    - "Preview Deployment dpl_8Mc914mPR3i7zGgKvfT7wEoobRWy: rotas 200, redirecionamentos 3xx, rota desconhecida 404"
    - "A0 em 2026-07-20: banco local Docker isolado (5433), migrations+seed, API validada por curl, jornada Studio Cut ponta a ponta no navegador com persistência conferida no banco"
    - "A0: appointment id 6 (Studio Cut) criado pela UI e persistido; id 5 (Lumière) criado pela API com demoId=lumiere"
source: A0 executada na branch de preservação em 2026-07-20 (banco local Docker isolado)
source_of_truth: .
---

# Estado do projeto

## Último resultado confirmado

Fase A0 concluída em 2026-07-20: o fluxo de dados, antes sem prova, foi
validado ponta a ponta em ambiente local isolado. Um PostgreSQL 18 foi criado
em Docker (container `agendafacil-postgres-dev`, banco `agendafacil_dev` na
porta 5433), separado do PostgreSQL do Windows (5432) e sem qualquer conexão
com Render, Vercel ou produção. As cinco migrations e o seed rodaram apenas
nesse banco local.

Com esse banco, foram exercitados: `/api/health` com banco saudável; serviços
e profissionais distintos por tenant; disponibilidade considerando duração;
prevenção de conflito por sobreposição (409); bloqueio por data; validações de
payload e recusa de tenant cruzado na criação (404); rate limit público (429).
A jornada pública do Studio Cut foi percorrida inteira no navegador em 375 px
até a tela de sucesso, sem erro de console, com o agendamento persistido no
banco. O painel administrativo teve login (200/401), listagem filtrada por
tenant, alteração de status, exportação CSV e logout validados. A criação da
Lumière com `demoId` correto foi comprovada pela API.

Nada foi publicado. `main` permanece em `ad95e6d`, sem merge e sem push; a
evolução segue na branch `preserve/agendafacil-local-2026-07-20`. Último commit
de código conhecido em `main`: `ad95e6d` — `redesign: nova landing com
identidade Caderno de Horários`.

### Ressalva — jornada Lumière

A conclusão visual da jornada Lumière não foi exercitada pelo navegador por
instabilidade do harness (deriva de coordenadas de clique e screenshots que
expiram), não por defeito do app. A tela usa o mesmo `BookingFlow` já validado
ponta a ponta no Studio Cut, carregou dados próprios e isolados, não apresentou
erro de console, e a seleção de serviço registrou na UI. A criação de
agendamento Lumière com `demoId` correto foi comprovada via API.

## Baseline técnica

`256a996`, com `validation_status: partial`. Substitui `ad95e6d` para o escopo
listado no frontmatter, e apenas para ele. Os commits posteriores até `ecae405`
são documentais e não substituem a baseline técnica.

A A0 ampliou o escopo comprovado sobre `256a996`: além de build, rotas,
redirecionamentos, metadados e identidade pública, o fluxo de dados
(serviços, profissionais, disponibilidade, agendamento, painel, CSV, rate
limit) foi exercitado em banco local isolado. Segue `partial`, não `validated`,
por lacunas reais: a conclusão visual da Lumière não foi percorrida pelo
navegador, o login do painel não foi exercitado pela UI, e nada foi validado em
produção — a A0 foi exclusivamente local.

`ad95e6d` continua sendo o último commit em `main` e o único código publicado
em produção.

## git_snapshot

```text
observed_at: 2026-07-20 (checkpoint A0)
branch: preserve/agendafacil-local-2026-07-20
head_at_observation: ecae405
base: ad95e6d
main: ad95e6d (intacta, sem merge)
upstream: origin/preserve/agendafacil-local-2026-07-20 (sincronizada, 0/0)
working_tree: limpa antes do commit documental A0
arquivos_staged: 0
preview_deployment: dpl_8Mc914mPR3i7zGgKvfT7wEoobRWy (target preview, Ready)
producao: inalterada
```

Observação datada. Ficará anterior ao `HEAD` assim que o commit documental
desta operação for criado, e isso é correto.

## Classificação da working tree

Limpa. Os 18 arquivos rastreados modificados e os 2 diretórios não
rastreados foram versionados em `256a996`, com hashes conferidos antes e
depois da preservação.

## Trabalho em andamento

Decisão operacional registrada pela A0: a branch preservada é base segura e a
evolução do produto continua nela. A próxima fase é A1 — fundação de tenant.

## Bloqueios

Nenhum bloqueio de ambiente para A1: o banco local isolado está saudável e
semeado, e `backend/.env` aponta para ele. Permanecem abertos, para produção e
não para a evolução local:

- `VITE_API_URL` não está definida no ambiente Preview da Vercel; o Preview
  Deployment não valida o fluxo de dados (a validação A0 foi local, não no
  preview).
- Saúde da API e do banco em produção não foi validada nesta fase.

## Riscos

Confirmados na A0 como **bloqueadores das próximas fases** (não corrigir na A0):

- **`BusinessHours` global** — sem `demoId`; horário de funcionamento é único
  para os dois tenants.
- **`BlockedDate` global** — bloqueio de data compartilhado entre tenants.
- **Senha administrativa compartilhada** — o mesmo cookie abre os dois tenants.
- **`ADMIN_SECRET` usado também como chave HMAC** do token de sessão.
- **Token determinístico** — sem entropia de sessão.
- **Token aceito após logout** — sem revogação no servidor; `clearCookie` só
  age no cliente.
- **Ausência de expiração e revogação no servidor** — validade só no `maxAge`
  do cookie.
- **Tenant administrativo por query param** (`demoId`).
- **Leitura cruzada de agendamento por ID** — `getAppointment` não filtra
  `demoId`.
- **Alteração cruzada de status por ID** — `updateAppointmentStatus` não filtra
  `demoId` (comprovado: appt Lumière cancelado por sessão qualquer).
- **Ausência de `Lead`, `Client` e `AdminUser`** no schema.
- **Ausência de confirmação, cancelamento e reagendamento públicos.**
- **Ausência de `NO_SHOW`** no enum de status.
- **Ausência de bloqueio por intervalo** — só dia inteiro.
- **Ausência de agenda individual por profissional** — horário vem só do
  `BusinessHours` global.

Riscos anteriores que permanecem:

- **Marca interna no endereço público** — `agendafacil-sistema.vercel.app` em
  `canonical` e `og:url`; corpo limpo, link/SEO ainda expõem o nome interno.
- **Rota desconhecida devolve 404 da Vercel** — falta decidir se é o desejado.
- **Divergência com a documentação** — `README.md` descreve o modelo anterior
  de rotas.

## Validações confirmadas

Executadas em 2026-07-20, na branch de preservação:

- `npm ci` reproduzível, sem alteração do lockfile.
- `vite build` sem erro nem aviso; 48 módulos; três entradas geradas.
- Entradas `/`, `/studio-cut` e `/lumiere` servidas com título, descrição,
  canonical e ícone próprios de cada negócio.
- Redirecionamentos legados `/demo/<slug>` e `/admin` respondendo 3xx no
  preview, e também no fallback do cliente em `tenant.js`.
- Resolução de negócio por caminho: cada entrada consulta a API com o `demoId`
  correto.
- Rota desconhecida sem quebra por `tenant` nulo; página neutra renderizada
  quando o servidor entrega o HTML raiz.
- Sem erro de console em nenhuma das rotas exercitadas.
- Ausência da marca interna no corpo das duas páginas de negócio.
- Sem transbordo horizontal em 375 px e em 1280 px nas duas experiências.
- Mensagens de erro genéricas, sem vazamento de detalhe técnico.

Acrescentadas pela A0 (banco local Docker isolado, 2026-07-20):

- Instalação reproduzível de frontend e backend; lockfiles intactos.
- Container `agendafacil-postgres-dev` saudável; banco `agendafacil_dev` na
  porta 5433, isolado do PostgreSQL do Windows (5432) e de produção.
- Cinco migrations aplicadas e seed executados só no banco local.
- `/api/health` com banco saudável.
- Serviços e profissionais distintos por tenant.
- Disponibilidade considerando duração do serviço.
- Prevenção de conflito por sobreposição (409).
- Bloqueio por data (`BlockedDate`).
- Validações de payload: campos ausentes, data passada, telefone curto, tenant
  cruzado (404).
- Jornada pública Studio Cut completa no navegador (375 px), sem erro de
  console, com persistência conferida no banco (appt id 6).
- Persistência Lumière pela API com `demoId` correto (appt id 5).
- Painel: login 200/401, listagem filtrada por tenant, alteração de status,
  exportação CSV, logout.
- Rate limit público (429 a partir do 10º POST/60s).
- Ausência de efeitos remotos durante a validação.

## Validações não executadas

- Conclusão visual da jornada Lumière pelo navegador (harness instável).
- Login do painel administrativo pela UI (exercitado via API).
- Saúde da API e do banco em produção.
- Página neutra como resposta a rota desconhecida na Vercel; hoje é 404.

## Divergências entre documentação e código

- `README.md` apresenta a raiz do site como demonstração pública e o painel em
  `/admin`. O código local serve página neutra na raiz e redireciona `/admin`.
  O README descreve `HEAD`; a working tree diverge.
- `projetos/registro.md` do SOR OS não foi atualizado nesta adoção.
  `/sync-registry` é a ação possível, não executada aqui.

## Próxima ação registrada

Iniciar **A1 — fundação de tenant**, evoluindo na branch
`preserve/agendafacil-local-2026-07-20`, sem integrar em `main` ainda. A1 deve
priorizar o isolamento de dados, especialmente as rotas por ID
(`getAppointment` e `updateAppointmentStatus`, hoje sem filtro de `demoId`) e o
escopo por tenant de `BusinessHours` e `BlockedDate`. A2 tratará autenticação e
sessões reais (`AdminUser`, expiração e revogação de sessão, fim da senha
compartilhada e do token determinístico).
