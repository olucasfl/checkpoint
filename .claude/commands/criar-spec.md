---
description: Escreve uma spec nova em docs/specs/ por entrevista dirigida, com critérios de aceite em BDD
argument-hint: <nome-da-feature>
---

Crie a spec de **$ARGUMENTS** em `docs/specs/$ARGUMENTS.md`, a partir de `docs/specs/_template.md`.

## Antes de perguntar qualquer coisa

Leia, nesta ordem: `.claude/rules/RULES.md`, `CLAUDE.md`, `ARCHITECTURE.md` e
`docs/specs/INDEX.md`. Se já existir spec ou plano para algo parecido, **diga isso e pergunte se é
para estender o que existe** em vez de criar arquivo novo.

## Como conduzir

Faça **perguntas direcionadas, uma de cada vez**, com opções quando fizer sentido. Cubra: objetivo
· comportamento esperado · contrato das rotas (se tocar `apps/api`) · modelo de dados (se tocar
`prisma/schema.prisma`) · o que entra em `packages/shared` · erros e limites · critérios de aceite
· fora de escopo.

**Não pergunte o que já está claro no pedido ou nas convenções do projeto — só o que realmente
muda o design.** Teto de **3 perguntas** antes de propor a spec. O que faltar, você assume um
padrão razoável, escreve na spec, e **sinaliza a suposição explicitamente**.

checkpoint ainda não tem entidades de domínio (`ARCHITECTURE.md` §1) — se a feature depende de um
modelo de dados que ainda não existe, a spec é o lugar certo para propor o shape; não assuma um
design de domínio de outra conversa ou de memória.

## Regras de conteúdo

- **Critérios de aceite em BDD**: `Dado <estado>, quando <ação>, então <resultado observável>`. Se
  a feature expõe rota HTTP, inclua pelo menos **um caminho de erro** (payload inválido, recurso
  inexistente) além do caminho feliz.
- Nada de "funciona corretamente" ou "está performático" — se não dá para outra pessoa verificar
  com um `curl` ou um passo de UI, não é critério.
- **A seção "Requisitos de saída" é literal**: método, path, DTO, response, códigos de erro (para
  API) ou campos/estados de tela (para web). É dela que `/qa-verify` monta a verificação.
- **Modelo de dados**: separe o que é aditivo do que é destrutivo (`RULES.md` §3). Mudança
  destrutiva precisa de aprovação humana explícita registrada na spec.
- Se a feature toca `apps/api` **e** `apps/web`, diga isso na spec e liste o contrato compartilhado
  que vai para `packages/shared` — não duplique o shape em cada lado.

## Ao terminar

1. Escreva o arquivo com `Status: rascunho`.
2. Adicione a linha correspondente em `docs/specs/INDEX.md`.
3. Liste as suposições que você fez, em bullets, e **pare** — a spec só vira `aprovada` com um "ok"
   explícito do humano. Não comece a implementar.
