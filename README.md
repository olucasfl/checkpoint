# checkpoint

App para registrar jogos **zerados**, **jogando** e **que quero jogar**.

> O catálogo de jogos está sendo implementado por etapas (spec em `docs/specs/catalogo-jogos.md`):
> a **API** e o **web** (catálogo de jogos em três status, com capa e visual "Neon arcade") já existem.

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
│   │   │   ├── schema.prisma     # datasource + generator + enum GameStatus + model Game
│   │   │   └── migrations/       # migrations versionadas
│   │   └── src/
│   │       ├── common/           # filters, interceptors, decorators (vazios)
│   │       ├── config/           # validação de env, constantes e helpers de config
│   │       ├── database/         # PrismaModule + PrismaService (globais)
│   │       ├── modules/          # um módulo por domínio
│   │       │   ├── health/       # GET /api/health
│   │       │   └── games/        # catálogo de jogos: /api/games e /api/games/:id/capa
│   │       ├── app.module.ts
│   │       └── main.ts           # prefixo /api, CORS, ValidationPipe, Swagger
│   │
│   └── web/                      # @checkpoint/web — frontend React
│       └── src/
│           ├── app/              # providers e router da aplicação
│           ├── features/         # uma pasta por feature (hoje games/)
│           ├── pages/            # páginas de rota (/ catálogo, /status diagnóstico)
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

- **Node.js 20.19+** (ver `.nvmrc` — `nvm use` se você usa nvm)
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

| Arquivo         | Para quê                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/.env` | `PORT`, `DATABASE_URL`, `CORS_ORIGIN`, `NODE_ENV`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` |
| `apps/web/.env` | `VITE_API_URL`                                                                                                            |

> As variáveis `SUPABASE_*` são **obrigatórias** (a API não sobe sem elas) e servem só às capas dos
> jogos: `SUPABASE_URL` é a URL do projeto, `SUPABASE_STORAGE_BUCKET` é o bucket público `capas`, e
> `SUPABASE_SERVICE_ROLE_KEY` recebe a **secret key** (`sb_secret_…`, em Settings → API Keys →
> Secret keys) — não a publishable. Ela só existe no backend: nunca no web, nunca em log ou commit.

> `DATABASE_URL` deve apontar para um PostgreSQL 16 acessível (instância local instalada na
> máquina ou um serviço gerenciado, ex.: Supabase). Este projeto não usa Docker.

### 3. Garanta que o banco está acessível

Confirme que a instância PostgreSQL referenciada em `DATABASE_URL` está no ar (local ou
gerenciada) antes de seguir para o próximo passo.

### 4. Aplique as migrations

```bash
npm run db:migrate
```

> Rode este comando toda vez que adicionar ou alterar um model: ele aplica as migrations
> pendentes (hoje, o model `Game`) e gera uma nova quando o schema mudou.

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

A página inicial (`/`) é o catálogo de jogos. O diagnóstico, que consulta o `/api/health` e mostra o
status da API e do banco, fica em `/status`.

---

## Scripts da raiz

| Script                 | O que faz                                                            |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run dev`          | compila o `shared` e sobe web + api + watch do shared (concurrently) |
| `npm run dev:api`      | sobe só a API em watch mode                                          |
| `npm run dev:web`      | sobe só o frontend                                                   |
| `npm run build`        | build de produção de shared → api → web, nessa ordem                 |
| `npm run typecheck`    | `tsc --noEmit` em todos os workspaces                                |
| `npm test`             | compila o `shared` e roda os testes (Jest na api, Vitest no web)     |
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
