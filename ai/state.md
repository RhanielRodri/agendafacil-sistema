---
project: AgendaFácil
updated_at: 2026-07-20
review_at: 2026-07-23
status: active
current_phase: null
technical_baseline: ad95e6d
source: descoberta somente leitura na adoção ao padrão ai/
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

Preservação é resultado confirmado. Validação não é: nenhum build, teste ou
deploy foi executado. Não há evidência atual de saúde de produção.

## Baseline técnica

`ad95e6d` — último commit de código validado conhecido.

Validação funcional: não confirmada. `256a996` preserva código ainda não
validado e por isso **não** substitui a baseline técnica.

## git_snapshot

```text
observed_at: 2026-07-20
branch: preserve/agendafacil-local-2026-07-20
head_at_observation: 256a996
base: ad95e6d
main: ad95e6d (intacta, sem merge)
upstream: origin/preserve/agendafacil-local-2026-07-20
working_tree: limpa
arquivos_staged: 0
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
- Build e rotas da reestruturação nunca foram executados. Sem isso, não há
  base para decidir a organização temática dos commits.

## Riscos

- **Perda de trabalho — mitigado.** O conteúdo está versionado em `256a996` e
  publicado na branch de preservação. Deixa de depender de uma única máquina.
- **Código não validado versionado.** `256a996` preserva; não prova. Nada ali
  passou por build, teste ou publicação.
- **Mistura de mudanças potencialmente independentes.** A remoção da landing
  comercial, a mudança de rotas e o ajuste de tratamento de erro podem ser
  decisões separadas versionadas como um bloco único.
- **Divergência com a documentação.** O README descreve o modelo anterior de
  rotas; publicar as alterações sem atualizá-lo amplia a defasagem.

## Validações confirmadas

Nenhuma.

## Validações não executadas

- Build do frontend com a configuração de múltiplas entradas.
- Comportamento das rotas diretas e dos redirecionamentos na Vercel.
- Página neutra na raiz após a remoção da reescrita coringa.
- Painel administrativo nas novas rotas.
- Saúde da API e do banco em produção.

## Divergências entre documentação e código

- `README.md` apresenta a raiz do site como demonstração pública e o painel em
  `/admin`. O código local serve página neutra na raiz e redireciona `/admin`.
  O README descreve `HEAD`; a working tree diverge.
- `projetos/registro.md` do SOR OS não foi atualizado nesta adoção.
  `/sync-registry` é a ação possível, não executada aqui.

## Próxima ação registrada

Validar o build e as rotas na branch de preservação antes de decidir a
organização temática.
