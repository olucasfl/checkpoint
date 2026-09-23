# Spec: <nome da feature>

> Status: rascunho | aprovada | em andamento | implementada | obsoleta

## Objetivo

<Uma frase: o que esta feature permite ao usuário do checkpoint que hoje não é possível.>

## Stack

<Só o que diverge do padrão da casa. Se seguir `ARCHITECTURE.md` inteiro, escreva "padrão da casa"
e siga em frente. Se divergir (biblioteca nova, padrão diferente), diga **o quê** e **por quê** —
lembre que dependência nova exige aprovação (`RULES.md` §9).>

## Comportamento esperado

- <entrada / ação do usuário> → <saída / efeito observável>
- <regra de negócio>
- <o que acontece no erro: mensagem, status, estado da UI>
- <o que acontece no caso vazio (lista sem itens, recurso inexistente)>

## Requisitos de saída

<O contrato. Para rota de API: método, path (já com o prefixo `/api`), shape do DTO de entrada,
shape do response, códigos de erro. Para tela: quais campos aparecem, em que ordem, em que estado.
Este bloco é o que `/qa-verify` usa para montar a evidência — seja literal.>

## Modelo de dados

<Se a feature exige model novo ou campo novo em `apps/api/prisma/schema.prisma`: descreva o shape
e classifique — aditivo (model novo, campo opcional novo) ou destrutivo (campo removido, tipo
alterado, obrigatório novo em tabela com dados). Destrutivo exige aprovação explícita
(`RULES.md` §3) e passa por `/db-change` na implementação. Se não houver mudança de schema,
escreva "n/a".>

## Contrato compartilhado

<O que vai para `packages/shared/src` (tipos de request/response usados por `apps/api` e
`apps/web` ao mesmo tempo). Se a feature é só de um lado (ex. só UI, sem rota nova), escreva
"n/a".>

## Critérios de aceite (testáveis, em BDD)

- [ ] **Dado** <estado inicial>, **quando** <ação>, **então** <resultado observável>.
- [ ] **Dado** <estado inicial>, **quando** <ação>, **então** <resultado observável>.

<Regras para escrever um critério útil:
— o "então" tem que ser verificável por alguém que não escreveu o código (um `curl`, um clique);
— nada de "funciona corretamente", "está performático", "a UI está boa";
— um critério por comportamento, não um critério por tela/rota inteira;
— se a feature expõe rota HTTP, inclua pelo menos um critério de payload inválido.>

## Plano de testes

- **Unitário (Jest no backend / Vitest no frontend):** <quais arquivos, o que cada um cobre — ver
  skill `checkpoint-testing` se o workspace ainda não tem runner configurado>
- **Manual:** <o que só dá para verificar rodando a aplicação de ponta a ponta>

Loop de verificação por tarefa:
`npm run typecheck -w <workspace>` → `npm test -w <workspace>` (quando existir runner) →
`npm run lint` → `npm run build` → commit.

## Fora de escopo

- <o que NÃO faz parte desta entrega, registrado para não voltar como "faltou">
- <separe explicitamente **feature do produto** de **passo de processo**: rodar a migration,
  atualizar `ARCHITECTURE.md`, configurar o runner de teste são processo, não critério de aceite>

## Notas de ambiente

- <variável de ambiente nova em `apps/api/.env`/`apps/web/.env` (e o `.env.example`
  correspondente), dependência nova (`RULES.md` §9) — tudo que exige decisão explícita.>

## Questões em aberto

- [ ] <pergunta que muda o design e ainda não foi respondida — se não houver, escreva "Nenhuma">
