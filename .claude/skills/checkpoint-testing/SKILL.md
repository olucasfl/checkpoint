---
name: checkpoint-testing
description: Convenções de teste do checkpoint (Jest no backend NestJS, Vitest no frontend React) e como configurar cada runner quando ele ainda não existir no workspace. Use ao escrever qualquer teste novo, ao testar um módulo/feature nova, ou ao decidir como cobrir código que fala com Prisma ou com a API.
---

# Testes no checkpoint

**Nenhum dos dois workspaces tem runner de teste configurado hoje** (`ARCHITECTURE.md` §1) — nem
Jest em `apps/api`, nem Vitest em `apps/web`. Isso não é uma lacuna a ignorar: é o primeiro passo
antes do primeiro teste real de cada workspace.

## Configurar o runner (uma vez por workspace, quando faltar)

**Backend (`apps/api`) — Jest**, é o padrão do `@nestjs/cli`:

```bash
npm install -D jest @types/jest ts-jest @nestjs/testing -w @checkpoint/api
```

Configuração mínima em `apps/api/package.json` (bloco `"jest"`) ou `jest.config.ts`: `preset:
'ts-jest'`, `testEnvironment: 'node'`, `rootDir: 'src'`, `testRegex: '.*\\.spec\\.ts$'`. Adicione o
script `"test": "jest"` (e `"test:watch"`, `"test:cov"`) em `apps/api/package.json`.

**Frontend (`apps/web`) — Vitest + React Testing Library**, é o que já combina com o Vite existente:

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom -w @checkpoint/web
```

Configuração em `vite.config.ts` (bloco `test`) ou `vitest.config.ts` separado: `environment:
'jsdom'`, `globals: true`, `setupFiles` com o import de `@testing-library/jest-dom`. Adicione
`"test": "vitest run"` (e `"test:watch"`, `"test:cov"`) em `apps/web/package.json`.

Registre o script novo também em `npm test --workspaces --if-present` da raiz funcionando sem
alterar `package.json` da raiz — os scripts de workspace já são alcançáveis por
`npm run <script> -w <workspace>`.

## Onde o teste mora

Ao lado do arquivo: `games.service.ts` → `games.service.spec.ts` (backend, Jest) ou
`GameCard.tsx` → `GameCard.test.tsx` (frontend, Vitest). Um arquivo de teste por arquivo de
produção com lógica — não crie um `__tests__/` paralelo.

`*.module.ts` e `main.ts` (backend), `main.tsx` (frontend) ficam fora de qualquer meta de
cobertura — são fiação de bootstrap, não comportamento.

## Backend: nada de banco real, nada de rede real

**`PrismaService` é sempre mockado como objeto simples de `jest.fn()`s** — só os métodos que aquele
teste realmente usa. Nunca instancie `PrismaClient` real, nunca aponte para o Postgres de
desenvolvimento.

```ts
const prisma = {
  game: { findMany: jest.fn(), create: jest.fn() },
} as unknown as PrismaService;

const service = new GamesService(prisma);
```

Se o serviço um dia chamar uma API externa, mocke no nível do módulo (`jest.mock('axios')` ou
`global.fetch = jest.fn()`) — nenhum teste desta suíte deve fazer chamada de rede real.

## Frontend: mockar `apiClient`, não `fetch` global

Toda chamada à API passa por `apiClient` (`apps/web/src/shared/lib/api-client.ts`). Em teste de
componente/hook que usa TanStack Query, mocke o módulo `api-client` (ou o método de serviço que o
usa), envolva o componente num `QueryClientProvider` de teste (um `QueryClient` novo por teste,
`retry: false`), e nunca deixe uma request real sair.

## Como assertar

**Prefira asserção por estado a asserção por sequência.** Duas perguntas por teste:

1. O que a função/componente **retornou ou renderizou**?
2. Com **quais argumentos** o Prisma (ou o mock de `apiClient`) foi chamado?

```ts
expect(await service.remove(id)).toEqual({ deleted: true });
expect(prisma.game.delete).toHaveBeenCalledWith({ where: { id } });
```

Assertar a ordem exata de chamadas trava o teste no _como_ em vez do _quê_, e quebra em todo
refactor legítimo. Use só quando a ordem **é** o comportamento (ex.: transação Prisma).

## O que todo módulo/feature novo precisa cobrir

Além do caminho feliz:

- **Payload inválido** → 400 (backend: campo não declarado no DTO, string acima de `@MaxLength`,
  número abaixo de `@Min`).
- **Caso vazio** → o que a rota/componente mostra quando não há nada (`[]`, estado vazio de UI,
  404 — decida e teste).
- Se a lógica ramificar (condicional de negócio, cálculo), cubra os dois lados da ramificação —
  não só o caminho que o autor tinha em mente ao escrever.

## Loop de verificação

```
npm run typecheck -w <workspace>
npm test -w <workspace> -- <pattern>   # o teste que você acabou de escrever
npm test -w <workspace>                # suíte inteira do workspace
npm run lint
npm run build
```

Só depois disso, commit.

## Contrato: o teste unitário não substitui `/qa-verify`

Um teste com `PrismaService` mockado **não prova** que a rota responde o que a spec diz — ele prova
que o serviço chama o Prisma direito. Para o contrato ponta a ponta, use `/qa-verify`: uma
verificação por critério de aceite, contra a aplicação local (`localhost:3333`/`localhost:5173`)
no ar. Os dois são necessários e cobrem coisas diferentes.
