---
project: AgendaFácil
updated_at: 2026-07-20
source: descoberta somente leitura na adoção ao padrão ai/
source_of_truth: .
---

# Escopo do projeto

## Produto principal

Sistema de agendamento online para negócios de serviço, composto por página
pública de agendamento e painel administrativo.

## Negócios existentes

- Studio Cut — barbearia.
- Lumière Estética — clínica de estética.

Empresas fictícias, usadas como prova funcional. Não são clientes.

## Funcionalidades confirmadas no código versionado

- Listagem de serviços e profissionais por negócio.
- Consulta de horários disponíveis por data, profissional e serviço.
- Criação de agendamento com confirmação.
- Painel administrativo com listagem de agendamentos, alteração de status,
  filtro por data e exportação CSV.
- Autenticação administrativa por sessão em cookie `httpOnly`.
- Identidade visual por negócio, aplicada por configuração.

Confirmadas como presentes no código. Não confirmadas como validadas em
produção nesta adoção.

## Alterações locais ainda não validadas

Existem na working tree e **não** podem ser consideradas concluídas:

- Endereços públicos diretos por negócio, substituindo `/demo/<slug>`.
- Build de múltiplas entradas no Vite, com um HTML por negócio.
- Redirecionamentos e reescritas correspondentes na Vercel.
- Remoção da landing comercial do AgendaFácil, substituída por uma página
  neutra de acesso direto.
- Remoção das estatísticas e depoimentos que não correspondiam a fatos
  verificáveis.
- Novas seções de conteúdo por negócio e mensagens de erro genéricas.

Aparecer no diff não é entrega. Nenhum desses itens tem build, teste ou
publicação confirmados.

## Decisões já estabilizadas

- Frontend e backend têm deploys separados, com variáveis próprias por
  ambiente.
- A identidade de cada negócio é centralizada em configuração, não espalhada
  em componentes.
- O backend distingue negócios por `demoId`.
- O idioma público é português; o alternador de idioma foi removido em
  `a2c61f3`.

## Roadmap antigo

O README descreve o projeto pelo modelo anterior de rotas e apresenta a raiz
do site como demonstração pública. Isso descreve o estado versionado em
`HEAD`, e conflita com as alterações locais. Trata-se de documentação
defasada, não de escopo pendente.

## Fora de escopo

- Cobrança, assinatura e checkout.
- Notificação por WhatsApp, e-mail ou SMS.
- Cadastro autônomo de novos negócios pela interface.
- Aplicativo nativo.
- Divulgação pública de preço ou modelo de assinatura.

## Limite explícito

Nenhuma alteração local pode ser tratada como escopo entregue antes de
decisão sobre a estratégia de preservação e de validação executada.
