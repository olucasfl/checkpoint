---
description: Sobe a versão do projeto (root + workspaces) de forma consistente, com o porquê registrado
argument-hint: <major|minor|patch> [motivo]
---

Faça o bump de versão: **$ARGUMENTS**

## Por que este comando existe

O `version` de `package.json` (raiz e de cada workspace — `apps/api`, `apps/web`,
`packages/shared`) hoje é editado à mão e não está amarrado a nenhum processo de release/deploy
(`ARCHITECTURE.md` §1 — não existe CI/deploy configurado ainda). Este comando existe para que o
bump seja sempre uma decisão consciente e consistente entre os workspaces, não um valor que um
workspace atualiza e os outros esquecem.

## Procedimento

1. Mostre os valores atuais:
   ```
   grep -n "\"version\"" package.json apps/api/package.json apps/web/package.json packages/shared/package.json
   ```
2. Confirme o tipo de bump (`major`/`minor`/`patch`) e o motivo — peça se `$ARGUMENTS` não deixar
   claro. Sem changelog automatizado neste projeto ainda: o motivo vai na mensagem do commit.
3. Aplique o **mesmo** número em todos os `package.json` do monorepo (raiz + cada workspace) — não
   deixe um workspace ficar para trás. Todos partem de `0.1.0` hoje.
4. Verifique:
   ```
   npm run typecheck
   npm run build
   ```
5. Commit único, tipo `chore(release):`, mensagem citando o motivo do bump.

## Limites

- **Nunca** bumpe como efeito colateral de outra tarefa (feature, fix) — é sempre um commit
  separado e explícito.
- Este comando **não** cria tag git nem publica nada — não há pipeline de release configurado.
  Se/quando existir, este arquivo deve ser atualizado para refletir o processo real.
