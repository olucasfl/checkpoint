---
description: Revisão completa antes do PR — critérios de aceite e varredura de erros, em paralelo
argument-hint: [branch base, padrão main]
---

Revise a branch atual antes de abrir PR. Base: **${ARGUMENTS:-main}**.

## 1. Sanidade

```
git rev-parse --abbrev-ref HEAD
git diff --stat ${ARGUMENTS:-main}...HEAD
```

Se a branch atual for `main`, **pare** — não há PR a abrir contra si mesma. Se o diff estiver
vazio, diga isso e pare.

## 2. Dois revisores, em paralelo

Dispare os dois agentes **read-only**, na mesma mensagem:

- **`revisor-criterios`** — recebe a spec (`docs/specs/<feature>.md`), se existir. Devolve
  veredito por critério de aceite, com evidência.
- **`error-scanner`** — recebe o diff. Devolve os achados do checklist fixo de 12 itens (import
  cruzando workspace, `packages/shared` não agnóstico, segredo, `.env` no diff, log sensível,
  schema sem migration, schema destrutivo, DTO sem validação, módulo não registrado, `axios`
  duplicado, dependência não justificada, regra de domínio inventada).

Nenhum dos dois edita código. É isso que torna a saída deles confiável como portão.

## 3. Verificação mecânica

Rode nos workspaces tocados pelo diff:

```
npm run typecheck --workspaces --if-present
npm run lint
npm run build
npm test --workspaces --if-present    # onde já houver runner configurado
```

## 4. Síntese

Um veredito só, em três blocos:

- **Bloqueadores** — critério não atendido, achado crítico/alto, build ou typecheck quebrado.
  Qualquer um deles e o veredito é **não abrir**.
- **Corrigir antes do merge** — o que dá para resolver rápido.
- **Registrar como dívida** — o que fica, e onde foi anotado (`docs/specs/INDEX.md` ou
  `ARCHITECTURE.md`).

Confirme também a higiene: `docs/specs/INDEX.md` com o status em dia, `ARCHITECTURE.md` atualizado
se o comportamento estrutural mudou, e migration de Prisma commitada se o schema mudou.

**O agente antecede a revisão humana, nunca a substitui.** Diga isso no fecho.
