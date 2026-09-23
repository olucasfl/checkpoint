---
description: Investiga a causa raiz de um bug e corrige — sem editar código de produção antes de confirmar a causa
argument-hint: <descrição do bug ou teste falhando>
---

Bug: **$ARGUMENTS**

Aplique a skill **`bug-research`** integralmente. Ela não é sugestão: é o procedimento.

## O portão

**Não altere código de produção antes do passo 4** (causa raiz confirmada — por teste que falha,
quando o workspace tem runner, ou por reprodução manual documentada, quando não tem). Se você se
pegar editando um arquivo em `src/` antes de mostrar essa confirmação, pare e volte.

## Sequência

1. **Reproduzir** — local (`npm run dev`, depois `curl` contra `http://localhost:3333/api/...` ou
   passo a passo no browser em `http://localhost:5173`). Nunca contra um ambiente que não seja o
   seu Postgres/API local. Defina rota/tela, dado de entrada, e estado esperado × real.
2. **Localizar a causa raiz** — no backend: controller → pipe/DTO → service → Prisma, inteiro. No
   frontend: componente → hook/query → `apiClient` → resposta da API. Pergunte **por que** o valor
   errado chegou ali, e de novo para a resposta, até a causa virar "porque foi escrito assim".
3. **Hipótese** em uma frase testável.
4. **Confirmação** — teste que falha (workspace com runner) ou reprodução manual com evidência
   colada (workspace sem runner ainda). Se passar/funcionar de primeira, a hipótese está errada:
   volte ao passo 2.
5. **Corrigir** — a menor mudança possível. Delegue ao agente `bug-fixer` se o escopo for claro.
6. **Regressão** — o teste (se houver) fica no repo; rode `npm run typecheck`, `npm run lint`,
   `npm run build` no(s) workspace(s) afetado(s).

## Limites

- **Nunca** altere `apps/api/prisma/schema.prisma` como parte de uma correção de bug — vai por
  `/db-change`.
- **Nunca** afrouxe validação de DTO para fazer um teste passar.
- Se a correção mudar o contrato de uma rota ou de um tipo em `packages/shared`, **pare e
  pergunte**: o outro lado do monorepo muda em lockstep.
- Um bug por execução. Achou um segundo? Descreva e siga.
