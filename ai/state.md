---
project: AgendaFácil
updated_at: 2026-07-20
review_at: 2026-07-23
status: active
current_phase: null
technical_baseline: ad95e6d
source: validação executada na branch de preservação em 2026-07-20
source_of_truth: .
---

# Estado do projeto

## Último resultado confirmado

Trabalho local preservado integralmente na branch
`preserve/agendafacil-local-2026-07-20`, em dois commits acima de `ad95e6d`:
os 20 arquivos da fotografia em `256a996` e esta documentação em seguida.
`main` permanece em `ad95e6d`, sem merge e sem push.

Último commit de código conhecido em `main`: `ad95e6d` — `redesign: nova
landing com identidade Caderno de Horários`, presente no remoto.

Build e rotas da branch preservada foram validados em 2026-07-20. `npm ci` sem
alteração de lockfile; `vite build` sem erro nem aviso, gerando as três
entradas esperadas. Rotas, redirecionamentos legados e resolução de negócio
por caminho conferidos no Preview Deployment automático da própria branch.

O fluxo de dados continua sem validação: nenhuma chamada de API foi bem
sucedida em nenhum ambiente testado. Nada foi publicado em produção.

## Baseline técnica

`ad95e6d` — último commit de código validado conhecido.

`256a996` **não** substitui a baseline. Compila e roteia corretamente, mas
nenhuma tela chegou a carregar serviços, profissionais ou horários. Build
aprovado não é fluxo aprovado.

## git_snapshot

```text
observed_at: 2026-07-20
branch: preserve/agendafacil-local-2026-07-20
head_at_observation: 796cbaf
base: ad95e6d
main: ad95e6d (intacta, sem merge)
upstream: origin/preserve/agendafacil-local-2026-07-20
working_tree: limpa
arquivos_staged: 0
preview_deployment: dpl_8Mc914mPR3i7zGgKvfT7wEoobRWy (target preview, Ready)
producao: inalterada, último deploy de produção com 19 dias
```

Observação datada. Ficará anterior ao `HEAD` assim que o commit documental
desta operação for criado, e isso é correto.

## Classificação da working tree

Limpa. Os 18 arquivos rastreados modificados e os 2 diretórios não
rastreados foram versionados em `256a996`, com hashes conferidos antes e
depois da preservação.

## Trabalho em andamento

Não confirmado.

As alterações locais formam uma reestruturação coerente de rotas públicas e
identidade, mas não há decisão registrada, commit, teste ou publicação que
comprove intenção ou conclusão. O conjunto é tratado como trabalho não
confirmado até esclarecimento.

## Bloqueios

- Natureza e intenção das alterações ainda não confirmadas pelo autor.
- `VITE_API_URL` não está definida no ambiente Preview da Vercel. O bundle do
  preview não contém endereço de API, então nenhuma requisição é emitida e
  todas as seções dinâmicas caem direto no estado de indisponibilidade. Sem
  essa variável, o Preview Deployment não valida o fluxo de dados.
- O `.env` local aponta a API para `http://localhost:4000/api`. O build local
  herda esse endereço, e sem backend em execução o fluxo também não é
  exercitável nesta máquina.

## Riscos

- **Perda de trabalho — mitigado.** O conteúdo está versionado em `256a996` e
  publicado na branch de preservação. Deixa de depender de uma única máquina.
- **Fluxo de dados não validado.** Build, rotas e identidade estão conferidos;
  serviços, profissionais, horários e painel autenticado não.
- **Marca interna no endereço público.** O domínio
  `agendafacil-sistema.vercel.app` aparece em `canonical` e `og:url` das duas
  experiências. O corpo das páginas está limpo, mas o link compartilhado e o
  SEO ainda expõem o nome interno do produto.
- **Rota desconhecida devolve 404 da Vercel.** Com a remoção da reescrita
  coringa, um caminho inexistente deixa de cair na página neutra. Comportamento
  observado no preview; falta decidir se é o desejado.
- **Mistura de mudanças potencialmente independentes.** A remoção da landing
  comercial, a mudança de rotas e o ajuste de tratamento de erro podem ser
  decisões separadas versionadas como um bloco único.
- **Divergência com a documentação.** O README descreve o modelo anterior de
  rotas; publicar as alterações sem atualizá-lo amplia a defasagem.

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

## Validações não executadas

- Carregamento real de serviços, profissionais e horários.
- Fluxo de agendamento além da tela inicial.
- Login autenticado do painel administrativo.
- Saúde da API e do banco em produção.
- Página neutra como resposta a rota desconhecida na Vercel; hoje é 404.

## Divergências entre documentação e código

- `README.md` apresenta a raiz do site como demonstração pública e o painel em
  `/admin`. O código local serve página neutra na raiz e redireciona `/admin`.
  O README descreve `HEAD`; a working tree diverge.
- `projetos/registro.md` do SOR OS não foi atualizado nesta adoção.
  `/sync-registry` é a ação possível, não executada aqui.

## Próxima ação registrada

Definir `VITE_API_URL` no ambiente Preview da Vercel e revalidar o fluxo de
dados na branch de preservação, antes de decidir entre manter o commit WIP
único ou reorganizar as mudanças em commits temáticos.
