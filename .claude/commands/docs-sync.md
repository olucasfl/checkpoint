---
description: Confere se CLAUDE.md, ARCHITECTURE.md e docs/specs/INDEX.md batem com a realidade do código
---

Audite a documentação deste repo contra o estado real. Índice que mente é pior que índice que
falta: um agente que lê um `ARCHITECTURE.md` desatualizado toma decisão errada com confiança.

## O que conferir

**1. `CLAUDE.md` × arquivos reais**

- Todo caminho citado existe? (`ARCHITECTURE.md`, `.claude/rules/RULES.md`, `docs/specs/`)
- Os comandos e scripts citados batem com `package.json` da raiz?

**2. `ARCHITECTURE.md` × código**

- Cada afirmação verificável ainda é verdade? Cheque as mais caras de estar erradas: módulos
  listados em §4.4 contra `apps/api/src/modules/*` reais, features listadas em §5.4 contra
  `apps/web/src/features/*` reais, variáveis de ambiente em §8 contra os `.env.example` reais, e o
  status "não existe ainda" de auth/testes/PWA/deploy em §1 — algum desses deixou de ser verdade?
- Alguma seção descreve comportamento que o código não tem mais?

**3. `docs/specs/INDEX.md` × `docs/specs/`**

- Toda spec no disco está na tabela? Toda linha aponta para arquivo existente?
- O status (`rascunho`/`aprovada`/`implementada`/`obsoleta`) bate com o que o código realmente tem?

**4. `prisma/schema.prisma` × docs**

- Todo model novo aparece em `ARCHITECTURE.md` §7? Toda migration em `prisma/migrations/` tem
  contrapartida no schema atual (nada órfão)?

**5. Git**

- Alguma spec marcada `implementada` sem commit correspondente? (`git log --oneline -30`)

## Saída

| Arquivo | Linha | Afirma | Realidade | Gravidade |
| ------- | ----- | ------ | --------- | --------- |

Gravidade **alta** quando a afirmação errada levaria alguém a uma decisão ruim (ex.: "auth não
existe" quando já existe). **Baixa** quando é só cosmético.

Depois da tabela, proponha as correções — **e pare**. Aplique só com o "ok" do humano, num commit
de `docs:` separado do trabalho de feature.
