# AgendaFacil - Sistema de Agendamento Online

AgendaFacil e uma aplicacao full stack para pequenos negocios aceitarem agendamentos online. A V1 usa a marca ficticia **Studio Cut**, uma barbearia onde o cliente escolhe servico, profissional, data e horario disponivel sem ligacao e sem espera.

## Stack

- Frontend: React, Vite e CSS puro
- Backend: Node.js e Express
- Banco: PostgreSQL
- ORM: Prisma
- Deploy planejado: Vercel para frontend e Render para backend

## Funcionalidades

- Home publica com navbar, hero, servicos, profissionais, depoimentos e footer
- Cards de servico clicaveis que iniciam o fluxo de agendamento
- Fluxo de agendamento em 3 etapas
- Tela de sucesso com resumo do agendamento
- Estados de loading, erro e vazio
- Painel admin em `/admin`
- Cards de metricas por dia, semana e status
- Lista de proximos agendamentos
- Lista geral de agendamentos
- Alteracao de status do agendamento
- Listagem de servicos e profissionais

## Fluxo do usuario

1. O cliente acessa a home do Studio Cut.
2. Escolhe um servico ativo.
3. Escolhe profissional, data e horario disponivel.
4. Preenche nome, telefone e e-mail.
5. Revisa os dados e confirma.
6. Recebe uma tela de sucesso com o resumo.

## Regras de negocio

- O servico precisa existir e estar ativo.
- O profissional precisa existir e estar ativo.
- A data nao pode estar bloqueada.
- O horario precisa estar dentro do funcionamento do dia.
- O horario nao pode estar ocupado pelo mesmo profissional na mesma data.
- Todo novo agendamento inicia com status `NEW`.
- Status aceitos: `NEW`, `CONFIRMED`, `COMPLETED` e `CANCELLED`.
- Nao e permitido alterar `CANCELLED` para `COMPLETED`.
- Horarios disponiveis sao gerados de 30 em 30 minutos.
- Dias fechados ou bloqueados retornam lista vazia de horarios.

## Endpoints

| Metodo | Rota | Descricao |
| --- | --- | --- |
| GET | `/api/health` | Verifica saude da API |
| GET | `/api/services` | Lista servicos ativos |
| GET | `/api/professionals` | Lista profissionais ativos |
| GET | `/api/appointments` | Lista agendamentos |
| GET | `/api/appointments/:id` | Busca um agendamento |
| POST | `/api/appointments` | Cria um agendamento |
| PATCH | `/api/appointments/:id/status` | Altera status |
| GET | `/api/available-slots?date=&professionalId=&serviceId=` | Lista horarios disponiveis |
| GET | `/api/business-hours` | Lista horarios de funcionamento |

## Models

### Service

- `id`
- `name`
- `description`
- `duration`
- `price`
- `active`
- `createdAt`
- `updatedAt`

### Professional

- `id`
- `name`
- `specialty`
- `photo`
- `active`
- `createdAt`
- `updatedAt`

### Appointment

- `id`
- `serviceId`
- `professionalId`
- `clientName`
- `clientPhone`
- `clientEmail`
- `date`
- `time`
- `status`
- `createdAt`
- `updatedAt`

### BusinessHours

- `id`
- `dayOfWeek`
- `openTime`
- `closeTime`
- `isOpen`

### BlockedDate

- `id`
- `date`
- `reason`
- `createdAt`

## Como rodar localmente

### Backend

Crie um banco PostgreSQL chamado `agendafacil` e configure o `.env`.

No PowerShell:

```powershell
cd backend
npm.cmd install
Copy-Item .env.example .env
npm.cmd run prisma:generate
npm.cmd run prisma:migrate
npm.cmd run prisma:seed
npm.cmd run dev
```

A API roda por padrao em:

```text
http://localhost:4000/api
```

### Frontend

No PowerShell:

```powershell
cd frontend
npm.cmd install
Copy-Item .env.example .env
npm.cmd run dev
```

O frontend roda por padrao em:

```text
http://localhost:5173
```

## Variaveis de ambiente

### Backend

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agendafacil?schema=public"
PORT=4000
FRONTEND_URL="http://localhost:5173"
```

### Frontend

```env
VITE_API_URL=http://localhost:4000/api
```

## Comandos Prisma

```powershell
npm.cmd run prisma:generate
npm.cmd run prisma:migrate
npm.cmd run prisma:seed
```

## Deploy automatizado

### Ordem recomendada

1. Suba o repositorio para o GitHub.
2. Conecte o repositorio no Render como Blueprint usando `render.yaml`.
3. Aguarde o Render criar o PostgreSQL e o Web Service do backend.
4. Copie a URL publica do backend no Render.
5. Configure `VITE_API_URL` na Vercel com a URL do backend + `/api`.
6. Rode o deploy do frontend pela Vercel CLI.

Ainda sera necessario autenticar as contas uma vez no Render, GitHub e Vercel.

### Backend no Render Blueprint

O arquivo `render.yaml` na raiz cria:

- PostgreSQL: `agendafacil-db`
- Web Service: `agendafacil-api`
- Root directory: `backend`
- Build command: `npm install && npx prisma generate && npx prisma migrate deploy && node prisma/seed.js`
- Start command: `npm start`
- `DATABASE_URL` preenchido automaticamente via `fromDatabase`
- `FRONTEND_URL` como placeholder para atualizar depois com a URL da Vercel

Depois que a Vercel gerar a URL do frontend, atualize `FRONTEND_URL` no Render para:

```text
https://SEU-FRONTEND.vercel.app
```

### Frontend na Vercel CLI

- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Variavel: `VITE_API_URL` com a URL publica do backend no Render

Instale e autentique a Vercel CLI:

```powershell
npm i -g vercel
vercel login
```

Configure a variavel de producao:

```powershell
cd frontend
vercel env add VITE_API_URL production
```

Use o valor no formato:

```text
https://SUA-API.onrender.com/api
```

Rode o deploy:

```powershell
vercel
vercel --prod
```

## Melhorias futuras

- Autenticacao para admin
- Cadastro e edicao de servicos
- Cadastro e edicao de profissionais
- Bloqueio de datas pelo painel
- Confirmacao por WhatsApp
- Notificacoes por e-mail
- Relatorios financeiros simples

## Screenshots

Adicione aqui prints da home, fluxo de agendamento e painel admin.
