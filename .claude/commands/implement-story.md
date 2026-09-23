---
description: Implementa uma spec aprovada — plano curto primeiro, depois código e testes por critério
argument-hint: <caminho-da-spec>
---

Implemente **$ARGUMENTS**.

## 1. Contexto (antes de qualquer edição)

Leia: `.claude/rules/RULES.md` → `CLAUDE.md` → `ARCHITECTURE.md` (§2 workspaces, §4 backend, §5
frontend, §7 Prisma) → a spec passada.

Se a spec não tiver critérios de aceite em BDD, **diga isso** e proponha convertê-los antes de
codar — sem eles, `/qa-verify` não consegue provar nada depois. Se o `Status` da spec não for
`aprovada`, **pare e pergunte** antes de escrever qualquer código.

## 2. Plano curto, antes de editar

Apresente, em no máximo 15 linhas: arquivos que vão mudar, a ordem, e qual critério de aceite cada
passo fecha. **Pare e espere o "ok"** se o plano tocar algo que o `RULES.md` marca como "Perguntar
antes" — em especial mudança em `prisma/schema.prisma` ou dependência nova em `package.json`.

## 3. Implementar, em fatias verticais

Uma fatia = um critério fechado ponta a ponta, não "todos os models e depois todos os
controllers". No backend: model (se houver) → service → controller → DTO → teste. No frontend:
chamada de API/hook → componente → rota registrada em `app/router.tsx`. Contrato compartilhado
entra em `packages/shared/src` antes de ser usado dos dois lados (`ARCHITECTURE.md` §2/§6).

Obrigatório em toda rota nova do backend: DTO com validação (`class-validator`) e limites
razoáveis. Obrigatório em toda chamada nova do frontend: passar por `apiClient`
(`shared/lib/api-client.ts`), nunca um `axios`/`fetch` avulso.

## 4. Testar cada critério

Se o workspace afetado ainda não tem runner de teste configurado, siga a skill
`checkpoint-testing` para montá-lo primeiro — isso é parte da fatia, não uma tarefa separada
implícita. Depois, cada critério ganha ao menos um teste que falharia se o comportamento sumisse.

## 5. Verificar

```
npm run typecheck -w <workspace afetado>
npm run lint
npm test -w <workspace afetado>   # quando o runner existir
npm run build
```

Se a feature muda `prisma/schema.prisma`: rode `npm run db:migrate` para gerar a migration
localmente (`RULES.md` §3), e confira que o arquivo gerado em `prisma/migrations/` está no commit.

## 6. Fechar

- Atualize `ARCHITECTURE.md` se o comportamento mudou (módulo novo, feature nova, env var nova) —
  **no mesmo commit**.
- Atualize o status em `docs/specs/INDEX.md`.
- Commit com o **porquê** na mensagem, tipo Conventional Commit correto (`RULES.md` §6).

Se um critério não puder ser fechado, **diga qual e por quê** — não entregue silenciosamente
parcial.
