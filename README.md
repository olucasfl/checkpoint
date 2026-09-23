# checkpoint

App para registrar jogos **zerados**, **jogando** e **que quero jogar**.

> Este repositório contém apenas a **estrutura inicial** do projeto. Nenhuma entidade de
> domínio, tela ou regra de negócio foi implementada — só o esqueleto pronto para escalar.

---

## Stack

| Camada    | Tecnologias                                                                     |
| --------- | ------------------------------------------------------------------------------- |
| Monorepo  | npm workspaces, TypeScript 5 (strict), concurrently                             |
| Frontend  | React 19, Vite 6, React Router 7, TanStack Query 5, Tailwind CSS 4, axios       |
| Backend   | NestJS 11, @nestjs/config, class-validator/class-transformer, Swagger, Prisma 6 |
| Banco     | PostgreSQL 16 (instância local ou gerenciada, ex.: Supabase)                    |
| Qualidade | ESLint 9 (flat config), Prettier, Husky, lint-staged, commitlint (Conventional) |

---

## Estrutura de pastas

```
checkpoint/
├── apps/
│   ├── api/                      # @checkpoint/api — backend NestJS
│   │   ├── prisma/
│   │   │   └── schema.prisma     # datasource + generator (ainda sem models)
│   │   └── src/
│   │       ├── common/           # filters, interceptors, decorators (vazios)
│   │       ├── config/           # validação de env, constantes e helpers de config
│   │       ├── database/         # PrismaModule + PrismaService (globais)
│   │       ├── modules/          # um módulo por domínio
│   │       │   └── health/       # GET /api/health
│   │       ├── app.module.ts
│   │       └── main.ts           # prefixo /api, CORS, ValidationPipe, Swagger
│   │
│   └── web/                      # @checkpoint/web — frontend React
│       └── src/
│           ├── app/              # providers e router da aplicação
│           ├── features/         # uma pasta por feature (vazio por enquanto)
│           ├── pages/            # páginas de rota
│           ├── shared/
│           │   ├── components/   # componentes reutilizáveis
│           │   ├── hooks/        # hooks reutilizáveis
│           │   └── lib/          # apiClient (axios), queryClient, env
│           ├── styles/           # entrada do Tailwind
│           └── main.tsx
│
├── packages/
│   └── shared/                   # @checkpoint/shared — tipos/utils compartilhados
│       └── src/index.ts
│
├── eslint.config.mjs             # ESLint compartilhado por todos os workspaces
├── tsconfig.base.json            # tsconfig base estendido pelos apps
└── package.json                  # workspaces + scripts da raiz
```

### Como os workspaces se conversam

`@checkpoint/shared` é compilado para `dist/` (CommonJS + `.d.ts`) e consumido pelos dois apps
como uma dependência normal (`"@checkpoint/shared": "*"`). Por isso ele é **sempre construído
antes** da api e da web nos scripts de `build`, `dev` e `typecheck`.

Coloque nele apenas código agnóstico de plataforma: tipos, contratos de API, enums e funções
puras. Nada que dependa de `window`, do Node ou do Prisma.

---

## Pré-requisitos

- **Node.js 24** (ver `.nvmrc` — `nvm use` se você usa nvm)
- **npm 10+** (o projeto usa npm workspaces; não use pnpm nem yarn)
- **PostgreSQL 16** acessível (instância local ou gerenciada, ex.: Supabase)

---

## Rodando localmente

### 1. Instale as dependências (na raiz, uma vez só)

```bash
npm install
```

Isso instala todos os workspaces e roda `prisma generate` automaticamente.

### 2. Crie os arquivos de ambiente

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

| Arquivo         | Para quê                                          |
| --------------- | ------------------------------------------------- |
| `apps/api/.env` | `PORT`, `DATABASE_URL`, `CORS_ORIGIN`, `NODE_ENV` |
| `apps/web/.env` | `VITE_API_URL`                                    |

> `DATABASE_URL` deve apontar para um PostgreSQL 16 acessível (instância local instalada na
> máquina ou um serviço gerenciado, ex.: Supabase). Este projeto não usa Docker.

### 3. Garanta que o banco está acessível

Confirme que a instância PostgreSQL referenciada em `DATABASE_URL` está no ar (local ou
gerenciada) antes de seguir para o próximo passo.

### 4. Aplique as migrations

```bash
npm run db:migrate
```

> Ainda não existe nenhum model no `schema.prisma`, então nenhuma migration será gerada.
> Rode este comando toda vez que adicionar ou alterar um model.

### 5. Suba a aplicação

```bash
npm run dev
```

| Serviço  | URL                              |
| -------- | -------------------------------- |
| Frontend | http://localhost:5173            |
| API      | http://localhost:3333/api        |
| Swagger  | http://localhost:3333/api/docs   |
| Health   | http://localhost:3333/api/health |

A página inicial da web consulta o `/api/health` e mostra o status da API e do banco.

---

## Scripts da raiz

| Script                 | O que faz                                                            |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run dev`          | compila o `shared` e sobe web + api + watch do shared (concurrently) |
| `npm run dev:api`      | sobe só a API em watch mode                                          |
| `npm run dev:web`      | sobe só o frontend                                                   |
| `npm run build`        | build de produção de shared → api → web, nessa ordem                 |
| `npm run typecheck`    | `tsc --noEmit` em todos os workspaces                                |
| `npm run lint`         | ESLint em todo o monorepo                                            |
| `npm run lint:fix`     | ESLint com `--fix`                                                   |
| `npm run format`       | Prettier em todo o repositório                                       |
| `npm run format:check` | verifica formatação sem alterar arquivos                             |
| `npm run db:generate`  | regenera o Prisma Client                                             |
| `npm run db:migrate`   | cria/aplica migrations em desenvolvimento                            |
| `npm run db:studio`    | abre o Prisma Studio                                                 |

Para rodar um script de um workspace específico:

```bash
npm run <script> -w @checkpoint/api
npm run <script> -w @checkpoint/web
npm run <script> -w @checkpoint/shared
```

---

## Padrões de código

### Commits

O projeto usa **Conventional Commits**, validados pelo commitlint no hook `commit-msg`:

```
feat: adiciona cadastro de jogos
fix(api): corrige validação do health check
chore: atualiza dependências
```

Tipos aceitos: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`,
`style`, `test`.

### Pre-commit

O hook `pre-commit` roda o **lint-staged**, que aplica `eslint --fix` e `prettier --write`
apenas nos arquivos em stage.

### Alias de import (frontend)

```ts
import { apiClient } from '@/shared/lib/api-client';
```

O alias `@/` aponta para `apps/web/src` e está configurado tanto no `vite.config.ts` quanto no
`tsconfig.app.json`.

---

## Próximos passos sugeridos

1. Modelar as entidades em `apps/api/prisma/schema.prisma` e rodar `npm run db:migrate`.
2. Criar um módulo por domínio em `apps/api/src/modules/`.
3. Criar a feature correspondente em `apps/web/src/features/` e registrar a rota em
   `apps/web/src/app/router.tsx`.
4. Compartilhar os contratos (tipos de request/response) em `packages/shared/src`.
