# ARCHITECTURE.md — checkpoint

Guia técnico do monorepo. Descreve o que **existe de fato** hoje — o projeto é um esqueleto
recém-criado: uma única entidade de domínio (`Game`, catálogo de jogos, só no backend por ora), sem
auth e sem tela além de uma home de diagnóstico. Leia
isto antes de tocar em qualquer workspace; atualize a seção afetada no mesmo commit que muda o
comportamento que ela descreve.

> `README.md` é a porta de entrada (setup, scripts, "próximos passos"). Este arquivo é o guia
> técnico — como as peças se encaixam e por quê.

---

## 1. Visão geral

|                      |                                                                                                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipo de repo         | Monorepo único, npm workspaces (`apps/*`, `packages/*`) — não é multi-repo                                                                                                                                                                                      |
| Gerenciador          | npm 10+ (workspaces). Não usar pnpm nem yarn                                                                                                                                                                                                                    |
| Node                 | 20.19+ (`engines` do `package.json` da raiz; `.nvmrc` = `20.19`). O piso vem do `jsdom@27`; as versões de teste do web foram escolhidas para rodar em Node 20.19                                                                                                |
| Linguagem            | TypeScript 5, strict, em todos os workspaces                                                                                                                                                                                                                    |
| `apps/api`           | `@checkpoint/api` — NestJS 11, Express, Prisma 6, PostgreSQL 16                                                                                                                                                                                                 |
| `apps/web`           | `@checkpoint/web` — React 19, Vite 6, React Router 7, TanStack Query 5, Tailwind CSS 4, axios                                                                                                                                                                   |
| `packages/shared`    | `@checkpoint/shared` — tipos/contratos/utils puros, compilado para `dist/` (CommonJS + `.d.ts`)                                                                                                                                                                 |
| Storage de arquivos  | Supabase Storage (bucket público `capas`, mesmo projeto do banco), só para as capas dos jogos; acessado pelo backend pela REST com `fetch` (sem SDK). Leitura pública; escrita só pelo backend, com a secret key                                                |
| Banco                | PostgreSQL 16, instância local ou gerenciada (ex.: Supabase) — sem Docker no projeto                                                                                                                                                                            |
| Qualidade            | ESLint 9 (flat config, `eslint.config.mjs` na raiz), Prettier, Husky, lint-staged, commitlint (Conventional Commits)                                                                                                                                            |
| Testes               | Jest 30 + ts-jest na API e Vitest 4 + Testing Library + jsdom na web (`npm test -w <workspace>`); `packages/shared` não tem runner próprio. `npm test` na raiz compila o `shared` antes (`pretest`). Convenções em `.claude/skills/checkpoint-testing/SKILL.md` |
| Auth                 | Não existe                                                                                                                                                                                                                                                      |
| PWA / service worker | Não existe                                                                                                                                                                                                                                                      |
| Deploy / CI          | Não existe (sem Dockerfile de produção, sem workflow de CI, sem manifest de hospedagem)                                                                                                                                                                         |

Não assuma nenhuma dessas ausências como "esquecimento" a corrigir de lado — são decisões de
escopo do esqueleto. Adicionar qualquer uma delas é uma feature própria, com spec (`docs/specs/`),
não um efeito colateral de outra tarefa.

---

## 2. Grafo de dependências dos workspaces

```
packages/shared  ──▶  apps/api
packages/shared  ──▶  apps/web
```

`@checkpoint/shared` não depende de nenhum outro workspace. `apps/api` e `apps/web` dependem dele
via `"@checkpoint/shared": "*"` (link simbólico do npm workspaces) e **não dependem um do outro** —
não existe (e não deve existir) import direto de `apps/api/src` a partir de `apps/web/src` ou
vice-versa. Qualquer coisa que os dois precisem compartilhar entra em `packages/shared`.

**Ordem de build é uma regra, não uma conveniência**: `shared` é sempre construído antes de `api` e
`web`, porque os dois importam de `@checkpoint/shared/dist`, não do `src` dele.

```
npm run build      →  build -w shared  →  build -w api  →  build -w web
npm run typecheck   →  build -w shared  →  typecheck --workspaces
npm test            →  pretest builda shared  →  test em cada workspace que tiver (--if-present)
npm run dev         →  predev builda shared uma vez, depois shared/api/web sobem em paralelo com watch
```

Consequência prática: se você editar `packages/shared/src` e não ver o tipo/valor novo em
`apps/api` ou `apps/web`, o `dist/` do `shared` está desatualizado — rode
`npm run build -w @checkpoint/shared` (ou reinicie `npm run dev`, que já cuida disso via
`predev`/watch).

`packages/shared` só pode conter código agnóstico de plataforma: tipos, contratos de request/
response, enums, funções puras. Nada que dependa de `window`, do Node ou do `@prisma/client`.

---

## 3. Estrutura de pastas (estado real)

```
checkpoint/
├── apps/
│   ├── api/                          # @checkpoint/api
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # datasource + generator + enum GameStatus + model Game
│   │   │   └── migrations/           # migrations versionadas (commitadas)
│   │   └── src/
│   │       ├── common/                # errors/ (ApiErrorResponse), pipes/ (ValidationPipe global); filters/, interceptors/, decorators/ vazias (.gitkeep)
│   │       ├── config/                 # app.config.ts, env.validation.ts, index.ts
│   │       ├── database/               # PrismaModule (@Global) + PrismaService
│   │       ├── modules/                # um módulo por domínio — hoje health/ e games/
│   │       │   ├── health/             # GET /api/health → status da API + do banco
│   │       │   └── games/              # catálogo de jogos: GET/POST/PATCH/DELETE /api/games
│   │       ├── app.module.ts
│   │       └── main.ts                 # bootstrap: prefixo /api, CORS, ValidationPipe, Swagger
│   │
│   └── web/                           # @checkpoint/web
│       └── src/
│           ├── app/                    # providers.tsx (AppProviders) + router.tsx (AppRouter)
│           ├── features/               # uma pasta por feature — vazio (.gitkeep)
│           ├── pages/                  # páginas de rota — hoje só HomePage.tsx
│           ├── shared/
│           │   ├── components/         # vazio (.gitkeep)
│           │   ├── hooks/              # vazio (.gitkeep)
│           │   └── lib/                # api-client.ts (axios), query-client.ts, env.ts
│           ├── styles/                 # index.css — entrada do Tailwind
│           └── main.tsx
│
├── packages/
│   └── shared/
│       └── src/
│           ├── games.ts               # contrato do catálogo de jogos (tipos, constantes, regra da nota)
│           └── index.ts               # reexporta games; HealthCheckResponse, APP_NAME — exemplos
│
├── eslint.config.mjs                   # config compartilhada por todos os workspaces
├── tsconfig.base.json                  # tsconfig base estendido pelos apps
├── commitlint.config.js
└── package.json                        # workspaces + scripts + lint-staged
```

Módulos/páginas além dos citados acima **ainda não existem** — não documente domínio que não foi
implementado. No web, o catálogo de jogos (etapa 3 da spec) ainda não foi feito: `features/` segue
vazia e `/` segue sendo a home de diagnóstico.

---

## 4. Backend (`apps/api`)

### 4.1 Ciclo de vida da request (`src/main.ts`)

1. **Prefixo global** `api` (`API_GLOBAL_PREFIX`, `src/config/app.config.ts`) — toda rota fica sob
   `/api/*`.
2. **CORS** habilitado com `credentials: true`; a origem vem de `CORS_ORIGIN` e é parseada por
   `parseCorsOrigin()` (`*` → libera tudo; lista separada por vírgula → `string[]`; um valor só →
   `string`).
3. **`ValidationPipe` global**: `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`,
   `enableImplicitConversion: true`. Todo DTO precisa declarar exatamente os campos que aceita —
   campo não declarado é removido (`whitelist`) ou rejeita a request com 400
   (`forbidNonWhitelisted`), dependendo de onde a validação pega primeiro. O pipe é montado por
   `createValidationPipe()` (`src/common/pipes/app-validation.pipe.ts`, o mesmo que os testes de
   DTO usam) e seu `exceptionFactory` devolve os erros no formato `ApiErrorResponse` de
   `@checkpoint/shared`: `{ statusCode, message, fields? }`, com uma mensagem por campo em `fields`
   (o web a mostra junto do campo). Os erros de negócio (409, 400 da regra da nota) usam o mesmo
   formato, via `badRequestError`/`conflictError` (`src/common/errors/api-error.ts`).
   Como `enableImplicitConversion` converte por tipo antes de validar (`["a"]` viraria `"a"`), os
   DTOs de `games` leem o valor cru com `TrimString`/`RawValue` (`modules/games/dto/transforms.ts`).
4. **Swagger** servido em `/api/docs` (`SWAGGER_PATH`), montado a partir do `DocumentBuilder` em
   `main.ts`. Todo controller novo deve usar `@ApiTags`/`@ApiOperation` como `HealthController` já
   faz — é a única documentação viva das rotas hoje.

### 4.2 Configuração e ambiente (`src/config/`)

- `env.validation.ts` — `EnvironmentVariables` (class-validator) valida `NODE_ENV`, `PORT`,
  `DATABASE_URL`, `CORS_ORIGIN` e `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_STORAGE_BUCKET` (capas, §4.4) no boot; falta ou valor inválido **derruba a aplicação** com a
  lista de erros. `SUPABASE_SERVICE_ROLE_KEY` também recusa uma chave que comece com
  `sb_publishable_` (a chave pública, sujeita a RLS, com que todo upload falharia com 403). Variável de ambiente nova em `apps/api/.env` **precisa** ganhar um campo aqui, ou
  o `ConfigService` não a expõe (nem para leitura).
- `ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv })` — `ConfigService`
  fica disponível em qualquer módulo sem reimportar.

### 4.3 Banco de dados (`src/database/`, `prisma/schema.prisma`)

- `PrismaModule` é `@Global()` — `PrismaService` pode ser injetado em qualquer módulo sem importar
  `PrismaModule` de novo.
- `PrismaService extends PrismaClient`, conecta em `onModuleInit`, desconecta em
  `onModuleDestroy`, expõe `isHealthy()` (usado só pelo health check hoje — `SELECT 1`).
- `prisma/schema.prisma` tem o enum `GameStatus` (`ZERADO`, `JOGANDO`, `QUERO_JOGAR`) e o model
  `Game`: `titulo`, `plataforma` (`""` = sem plataforma; a API expõe `null`), `status`, `nota`
  (`Int?`), `capaPath` (`String?`: caminho do objeto da capa no bucket, não a URL), `criadoEm`/`atualizadoEm` e as colunas `tituloNormalizado`/`plataformaNormalizada`,
  preenchidas pelo `GamesService` (aparadas e em minúsculas) e cobertas por
  `@@unique([tituloNormalizado, plataformaNormalizada])`. É assim, e não com um índice `lower()`
  escrito à mão, para o Prisma enxergar toda a estrutura e o `migrate dev` não acusar drift. A
  migration também tem dois `CHECK` escritos à mão (nota entre 0 e 10; nota nula com
  `QUERO_JOGAR`), que o Prisma não modela e não vê como drift. Este projeto usa **migrations versionadas**
  (`prisma migrate dev`/`prisma migrate deploy`), diferente de um fluxo baseado em `db push` sem
  histórico — toda mudança de schema gera um arquivo em `prisma/migrations/` que fica commitado.
  Ver §7 e `.claude/rules/RULES.md`.

### 4.4 Módulo por domínio (`src/modules/`)

Convenção NestJS padrão, um módulo por domínio, cada um com `*.module.ts` + `*.controller.ts` +
`*.service.ts` (+ `dto/` quando a rota aceitar body). Hoje há dois:

- `health/` — `GET /api/health`, sem domínio; serve de modelo de forma.
- `games/` — o catálogo de jogos (spec `docs/specs/catalogo-jogos.md`, etapas 1 e 2; o web é a etapa 3):
  - `GET /api/games[?status=]` (ordenado por `atualizadoEm` desc, desempate `criadoEm` desc),
    `POST /api/games`, `PATCH /api/games/:id` (parcial; só `plataforma` e `nota` aceitam `null`) e
    `DELETE /api/games/:id` (204).
  - **Capa** (uma por jogo, opcional): `PUT /api/games/:id/capa` (multipart, campo `arquivo`) e
    `DELETE /api/games/:id/capa`. Só JPEG/PNG/WebP, identificados pela **assinatura do arquivo**
    (`cover/image-signature.ts`) e não pelo `Content-Type`; até 2 MB (413). O objeto vai para o
    bucket público `capas` do Supabase como `<gameId>/<uuid>.<ext>`; o banco guarda só o caminho
    (`capaPath`) e a resposta expõe `capaUrl` (nunca o caminho). Trocar a capa envia o objeto novo,
    grava e só então apaga o antigo; remover o jogo apaga a capa em _best effort_ (a falha vira log,
    não erro). Falha do storage é **502** (`fields.arquivo`), nunca 500.
  - **`StorageService`** (`cover/storage.service.ts`) fala com a REST do Supabase Storage pelo
    `fetch` nativo, **sem `@supabase/supabase-js`**, autenticando **só com o cabeçalho `apikey`**
    (a secret key `sb_secret_…` não é JWT e não vai em `Authorization: Bearer`; ver a spec). Fica
    isolado atrás de `upload`/`remove`/`publicUrl` e é mockado nos testes; timeout de 10 s; o log
    tem status HTTP e mensagem, nunca cabeçalhos nem a chave. O CDN do Supabase pode servir a URL
    pública de um objeto apagado por até ~1 min (cache), embora ele já não exista no bucket.
  - `cover/cover-upload.interceptor.ts` embrulha o `FileInterceptor` do Nest para converter os erros
    do multer (413, campo errado) em `ApiErrorResponse`; o multipart é lido **antes** dos pipes, então
    um arquivo grande para um id inválido dá 413, não 400.
  - **Regra da nota:** validada no service sobre o **estado final** (registro atual + body), porque
    o DTO só enxerga o body: `{ status: "QUERO_JOGAR" }` num jogo com nota é 400, a menos que o
    mesmo body traga `nota: null`. A API nunca apaga a nota por conta própria.
  - **Duplicidade** (mesmo título e plataforma, sem diferenciar caixa nem espaços nas pontas): checagem
    prévia para dar um 409 claro; a garantia real é o `@@unique` do banco, e o `P2002` da corrida
    também vira 409. Ao editar, o próprio jogo não conta como duplicata.
  - `id` que não é UUID → 400 (`ParseUUIDPipe`); UUID sem jogo → 404.
  - Testes ao lado do código: `games.service.spec.ts` (regra de negócio, Prisma mockado),
    `dto/*.spec.ts` (validação pelo pipe do `main.ts`), `games.http.spec.ts` e
    `games.cover.http.spec.ts` (status e corpo por HTTP, numa porta local, com o multer real e sem
    banco nem Supabase), `games.cover.service.spec.ts` e `cover/*.spec.ts` (assinatura de imagem e
    `StorageService` com `fetch` mockado).

```
apps/api/src/modules/games/
├── games.module.ts       # @Module({ controllers, providers }), registrado em app.module.ts
├── games.controller.ts   # rotas, @ApiTags/@Api*Response
├── games.service.ts      # regra de negócio, injeta PrismaService e StorageService
├── cover/                # capa: StorageService (REST do Supabase), assinatura, interceptor
└── dto/                  # class-validator + Swagger; transforms.ts lê o valor cru
```

Registre o módulo novo em `app.module.ts` (`imports: [...]`).

---

## 5. Frontend (`apps/web`)

### 5.1 Composição da aplicação

- `src/main.tsx` monta `<AppProviders><AppRouter/></AppProviders>`.
- `src/app/providers.tsx` — ponto único para providers globais. Hoje só `QueryClientProvider`
  (`shared/lib/query-client.ts`); tema, auth etc. entram aqui quando existirem.
- `src/app/router.tsx` — `createBrowserRouter` com a lista de rotas. Hoje só `/` → `HomePage`.
  Registre rotas novas aqui conforme cada feature ganha uma página.

### 5.2 Alias de import

`@/` aponta para `apps/web/src`, configurado tanto em `vite.config.ts` (`resolve.alias`) quanto em
`tsconfig.app.json` (`paths`). Um import novo cruzando pastas usa o alias
(`@/shared/lib/api-client`), nunca `../../../`.

### 5.3 HTTP e cache de servidor

`shared/lib/api-client.ts` exporta uma instância única do axios (`apiClient`), `baseURL` vindo de
`shared/lib/env.ts` (`VITE_API_URL`, já incluindo o prefixo `/api`). Toda chamada à API passa por
essa instância — não crie um segundo `axios.create()`. Cache/estado de servidor é TanStack Query
(`shared/lib/query-client.ts`); não há Redux/Zustand/Context-como-store no projeto.

### 5.4 Onde as coisas vão

| Pasta                    | Para quê                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/<nome>/`   | Uma feature de domínio (componentes, hooks, chamadas de API específicas dela). Vazio hoje — nasce quando a primeira feature real (ex. lista de jogos) for criada. |
| `src/pages/`             | Componentes de página, um por rota, registrados em `app/router.tsx`.                                                                                              |
| `src/shared/components/` | Componentes de UI reutilizáveis entre features.                                                                                                                   |
| `src/shared/hooks/`      | Hooks reutilizáveis entre features.                                                                                                                               |
| `src/shared/lib/`        | Infra transversal: cliente HTTP, query client, acesso a env.                                                                                                      |
| `src/styles/`            | Entrada do Tailwind (`index.css`) e qualquer CSS global.                                                                                                          |

Regra prática: se o código só faz sentido dentro de uma feature, ele mora em
`features/<nome>/`; se é usado por duas ou mais features (ou não pertence a nenhuma), vai em
`shared/`.

---

## 6. `packages/shared`

Consumido como dependência normal de workspace (`"@checkpoint/shared": "*"`), sempre buildado
antes de `api`/`web` (§2). Hoje tem:

- `games.ts` — contrato do catálogo de jogos: `GAME_STATUS`/`GameStatus` (códigos `ZERADO`,
  `JOGANDO`, `QUERO_JOGAR`, sem rótulo de tela), `Game`, `CreateGameRequest`, `UpdateGameRequest`,
  `ListGamesQuery`, `ApiErrorResponse` (formato dos erros 400/409, com `fields` por campo), as
  constantes de limite e `statusAllowsRating` (regra da nota, usada pela API e pelo formulário).
  A capa entra como `Game.capaUrl` (URL pública ou `null`), `GAME_COVER_MAX_BYTES` (2 MB),
  `GAME_COVER_MIME_TYPES`, `GAME_COVER_FIELD` (`arquivo`) e o campo `arquivo` em `ApiErrorField`.
- `index.ts` — reexporta `games` e mantém dois exemplos herdados do esqueleto
  (`HealthCheckResponse`, `APP_NAME`).

O que entra aqui: tipos de request/response compartilhados entre API e web, enums de domínio,
funções puras (formatação, validação simples) sem dependência de `window`/Node/Prisma. O que **não**
entra: nada que importe `@prisma/client`, nada de componente React, nada de código específico de
Node (`fs`, `path` etc.).

---

## 7. Banco de dados e Prisma — fluxo de trabalho

```bash
npm run db:migrate     # prisma migrate dev — cria/aplica migration em dev
npm run db:generate    # regenera o Prisma Client (já roda automaticamente no postinstall)
npm run db:studio      # Prisma Studio
```

- Não há Docker neste projeto. `DATABASE_URL` (`apps/api/.env`) deve apontar para um PostgreSQL 16
  já acessível — instância local instalada na máquina ou um serviço gerenciado (ex.: Supabase).
  Garantir que o banco está no ar é pré-requisito manual antes de `db:migrate`/`db:studio`/`dev`.
- Se o banco for Supabase: `DATABASE_URL` deve usar o **Connection Pooler em modo Transaction**
  (porta 6543, com `?pgbouncer=true&connection_limit=1`) e existe também um `DIRECT_URL` (modo
  Session, porta 5432, sem `pgbouncer=true`), usado só pelo Prisma Migrate — `migrate dev` precisa
  de uma conexão com estado/lock de sessão, que o transaction pooler não oferece (o comando trava
  sem erro se você tentar usar só a pooled URL). O host "direto" do Supabase
  (`db.<ref>.supabase.co:5432`) é IPv6-only e pode não ser alcançável em redes sem rota IPv6 — por
  isso o `directUrl` também aponta pro pooler, só numa porta diferente.
- Toda alteração em `apps/api/prisma/schema.prisma` precisa terminar em
  `npm run db:migrate` (ou `npm run db:migrate -w @checkpoint/api`) rodado localmente, gerando um
  diretório novo em `apps/api/prisma/migrations/` que fica commitado — é o histórico de schema do
  projeto.
- Depois de qualquer `db:migrate`/`db:generate`, o Prisma Client é regenerado; se o editor mostrar
  tipos desatualizados, rode `npm run db:generate` e reinicie o TS server.

Ver `.claude/rules/RULES.md` e `.claude/commands/db-change.md` para o processo de revisão de
mudanças de schema por um agente.

---

## 8. Variáveis de ambiente

| Arquivo         | Variáveis                                                              | Para quê                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/.env` | `NODE_ENV`, `PORT`, `DATABASE_URL`, `CORS_ORIGIN`                      | Validadas em `src/config/env.validation.ts`; falta/erro derruba o boot                                                                                                          |
| `apps/api/.env` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Storage das capas; validadas em `env.validation.ts` (obrigatórias). O valor da chave é a **secret key** (`sb_secret_…`) e só o backend a usa: nunca vai para o web nem para log |
| `apps/api/.env` | `DIRECT_URL`                                                           | Só o Prisma CLI lê (via `schema.prisma`); necessária apenas se `DATABASE_URL` for uma conexão pooled (ex.: Supabase)                                                            |
| `apps/web/.env` | `VITE_API_URL`                                                         | Consumida em `src/shared/lib/env.ts`, `baseURL` do `apiClient`                                                                                                                  |

Cada arquivo tem um `.env.example` correspondente, versionado. Nunca commitar `.env` real nem
colar valor real em spec, teste, commit ou log.

---

## 9. Como isto deve evoluir

Isto amarra com a seção "Próximos passos sugeridos" do `README.md` — não a contradiga.

1. **Modelar entidades em `apps/api/prisma/schema.prisma`** (ex. jogo, status de jogo — zerado /
   jogando / quero jogar) e rodar `npm run db:migrate`. Ver §7.
2. **Um módulo por domínio em `apps/api/src/modules/`** (ex. `modules/games/`), seguindo o formato
   de §4.4. Registrar em `app.module.ts`.
3. **Uma feature correspondente em `apps/web/src/features/`** (ex. `features/games/`), com a rota
   registrada em `apps/web/src/app/router.tsx`.
4. **Contratos compartilhados em `packages/shared/src`** — o shape de request/response de cada rota
   nova, consumido pelos dois lados (como `HealthCheckResponse` já faz para `/health`).

O primeiro ciclo (jogo e seu status) está especificado em `docs/specs/catalogo-jogos.md` e em
implementação por etapas: os passos 1, 2 e 4 já existem para o catálogo (schema, `modules/games/` e
`packages/shared/src/games.ts`); o passo 3 (`features/games/` no web) é a etapa 3 da spec. Este
arquivo não deve ser editado para "prever" um design de domínio que ainda não foi decidido: cada
feature nova atualiza as seções que ela toca **no mesmo commit** (novo módulo em §4.4, nova feature
em §5.4, novo model em §4.3).

Quando o projeto ganhar auth, testes automatizados, PWA ou pipeline de deploy, as linhas
correspondentes em §1 deixam de dizer "não existe" e passam a descrever o mecanismo real — até lá,
não assuma nenhuma delas.
