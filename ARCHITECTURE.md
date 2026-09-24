# ARCHITECTURE.md — checkpoint

Guia técnico do monorepo. Descreve o que **existe de fato** hoje — o projeto é um esqueleto
recém-criado: uma única entidade de domínio (`Game`, catálogo de jogos, com API e tela) e sem auth. Leia
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
| Auth                 | API pronta (spec `autenticacao`, etapa 1): e-mail e senha, access token (JWT, 15 min) + refresh token (30 dias) em cookie HttpOnly, com rotação e guard global (§4.5). O web (etapa 2) e o dono dos jogos (etapa 3) ainda não existem: `games` segue público    |
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
│   │   │   ├── schema.prisma         # datasource + generator + enum GameStatus + models Game, User e RefreshSession
│   │   │   └── migrations/           # migrations versionadas (commitadas)
│   │   └── src/
│   │       ├── common/                # errors/ (ApiErrorResponse), pipes/ (ValidationPipe global), decorators/ (@Public, @CurrentUser), dto/ (transforms); filters/ e interceptors/ vazias (.gitkeep)
│   │       ├── config/                 # app.config.ts, env.validation.ts, index.ts
│   │       ├── database/               # PrismaModule (@Global) + PrismaService
│   │       ├── modules/                # um módulo por domínio — hoje health/, games/ e auth/
│   │       │   ├── health/             # GET /api/health → status da API + do banco
│   │       │   ├── games/              # catálogo de jogos: GET/POST/PATCH/DELETE /api/games
│   │       │   └── auth/               # registro, login, refresh, logout, me; guard global de access token (§4.5)
│   │       ├── app.module.ts           # inclui o guard global (APP_GUARD)
│   │       ├── app.setup.ts            # setupApp(): prefixo /api, cookie-parser, CORS, ValidationPipe, Swagger (o main.ts e a verificação manual usam o mesmo)
│   │       └── main.ts                 # bootstrap: cria o app, setupApp() e listen
│   │
│   └── web/                           # @checkpoint/web
│       ├── pwa.config.ts               # manifest + plugin de PWA (Workbox); ver §5.8
│       └── src/
│           ├── app/                    # providers.tsx (AppProviders) + router.tsx (AppRouter)
│           │   └── layout/             # AppLayout (fundo + navegação), BottomNav, TopNav, nav-items.ts
│           ├── features/               # uma pasta por feature — hoje games/ (api/, lib/, components/)
│           ├── pages/                  # páginas de rota — GamesPage (/) e StatusPage (/status)
│           ├── shared/
│           │   ├── components/         # Icon (Material Symbols), ModalDialog (<dialog> nativo), OverlayPortal, ConnectionBanner, UpdatePrompt, InstallNudge
│           │   ├── hooks/              # use-typing-outside-dialog (esconde a barra com o teclado aberto), use-connectivity, use-dialog-open
│           │   └── lib/                # api-client.ts (axios), query-client.ts, env.ts, connectivity.ts, storage/ (armazenamento local tipado), pwa/ (use-app-update, install-prompt, display, usage-days, install-keys)
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
implementado.

---

## 4. Backend (`apps/api`)

### 4.1 Ciclo de vida da request (`src/main.ts` + `src/app.setup.ts`)

1. **Prefixo global** `api` (`API_GLOBAL_PREFIX`, `src/config/app.config.ts`) — toda rota fica sob
   `/api/*`.
2. **`cookie-parser`** (para ler o cookie `checkpoint_refresh`) e **CORS** com `credentials: true`. A origem
   vem de `CORS_ORIGIN`, parseada por `parseCorsOrigin()` **sempre para uma lista** (com uma string única o
   `cors` responderia `Access-Control-Allow-Origin` para qualquer origem). **`CORS_ORIGIN=*` é recusado no
   boot** (`env.validation.ts`): com cookie de sessão, refletir qualquer origem deixaria qualquer site
   renovar a sessão.
3. **`ValidationPipe` global**: `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`,
   `enableImplicitConversion: true`. Todo DTO precisa declarar exatamente os campos que aceita —
   campo não declarado é removido (`whitelist`) ou rejeita a request com 400
   (`forbidNonWhitelisted`), dependendo de onde a validação pega primeiro. O pipe é montado por
   `createValidationPipe()` (`src/common/pipes/app-validation.pipe.ts`, o mesmo que os testes de
   DTO usam) e seu `exceptionFactory` devolve os erros no formato `ApiErrorResponse` de
   `@checkpoint/shared`: `{ statusCode, code?, message, fields? }` (`code: 'VALIDACAO'` nos erros do pipe), com uma mensagem por campo em `fields`
   (o web a mostra junto do campo). Os erros de negócio (409, 400 da regra da nota) usam o mesmo
   formato, via `badRequestError`/`conflictError` (`src/common/errors/api-error.ts`).
   Como `enableImplicitConversion` converte por tipo antes de validar (`["a"]` viraria `"a"`), os
   DTOs leem o valor cru com `TrimString`/`RawValue` (`common/dto/transforms.ts`), que também desligam a
   conversão implícita da propriedade (`@Type(() => Object)`): sem isso, `{"senha":{"toString":"x"}}` faria o
   class-transformer lançar `TypeError` (500 num endpoint público).
4. **Guard global** (`APP_GUARD` em `app.module.ts`, `modules/auth/access-token.guard.ts`): toda rota exige
   `Authorization: Bearer <access token>`, **exceto as marcadas com `@Public()`** (`common/decorators/`).
   Esquecer o decorator **fecha** a rota, nunca a abre. Hoje são públicas: `health`, as rotas de auth
   (`registro`, `login`, `refresh`, `logout`) e, **só até a etapa 3 da spec `autenticacao`**, o
   `GamesController` inteiro (o catálogo continua sem dono e sem proteção). `@CurrentUser()` entrega
   `{ id, sessionId }` ao controller.
5. **Swagger** servido em `/api/docs` (`SWAGGER_PATH`), montado a partir do `DocumentBuilder` em
   `app.setup.ts`, com `addBearerAuth()` (botão "Authorize"). Todo controller novo deve usar `@ApiTags`/`@ApiOperation` como `HealthController` já
   faz — é a única documentação viva das rotas hoje.

### 4.2 Configuração e ambiente (`src/config/`)

- `env.validation.ts` — `EnvironmentVariables` (class-validator) valida `NODE_ENV`, `PORT`,
  `DATABASE_URL`, `CORS_ORIGIN` (obrigatória, **sem padrão e sem `*`**), `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET` (≥ 32 caracteres, **diferentes** entre si), `AUTH_REGISTRATION_OPEN`
  (`true`/`false`, sem padrão; o texto é lido cru porque a conversão implícita transformaria `"false"` em
  `true`), `AUTH_REGISTRATION_LIMIT_PER_HOUR` (opcional, inteiro ≥ 1; ausente = 3) e `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
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
- **`User` e `RefreshSession`** (spec `autenticacao`, migração A1, **aditiva**): `User` (`nome`, `email`
  único e sempre normalizado, `senhaHash`) e `RefreshSession` (uma linha por dispositivo logado; o `id` é o
  `sid` dos tokens; guarda só o **SHA-256** do refresh token e o do anterior, mais um rótulo do dispositivo
  derivado do `User-Agent`, sem IP), com `onDelete: Cascade`. **`Game` não tem dono ainda**: `Game.userId` e a
  troca do `@@unique` são as migrações A3 e A4 (etapas 3 e 4), **destrutivas** e já aprovadas na spec.

### 4.4 Módulo por domínio (`src/modules/`)

Convenção NestJS padrão, um módulo por domínio, cada um com `*.module.ts` + `*.controller.ts` +
`*.service.ts` (+ `dto/` quando a rota aceitar body). Hoje há três (`health/`, `games/` e `auth/`, §4.5):

- `health/` — `GET /api/health`, sem domínio; serve de modelo de forma.
- `games/` — o catálogo de jogos (spec `docs/specs/catalogo-jogos.md`, etapas 1 e 2; o web está em §5.5):
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

### 4.5 Autenticação (`modules/auth/`, spec `docs/specs/autenticacao.md`, etapa 1)

- **Rotas** (`/api/auth`, tag Swagger `auth`): `POST registro`, `POST login`, `POST refresh`, `POST logout` (as
  quatro `@Public()`) e `GET me` (protegida). Erros com `code` estável (`ApiErrorCode` do shared), nunca
  comparando a `message`.
- **Tokens:** access JWT HS256 (15 min, `JWT_ACCESS_SECRET`, `{ sub, sid, typ: 'access' }`, só em memória no
  web) e refresh JWT HS256 (30 dias, **segredo separado**, `jti` aleatório) no cookie `checkpoint_refresh`
  (`HttpOnly`, `SameSite=Lax`, `Path=/api/auth`, `Secure` só em produção). O corpo **nunca** traz o refresh
  token. O banco guarda só `sha256(refreshToken)`.
- **Sessão = uma linha de `RefreshSession`** por dispositivo; máximo de 10 por usuário (a 11ª apaga a de
  `ultimoUsoEm` mais antigo). O **guard global** confere a sessão do access token a cada request (uma leitura
  por chave primária): logout, reuso e (etapa 5) troca de senha derrubam o access token **na hora**.
- **Rotação:** `refresh` troca o token **na mesma linha** (`updateMany` condicionado ao hash apresentado; `count
0` = corrida = 409 `AUTH_REFRESH_CONCORRENTE`). O token anterior vale por **30 s** (corrida de abas); fora da
  janela, ou se não bate com nenhum dos dois hashes, é **reuso**: a sessão é apagada, o cookie é limpo e um
  `warn` registra o `sessionId` (nunca o token).
- **Anti-CSRF:** `refresh` e `logout` exigem `X-Checkpoint-Csrf: 1` (`CsrfHeaderGuard`; força o preflight de
  CORS). Sem ele: 403 `AUTH_ORIGEM_INVALIDA`.
- **Limite por IP** (`@nestjs/throttler`, memória, uma instância) só no `AuthController`: login 5/min, refresh
  30/min, registro **3/h** (constante no código; a env opcional `AUTH_REGISTRATION_LIMIT_PER_HOUR` só existe
  para verificação manual). 429 com `code: LIMITE_TENTATIVAS` e `Retry-After`.
- **Hash de senha: `node:crypto.scrypt`** (`password-hasher.ts`, N=2^17, r=8, p=1, sal de 16 bytes, formato
  `scrypt$N$r$p$sal$hash`), **não argon2**: o `argon2` não instala nesta máquina (sem binário pré-compilado e sem
  toolchain do Visual Studio), e a spec já previa esse plano B. `PasswordHasher` isola o algoritmo. Login com
  e-mail inexistente ainda paga um hash (contra um hash fixo) para o tempo não denunciar a conta.
- **Sem dado sensível** em corpo nem log: o `select` do Prisma é uma lista branca (`USUARIO_PUBLICO_SELECT`);
  nenhuma rota loga senha, token, cookie ou cabeçalho `Authorization`.
- Testes ao lado do código: `auth.service.spec.ts` (rotação, janela, reuso, teto de 10, com relógio falso),
  `access-token.guard.spec.ts` (`@Public`, tipos de token trocados, vencido, sessão apagada),
  `password-hasher.spec.ts` (scrypt real), `session-device.spec.ts`, `dto/*.spec.ts` e
  `auth.http.spec.ts` (HTTP numa porta local: cookie, anti-CSRF, 429, CORS, corpos e logs). O
  `testing/fake-auth-prisma.ts` é um Prisma em memória só para testes.

---

## 5. Frontend (`apps/web`)

### 5.1 Composição da aplicação

- `src/main.tsx` monta `<AppProviders><AppRouter/></AppProviders>`.
- `src/app/providers.tsx` — ponto único para providers globais. Hoje só `QueryClientProvider`
  (`shared/lib/query-client.ts`); tema, auth etc. entram aqui quando existirem.
- `src/app/router.tsx` — `createBrowserRouter` com a lista de rotas: `/` → `GamesPage` (o catálogo) e
  `/status` → `StatusPage` (o diagnóstico de health que antes era a home), as duas **aninhadas no
  `AppLayout`** (§5.6). Registre rotas novas aqui, como filhas do layout, conforme cada feature ganha
  uma página.

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

| Pasta                    | Para quê                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `src/features/<nome>/`   | Uma feature de domínio (componentes, hooks, chamadas de API específicas dela). Hoje só `games/`: ver §5.5. |
| `src/pages/`             | Componentes de página, um por rota, registrados em `app/router.tsx`.                                       |
| `src/shared/components/` | Componentes de UI reutilizáveis entre features.                                                            |
| `src/shared/hooks/`      | Hooks reutilizáveis entre features.                                                                        |
| `src/shared/lib/`        | Infra transversal: cliente HTTP, query client, acesso a env, conectividade, armazenamento local (§5.7).    |
| `src/styles/`            | Entrada do Tailwind (`index.css`) e qualquer CSS global.                                                   |

Regra prática: se o código só faz sentido dentro de uma feature, ele mora em
`features/<nome>/`; se é usado por duas ou mais features (ou não pertence a nenhuma), vai em
`shared/`.

### 5.5 Catálogo de jogos (`features/games/`, spec `docs/specs/catalogo-jogos.md`, etapa 3)

- **Dados:** o web busca a lista **completa** uma vez (`GET /api/games`, query `['games']`); o filtro
  (`/?status=`, na URL) e as contagens dos painéis e botões saem dela, no cliente. Toda mutação invalida
  essa query. Chamadas só pelo `apiClient`, tipos de `@checkpoint/shared`. O upload da capa manda
  `multipart/form-data` **explícito**: o `apiClient` tem `Content-Type: application/json` por padrão e,
  nesse caso, o axios converte o `FormData` em JSON (a API recebia o arquivo vazio: 400).
- **`lib/`** (lógica pura, com teste ao lado): `count-by-status`, `status-filter`, `game-cover` (cor da
  capa gerada por hash FNV-1a do título + iniciais), `api-error` (mapeia o `fields` da
  `ApiErrorResponse` para os campos do formulário), `cover-file` (pré-checagem de tipo e tamanho),
  `form-values` (`nota: null` explícito em "Quero jogar"), `platforms` (lista de plataformas) e
  `save-game` (salva o jogo e SÓ DEPOIS a capa; se a capa falha, devolve o jogo salvo + o erro da capa e
  o formulário passa a editar aquele jogo, para o próximo Salvar ser `PATCH`, não `POST`/409).
- **Plataforma** é uma seleção das plataformas mais usadas, agrupadas por família; a API continua
  aceitando texto livre, e uma plataforma antiga fora da lista vira opção extra na edição.
- **Diálogos** são `<dialog>` nativo com `showModal()` (`shared/components/ModalDialog`): Esc fecha, o
  foco fica preso e volta ao botão que abriu. O `autoFocus` do React não funciona com o diálogo
  fechado; o foco inicial vai para o elemento com `data-autofocus`.
- **Tema Neon arcade:** todos os tokens de cor (e os únicos hex do web) ficam no `@theme` de
  `src/styles/index.css`; componentes usam só as classes (`bg-fundo`, `text-ouro`...) e os brilhos são
  `color-mix()` dos tokens. Status: Zerado = `ouro`, Jogando = `ciano`, Quero jogar = `vermelho-neon`.
  `prefers-reduced-motion: reduce` desliga todas as animações e transições. Fontes (Orbitron, Rajdhani)
  e ícones (Material Symbols Rounded) vêm por `<link>` no `index.html`, sem pacote npm. O número da nota
  usa Rajdhani (a Orbitron deixa o 0 e o 8 ambíguos).
- **Build de produção:** o `@checkpoint/shared/dist` é CommonJS e linkado; o `vite.config.ts` libera
  esse caminho em `build.commonjsOptions`, senão o Rollup não enxerga os valores exportados (o `dev`
  esconde o problema).
- **Testes** (Vitest + Testing Library, `apiClient`/`gamesApi` mockados; o `jsdom` não tem
  `showModal()`, então `src/test/setup.ts` tem um polyfill mínimo): `lib/*.test.ts`,
  `GameForm.test.tsx`, `GamesPage.test.tsx`, `api/games-api.test.ts` e `styles/tokens.test.ts` (sem hex
  fora do `@theme`, regra de movimento reduzido no CSS, links de fontes).

### 5.6 Layout mobile-first (`app/layout/`, spec `docs/specs/pwa-e-mobile.md`, etapa 1)

- **`AppLayout`** envolve toda tela do app: fundo Neon (orbes + _scanlines_, que saíram da
  `GamesPage`), `TopNav`, o `<Outlet/>` e a `BottomNav`. **Nenhuma página importa a navegação**
  (teste em `AppLayout.test.tsx`).
- **`nav-items.ts`** é a fonte única dos destinos (hoje "Jogos" e "Adicionar"; "Perfil" entra com a
  spec `autenticacao`). `/status` fica fora de propósito.
- **`BottomNav`** (< 768px, o `md`): fixa embaixo, renderizada por portal (`OverlayPortal`) no
  `#overlay-root`, irmão do `#root` no `index.html`, para nenhum `transform` de ancestral prender o
  `position: fixed`. Some enquanto um campo **fora de diálogo** está focado
  (`use-typing-outside-dialog`), para não flutuar sobre o teclado virtual. "Adicionar" navega para
  `/?novo=1` (mantendo o `?status=` quando já está em `/`); a `GamesPage` abre o formulário e tira o
  `novo` da URL com `replace` (`features/games/lib/new-game.ts`).
- **`TopNav`** (>= 768px) usa a mesma lista, mas só aparece com mais de um link; com um só, o desktop
  fica como era (o "Adicionar" do desktop é o botão "Adicionar jogo" do catálogo).
- **Ponto de quebra único: 768px (`md`).** O catálogo usava `max-[900px]`; não usa mais.
- **CSS** (`styles/index.css`, camada `components`): `.app-shell` (`100dvh` com `100vh` de reserva),
  `.safe-x`, `.nav-clearance` e `.bottom-nav` (safe-area por `env()`), `.game-row` (grade no celular,
  linha no desktop, áreas por `data-area`), `.game-title` (2 linhas no celular), `dialog.modal` (folha
  inferior no celular com a animação `sheet-up`, centralizado em >= 768px), `.sheet-footer`/`.sheet-pad`.
  Globais: `touch-action: manipulation`, piso de 16px nos campos (camada `base`, evita o zoom do iOS),
  hover da linha só com `@media (hover: hover)` e `overscroll-behavior-y: none` só no app instalado.
  `env(safe-area-*)` fica em classe própria, não em classe arbitrária do Tailwind (que poderia
  espaçar o `-` dentro do `calc()`).
- **Viewport** (`index.html`): `viewport-fit=cover` e `interactive-widget=resizes-content`, **sem**
  `maximum-scale`/`user-scalable` (zoom não é travado, WCAG 1.4.4).

### 5.7 Armazenamento local e conectividade (`shared/lib/`, spec `docs/specs/pwa-e-mobile.md`, etapa 2)

- **Armazenamento local só por `shared/lib/storage/`.** Nenhum outro arquivo do web usa a API nativa
  do navegador para isso (o teste `no-direct-access.test.ts` varre o `src` inteiro). Cada chave é
  declarada com `defineKey({ nome, escopo, padrao, validar })` (`keys.ts`; nome repetido lança);
  `escopo` é `dispositivo` (fica ao trocar de usuário) ou `usuario` (`storage.clearScope('usuario')`
  apaga só as chaves **registradas** desse escopo, nunca por prefixo). Tudo é gravado como JSON sob
  `checkpoint:`.
- `storage.get/set/remove` **nunca lançam**: JSON inválido ou valor que o `validar` recusa devolve o
  padrão e apaga a chave; armazenamento bloqueado ou cheio cai num `Map` em memória (cota cheia avisa
  com **um** `console.warn` por sessão, sem o valor).
- **Versão e migração** (`migrations.ts`): `STORAGE_SCHEMA_VERSION` (hoje 1) em `checkpoint:versao`;
  `runStorageMigrations()` roda em `main.tsx` **antes** do render. Ausente → grava a atual; menor →
  aplica `MIGRATIONS[n]` (n→n+1) em ordem; maior, ilegível ou migração que lança → apaga **todas** as
  chaves `checkpoint:*` (só elas; `outro-app:x` fica) e grava a atual. Mudar o formato de uma chave =
  subir a versão + escrever a migração.
- **Conectividade** (`connectivity.ts`, hook `use-connectivity`): store externo lido por
  `useSyncExternalStore` com `online | offline | sem-servidor`. Entradas: eventos `online`/`offline` e
  `visibilitychange` (ligados por `connectivity.start()` em `main.tsx`) e o **interceptor de resposta
  do `apiClient`** (sem resposta → `sem-servidor`, ou `offline` se `navigator.onLine` é falso; qualquer
  resposta HTTP → `online`). A sondagem `GET /api/health` usa o **mesmo** `apiClient`, com a marca
  `isConnectivityProbe` na config para o interceptor não a realimentar; espera 5/10/20 s e depois 30 s
  (este só com a aba visível). Voltar a `online` chama `queryClient.invalidateQueries()`.
  `connectivity.ts` não importa o `api-client` (evita ciclo): é o `api-client` que registra a sondagem.
- `queryClient` usa `networkMode: 'always'` em queries e mutations (o padrão pausaria a consulta sem
  rede e a lista ficaria carregando para sempre).
- **`ConnectionBanner`** (renderizado pelo `AppLayout` no `#overlay-root`): região `role="status"`
  sempre presente; aviso no topo, abaixo de `env(safe-area-inset-top)`; "Conexão restabelecida" some em
  3 s; "Tentar agora" chama `connectivity.retryNow()`.
- **Mensagens sem conexão** (`features/games/lib/api-error.ts`): escrita sem resposta → "Sem conexão.
  Nada foi salvo…"; capa que falha depois de o jogo salvo → "O jogo foi salvo, mas a capa não…"; tempo
  esgotado → "O servidor não respondeu a tempo…" (o servidor pode ter gravado). `ListError` recebe
  `offline` e mostra "Sem conexão. Seu catálogo aparece quando a conexão voltar.". Botões **não** são
  desabilitados por causa do estado da conexão.

### 5.8 PWA base (`pwa.config.ts`, `shared/lib/pwa/`, spec `docs/specs/pwa-e-mobile.md`, etapa 3)

- **`apps/web/pwa.config.ts`** (importado pelo `vite.config.ts` e pelos testes) exporta `MANIFEST`,
  `pwaOptions` e `pwaPlugin` (`vite-plugin-pwa`, `generateSW`, `registerType: 'prompt'`,
  `injectRegister: false`). O precache é o shell (js/css/html/svg/png/webp/woff2) com a revisão (hash)
  de cada arquivo, gerada no build: **não há número de versão de cache no código**. `runtimeCaching`
  é `[]` (nem API, nem fontes, nem capas: offline só o shell). `navigateFallback` é o `index.html`,
  exceto `/api/`. O SW novo **não** se ativa sozinho: só quando o usuário clica em Atualizar.
- **O SW só existe no build.** `devOptions.enabled` é `false`: no `npm run dev` não há SW. Verifique
  com `npm run build` + `npm run preview -w @checkpoint/web` (:4173). O Vitest tem config própria,
  sem o plugin: nenhum teste registra SW.
- **Manifest** (`/manifest.webmanifest`, gerado no build; o `<link>` é injetado pelo plugin). Sem
  `orientation` (retrato e paisagem). Com `shortcuts` (§5.9). Ícones `any` e `maskable` em entradas
  separadas, apontando para `public/icons/*`.
- `theme_color`, `background_color` e o `<meta name="theme-color">` repetem o hex do token `fundo`
  (o manifest não lê CSS); `pwa.config.test.ts` confere que os três são iguais ao `--color-fundo`.
- **`shared/lib/pwa/use-app-update.ts`** é o **único** arquivo que importa `virtual:pwa-register/react`
  (os testes mockam este arquivo, nunca o módulo virtual; o mock padrão está em `test/setup.ts`).
  Expõe `{ precisaAtualizar, atualizar(), adiar() }` e busca versão nova no registro, a cada 60 min
  com a aba visível e ao voltar a aba para visível. Tipos do módulo virtual: `vite-plugin-pwa/react`
  em `tsconfig.app.json`.
- **`UpdatePrompt`** (renderizado pelo `AppLayout` no `#overlay-root`, acima da barra inferior):
  "Nova versão disponível", **Atualizar** (`updateServiceWorker(true)`, o único recarregamento do app) e
  **Depois** (esconde até o próximo carregamento). Não aparece enquanto há um `<dialog open>`
  (`shared/hooks/use-dialog-open.ts`) e volta quando ele fecha. Sem diálogo nativo de confirmação, sem
  ativação imediata do SW e sem recarga automática (`no-forced-reload.test.ts` varre o código).
- Animação do aviso: `update-in` (nome próprio; `pulse`/`spin`/`ping`/`bounce` colidem com o Tailwind),
  desligada pela regra global de `prefers-reduced-motion`.

### 5.9 Instalação (`shared/lib/pwa/`, `InstallNudge`, spec `docs/specs/pwa-e-mobile.md`, etapa 4)

- **`install-prompt.ts`** é importado na **primeira linha** de `main.tsx` (teste confere): liga na
  importação `beforeinstallprompt` (`preventDefault()` + guarda o evento) e `appinstalled` (descarta o
  evento e grava `instalacao:instalado = true`). O Chrome dispara o evento uma vez e cedo; quem começa a
  escutar dentro de um componente o perde. Exporta `podeInstalar()`, `pedirInstalacao()`
  (`'aceito' | 'recusado' | 'indisponivel'`; o evento só vale uma vez) e `assinar(cb)`. O tipo
  `BeforeInstallPromptEvent` é declarado ali (não existe no `lib.dom`).
- **`display.ts`**: `estaInstalado()` (`display-mode: standalone` ou `navigator.standalone`) e
  `ehSafariIos()` (iPhone/iPad, incluindo iPadOS que se apresenta como Mac; Chrome/Firefox/Edge do iOS
  não contam; fora do app instalado).
- **Chaves** (`install-keys.ts`, todas `dispositivo`, por `defineKey`): `instalacao:instalado`,
  `instalacao:dispensado-em` (epoch ms ou `null`) e `instalacao:dias-de-uso` (`{ ultimoDia, total }`).
- **Contagem de dias de uso** (`usage-days.ts`): `registrarDiaDeUso()` roda em `main.tsx` logo **depois**
  de `runStorageMigrations()` e antes do render. O dia é o **local** (AAAA-MM-DD; UTC viraria o dia às 21h
  no Brasil). `proximosDiasDeUso` é a parte pura.
- **`InstallNudge`** (renderizado pelo `AppLayout` no `#overlay-root`, acima da barra inferior, mesmo
  cartão do `UpdatePrompt`): aparece 4 s depois da carga, quando TODAS valem: não instalado, `instalado`
  falso, convite nativo **ou** Safari do iOS, fora de `/login` e `/registro`, sem `<dialog open>`
  (`use-dialog-open`), `dias-de-uso.total >= 2`, `dispensado-em` nulo ou há >= 14 dias, **e sem o
  `UpdatePrompt` na tela** (`update-prompt-visibility.ts`: a atualização tem prioridade). "Agora não",
  "Entendi" ou o prompt recusado gravam `dispensado-em`; aceito some e não volta.
- **Atalhos do manifest** (`pwa.config.ts`): "Adicionar jogo" → `/?novo=1` e "Jogando" →
  `/?status=JOGANDO`, sem `icons` (os PNGs de 96 px são opcionais e não existem).

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

| Arquivo         | Variáveis                                                              | Para quê                                                                                                                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/.env` | `NODE_ENV`, `PORT`, `DATABASE_URL`, `CORS_ORIGIN`                      | Validadas em `src/config/env.validation.ts`; falta/erro derruba o boot                                                                                                                                                                                                                                        |
| `apps/api/.env` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Storage das capas; validadas em `env.validation.ts` (obrigatórias). O valor da chave é a **secret key** (`sb_secret_…`) e só o backend a usa: nunca vai para o web nem para log                                                                                                                               |
| `apps/api/.env` | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `AUTH_REGISTRATION_OPEN`    | Autenticação; obrigatórias em `env.validation.ts`. Os dois segredos têm ≥ 32 caracteres e são **diferentes**; gere cada um localmente (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`). Nunca vão para o web, spec, log ou PR. `AUTH_REGISTRATION_OPEN` é `true` ou `false` |
| `apps/api/.env` | `AUTH_REGISTRATION_LIMIT_PER_HOUR`                                     | **Opcional**, só dev/teste: sobrescreve o limite de 3 registros por hora por IP. Em ambiente exposto, deixe ausente                                                                                                                                                                                           |
| `apps/api/.env` | `DIRECT_URL`                                                           | Só o Prisma CLI lê (via `schema.prisma`); necessária apenas se `DATABASE_URL` for uma conexão pooled (ex.: Supabase)                                                                                                                                                                                          |
| `apps/web/.env` | `VITE_API_URL`                                                         | Consumida em `src/shared/lib/env.ts`, `baseURL` do `apiClient`                                                                                                                                                                                                                                                |

`CORS_ORIGIN` deixou de ter padrão e **recusa `*`** (cookie de sessão): liste as origens, ex.:
`http://localhost:5173`. Cada arquivo tem um `.env.example` correspondente, versionado. Nunca commitar `.env` real nem
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
`packages/shared/src/games.ts`); o passo 3 (`features/games/` no web) existe desde a etapa 3 da spec. Este
arquivo não deve ser editado para "prever" um design de domínio que ainda não foi decidido: cada
feature nova atualiza as seções que ela toca **no mesmo commit** (novo módulo em §4.4, nova feature
em §5.4, novo model em §4.3).

Quando o projeto ganhar auth, testes automatizados, PWA ou pipeline de deploy, as linhas
correspondentes em §1 deixam de dizer "não existe" e passam a descrever o mecanismo real — até lá,
não assuma nenhuma delas.
