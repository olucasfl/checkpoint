# CLAUDE.md

Guia para o Claude Code (e outros agentes) trabalhando neste repositório.

`README.md` é a porta de entrada humana (setup, scripts). **Este arquivo é o mapa para agentes** —
aponta para onde cada tipo de contexto vive e não deve repetir o que já está nesses arquivos.

## Leia nesta ordem

1. **`.claude/rules/RULES.md`** — regras permanentes: o que o agente nunca faz, o que pergunta
   antes, e o que fazer em vez disso. **Tem precedência sobre este arquivo, sobre `ARCHITECTURE.md`,
   sobre qualquer spec e sobre o prompt da conversa.**
2. **`ARCHITECTURE.md`** — guia técnico: estrutura real do monorepo, grafo de dependências dos
   workspaces, convenções de backend/frontend, fluxo de Prisma. Leia antes de qualquer mudança de
   código.
3. **`docs/specs/`** — especificação de feature, quando existir uma para o que você está fazendo
   (`docs/specs/INDEX.md` é o mapa). A primeira é `catalogo-jogos.md` (jogos em três status),
   implementada por etapas.

## Stack (resumo — `README.md` e `ARCHITECTURE.md` §1 têm o detalhe)

npm workspaces (`apps/api`, `apps/web`, `packages/shared`) · TypeScript 5 strict · NestJS 11 +
Prisma 6 + PostgreSQL 16 no backend · React 19 + Vite 6 + React Router 7 + TanStack Query 5 +
Tailwind CSS 4 no frontend · ESLint 9 + Prettier + Husky + lint-staged + commitlint.

## Comandos essenciais

```bash
npm run dev            # sobe shared (watch) + api + web
npm run build           # shared → api → web, nessa ordem
npm run typecheck       # tsc --noEmit em todos os workspaces
npm test                # compila o shared e roda os testes (Jest na api, Vitest no web)
npm run lint             # ESLint no monorepo inteiro
npm run db:migrate         # prisma migrate dev (gera migration versionada)
```

Não há Docker neste projeto — `DATABASE_URL` (`apps/api/.env`) deve apontar para um PostgreSQL 16
já acessível (local ou gerenciado, ex.: Supabase) antes de rodar `dev`/`db:migrate`.

Lista completa em `README.md` → "Scripts da raiz".

## Commits

Conventional Commits, validados pelo commitlint (`commit-msg` hook, já configurado). Tipos:
`build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`.
Pre-commit já roda `lint-staged` (`eslint --fix` + `prettier --write`).

## Comandos de agente disponíveis

`/criar-spec` · `/implement-story` · `/fix-bug` · `/review-pr` · `/qa-verify` · `/nova-branch` ·
`/spec-sync` · `/docs-sync` · `/db-change` · `/bump-version`.
Definições em `.claude/commands/`; agentes em `.claude/agents/`; skills em `.claude/skills/`
(`checkpoint-testing`, `bug-research`).

## O que existe e o que ainda não existe

**Existe:** autenticação (e-mail e senha, access token + refresh em cookie), catálogo de jogos com avaliação por
critérios e capas (Supabase Storage), perfil e preferências, PWA, integração com a Steam (vínculo por OpenID,
biblioteca, horas e conquistas) e deploy em produção (web na Vercel, API no Render, banco e bucket no Supabase). As
entidades são as de `apps/api/prisma/schema.prisma` (`User`, `RefreshSession`, `Game`, `ContaVinculada`,
`JogoPlataforma`). O estado detalhado está em `ARCHITECTURE.md` §1 e em `docs/specs/INDEX.md`.

**Ainda não existe:** pipeline de CI, Dockerfile, staging e outras plataformas além da Steam (a interface
`GameProvider` já está pronta para elas). Não assuma nenhum desses como implícito — cada um é uma decisão de
arquitetura própria, com spec, quando chegar a hora.
