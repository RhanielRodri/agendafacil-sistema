---
project: AgendaFácil
updated_at: 2026-07-20
source: descoberta somente leitura na adoção ao padrão ai/
source_of_truth: .
---

# Contexto do projeto

## Identidade

AgendaFácil é um sistema de agendamento online para negócios de serviço:
página pública de agendamento para o cliente final e painel administrativo
para o dono do negócio.

`AgendaFácil` é o nome interno do produto. As experiências públicas são
apresentadas como negócios independentes, com marca, identidade visual e
endereço próprios. O nome do produto não é a marca exibida ao público.

## Arquitetura observada

Monorepo com duas aplicações independentes e deploys separados:

- `frontend/` — SPA React servida pela Vercel.
- `backend/` — API Express com Prisma, servida pelo Render.
- `docs/` — capturas de tela usadas no README.
- `render.yaml` — infraestrutura declarada do backend.

O frontend resolve o negócio ativo pelo caminho da URL, em
`src/config/tenant.js`, e carrega a configuração correspondente de
`src/config/demos/`. Cada negócio define identidade, textos, imagens e ordem
das seções. O backend distingue os negócios pelo parâmetro `demoId`.

## Stack confirmada

- Frontend: React 19, Vite 6, `@vitejs/plugin-react`. Playwright presente
  como dependência de desenvolvimento.
- Backend: Node com Express 4, Prisma 6, `cors`, `morgan`, `dotenv`.
- Banco: PostgreSQL no Render, conforme README e `render.yaml`.
- Sessão administrativa em cookie `httpOnly`, conforme README.

## Negócios existentes

- `studio-cut` — Studio Cut, barbearia em Vila Velha.
- `lumiere` — Lumière Estética, clínica de estética em Vila Velha.

Ambos são empresas fictícias, usadas como prova funcional do produto. As duas
configurações têm hoje o mesmo conjunto de chaves de topo.

## Integrações externas

- Imagens remotas do Unsplash, referenciadas por URL nas configurações.
- Google Fonts, carregadas pelos HTML de entrada.
- Nenhuma integração de pagamento, mensageria ou notificação observada.

## Configuração e variáveis

`.env.example` versionado em `backend/` e `frontend/`. Existem arquivos `.env`
locais não versionados, cujo conteúdo não foi aberto nesta adoção.

Nomes de variáveis exigidos, sem qualquer valor:

- Backend: `DATABASE_URL`, `PORT`, `FRONTEND_URL`, `NODE_ENV`, `ADMIN_SECRET`.
- Frontend: `VITE_API_URL`.

## Fontes autoritativas

1. Git observável do checkout atual.
2. Código e configuração no repositório.
3. `README.md`, com a ressalva de estar defasado quanto às rotas públicas.

## Estado multi-negócio observado

O modelo versionado em `HEAD` serve os negócios por rota de SPA sob
`/demo/<slug>`, com um único HTML de entrada e reescrita coringa na Vercel.

A working tree contém uma reestruturação não versionada para múltiplas
entradas: um HTML por negócio, endereços diretos `/studio-cut` e `/lumiere`,
e redirecionamentos dos caminhos antigos. Essa reestruturação existe apenas
localmente e não foi validada.

## Limites de confiança

- Nada foi executado nesta adoção: sem build, sem teste, sem lint, sem deploy.
- A saúde de produção não foi verificada. O README declarar deploy prova
  apenas que o deploy foi declarado.
- O conteúdo dos `.env` locais não foi lido; a ausência de segredo em arquivo
  versionado foi verificada apenas nos `.env.example`.
- As alterações locais foram lidas como diff, não executadas. Coerência de
  código não é prova de funcionamento.
- A intenção por trás das alterações locais é inferência a partir de
  evidência no próprio diff, não decisão registrada.
