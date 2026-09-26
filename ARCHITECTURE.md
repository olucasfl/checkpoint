# ARCHITECTURE.md — checkpoint

Guia técnico do monorepo. Descreve o que **existe de fato** hoje — o projeto é um esqueleto
recém-criado: uma única entidade de domínio (`Game`, catálogo de jogos, com API e tela) e sem auth. Leia
isto antes de tocar em qualquer workspace; atualize a seção afetada no mesmo commit que muda o
comportamento que ela descreve.

> `README.md` é a porta de entrada (setup, scripts, "próximos passos"). Este arquivo é o guia
> técnico — como as peças se encaixam e por quê.

---

## 1. Visão geral

|                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipo de repo         | Monorepo único, npm workspaces (`apps/*`, `packages/*`) — não é multi-repo                                                                                                                                                                                                                                                                                                                                                                     |
| Gerenciador          | npm 10+ (workspaces). Não usar pnpm nem yarn                                                                                                                                                                                                                                                                                                                                                                                                   |
| Node                 | 20.19+ (`engines` do `package.json` da raiz; `.nvmrc` = `20.19`). O piso vem do `jsdom@27`; as versões de teste do web foram escolhidas para rodar em Node 20.19                                                                                                                                                                                                                                                                               |
| Linguagem            | TypeScript 5, strict, em todos os workspaces                                                                                                                                                                                                                                                                                                                                                                                                   |
| `apps/api`           | `@checkpoint/api` — NestJS 11, Express, Prisma 6, PostgreSQL 16                                                                                                                                                                                                                                                                                                                                                                                |
| `apps/web`           | `@checkpoint/web` — React 19, Vite 6, React Router 7, TanStack Query 5, Tailwind CSS 4, axios                                                                                                                                                                                                                                                                                                                                                  |
| `packages/shared`    | `@checkpoint/shared` — tipos/contratos/utils puros, compilado para `dist/` (CommonJS + `.d.ts`)                                                                                                                                                                                                                                                                                                                                                |
| Storage de arquivos  | Supabase Storage (bucket público `capas`, mesmo projeto do banco), só para as capas dos jogos; acessado pelo backend pela REST com `fetch` (sem SDK). Leitura pública; escrita só pelo backend, com a secret key                                                                                                                                                                                                                               |
| Banco                | PostgreSQL 16, instância local ou gerenciada (ex.: Supabase) — sem Docker no projeto                                                                                                                                                                                                                                                                                                                                                           |
| Qualidade            | ESLint 9 (flat config, `eslint.config.mjs` na raiz), Prettier, Husky, lint-staged, commitlint (Conventional Commits)                                                                                                                                                                                                                                                                                                                           |
| Testes               | Jest 30 + ts-jest na API e Vitest 4 + Testing Library + jsdom na web (`npm test -w <workspace>`); `packages/shared` não tem runner próprio. `npm test` na raiz compila o `shared` antes (`pretest`). Convenções em `.claude/skills/checkpoint-testing/SKILL.md`                                                                                                                                                                                |
| Auth                 | Spec `autenticacao`, etapas 1 a 5: e-mail e senha, access token (JWT, 15 min) + refresh token (30 dias) em cookie HttpOnly, com rotação e guard global (§4.5); troca de senha; telas no web (§5.10); cada jogo tem dono obrigatório e `games` exige login (§4.4)                                                                                                                                                                               |
| PWA / service worker | Spec `pwa-e-mobile`: manifest e service worker gerados no build (`vite-plugin-pwa`, `generateSW`; só existem no build, não no `npm run dev`), com precache só do shell (offline: só o shell, sem API, fontes nem capas) e atualização que só se ativa quando o usuário clica em Atualizar (§5.8); instalação do app em §5.9                                                                                                                    |
| Deploy / CI          | Em produção: web na **Vercel** (`apps/web/vercel.json`: rewrite de `/api/*` para a API no Render, o que mantém o cookie de sessão no mesmo site, e fallback do SPA para `index.html`), API no **Render** (o script `start` é `node dist/main.js`; as variáveis de ambiente ficam no painel, §8), banco e bucket no **Supabase**. Sem Dockerfile nem workflow de CI no repositório: a configuração de build de Vercel e Render vive nos painéis |

Não assuma nenhuma dessas ausências como "esquecimento" a corrigir de lado — são decisões de
escopo do esqueleto. Adicionar qualquer uma delas é uma feature própria, com spec (`docs/specs/`),
não um efeito colateral de outra tarefa.

**Testes sob carga (linha "Testes" acima):** o timeout por teste é de **20 s** no Jest
(`apps/api/jest.config.js`, que substituiu o bloco `jest` do `package.json` para caber o comentário) e
no Vitest (`testTimeout` e `hookTimeout` em `apps/web/vitest.config.ts`), e o Vitest usa no máximo
**4 workers** (`maxWorkers`). Existem porque a máquina de desenvolvimento é lenta (projeto dentro do
OneDrive): com o padrão de 5 s e um worker por núcleo, o `npm test` da raiz falhava de forma
intermitente ("Test timed out in 5000ms", "Failed to start forks worker"), embora cada arquivo
passasse sozinho. Não são folga para teste lento: um teste que precise de mais que isso é um problema.

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

**Cuidado com o cache do Vite:** o `shared` emite CommonJS e o Vite o **pré-empacota** em
`apps/web/node_modules/.vite/deps/@checkpoint_shared.js`, um cache que ele só refaz quando o lockfile ou a
config mudam. Se você acrescentar uma **exportação nova** ao `shared` e o app (só no `dev`) quebrar com
"`X is not iterable`" ou "`X is not a function`" para algo que existe no `dist/`, apague esse diretório
(`rm -rf apps/web/node_modules/.vite`) e reinicie o `dev`. O `build` de produção e os testes não usam esse cache. O Vite serve esses módulos como imutáveis, então **o
navegador também pode guardar uma cópia velha**: depois de apagar o cache, recarregue a aba **sem cache**
(Ctrl+Shift+R; ou, no console, `fetch(url, { cache: 'reload' })` na URL `@checkpoint_shared.js?v=…` e recarregue).

`packages/shared` só pode conter código agnóstico de plataforma: tipos, contratos de request/
response, enums, funções puras. Nada que dependa de `window`, do Node ou do `@prisma/client`.

---

## 3. Estrutura de pastas (estado real)

```
checkpoint/
├── apps/
│   ├── api/                          # @checkpoint/api
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # datasource + generator + enums GameStatus e Provedor + models Game, User, RefreshSession, ContaVinculada e JogoPlataforma
│   │   │   └── migrations/           # migrations versionadas (commitadas)
│   │   └── src/
│   │       ├── common/                # errors/ (ApiErrorResponse), pipes/ (ValidationPipe global), decorators/ (@Public, @CurrentUser), dto/ (transforms); filters/ e interceptors/ vazias (.gitkeep)
│   │       ├── config/                 # app.config.ts, env.validation.ts, index.ts
│   │       ├── database/               # PrismaModule (@Global) + PrismaService
│   │       ├── modules/                # um módulo por domínio — hoje health/, games/, auth/, users/ e integrations/
│   │       │   ├── health/             # GET /api/health → status da API + do banco
│   │       │   ├── games/              # catálogo de jogos: GET/POST/PATCH/DELETE /api/games
│   │       │   ├── auth/               # registro, login, refresh, logout, me; guard global de access token (§4.5)
│   │       │   ├── users/              # a conta do usuário logado: PATCH /api/users/me (nome), POST /api/users/me/exclusao; lista branca do Usuario
│   │       │   └── integrations/       # integrações com plataformas de jogos (Steam): vínculo por OpenID, cartão do perfil, GameProvider/SteamClient (§4.4)
│   │       ├── app.module.ts           # inclui o guard global (APP_GUARD)
│   │       ├── app.setup.ts            # setupApp(): prefixo /api, cookie-parser, CORS, ValidationPipe, Swagger (o main.ts e a verificação manual usam o mesmo)
│   │       └── main.ts                 # bootstrap: cria o app, setupApp() e listen
│   │
│   └── web/                           # @checkpoint/web
│       ├── pwa.config.ts               # manifest + plugin de PWA (Workbox); ver §5.8
│       └── src/
│           ├── app/                    # providers.tsx (AppProviders) + routes.tsx (as rotas) + router.tsx (AppRouter)
│           │   └── layout/             # AppLayout/AppFrame, AuthLayout, RequireAuth, LoadingScreen, Backdrop, BottomNav, TopNav, nav-items.ts
│           ├── features/               # uma pasta por feature — hoje games/, auth/, perfil/ e integracoes/ (api/, lib/, session/, components/)
│           ├── pages/                  # páginas de rota — GamesPage (/), GameDetailPage (/jogos/:id), PerfilPage (/perfil), TrocarSenhaPage (/perfil/senha), LoginPage, RegistroPage e StatusPage (/status)
│           ├── shared/
│           │   ├── components/         # Icon (Material Symbols), ModalDialog (<dialog> nativo), OverlayPortal, ConnectionBanner, UpdatePrompt, InstallNudge
│           │   ├── hooks/              # use-typing-outside-dialog (esconde a barra com o teclado aberto), use-connectivity, use-dialog-open, use-install-option
│           │   └── lib/                # api-client.ts (axios), query-client.ts, env.ts, connectivity.ts, game-cover.ts (cor + iniciais por hash), storage/ (armazenamento local tipado), pwa/ (use-app-update, install-prompt, display, usage-days, install-keys)
│           ├── styles/                 # index.css — entrada do Tailwind
│           └── main.tsx
│
├── packages/
│   └── shared/
│       └── src/
│           ├── games.ts               # contrato do catálogo de jogos (tipos, constantes, notas por critério e notaMedia)
│           ├── integracoes.ts         # contrato das integrações com plataformas (Provedor, tipos, constantes de atualização, chaveDeTitulo)
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
   `/api/*`. Logo em seguida, **`trust proxy`**: `app.set('trust proxy', TRUST_PROXY_HOPS)`, com a env
   opcional validada em `env.validation.ts` (inteiro de 0 a 10; **ausente = 0**, que ignora o
   `X-Forwarded-For`). É um **número de saltos, nunca `true`**: sem isso o `req.ip` é o endereço do socket,
   que atrás de Vercel → Render é o do proxy, e o limite por IP (§4.5) agrupava todos os usuários num contador
   só (bug corrigido em `fix/trust-proxy`, com regressão em `app.setup.trust-proxy.http.spec.ts`). Com N saltos o
   Express só confia nos **últimos N** endereços do cabeçalho e usa o anterior a eles como IP do cliente, então
   o que o cliente forjar **antes** disso não muda o IP usado. O número **precisa ser medido em produção** (um
   valor menor que o real deixa o limite quebrado; um maior deixa o cabeçalho forjável).
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
   Esquecer o decorator **fecha** a rota, nunca a abre. Hoje são públicas só `health` e as rotas de auth
   (`registro`, `login`, `refresh`, `logout`); o `GamesController` é protegido desde a etapa 3 da spec
   `autenticacao`. `@CurrentUser()` entrega `{ id, sessionId }` ao controller.
5. **Swagger** servido em `/api/docs` (`SWAGGER_PATH`), montado a partir do `DocumentBuilder` em
   `app.setup.ts`, com `addBearerAuth()` (botão "Authorize"). Todo controller novo deve usar `@ApiTags`/`@ApiOperation` como `HealthController` já
   faz — é a única documentação viva das rotas hoje.

### 4.2 Configuração e ambiente (`src/config/`)

- `env.validation.ts` — `EnvironmentVariables` (class-validator) valida `NODE_ENV`, `PORT`,
  `DATABASE_URL`, `CORS_ORIGIN` (obrigatória, **sem padrão e sem `*`**), `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET` (≥ 32 caracteres, **diferentes** entre si), `AUTH_REGISTRATION_OPEN`
  (`true`/`false`, sem padrão; o texto é lido cru porque a conversão implícita transformaria `"false"` em
  `true`), `AUTH_REGISTRATION_LIMIT_PER_HOUR` (opcional, inteiro ≥ 1; ausente = 3) e `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_STORAGE_BUCKET` (capas, §4.4) no boot, mais as três da integração com plataformas (spec
  `integracao-plataformas`): `STEAM_API_KEY` (32 hexadecimais, **só o backend**: viaja na query string das
  chamadas à Steam, então nunca vai para o web nem para log, e a mensagem de erro não a ecoa),
  `API_PUBLIC_URL` (o endereço em que o **navegador** alcança a API, usado no `return_to`/`realm` do OpenID: em
  produção o domínio da Vercel, por causa do rewrite de `/api`; em dev `http://localhost:3333`) e
  `WEB_PUBLIC_URL` (a origem do web, para onde o retorno do vínculo redireciona), as duas **sem barra final e
  sem caminho**; falta ou valor inválido **derruba a aplicação** com a
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
  `Game`: `titulo`, `plataforma` (`""` = sem plataforma; a API expõe `null`), `status`, as cinco notas por
  critério `notaGameplay`/`notaHistoria`/`notaGraficos`/`notaTrilhaSonora`/`notaPerformance` (`Int?` em
  **décimos**, 0 a 100: 7,3 = 73; sem `Decimal` nem ponto flutuante; a conversão fica só no
  `GamesService`/`games/lib/ratings.ts`), `descricao` (`VarChar(1000)?`), `capaPath` (`String?`: caminho do objeto da capa no bucket, não a URL), `userId` (o dono,
  ver abaixo), `criadoEm`/`atualizadoEm` e as colunas `tituloNormalizado`/`plataformaNormalizada`,
  preenchidas pelo `GamesService` (aparadas e em minúsculas) e cobertas por
  `@@unique([userId, tituloNormalizado, plataformaNormalizada])`. É assim, e não com um índice `lower()`
  escrito à mão, para o Prisma enxergar toda a estrutura e o `migrate dev` não acusar drift. A
  migration também tem `CHECK`s escritos à mão (cada nota entre 0 e 100; as cinco nulas com
  `QUERO_JOGAR`), que o Prisma não modela e não vê como drift. Este projeto usa **migrations versionadas**
  (`prisma migrate dev`/`prisma migrate deploy`), diferente de um fluxo baseado em `db push` sem
  histórico — toda mudança de schema gera um arquivo em `prisma/migrations/` que fica commitado.
  Ver §7 e `.claude/rules/RULES.md`.
- **`User` e `RefreshSession`** (spec `autenticacao`, migração A1, **aditiva**): `User` (`nome`, `email`
  único e sempre normalizado, `senhaHash`) e `RefreshSession` (uma linha por dispositivo logado; o `id` é o
  `sid` dos tokens; guarda só o **SHA-256** do refresh token e o do anterior, mais um rótulo do dispositivo
  derivado do `User-Agent`, sem IP), com `onDelete: Cascade`.
- **`Provedor`, `ContaVinculada` e `JogoPlataforma`** (spec `integracao-plataformas`, etapa 1, migration
  `integracao_plataformas`, **só aditiva**: um enum e duas tabelas, nenhuma coluna existente tocada).
  `Provedor` é um enum do Postgres (`STEAM`; acrescentar um valor é `ALTER TYPE … ADD VALUE`). `ContaVinculada`
  é a conta do usuário na plataforma, com a posse já comprovada (na Steam, o SteamID64 pelo OpenID): `userId`,
  `provedor`, `idExterno`, `nomeExibicao`, `vinculadaEm`, com `@@unique([userId, provedor])` (uma por provedor).
  `JogoPlataforma` é a camada da plataforma sobre um `Game` (o **último valor** consultado, nunca substitui
  título, status, notas nem a capa do usuário): `gameId`, `userId` (repetido de `Game.userId` para a unicidade
  por usuário; o service grava sempre com `where: { id, userId }`), `provedor`, `idExterno` (o appid),
  `minutosJogados`, `ultimaVezJogadoEm`, `conquistasTotal`/`conquistasDesbloqueadas` (`null` = nunca consultado
  ou negado; `0` = o jogo não tem conquistas), `capaUrl` e `atualizadoEm`, com `@@unique([userId, provedor,
idExterno])` e `@@unique([gameId, provedor])` (1 para 1 nos dois sentidos). As duas tabelas têm `onDelete:
Cascade` a partir de `User` (e `JogoPlataforma` também de `Game`): excluir a conta leva os vínculos e os dados
  por provedor. `CHECK`s escritos à mão na migration: `minutosJogados >= 0` e conquistas nunca negativas, com as
  desbloqueadas nunca acima do total. A lista de conquistas **não** é gravada (é buscada ao abrir o detalhe).
- **`Game.userId`** (spec `autenticacao`): **obrigatório** (`String`, `NOT NULL`), com FK para `User` e
  `onDelete: Cascade` (excluir a conta apaga os jogos no banco; as capas no bucket ficam por conta de quem
  exclui). Veio em duas migrações **destrutivas**, aprovadas na spec: a A3 (`game_dono`) criou a coluna
  nulável e trocou o `@@unique`; a A4 (`game_dono_obrigatorio`) fez o `SET NOT NULL`, precedido de uma trava
  escrita à mão (`DO $$ … RAISE EXCEPTION`) que aborta com mensagem clara se ainda houver jogo sem dono. A
  unicidade é **por dono**; com `userId` na frente, o mesmo índice serve ao `where: { userId }`, então não há
  `@@index([userId])`.

### 4.4 Módulo por domínio (`src/modules/`)

Convenção NestJS padrão, um módulo por domínio, cada um com `*.module.ts` + `*.controller.ts` +
`*.service.ts` (+ `dto/` quando a rota aceitar body). Hoje há cinco (`health/`, `games/`, `auth/`, §4.5 —
que também guarda as **sessões ativas** do perfil —, `users/` e `integrations/`):

- `health/` — `GET /api/health`, sem domínio; serve de modelo de forma.
- `games/` — o catálogo de jogos (spec `docs/specs/catalogo-jogos.md`, etapas 1 e 2; o web está em §5.5):
  - **Por dono** (spec `autenticacao`, etapa 3): o controller **não** é `@Public()`; todo método recebe
    o `userId` de `@CurrentUser()` e o `GamesService` o põe em **todo** `where` (`list` filtra por
    `userId`; `create` grava; `update`, `remove`, `setCover` e `removeCover` buscam/gravam com
    `where: { id, userId }`). Jogo de outro usuário ou sem dono é **404 "Jogo não encontrado"**, igual a
    um id inexistente (não revela que existe). `userId` **não** está no `Game` da resposta (os campos
    são listados um a um em `toGame`) e **não** é aceito no corpo (400, campo desconhecido).
  - `GET /api/games[?status=]` (ordenado por `atualizadoEm` desc, desempate `criadoEm` desc),
    `POST /api/games`, `PATCH /api/games/:id` (parcial; só `plataforma`, os cinco critérios de nota e `descricao` aceitam `null`) e
    `DELETE /api/games/:id` (204).
  - **Capa** (uma por jogo, opcional): `PUT /api/games/:id/capa` (multipart, campo `arquivo`) e
    `DELETE /api/games/:id/capa`. Só JPEG/PNG/WebP, identificados pela **assinatura do arquivo**
    (`cover/image-signature.ts`) e não pelo `Content-Type`; até 2 MB (413). O objeto vai para o
    bucket público `capas` do Supabase como `<userId>/<gameId>/<uuid>.<ext>` (o prefixo do dono
    facilita apagar tudo de uma conta); o banco guarda o caminho inteiro (`capaPath`) e a resposta
    expõe `capaUrl` (nunca o caminho). As capas enviadas antes da etapa 3 seguem em
    `<gameId>/<uuid>.<ext>` e continuam funcionando pelo caminho gravado, sem migrar objeto. Trocar a capa envia o objeto novo,
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
  - **Notas por critério** (spec `avaliacao-de-jogos`): cinco campos no topo do corpo (`gameplay`, `historia`,
    `graficos`, `trilhaSonora`, `performance`), cada um `number | null` de 0 a 10 com no máximo 1 casa
    (DTO `GameRatingFieldsDto`, um decorator `Rating` que lê o valor cru: texto `"8"` falha). A resposta as
    agrupa em `notas` e traz `notaMedia` (calculada por `notaMedia()` do shared, nunca gravada) e `descricao`
    (`TrimText`: `\r\n` vira `\n`, apara as pontas; vazia vira `null` no service). O campo antigo `nota` não existe
    mais (400, campo desconhecido).
  - **Regras das notas** (no service, sobre o **estado final** = registro atual + body, porque o DTO só enxerga o
    body): `QUERO_JOGAR` não tem nenhuma nota (400 com `fields.<critério>` em cada preenchido; `{ status:
"QUERO_JOGAR" }` num jogo com nota é 400, a menos que o mesmo body traga todas como `null`); **Zerado exige ao
    menos 1 critério só quando a escrita muda o status para Zerado ou o VALOR de algum critério** em relação
    ao gravado (`fields.notas`; a presença no body não conta, porque o formulário envia tudo sempre, e assim os
    jogos Zerado sem notas continuam editáveis). A API nunca apaga nota por conta própria.
  - **Duplicidade** (mesmo dono, título e plataforma, sem diferenciar caixa nem espaços nas pontas): checagem
    prévia para dar um 409 claro; a garantia real é o `@@unique` do banco, e o `P2002` da corrida
    também vira 409. Ao editar, o próprio jogo não conta como duplicata.
  - `id` que não é UUID → 400 (`ParseUUIDPipe`); UUID sem jogo → 404.
  - Testes ao lado do código: `games.service.spec.ts` (regra de negócio, Prisma mockado),
    `dto/*.spec.ts` (validação pelo pipe do `main.ts`), `games.http.spec.ts` e
    `games.cover.http.spec.ts` (status e corpo por HTTP, numa porta local, com o multer real e sem
    banco nem Supabase), `games.cover.service.spec.ts` e `cover/*.spec.ts` (assinatura de imagem e
    `StorageService` com `fetch` mockado). Os dois specs HTTP sobem o app por
    `testing/games-http-app.ts`, com o **guard global real** (JWT assinado pelo `AuthTokensService`,
    sessão num mapa em memória), para cobrir o 401 sem token e o 404 cruzado entre usuários.

```
apps/api/src/modules/games/
├── games.module.ts       # @Module({ controllers, providers }), registrado em app.module.ts
├── games.controller.ts   # rotas, @ApiTags/@Api*Response
├── games.service.ts      # regra de negócio, injeta PrismaService e StorageService
├── cover/                # capa: StorageService (REST do Supabase), assinatura, interceptor
├── dto/                  # class-validator + Swagger; transforms.ts lê o valor cru
└── testing/              # só para testes: o app HTTP com o guard global e tokens sintéticos
```

- `users/` — a conta do usuário logado (spec `docs/specs/perfil.md`, etapas 1 e 4). Importa o `AuthModule`
  (que exporta o `PasswordHasher`) e o `GamesModule` (que exporta o `GamesService`).
  `PATCH /api/users/me` (protegida pelo guard global), corpo `AtualizarPerfilRequest { nome }` com a mesma
  regra do registro (`nomeProblem` de `auth/dto/field-rules.ts`: `trim`, 1 a 60). 200 + `Usuario`; 400
  `VALIDACAO` para nome vazio, 61 caracteres, `{}` ou campo desconhecido (**inclusive `email`**, que não é
  editável); 401 sem token; conta que sumiu (`P2025`) → 401 `AUTH_SESSAO_ENCERRADA`, como o `GET /auth/me`.
  `usuario-publico.ts` guarda a **lista branca** `USUARIO_PUBLICO_SELECT` (`id`, `nome`, `email`,
  `criadoEm`) e o `toUsuario`: uma definição só, usada também pelo `AuthService`, para nenhum `select`
  devolver `senhaHash`.
  - **Excluir conta** (`POST /api/users/me/exclusao`, etapa 4; `POST` com corpo porque alguns proxies descartam o
    corpo de um `DELETE`): `ExcluirContaDto { senha }` com a regra do login (não vazia, até 72 bytes). **Ordem**
    (`UsersService.excluirConta`): (1) confere a senha com o mesmo `PasswordHasher` da troca de senha, e errada é
    400 `AUTH_SENHA_ATUAL_INCORRETA` em `fields.senha`, sem nada apagado; (2) lê os `capaPath` dos jogos
    (`GamesService.listarCapasDoUsuario`); (3) apaga o `User` numa operação só, e o `onDelete: Cascade` leva os jogos
    e as sessões; (4) **depois** remove cada capa **pelo caminho lido** (`GamesService.removerCapasSemFalhar`, com o
    `removeObjectQuietly`: a REST do Storage apaga por nome exato, e as capas anteriores ao dono dos jogos estão em
    `<gameId>/…`, fora de `<userId>/`); (5) **204** com o `Set-Cookie` que limpa `checkpoint_refresh` (`Max-Age=0`,
    mesmos atributos). **Banco antes do bucket:** com o storage falhando, a conta já não existe e sobra no
    máximo um objeto órfão, com um `warn` que traz só o caminho; o storage nunca impede o 204. Conta que sumiu
    (`P2025`) → 401 `AUTH_SESSAO_ENCERRADA`. O `UsersService` não fala com o storage: o `StorageService` continua
    dentro de `games`. Limite: `@UseGuards(AuthThrottlerGuard)` + `EXCLUSAO_CONTA_LIMIT` (5 a cada 15 min por IP),
    com **contador próprio** (o throttler separa por controller e rota: não divide a cota com `PUT /auth/senha`).
  - Testes: `users.service.spec.ts` (Prisma e storage mockados, com o `GamesService` de verdade: ordem, senha
    errada, storage falhando com `warn` sem segredo, `P2025`), `dto/*.spec.ts` (pelo pipe do `main.ts`) e
    `users.http.spec.ts` (porta local, com a auth de verdade e o Prisma falso de `auth/testing/`, que ganhou o
    `user.delete` com o cascade: 204 e o cookie limpo, 400, 401, 429 no 6º pedido e o contador próprio).

- `integrations/` — integrações com plataformas de jogos (spec `docs/specs/integracao-plataformas.md`, **etapas 1 a 4**: a base, o **vínculo da conta com o cartão do perfil**, a **biblioteca**, o **vínculo de jogo** e o **detalhe do jogo** com horas e a lista de conquistas). Prefixo `/api/integracoes`, tag Swagger `integracoes`. Rotas (todas protegidas
  pelo guard global, **exceto o retorno**): `GET /` (contas vinculadas), `POST :provedor/vinculo`,
  `GET :provedor/retorno` (`@Public()`), `DELETE :provedor`, `GET :provedor/perfil` e
  `POST :provedor/perfil/atualizacao`, `GET :provedor/biblioteca`, `PUT :provedor/jogos/:jogoId` (200), `GET :provedor/jogos/:jogoId` (o detalhe), `POST :provedor/jogos/:jogoId/atualizacao` e `DELETE :provedor/jogos/:jogoId` (204). O `:provedor` é o _slug_ minúsculo (`steam`), validado pelo
  `ProvedorSlugPipe` (400 `VALIDACAO`).
  - **`GameProvider`** (`providers/game-provider.ts`) é a interface que cada plataforma implementa
    (`iniciarVinculo`, `concluirVinculo`, `listarBiblioteca` — que devolve também o perfil, porque o cartão do
    `/perfil` precisa dos dois e a detecção de privacidade cruza as duas chamadas —, e `obterJogo`). A Steam é
    a primeira implementação; PlayStation, Xbox e Epic entram implementando a interface e acrescentando um
    valor a `Provedor`. O **`ProviderRegistry`** acha o provider pelo `:provedor` da rota (o _slug_ em
    minúsculas, `steam`) ou pelo enum; a lista vem do token `GAME_PROVIDERS` (hoje só a Steam). Os erros de
    domínio (`providers/plataforma-errors.ts`: `PlataformaIndisponivelError`, `PlataformaLimiteError`,
    `PerfilPrivadoError`, `IdExternoInvalidoError`, `ProvedorNaoSuportadoError`, `VinculoCanceladoError`,
    `VinculoRecusadoError`) **não** são `HttpException`: carregam o `code` estável (`ApiErrorCode`), e quem
    responde HTTP os mapeia (`plataforma-http-errors.ts`: `PlataformaExceptionFilter` no controller; falha da
    plataforma é **502**, nunca 500; perfil privado é 409; ID malformado e provedor desconhecido são 400).
  - **`SteamClient`** (`steam/steam.client.ts`) fala com a Steam Web API (`api.steampowered.com`) pelo `fetch`
    nativo, **sem SDK**, no padrão do `StorageService`: timeout de 8 s, sem _retry_, isolado atrás de métodos
    simples (`obterPerfil`, `listarJogos`, `obterConquistasDoJogador`, `obterSchema`,
    `obterPercentuaisGlobais`) e mockado nos testes. Regras vindas da chamada real: **a chave viaja na query
    string, então o log tem só o nome da chamada e o status, nunca a URL**; **sem `JSON.parse` cego** (a
    Steam responde o 401 da chave inválida e o 400 de ID malformado em **HTML**, então o corpo só é lido como
    JSON quando o `content-type` é JSON); **SteamID (`^7656\d{13}$`) e appid são validados antes de chamar**
    (malformado é erro de validação, nunca "perfil privado"); 429 → `PlataformaLimiteError`; timeout, 5xx, 401
    (com um `error` de "chave recusada" no log), 403 fora das conquistas e resposta ilegível →
    `PlataformaIndisponivelError`; biblioteca sem `game_count` = privada (`game_count: 0` = vazia); jogo sem
    conquistas (400 "no stats") e conquistas negadas são **estados**, não erros; `percent` (texto) vira número
    com 1 casa e `rtime_last_played: 0` vira `null`.
  - **Números nomeados** em `integrations.constants.ts` (timeout, host, TTLs e teto do cache em memória, vida do
    `state`, emissor e nome do cookie, limites por usuário). Os intervalos de atualização (1 h e 30 s) ficam no
    `shared`. O cache (`cache/ttl-cache.ts`, `TtlCache`, com validade e teto que descarta o mais antigo) guarda a
    biblioteca **por SteamID** por 10 min (dado público: duas contas do checkpoint com a mesma Steam dividem a consulta).
  - **Vínculo da conta (Steam OpenID 2.0, só para vincular; o login do app continua e-mail e senha)**:
    - **`SteamOpenId`** (`steam/steam-open-id.ts`, código próprio, `fetch` nativo): `montarUrl` (`checkid_setup`
      com `return_to` e `realm`) e `validarRetorno`, cujas checagens **locais vêm primeiro e não gastam rede**
      (`mode`, `ns`, `op_endpoint`, `return_to` idêntico, `claimed_id` em https com 17 dígitos `7656`, `identity`
      igual, `signed` cobrindo `claimed_id`, `identity`, `return_to`, `op_endpoint` e `response_nonce`, parâmetro
      `openid.*` repetido) e só então o `POST check_authentication` (sem seguir redirecionamento, sem _retry_,
      timeout de 8 s). O SteamID só é aceito depois de a Steam confirmar; a Steam invalida o _nonce_ na primeira
      checagem (barra o replay).
    - **`state` e cookie** (`vinculo/`): o retorno da Steam é um GET do navegador sem `Authorization` e o cookie
      do refresh tem `Path=/api/auth`, então o `POST vinculo` emite um **`state`** (JWT HS256, **10 min**,
      `typ: 'vinculo'`, `prov`, `nonce` de 256 bits; assinado com o `JWT_ACCESS_SECRET`, sem segredo novo, mas com
      **emissor próprio** `checkpoint-api:vinculo`) e grava o cookie **`checkpoint_vinculo`** com o mesmo `nonce`
      (`HttpOnly`, `SameSite=Lax`, `Path=/api/integracoes`, 10 min, sem `Domain`, `Secure` em produção). O retorno
      só vale se o `state` conferir **e** o nonce do cookie for o dele (comparação em tempo constante): sem o cookie,
      o link de outra pessoa, aberto no navegador da vítima, vincularia a Steam da vítima à conta do atacante. Como
      o segredo é reaproveitado, os **dois sentidos são travados por teste**: o guard global recusa um `state` como
      access token (emissor e `typ`) e o serviço recusa um access token ou refresh token como `state`.
    - **O retorno** (`GET :provedor/retorno`, `@Public()`) **nunca responde JSON de erro**: todo desfecho é um
      **302** para `${WEB_PUBLIC_URL}/perfil?steam=vinculada` ou `?steam=erro&motivo=cancelado|invalido|expirado|
indisponivel|ja-vinculada`, sem SteamID nem `state` na URL. A ordem é a defesa: `state` → nonce do cookie →
      só então a Steam; um `state` ruim nunca gasta rede. Sem DTO de propósito (o `ValidationPipe` global recusaria
      as chaves `openid.*` com `forbidNonWhitelisted`); quem valida é o provider. O cookie é limpo em toda volta.
      Em produção o `return_to` e o `realm` são `API_PUBLIC_URL` (o domínio da **Vercel**, por causa do rewrite de
      `/api`: o cookie é gravado nesse host e só volta para ele), nunca o do Render.
    - **Regras de gravação**: mesmo SteamID já vinculado → sucesso sem duplicar (atualiza o nome); outro SteamID →
      `ja-vinculada`; falha ao ler o nome (`GetPlayerSummaries`) **não** desfaz o vínculo (o nome vira "Conta Steam").
      **A mesma conta Steam pode ser vinculada por mais de um usuário do checkpoint** (a unicidade é por usuário,
      provedor e id externo): cada vínculo é isolado. Desvincular apaga a `ContaVinculada` e todos os
      `JogoPlataforma` do provedor **do usuário**, numa transação, sem tocar em jogo, nota, status ou capa.
  - **`SteamProvider`** (`steam/steam.provider.ts`) junta `SteamOpenId` e `SteamClient`: `listarBiblioteca` trata
    visibilidade diferente de 3 ou falta de `game_count` como `PerfilPrivadoError` (biblioteca **vazia** não é
    erro); avatar e link do perfil só saem se forem https em host da Steam (`steam/steam-urls.ts`); a capa oficial
    é `cdn.cloudflare.steamstatic.com/steam/apps/<appid>/library_600x900.jpg` (404 em alguns apps: o web cai em
    `header.jpg`). `obterJogo` (etapa 3) devolve só o **resumo**: a biblioteca filtrada pelo appid (`appids_filter`, confere que o jogo é do
    usuário) e depois `GetPlayerAchievements` para as contagens; conquistas negadas não derrubam (contagens `null` e
    aviso `CONQUISTAS_PRIVADAS`), jogo sem conquistas dá `0` de `0` (o 400 "no stats" é fixture real); a lista completa vem do `obterDetalhe` (etapa 4, abaixo). **"Negado" (403 ou `success:false`) e "perfil privado" (visibilidade ≠ 3, biblioteca sem `game_count`) são
    suposições SEM fixture real (CA-63)**: os testes as chamam de "SIMULADO" e `apps/api/scripts/capturar-fixtures-steam.cjs`
    (modos `privado`, `detalhes-privados`, `vazio`; uma captura, sanitizada, sem gravar o ID) as troca por fixtures reais.
  - **Limite por USUÁRIO, não por IP** (`IntegrationsThrottlerGuard`, contador por rota e por usuário, em memória):
    30 por minuto, 5 por minuto em `POST vinculo`; 429 `LIMITE_TENTATIVAS` com `Retry-After`. Não depende do
    `TRUST_PROXY_HOPS`. O retorno usa `@SkipThrottle()`: quem o protege é o `state`, o cookie e a Steam.
  - **O cartão do perfil** (`GET :provedor/perfil`): total de jogos, horas totais e os 3 mais jogados vêm da
    biblioteca (cache de 10 min); as **conquistas são a soma dos jogos vinculados, já gravada no banco**, sem
    chamada extra (`{ desbloqueadas, total, jogosVinculados }`). `POST .../perfil/atualizacao` ignora o cache, mas
    no máximo uma consulta a cada 30 s: antes disso devolve o que tem, sem chamar a Steam.
  - **Biblioteca e vínculo de jogo (etapa 3)**: `GET :provedor/biblioteca?busca=&limite=` (padrão 30, máximo 50, busca de
    até 100 caracteres, sem paginação) lê a biblioteca do **mesmo cache de 10 min por SteamID** do cartão do perfil
    (`obterBiblioteca`; erro não entra no cache), ordena por horas e traz `jogosParecidos` (mesma `chaveDeTitulo`, até 3,
    sem vínculo) e `vinculadoA`. `PUT :provedor/jogos/:jogoId` (`{ idExterno, mover? }`, DTO com regex e `mover` booleano
    estrito) segue **esta ordem**: (1) o jogo é do usuário e há conta vinculada; (2) o jogo já tem vínculo → mesmo item
    responde 200 idempotente, outro item é 409 `PLATAFORMA_JOGO_JA_VINCULADO` (mesmo com `mover`); (3) o item está ligado a
    outro jogo → sem `mover`, 409 `PLATAFORMA_ITEM_JA_VINCULADO` com `jogoAtual`, **sem chamar a Steam**; (4) a Steam
    (`obterJogo`); (5) grava, e com `mover` numa `$transaction([deleteMany, create])`. Falha da Steam não muda nada
    (CA-66/67); o jogo antigo perde só a camada e **nada é copiado**; P2002 é traduzido pelo `meta.target`. `DELETE
.../jogos/:jogoId` tira só a camada (404 `PLATAFORMA_VINCULO_NAO_ENCONTRADO` se não há). O `games` devolve
    `Game.dadosPlataforma` (lista, lida com `include`, **sem chamar a Steam**) para o web saber quais jogos já têm vínculo.
  - **Detalhe do jogo (etapa 4)**: `GET :provedor/jogos/:jogoId` devolve `{ dados, conquistas, aviso }`. Ordem: (1) o jogo é do
    usuário → 404 `Jogo não encontrado`; (2) tem vínculo → 404 `PLATAFORMA_VINCULO_NAO_ENCONTRADO`; (3) há conta; **só então**
    a Steam (jogo de outro usuário e jogo sem vínculo nunca gastam cota). As **horas** só são reconsultadas se o dado gravado
    é mais velho que `ATUALIZACAO_AUTOMATICA_MS` (1 h); a **lista** vem do cache. O `POST .../atualizacao` (`ATUALIZACAO_MANUAL_MIN_MS`,
    30 s) ignora o cache das conquistas do jogador e reconsulta as horas; antes de 30 s devolve o gravado (a lista sai do
    cache). **O `GET` nunca dá 502**: se a plataforma falhar, 200 com o valor gravado e `aviso` (`INDISPONIVEL`, ou
    `PERFIL_PRIVADO`), sem escrever nada e logando só o tipo do erro; só o `POST` propaga 502/409. Grava **só o que mudou**:
    horas e `atualizadoEm` quando reconsultadas; contagens se diferem e **nunca** quando negadas (`null`: o valor antigo fica);
    duas aberturas seguidas não escrevem duas vezes. `SteamProvider.obterDetalhe` faz até 4 chamadas (horas por
    `appids_filter`, `GetPlayerAchievements`, `GetSchemaForGame` e os percentuais, estes sem chave) atrás de `CarregadorEmCache`
    (`cache/carregador-em-cache.ts`: `TtlCache` + junção de chamadas simultâneas): conquistas do jogador 5 min por SteamID e
    appid; schema e percentuais 24 h por appid (dado público, dividido entre usuários). Schema ou percentuais falhando não
    derruba: o nome cai para o do jogador (ou o id) e a raridade fica `null`. A conquista oculta vem sem descrição; o percentual
    (texto na Steam) vira número com 1 casa; ícones só de host da Steam (`iconeUrlSeguro`). **A regra do 403**: um 403 do
    `GetPlayerAchievements` (ou `success:false`) é "conquistas negadas" (`CONQUISTAS_PRIVADAS`, horas e vínculo ficam); um 403 em
    QUALQUER outra chamada é `INDISPONIVEL` (problema com a chave), e o 400 "no stats" é jogo sem conquistas (`SEM_CONQUISTAS`).
    O "negado" e o "perfil privado" no detalhe são **suposições sem fixture real (CA-63)**.
  - **Testes** (Jest, sem rede e sem banco): `steam/steam.client.spec.ts` (com **fixtures reais e
    sanitizados** em `steam/__fixtures__/`: respostas de uma conta de teste com SteamID, nome e avatar
    sintéticos; `steam/fixtures.spec.ts` falha se um SteamID ou uma chave passar), `steam/steam-open-id.spec.ts`,
    `steam/steam.provider.spec.ts`, `steam/steam-urls.spec.ts`, `vinculo/vinculo-state.service.spec.ts` (os dois
    sentidos do `state`) e `vinculo-cookie.spec.ts`, `integrations.service.spec.ts` (Prisma e provider mockados),
    `integrations.http.spec.ts` (**porta local com o guard global real**, cookie, redirecionamento, limite por
    usuário e o SteamID e o `state` fora do redirecionamento e do log; o Prisma em memória e o `SteamClient` falso
    ficam em `testing/integrations-http-app.ts`), `access-token.guard.spec.ts` (o `state` não vale como access
    token), `cache/ttl-cache.spec.ts`, `provedor-slug.pipe.spec.ts`, `plataforma-http-errors.spec.ts`,
    `providers/provider-registry.spec.ts`, `integrations.module.spec.ts` (a injeção resolve) e
    `chave-de-titulo.spec.ts`. Perfil privado real, conquistas negadas e biblioteca vazia estão como `it.todo`
    até a captura dos fixtures reais.

Registre o módulo novo em `app.module.ts` (`imports: [...]`).

### 4.5 Autenticação (`modules/auth/`, spec `docs/specs/autenticacao.md`, etapas 1 e 5; sessões: spec `perfil`, etapa 2)

- **Rotas** (`/api/auth`, tag Swagger `auth`): `POST registro`, `POST login`, `POST refresh`, `POST logout` (as
  quatro `@Public()`), `GET me`, `PUT senha`, `GET sessoes`, `DELETE sessoes` e `DELETE sessoes/:id`
  (protegidas). Erros com `code` estável (`ApiErrorCode` do shared), nunca comparando a `message`.
- **Sessões ativas** (spec `perfil`, etapa 2; `AuthService.listarSessoes/encerrarSessao/encerrarOutrasSessoes`):
  - `GET /api/auth/sessoes` → 200 `SessaoAtiva[]`: só as **vivas** (`expiraEm > agora`), a da própria request
    primeiro (`atual: true`), as outras por `ultimoUsoEm` decrescente. O `select` é lista branca: cada item tem
    **exatamente** `{ id, dispositivo, criadoEm, ultimoUsoEm, atual }` (nunca `tokenHash`, `hashAnterior`,
    `expiraEm`, `userId`).
  - `DELETE /api/auth/sessoes/:id` → **204**; apaga com `where: { id, userId }`, então o access token e o
    refresh daquela sessão caem **na hora** (o guard confere a sessão a cada request). Id que não é UUID → 400
    `VALIDACAO` (`sessao-id.pipe.ts`: `ParseUUIDPipe` com `exceptionFactory`; um DTO de parâmetro pelo pipe
    global diria "campo não permitido: id"); a própria sessão → 400 `SESSAO_ATUAL` (para ela, `logout`);
    inexistente **ou de outro usuário** → o **mesmo** 404 `SESSAO_NAO_ENCONTRADA` (não revela que existe).
  - `DELETE /api/auth/sessoes` → 200 `{ encerradas }`: apaga as outras sessões **vivas** (a contagem é a da
    lista); a atual continua. `sessoes` e `sessoes/:id` não conflitam (o `:id` exige mais um segmento).
  - Sem `@Throttle` próprio: vale o padrão do módulo (60/min por IP).
- **Troca de senha** (`PUT /api/auth/senha`, etapa 5, `TrocarSenhaDto`): `{ senhaAtual, novaSenha }`, com a nova
  sob a mesma regra do registro e a atual só não vazia e ≤ 72 bytes. **204**; senha atual errada → 400
  `AUTH_SENHA_ATUAL_INCORRETA` (`fields.senhaAtual`); nova igual à atual → 400 `AUTH_SENHA_IGUAL_ATUAL`
  (`fields.novaSenha`), checada **só depois** de a atual conferir. Erro de negócio de quem está logado **nunca é
  401** (o web trata 401 como sessão perdida). Sucesso grava o hash novo e apaga **todas as outras**
  `RefreshSession` do usuário (mantém a do `sid` atual) numa **mesma transação**.
- **Tokens:** access JWT HS256 (15 min, `JWT_ACCESS_SECRET`, `{ sub, sid, typ: 'access' }`, só em memória no
  web) e refresh JWT HS256 (30 dias, **segredo separado**, `jti` aleatório) no cookie `checkpoint_refresh`
  (`HttpOnly`, `SameSite=Lax`, `Path=/api/auth`, `Secure` só em produção). O corpo **nunca** traz o refresh
  token. O banco guarda só `sha256(refreshToken)`.
- **Sessão = uma linha de `RefreshSession`** por dispositivo; máximo de 10 por usuário (a 11ª apaga a de
  `ultimoUsoEm` mais antigo). O **guard global** confere a sessão do access token a cada request (uma leitura
  por chave primária): logout, reuso e troca de senha derrubam o access token **na hora**.
- **Rotação:** `refresh` troca o token **na mesma linha** (`updateMany` condicionado ao hash apresentado; `count
0` = corrida = 409 `AUTH_REFRESH_CONCORRENTE`). O token anterior vale por **30 s** (corrida de abas); fora da
  janela, ou se não bate com nenhum dos dois hashes, é **reuso**: a sessão é apagada, o cookie é limpo e um
  `warn` registra o `sessionId` (nunca o token).
- **Anti-CSRF:** `refresh` e `logout` exigem `X-Checkpoint-Csrf: 1` (`CsrfHeaderGuard`; força o preflight de
  CORS). Sem ele: 403 `AUTH_ORIGEM_INVALIDA`.
- **Limite por IP** (`@nestjs/throttler`, memória, uma instância) só no `AuthController`: login 5/min, refresh
  30/min, troca de senha **5 a cada 15 min**, registro **3/h** (constante no código; a env opcional `AUTH_REGISTRATION_LIMIT_PER_HOUR` só existe
  para verificação manual). 429 com `code: LIMITE_TENTATIVAS` e `Retry-After`. O "IP" é o `req.ip`, que só é o
  do cliente atrás de proxy com `TRUST_PROXY_HOPS` correto (§4.1); sem ele o contador vira um só para o site.
- **Hash de senha: `node:crypto.scrypt`** (`password-hasher.ts`, N=2^17, r=8, p=1, sal de 16 bytes, formato
  `scrypt$N$r$p$sal$hash`), **não argon2**: o `argon2` não instala nesta máquina (sem binário pré-compilado e sem
  toolchain do Visual Studio), e a spec já previa esse plano B. `PasswordHasher` isola o algoritmo. Login com
  e-mail inexistente ainda paga um hash (contra um hash fixo) para o tempo não denunciar a conta.
- **Sem dado sensível** em corpo nem log: o `select` do Prisma é uma lista branca (`USUARIO_PUBLICO_SELECT`);
  nenhuma rota loga senha, token, cookie ou cabeçalho `Authorization`.
- Testes ao lado do código: `auth.service.spec.ts` (rotação, janela, reuso, teto de 10, troca de senha,
  sessões ativas, com relógio falso), `sessao-id.pipe.spec.ts`,
  `access-token.guard.spec.ts` (`@Public`, tipos de token trocados, vencido, sessão apagada),
  `password-hasher.spec.ts` (scrypt real), `session-device.spec.ts`, `dto/*.spec.ts` e
  `auth.http.spec.ts` (HTTP numa porta local: cookie, anti-CSRF, 429, CORS, corpos e logs). O
  `testing/fake-auth-prisma.ts` é um Prisma em memória só para testes.

---

## 5. Frontend (`apps/web`)

### 5.1 Composição da aplicação

- `src/main.tsx` monta `<AppProviders><AppRouter/></AppProviders>`.
- `src/app/providers.tsx` — ponto único para providers globais: `QueryClientProvider`
  (`shared/lib/query-client.ts`) e o `AuthProvider` (§5.10); tema etc. entram aqui quando existirem.
- `src/app/routes.tsx` — a lista de rotas (à parte do roteador para os testes usarem um roteador em
  memória): `/` (`GamesPage`), `/jogos/:id` (`GameDetailPage`), `/perfil` (`PerfilPage`) e `/perfil/senha` (`TrocarSenhaPage`) dentro do
  **`RequireAuth`** e do `AppLayout`
  (§5.6, §5.10); `/status` (o diagnóstico de health) **público**, no `AppLayout`; `/login` e `/registro`
  no `AuthLayout` (sem barra). `src/app/router.tsx` só cria o `createBrowserRouter(routes)`. Registre
  rotas novas em `routes.tsx`, como filhas do layout, conforme cada feature ganha uma página.

### 5.2 Alias de import

`@/` aponta para `apps/web/src`, configurado tanto em `vite.config.ts` (`resolve.alias`) quanto em
`tsconfig.app.json` (`paths`). Um import novo cruzando pastas usa o alias
(`@/shared/lib/api-client`), nunca `../../../`.

### 5.3 HTTP e cache de servidor

`shared/lib/api-client.ts` exporta uma instância única do axios (`apiClient`), `baseURL` vindo de
`shared/lib/env.ts` (`VITE_API_URL`, já incluindo o prefixo `/api`). Toda chamada à API passa por
essa instância — não crie um segundo `axios.create()`. Ele tem **três interceptors**, todos nesta mesma instância:
Bearer + marcas de requisição, detecção de conectividade (§5.7) e sessão (§5.10). Cache/estado de servidor é TanStack Query
(`shared/lib/query-client.ts`); não há Redux/Zustand/Context-como-store no projeto.

### 5.4 Onde as coisas vão

| Pasta                    | Para quê                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/<nome>/`   | Uma feature de domínio (componentes, hooks, chamadas de API específicas dela): `games/` (§5.5), `auth/` (§5.10), `perfil/` (§5.11). |
| `src/pages/`             | Componentes de página, um por rota, registrados em `app/router.tsx`.                                                                |
| `src/shared/components/` | Componentes de UI reutilizáveis entre features.                                                                                     |
| `src/shared/hooks/`      | Hooks reutilizáveis entre features.                                                                                                 |
| `src/shared/lib/`        | Infra transversal: cliente HTTP, query client, acesso a env, conectividade, armazenamento local (§5.7).                             |
| `src/styles/`            | Entrada do Tailwind (`index.css`) e qualquer CSS global.                                                                            |

Regra prática: se o código só faz sentido dentro de uma feature, ele mora em
`features/<nome>/`; se é usado por duas ou mais features (ou não pertence a nenhuma), vai em
`shared/`.

### 5.5 Catálogo de jogos (`features/games/`, spec `docs/specs/catalogo-jogos.md`, etapa 3)

- **Dados:** o web busca a lista **completa** uma vez (`GET /api/games`, query `['games']`); o filtro
  (`/?status=`, na URL) e as contagens (pílulas de filtro e contadores das prateleiras) saem dela, no cliente. Toda mutação invalida
  essa query. Chamadas só pelo `apiClient`, tipos de `@checkpoint/shared`. O upload da capa manda
  `multipart/form-data` **explícito**: o `apiClient` tem `Content-Type: application/json` por padrão e,
  nesse caso, o axios converte o `FormData` em JSON (a API recebia o arquivo vazio: 400).
- **`lib/`** (lógica pura, com teste ao lado): `count-by-status`, `status-filter`, `api-error` (mapeia o `fields` da
  `ApiErrorResponse` para os campos do formulário), `cover-file` (pré-checagem de tipo e tamanho),
  `form-values` (o estado do formulário em texto: cada critério de nota é `""` = sem nota, que **não** é `"0"`;
  em "Quero jogar" o corpo leva `null` explícito em cada critério; `toGameRequest` sempre completo, para o
  `PATCH` não reabrir a regra "Zerado exige ≥ 1", que a API só aplica quando o valor muda), `rating-input`
  (`parseRatingInput`: vazio, número ou inválido, aceitando vírgula e ponto; `formatRating` com vírgula e 1 casa;
  usa `isValidRating` do shared), `platforms` (lista de plataformas) e
  `save-game` (salva o jogo e SÓ DEPOIS a capa; se a capa falha, devolve o jogo salvo + o erro da capa e
  o formulário passa a editar aquele jogo, para o próximo Salvar ser `PATCH`, não `POST`/409).
- **Avaliação** (spec `avaliacao-de-jogos`, etapa 2): o `GameForm` ganha a seção **Avaliação**
  (`AvaliacaoField`, só com Zerado ou Jogando) com os cinco critérios de `GAME_RATING_CRITERIA` do shared (rótulo,
  descrição curta, **slider** nativo `<input type="range">` de 0 a 10 com passo 0,1, **campo de texto** com
  `inputMode="decimal"` sincronizado que aceita vírgula e ponto, e **Limpar**) e a **média ao vivo** (a mesma
  `notaMedia` do shared). "Sem nota" é `""` e não é 0: o slider fica apagado, e como o `change` do range não
  dispara se o dedo solta onde ele já está, o `pointerup` num critério vazio grava o valor do slider (é o que
  permite dar nota 0). O erro de digitação (fora de 0 a 10, ou casa demais) aparece **na hora** e bloqueia o
  envio; os da API vêm por `fields` (cada critério, `notas` na seção, `descricao`). Em "Quero jogar" a seção some,
  as notas digitadas ficam no estado (voltar para Jogando as recupera) e um aviso diz que serão apagadas ao salvar.
  `DescricaoField`: textarea de 110 px com `maxLength` 1000 e contador `n/1000`. **Layout da F3:** diálogo de 640 px e raio 24 (folha inferior no celular); cabeçalho "Novo jogo"/"Editar jogo" com "Fechar" redondo; campos de 52 px e 16 px de fonte, foco com borda e anel em `destaque` (`form-parts.tsx`); `StatusPicker` na ordem Jogando, Quero jogar, Zerado (botões de 52 px, o ativo com fundo `texto`); a **Avaliação** é um cartão `painel-2` com a média ao vivo no topo ("Média 8,3", "—" sem nota) e, por critério, slider, campo de 76 px e "Limpar" de 76 × 44; a **capa** tem miniatura de 56 × 74 (a prévia da oficial da Steam quando há ligação e nenhuma capa) e "Enviar" e "Remover capa"; rodapé fixo com "Cancelar" e "Salvar" de 52 px; o cartão "Ligado à Steam" mostra a miniatura em pé (44 × 58), as horas e "Trocar" (reabre a busca) ao lado de "Remover ligação". O `GameTile` (F2; antes, `GameRow`) mostra só a **média**, como `AnelDeNota` (arco `conic-gradient` de `--pct` sobre trilho escuro, número com vírgula e 1 casa, `role="img"` "Nota 8,3 de 10"; **sem média, sem anel**; 0 é nota) e o **título é um `<Link>` real** para `/jogos/:id`, esticado sobre o tile por `after:absolute after:inset-0` (sem `<a>` aninhado nem `onClick` no `<li>`), com as ações em `z-10` por cima. A `RatingBar` (segmentos) só sobrevive no detalhe até a F3.
- **Estante** (spec `troca-de-design-estante`, F2; substitui a lista em linhas, `GameRow` e `StatPanels`): a `GamesPage` busca a
  lista completa e a divide no cliente com `lib/estante.ts` (puro, com teste): `agruparEmPrateleiras(games, filtro)` (Jogando agora,
  Quero jogar, Zerados, nessa ordem, **só as que têm jogo**; a ordem interna é a da API, `atualizadoEm` desc), `destaqueDoCatalogo`
  (o **primeiro Jogando da lista**, e **só com o filtro Todos ou Jogando**; toda edição o promove, questão 14), `chipsDoDestaque` (horas e
  conquistas **só nos ligados à Steam**) e `nomeDaPlataforma` ("Xbox Series X|S" vira "X/S" **só na tela**: a barra parecia um "I" na
  Manrope; o valor gravado não muda). Componentes: `DestaqueContinue` (cartão de 230 px no desktop e 176 no celular, fundo = capa enviada
  ou oficial sob `.destaque-scrim`, senão a cor gerada; a coluna de texto tem no máximo 50%; o cartão **cresce** em vez de cortar o texto
  se a fonte de reserva alargar os chips; no celular o `<Link>` cobre o cartão inteiro e o texto "Ver detalhes" vira `sr-only`),
  `Prateleira` (`<section>` + `<ul aria-label>`; **grade de colunas do tamanho da capa no desktop e fileira que rola por dentro no
  celular**, com `scroll-px-4` para o `snap` não comer o recuo; o botão-bloco "Adicionar em …" fecha a lista e abre o `GameForm` com
  `statusInicial` = o status dela, enquanto o "Adicionar jogo" do topo mantém o padrão), `GameTile` e `AnelDeNota`. **Editar e Remover**
  ficam em `.tile-acoes`: `display: none` por padrão (em toque nem existem na tela, e o caminho é abrir o jogo) e, **só dentro de
  `@media (hover: hover)`**, aparecem em `:hover` e `:focus-within`, junto da elevação de −6 px e do anel; a variante `movimento-reduzido`
  tira o `transform` e as transições (o anel continua). `StatusFilter` são pílulas de 44 px (a ativa com fundo `texto`); no desktop o grupo
  é um contêiner em pílula que **rola por dentro quando não cabe** (em 768 a 1100 px só parte das pílulas fica à vista), no celular é uma
  fileira que rola e traz a ativa à vista. **`GameCover`** é sempre em pé (3:4; `tile` 150 × 200 e 132 × 176, `tileCompacto` 120 × 160 e
  108 × 144, `detalhe`, `preview`), cadeia **enviada → oficial → gerada** (o `header.jpg` saiu) com `object-fit: cover`. A **densidade
  compacta** só troca as medidas (`compacta` em `Prateleira` e `GameTile`).
- **Página de detalhes** (spec `avaliacao-de-jogos`, etapa 3): **`/jogos/:id`** (`pages/GameDetailPage.tsx`) acha o jogo
  na **mesma query `['games']`** do catálogo (`useGames`; **sem `GET /api/games/:id`**, um link direto carrega a lista
  toda, como o catálogo já faz). `GameDetail` mostra a capa grande (`GameCover` `detalhe`, em pé 3:4 até 300 × 400, com o fallback de cor + iniciais), título, plataforma e status; chips de plataforma e de status e a **média no `AnelDeNota` `grande`** (92 px, arco `destaque`; sem média, o texto "A nota geral é a média dos critérios que você preencher."); **Editar** (pílula `destaque`) e **Excluir** ficam no próprio `GameDetail` (a página passa `onEdit`, `onRemove` e, com conta Steam e jogo sem vínculo, o "Vincular à Steam" em `acoesExtras`); o cartão **Avaliação** com os **5 critérios** de `GAME_RATING_CRITERIA` (`BarraDeCriterio`: barra contínua de 10 px, nota em Outfit, ou "sem nota" com a barra vazia); e a
  **descrição como texto** (`whitespace-pre-line`; nunca `dangerouslySetInnerHTML`) ou o convite "Adicionar
  descrição", que abre o formulário. Coluna única no celular; a partir de `lg` (1024 px) a capa (grade `300px 1fr`) fica ao lado do resto, e o bloco Steam vem abaixo das duas colunas. O topo é só o **Voltar** (a navegação principal vem do `TopNav`/`BottomNav`). **Editar** abre o mesmo `GameForm` no `ModalDialog` (a página se atualiza pela invalidação da query),
  **Excluir** usa o `DeleteGameDialog` (com `onDeleted`, que leva ao catálogo) e **Voltar** desfaz a navegação
  quando ela veio do app (o catálogo volta com o filtro) ou vai a `/` num link direto (`location.key === 'default'`).
  Carregando: esqueleto (`DetailLoading`, `role="status"`); id inexistente **ou de outro usuário** (a lista só
  traz os dele): "Jogo não encontrado" com link para `/`, a mesma mensagem nos dois casos, sem revelar o id.
- **Plataforma** é uma seleção das plataformas mais usadas, agrupadas por família; a API continua
  aceitando texto livre, e uma plataforma antiga fora da lista vira opção extra na edição.
- **Diálogos** são `<dialog>` nativo com `showModal()` (`shared/components/ModalDialog`): Esc fecha, o
  foco fica preso e volta ao botão que abriu. O `autoFocus` do React não funciona com o diálogo
  fechado; o foco inicial vai para o elemento com `data-autofocus`.
- **Tema "Estante de console"** (spec `troca-de-design-estante`, F1; antes, "Neon arcade"): todos os tokens de cor (e os
  únicos hex do web) ficam no `@theme` de `src/styles/index.css`; componentes usam só as classes (`bg-fundo`,
  `text-status-jogando`, `border-borda-controle`...) e sombras e sobreposições são `color-mix()` dos tokens. Superfícies:
  `fundo`, `painel`, `painel-2` e `painel-3` (esta também é o hover de botão e o esqueleto, por alias `acao-hover` e
  `esqueleto`). Status: Jogando = `status-jogando`, Quero jogar = `status-quero-jogar` (o mesmo `ouro` das conquistas, da estrela e dos
  avisos) e Zerado = `status-zerado`; chips de status usam `tint-status-*` (18% da cor). Erro: `erro` (borda e preenchimento) e `erro-texto`
  (texto de botão de perigo). O acento (logo, "Adicionar", botões principais, foco, barras) é o token **`destaque`** (§5.12).
  **`borda-controle` é `#606a8e`** (3,32:1 sobre o painel; o desenho trazia um valor de 1,86:1 que reprova a WCAG 1.4.11) e o anel de foco
  é o `destaque`. O token `apagado` e a `RatingBar` de segmentos **saíram na F3** (o detalhe era o último consumidor); sobra `apagado-2` (só controle desabilitado). `prefers-reduced-motion: reduce` desliga todas as animações e
  transições (variante `movimento-reduzido`, §5.12). Fontes **Outfit** (`--font-display`) e **Manrope** (`--font-corpo`) e ícones
  (Material Symbols Rounded) vêm por `<link>` no `index.html` (`display=swap`, `system-ui` de reserva), sem pacote npm; offline cai a fonte do
  sistema, como antes. Sem orbes, _scanlines_, pulso nem brilhos neon: o `Backdrop` é só um halo estático (`.halo`).
- **Build de produção:** o `@checkpoint/shared/dist` é CommonJS e linkado; o `vite.config.ts` libera
  esse caminho em `build.commonjsOptions`, senão o Rollup não enxerga os valores exportados (o `dev`
  esconde o problema).
- **Testes** (Vitest + Testing Library, `apiClient`/`gamesApi` mockados; o `jsdom` não tem
  `showModal()`, então `src/test/setup.ts` tem um polyfill mínimo): `lib/*.test.ts`,
  `GameForm.test.tsx`, `GamesPage.test.tsx`, `components/estante.test.tsx` (tile, prateleira, destaque, filtros e a regra CSS do hover), `AnelDeNota.test.tsx`, `BarraDeCriterio.test.tsx`, `GameCover.test.tsx`, `lib/estante.test.ts`, `api/games-api.test.ts` e `styles/tokens.test.ts` (sem hex fora do `@theme`, regra de movimento reduzido no CSS, links de fontes, contraste das iniciais da capa).

### 5.6 Layout mobile-first (`app/layout/`, spec `docs/specs/pwa-e-mobile.md`, etapa 1)

- **`AppLayout`** envolve toda tela do app (menos `/login` e `/registro`, que usam o `AuthLayout`): fundo
  (`Backdrop`: um halo estático na cor do destaque), `TopNav`, o `<Outlet/>` e a `BottomNav`. A moldura em si é o
  `AppFrame` (recebe `children`), para o `RequireAuth` poder mostrar a moldura com uma mensagem no lugar da
  rota. **Nenhuma página importa a navegação**
  (teste em `AppLayout.test.tsx`).
- **`nav-items.ts`** é a fonte única dos destinos: "Jogos", "Adicionar" e "Perfil" (`/perfil`), nesta
  ordem, na barra inferior e (os links) no topo em >= 768px. `/status` fica fora de propósito. Um link pode
  ter `ativoEm` (prefixo de caminho onde continua marcado): "Jogos" tem `/jogos/`, então segue ativo no detalhe de
  um jogo. `isNavActive(item, pathname)` decide (caminho exato ou o prefixo); a barra e o topo usam `Link` com
  `aria-current="page"` calculado por ela, e não o `NavLink`, que só marca o que casa com o próprio `to` (e com
  `end` `/jogos/:id` deixaria "Jogos" apagado).
- **`BottomNav`** (< 768px, o `md`; F2: 68 px no total, sendo 67 da lista e 1 da borda de cima, fundo `painel-2`, itens de ≥ 88 × 44 com rótulo de 12 px e o ativo em `destaque` com ícone cheio): fixa embaixo, renderizada por portal (`OverlayPortal`) no
  `#overlay-root`, irmão do `#root` no `index.html`, para nenhum `transform` de ancestral prender o
  `position: fixed`. Some enquanto um campo **fora de diálogo** está focado
  (`use-typing-outside-dialog`), para não flutuar sobre o teclado virtual. "Adicionar" navega para
  `/?novo=1` (mantendo o `?status=` quando já está em `/`); a `GamesPage` abre o formulário e tira o
  `novo` da URL com `replace` (`features/games/lib/new-game.ts`).
- **`TopNav`** (>= 768px, F2) é o logo (link para `/`) e a navegação em **pílulas** de 44 px (a ativa com fundo `texto` e `aria-current`), a mesma lista; só aparece com mais de um link e **não é renderizado em `/`**: o catálogo tem a barra própria, na `GamesPage` (logo com `aria-current="page"`, os filtros, "Adicionar jogo" e o link redondo "Perfil"). Logo e ações não encolhem e o grupo de filtros rola por dentro quando falta espaço (sem segundo ponto de quebra).
- **Ponto de quebra único: 768px (`md`).** O catálogo usava `max-[900px]`; não usa mais.
- **CSS** (`styles/index.css`, camada `components`): `.app-shell` (`100dvh` com `100vh` de reserva),
  `.safe-x`, `.nav-clearance` e `.bottom-nav` (safe-area por `env()`), `.tile-*` (título de 2 linhas, ações só com hover, elevação), `.destaque-scrim`, `.capa-*`, `dialog.modal` (folha
  inferior no celular com a animação `sheet-up`, centralizado em >= 768px), `.sheet-footer`/`.sheet-pad`.
  Globais: `touch-action: manipulation`, piso de 16px nos campos (camada `base`, evita o zoom do iOS),
  hover do tile só com `@media (hover: hover)` e `overscroll-behavior-y: none` só no app instalado.
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
- **Versão e migração** (`migrations.ts`): `STORAGE_SCHEMA_VERSION` (hoje **2**) em `checkpoint:versao`;
  `runStorageMigrations()` roda em `main.tsx` **antes** do render. Ausente → grava a atual; menor →
  aplica `MIGRATIONS[n]` (n→n+1) em ordem; maior, ilegível ou migração que lança → apaga **todas** as
  chaves `checkpoint:*` (só elas; `outro-app:x` fica) e grava a atual. Mudar o formato de uma chave =
  subir a versão + escrever a migração (`Migration` recebe o `raw` do armazenamento). A **1 → 2** (`migrarDestaques`) reescreve o
  `destaque` de cada entrada de `checkpoint:prefs`: `magenta` e o antigo `azul` viram `azul`, sem distinguir quem escolheu de quem ficou no
  padrão; `violeta` e `laranja` ficam; JSON ilegível, chave ausente e valor desconhecido não são tocados (a leitura devolve os padrões só para
  aquela entrada).
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

### 5.10 Autenticação no web (`features/auth/`, spec `docs/specs/autenticacao.md`, etapas 2 e 5)

- **Access token só em memória** (`shared/lib/auth-token.ts`, uma variável de módulo): nunca em armazenamento
  local, de sessão, IndexedDB nem cookie legível (`hygiene.test.ts` e `shared/lib/storage/no-token-in-storage.test.ts`).
  Recarregar a página o perde; o **refresh** (cookie `HttpOnly`, que o JS não lê) o recupera. A única marca
  local é a chave `checkpoint:sessao:ativa` (escopo `usuario`), que distingue "visitante" de "a sessão terminou".
- **Estado da sessão** (`session/session.ts`, um store externo lido por `useAuth()`): `carregando` (o boot ainda
  não respondeu) · `autenticado` · `visitante` (com o motivo: `sessao` = a sessão terminou, `usuario` = saiu,
  `null` = nunca entrou) · `desconectado` (o boot não chegou a saber: sem rede, 5xx ou 429).
  O **`AuthProvider`** faz o boot (`POST /auth/refresh`, uma promessa só mesmo com o `StrictMode`), refaz o boot
  quando a conectividade volta a `online` estando `desconectado`, e escuta o `BroadcastChannel('checkpoint-auth')`.
- **Interceptor de sessão no `apiClient`** (`shared/lib/api-client.ts`, a mesma instância): põe o `Bearer`; um 401
  `AUTH_TOKEN_EXPIRADO` dispara **uma** renovação compartilhada (`refreshOnce`: requests paralelas recebem a
  MESMA promessa, então sai um `POST /auth/refresh` só) e cada request é repetida **uma** vez
  (`sessionRetried`); um 409 `AUTH_REFRESH_CONCORRENTE` tenta de novo uma vez após 500 ms;
  `AUTH_SESSAO_ENCERRADA` (ou o refresh dando 401) é o logout local; sem rede na renovação a original falha
  como erro de rede, **sem deslogar**. As marcas `isAuthCall` (registro, login, refresh, logout: sem Bearer, sem
  renovação, com `withCredentials`; refresh e logout com `X-Checkpoint-Csrf: 1`) e `isConnectivityProbe` (a
  sonda: nunca passa pela renovação) impedem laços. O `shared` não importa a feature: a sessão se registra em
  `shared/lib/session-handlers.ts`.
- **Rotas** (`app/routes.tsx`): `RequireAuth` segura as telas logadas: `carregando` mostra só o logo (**nenhuma
  query sai antes do boot**), `visitante` vai para `/login?voltar=…` (com `motivo=sessao` só se tinha sessão e a
  perdeu; quem acabou de sair vai para `/login` limpo), `desconectado` mostra a moldura do app com "Sem conexão.
  Seu catálogo aparece quando a conexão voltar." e **não** redireciona. O `AuthLayout` (`/login`, `/registro`)
  manda quem já tem sessão para `safeRedirect(voltar)` (login) ou `/` (registro): é ele quem redireciona depois
  de um login bem-sucedido.
- **`safeRedirect`** (`lib/safe-redirect.ts`): aceita só caminho interno (nada de `//`, `/\`, esquema, controle,
  > 512 caracteres, `/login`, `/registro`); confere o valor cru **e** o decodificado.
- **Mensagens só pelo `code`** (`lib/auth-errors.ts`): `Record<ApiErrorCode, string>` (um código novo no shared
  quebra o typecheck até ganhar texto). Nada compara a `message` da API (`hygiene.test.ts` varre o código).
- **Logout local** (`encerrarLocal`): token `null`, `queryClient.clear()`, `storage.clearScope('usuario')`; as chaves
  `instalacao:*` (escopo `dispositivo`) ficam. **Sair** chama `POST /auth/logout`; **sem conexão não sai** ("Sem
  conexão. Para sair, conecte-se."), porque o cookie `HttpOnly` só o servidor apaga. Depois de sair, o
  `BroadcastChannel` avisa as outras abas, que fazem o logout local na hora.
- **Telas:** `LoginForm` e `RegistroForm` (validação local com as regras da API; "Confirmar senha" só no registro;
  `CampoSenha` com "mostrar senha" de 44 × 44 e `aria-pressed`) e o Sair do `/perfil` (a página está em §5.11). Reusam `shared/components/form-parts` (movido de `features/games`)
  e o tema do app.
- **`/perfil/senha`** (etapa 5, `TrocarSenhaPage` + `TrocarSenhaForm`): Senha atual (`current-password`), Nova senha
  e Confirmar nova senha (`new-password`), cada uma com o "mostrar senha". Confirmação diferente → "As senhas não
  coincidem" **sem request**; erros pelo `code`/`fields`. `authApi.trocarSenha` é uma chamada protegida comum (Bearer
  e renovação pelo interceptor). Sucesso navega para `/perfil` com o aviso no `state` da navegação
  (`lib/perfil-avisos.ts`: só um aviso conhecido é mostrado, em `role="status"`). As outras sessões caem no
  servidor; o outro navegador descobre na próxima request (401 → `/login?motivo=sessao`).

### 5.11 Perfil (`features/perfil/`, `pages/PerfilPage.tsx`, spec `docs/specs/perfil.md`, etapas 1 a 5)

- **`/perfil`** (dentro do `RequireAuth` + `AppLayout`; etapa 5): **uma coluna** centralizada (`max-w-[640px]`, sem
  grid de duas colunas), seções separadas por espaço e divisores finos, contêineres `rounded-2xl` sem borda. Ordem:
  **Cabeçalho**; **Conta** (`ListaDeLinhas` de `LinhaConta.tsx`: **Trocar senha** → `/perfil/senha`, **Sessões ativas**
  e **Sair**, linhas de 56 px com ícone, rótulo e seta; **sem repetir o nome**); **Contas vinculadas** (o cartão Steam, §5.13; spec `integracao-plataformas`);
  **Preferências** (uma linha,
  "Preferências do aparelho", com o resumo "Cor · Densidade" de `resumoDasPreferencias`, que abre o modal de
  §5.12); **Instalar app** (só quando dá); **Zona de perigo** (discreta, no fim). **Sessões ativas** é uma linha
  que se expande no lugar (`aria-expanded`, `aria-controls`): `SessoesAtivas` só monta aberta, então a lista
  só é buscada quando a pessoa a abre.
- **Cabeçalho** (`PerfilCabecalho`): avatar de iniciais 64 × 64 com a mesma regra da capa gerada dos jogos
  aplicada ao nome (**`shared/lib/game-cover.ts`**, movido de `features/games/lib` por servir às duas
  features: cor da paleta `capa-1` a `capa-6` por hash FNV-1a do texto aparado e em minúsculas, e as
  iniciais); o nome (editável); o e-mail com "(não verificado — usado só para entrar)"; "Membro desde
  <mês de ano>" (`Intl.DateTimeFormat('pt-BR')`); e o resumo "N jogos · X zerados · Y jogando · Z quero
  jogar" (`lib/resumo.ts`), calculado da **mesma query `['games']`** do catálogo (`useGames` +
  `countByStatus`, sem endpoint novo; "—" enquanto carrega). Nome e e-mail aparecem uma vez só na tela.
- **Nome editável** (`NomeEditavel`): Editar (44 × 44, `aria-label="Editar nome"`) abre o campo com o nome e
  o foco nele; **Esc** ou Cancelar fecham **sem request**; Salvar valida com a regra local
  (`features/auth/lib/field-rules`) e manda `PATCH /users/me` (`api/perfil-api.ts`, pelo `apiClient`). O
  sucesso chama `atualizarUsuario` da sessão (`features/auth/session/session.ts`, exposto no `useAuth`), que
  troca o `usuario` só se for a mesma conta ainda autenticada: o nome muda na tela toda sem recarregar. Erros
  pelo `code`/`fields` (`describeAuthError`); o foco volta ao Editar ao fechar.
- **Instalar app** (`InstalarApp`, uma linha da `ListaDeLinhas`, + `shared/hooks/use-install-option.ts`): `nativo` quando o Chrome/Edge
  guardou o convite (`podeInstalar()`), `ios` no Safari do iPhone/iPad (mostra o passo a passo), e nada quando
  já instalado (`estaInstalado()` ou a chave `instalacao:instalado`). Sem as regras de intervalo do
  `InstallNudge`: é um botão sempre disponível.
- **Sessões ativas** (`SessoesAtivas`, etapa 2): query `['sessoes']` (`api/use-sessoes.ts`, pelo `apiClient`;
  o logout local limpa o `queryClient` inteiro, esta chave junto). Uma linha por sessão, na ordem da API:
  ícone `smartphone` (rótulo com Android/iOS) ou `computer`, o `dispositivo` e "Último uso em dd/mm/aaaa hh:mm"
  (`lib/sessoes.ts`, pelas partes do `Intl`, sem a vírgula do pt-BR). A atual tem o selo "Este aparelho" e
  **nenhum botão**; as outras têm **Encerrar** (44 × 44, sem confirmação). **Encerrar todas as outras** pede
  confirmação no `<dialog>` ("Encerrar N sessões? Esses aparelhos vão precisar entrar de novo.") e some sem
  outras. Toda mutação invalida a lista (inclusive no erro: um 404 também a deixa velha). Erros pelo `code`
  (`SESSAO_ATUAL`, `SESSAO_NAO_ENCONTRADA` e sem conexão). O aparelho encerrado descobre na próxima request (401
  `AUTH_SESSAO_ENCERRADA` → `/login?motivo=sessao`), pelo interceptor que já existia.
- **Zona de perigo** (`ZonaDePerigo.tsx`, etapa 4): **Excluir conta** (contorno e texto `erro`, 44 × 44) abre o
  `ExcluirContaDialog` (o `ModalDialog`, folha inferior no celular): "Isso apaga sua conta, seus N jogos e as
  capas deles. Não dá para desfazer." (N da query `['games']`), campo Senha (`CampoSenha`,
  `current-password`), **Cancelar** com o foco inicial e **Excluir conta** (`bg-erro`, texto `fundo`)
  desabilitado com a senha vazia. Erros pelo `code`/`fields`; sem resposta → "Sem conexão. Nada foi excluído."
  e o diálogo continua aberto. Sucesso: `removerPrefsDoUsuario` (§5.12) e **`encerrarContaExcluida()`** da
  sessão, que faz o logout local **sem nenhuma request** (o token da conta já não vale, e um 401 mostraria
  "Sua sessão terminou") e avisa as outras abas pelo `BroadcastChannel`. A navegação é a do `RequireAuth`: a
  `saida` `conta-excluida` vira `/login?motivo=conta-excluida` (sem `voltar`), e o `LoginPage` mostra "Sua
  conta foi excluída." pelo mesmo mapa de `motivo` do aviso de sessão.
- **Testes:** `pages/PerfilPage.test.tsx` (cabeçalho e resumo, "—" carregando, edição com Esc sem request,
  validação local, erros da API, instalar só quando aplicável, estrutura em linhas e ordem das seções, Sessões
  expansível, Sair com e sem conexão, a linha de Preferências abre o modal e o foco volta a ela),
  `features/perfil/components/SessoesAtivas.test.tsx` (selo, botão só nas outras, confirmação com N, escondido
  sem outras, erros por `code`), `features/perfil/components/ZonaDePerigo.test.tsx` (número de jogos, foco em
  Cancelar, botão desabilitado sem senha, erros por `code`, sem conexão mantém aberto, e o fluxo de sucesso com a
  sessão e o `RequireAuth` de verdade), `features/perfil/lib/resumo.test.ts` e `features/perfil/lib/sessoes.test.ts`.

### 5.12 Preferências deste aparelho (`shared/lib/prefs/`, spec `docs/specs/perfil.md`, etapas 3 e 5)

- **Nunca vão para a API**: ficam só neste navegador, **por usuário**. Uma chave só, **`checkpoint:prefs`**
  (`prefs.ts`, `defineKey`, escopo **`dispositivo`**: sobrevive ao logout), com o valor
  `{ ultimoUsuario, porUsuario: { [userId]: Prefs } }`. O validador da chave só confere a forma; cada entrada é
  validada na leitura (`prefsDoUsuario`): a entrada inválida de um usuário volta aos padrões **só para ele**.
  JSON corrompido → padrões (a chave sai); armazenamento bloqueado → o módulo de storage guarda em memória e a
  escolha vale até recarregar.
- **As cinco** (padrão primeiro): cor de destaque (azul, violeta, rosa, laranja), filtro inicial (Todos,
  Jogando, Quero jogar, Zerado), densidade (confortável, compacta), animações (completas, reduzidas; o valor gravado continua `completos`/`reduzidos`) e até
  **8** plataformas favoritas.
- **Store** (`prefs-store.ts` + `shared/hooks/use-prefs.ts`, `useSyncExternalStore`): `iniciarPrefs()` roda no
  `main.tsx` **depois das migrações e antes do `createRoot`** e aplica as de `ultimoUsuario` no `<html>`
  (sem piscar na cor padrão); o **`app/PrefsSync.tsx`** (nos providers) chama `definirUsuario` quando a sessão
  resolve, e aí valem as de quem entrou (que vira o `ultimoUsuario`). Sair não troca a aparência.
- **Exclusão da conta** (`removerPrefsDoUsuario`, etapa 4): some só a entrada desse usuário (as dos outros
  ficam); `ultimoUsuario` vira `null` se era ele; e, se as preferências em uso eram as dele, a aparência volta ao
  padrão (a tela de login não fica com as cores de uma conta que não existe mais).
  `alterarPrefs` só grava com alguém logado.
- **Cor de destaque sem hex novo** (além do `acento`): `@theme` tem `--color-destaque: var(--color-acento)` (**Azul**, `#4f8cff`, o padrão), e
  `html[data-destaque='violeta'|'rosa'|'laranja']` o aponta para `capa-6`, `capa-2` e `capa-3`. Texto `fundo` sobre o destaque: azul 5,95:1, violeta
  7,03:1, rosa 7,22:1, laranja 8,45:1 (`tokens.test.ts` confere ≥ 4,5:1). Usam `destaque`: logo, "Adicionar" (barra e topo), borda dos diálogos, botões
  principais (login/registro, Salvar), item ativo da navegação, filtro ativo (até a F2), segmentos da barra de nota (até a F2) e o anel de foco.
  **Não** mudam: as cores de status e as conquistas (`ouro`).
- **"Animações" reduzidas** (antes "Efeitos"): as regras de movimento reduzido estão **uma vez só**, na variante do Tailwind
  `@custom-variant movimento-reduzido` com dois ramos: `@media (prefers-reduced-motion: reduce)` e
  `:root[data-efeitos='reduzidos'] &`. O ramo do atributo **não alcança `::before`/`::after`** (pseudo-elemento não entra no
  `:is()` gerado); nenhum pseudo-elemento do app anima, e o `tokens.test.ts` falha se algum passar a animar.
- **Filtro inicial** (`features/games/lib/initial-filter.ts`): abrir `/` sem `?status=` (inclusive pelo item
  "Jogos") troca a URL por `/?status=<filtro>` com `replace`, no mesmo efeito da `GamesPage` que trata o
  `?novo=1` (dois `setSearchParams` seguidos se sobrescreveriam), e o 1º render já filtra. Com filtro inicial
  diferente de Todos, "Todos" grava `?status=TODOS` (lido como Todos). Parâmetro explícito é respeitado.
- **Densidade compacta** (F2): tiles menores (`GameCover` `tileCompacto`: 120 × 160, e 108 × 144 no celular; o bloco "Adicionar" da prateleira acompanha); as ações continuam 44 × 44.
- **Favoritas:** `groupsWithFavorites` (`features/games/lib/platforms.ts`) põe o grupo "Favoritas" primeiro
  e as tira do grupo da família (sem opção repetida); o `PlatformField` recebe as favoritas do `GameForm`.
- **Tela** (etapa 5: `features/perfil/components/PreferenciasModal.tsx`, aberto pela linha de Preferências do
  `/perfil`): o `ModalDialog` existente (Esc, foco preso, volta à linha que abriu; folha inferior no celular), com
  três abas em `Abas.tsx` (`tablist`/`tab`/`tabpanel`, ativação automática, setas com volta circular, Home/End, Tab só
  na ativa, foco inicial na aba ativa): **Aparência** (cor de destaque em bolinhas `role="radio"` com nome
  acessível, pela variante `bolinha` do `GrupoOpcoes`; densidade e animações, cada uma com sua prévia em
  `PreviasAparencia.tsx`: dois tiles sintéticos nas medidas da densidade escolhida, e um esqueleto que anima (ou para) mais um texto do estado), **Catálogo** (filtro inicial) e **Plataformas** (`ChipsPlataformas`:
  chips `aria-pressed` por família; a 9ª mostra "Até 8 favoritas" e não marca). **Sem Salvar**: cada escolha chama
  `alterarPrefs`, que aplica no `<html>` e grava por usuário, e o próprio modal usa o token `destaque`, então a cor
  nova aparece nele também. "Restaurar padrões" volta só as preferências da aba ativa (`PADROES_DA_ABA`, a partir
  de `PREFS_PADRAO`); **Concluído** fecha. O conteúdo só existe aberto, então cada abertura começa em Aparência.
  Nenhum formato de storage mudou.
- **Testes:** `shared/lib/prefs/prefs.test.ts` (validador, por usuário, corrompido, bloqueado),
  `apply-prefs.test.ts` (atributos no `<html>` antes do render, ordem no `main.tsx`), `app/PrefsSync.test.tsx`,
  `features/perfil/components/PreferenciasModal.test.tsx` (abas e teclado, prévia ao vivo por usuário, limite de 8
  favoritas, Restaurar padrões por aba; o Esc nativo do `<dialog>` não existe no jsdom e é simulado com `close()`),
  `features/games/lib/initial-filter.test.ts`, `features/games/components/PlatformField.test.tsx`,
  acréscimos em `styles/tokens.test.ts` e `pages/GamesPage.test.tsx`.

### 5.13 Integrações no web (`features/integracoes/`, spec `docs/specs/integracao-plataformas.md`, etapas 2 a 4)

- **`/perfil`** ganha a seção **Contas vinculadas** (`ContasVinculadas`, entre "Conta" e "Preferências"), com o
  **cartão Steam** (`ContaSteamCard`). Dados pelo `apiClient` (`api/integracoes-api.ts`) e TanStack Query
  (`['integracoes', 'contas']` e `['integracoes', 'perfil', provedor]`, esta só habilitada com conta vinculada e
  **sem _retry_**: 409 e 502 se resolvem com "Tentar de novo", não com repetição automática).
- **Estados do cartão**: carregando (esqueleto com `role="status"`); sem vínculo (**Vincular conta**); vinculado
  (nome, avatar, jogos, horas, "X conquistas em N jogos vinculados" e os 3 mais jogados, com **Atualizar** e
  **Desvincular**, este com confirmação no `<dialog>` e o foco em Cancelar); **perfil privado** ("Seu perfil Steam
  está privado", passo a passo numerado e **Tentar de novo**); falha da Steam e sem conexão (mensagem própria e
  **Tentar de novo**; o nome gravado, Atualizar e Desvincular seguem na tela). Biblioteca vazia: "Nenhum jogo na sua
  biblioteca". Falha ao atualizar mantém os números que já estavam. Botões com `min-h-11`; avatar decorativo
  (`alt=""`, `referrerPolicy="no-referrer"`, `width`/`height`); só classes de token do tema (nenhum hex novo).
- **Vincular**: `POST vinculo` com **`withCredentials: true` só nesta chamada** (em produção o `/api` é do mesmo
  site pelo rewrite da Vercel e não muda nada; em dev, localhost:5173 → :3333, o navegador só aceita o cookie
  `checkpoint_vinculo` com ele). O navegador só vai à URL devolvida se ela for a tela de login da Steam
  (`lib/steam-url.ts`: `https`, `steamcommunity.com`, sem porta nem usuário, `/openid/login`); qualquer outra é
  recusada com uma mensagem. A navegação passa por `lib/navegar.ts` (`irPara`), que os testes mockam.
- **Aviso do retorno**: a API redireciona para `/perfil?steam=vinculada` ou `?steam=erro&motivo=…` (um
  redirecionamento externo não carrega o `state` da navegação, então o aviso vem na query). A `PerfilPage` o lê
  **uma vez** (`useState`), mostra (sucesso em `role="status"`, erro em `role="alert"`) e limpa só `steam` e
  `motivo` da URL com `replace`. Parâmetro desconhecido é ignorado (`lib/avisos-steam.ts`).
- **Formatação** (`lib/format.ts`): `horasCurtas` ("45 min", "1,5 h", "42 h", "1.234 h", arredondando para baixo) e
  `textoDasConquistas` (singular e plural). `lib/estado-do-cartao.ts` classifica a falha (`privado`, `sem-conexao`,
  `erro`).
- **Biblioteca e vínculo de jogo (etapa 3)**: `BibliotecaSteamDialog` (dois modos: `novo` e `vincular`, num `ModalDialog`;
  busca com _debounce_ de 300 ms; estados carregando, vazia, privada e erro com **Tentar de novo**). No modo `novo`, cada item
  é **Criar jogo** (ou **Criar outro jogo**, quando há parecidos, que ganham **Vincular a este**), mais **Vincular a outro
  jogo que já tenho** (seletor só dos jogos sem `dadosPlataforma`); item já ligado mostra "Já ligado a «X»" e não cria. Nunca
  vincula sozinho. Jogo de plataforma ≠ vazio/"PC" pede **confirmação** ("horas e conquistas são as da Steam"); o 409
  `PLATAFORMA_ITEM_JA_VINCULADO` mostra o aviso com **Mover o vínculo**, que reenvia com `mover: true`. `GameForm` (jogo novo)
  ganha **Buscar na Steam** (só com conta vinculada; senão o link "Vincule sua Steam no perfil"): preenche título, "PC" e o
  status sugerido (`lib/biblioteca.ts`: 0 min = Quero jogar, >0 = Jogando, **nunca** Zerado), a capa oficial é só **prévia**;
  ao salvar cria o jogo e **só depois** liga (falha da ligação: jogo salvo, formulário passa a editar, o próximo Salvar
  reenvia sem 409); a confirmação de plataforma vem **antes** de criar qualquer coisa. A página do jogo tem **Vincular à
  Steam** (modo `vincular`). Ligar invalida `['games']` e o cartão do perfil.
- **Horas e conquistas (etapa 4)**: a página `/jogos/:id` de um jogo ligado ganha o bloco **Steam** (`BlocoSteam`, dentro do
  `GameDetail`): o cabeçalho com o ícone, "Steam" (`h2`) e **"Atualizado há 12 minutos"** (`lib/tempo-relativo.ts`, `Intl.RelativeTimeFormat` pt-BR, a partir do `atualizadoEm` do dado; "agora" abaixo de 1 min; nunca "Invalid Date"), três cartões de dados ("Tempo jogado na Steam" "42 h 30 min", "Último jogo em" dd/mm/aaaa ou "Nunca jogado", "Conquistas · 12 de 40" com a barra `role="progressbar"` em `ouro` e a porcentagem), **Atualizar**, **Desvincular** (confirmação; só a camada da Steam some: título, status, notas e capa
  ficam, e **Vincular à Steam** volta) e **Abrir na Steam** (`rel="noopener noreferrer"`). A lista tem dois `<details>`:
  **Desbloqueadas** (fechada, por data decrescente) e **Faltam** (aberta, da mais comum à mais rara), com contador, ícone de 52 px (`width`/`height`/`loading="lazy"`; cadeado ou `visibility_off` sem ícone), nome, descrição ("Conquista oculta" se oculta e bloqueada), data e "12,4% dos jogadores" (ou "Raridade indisponível"); uma coluna no celular e, a partir de 1024 px, as duas listas lado a lado. O detalhe **só é pedido nesta página**
  (`useDetalheJogo`, sem _retry_; abrir `/` não faz nenhuma request de conquistas) e os valores novos entram direto no cache do
  catálogo (`comDadosAtualizados`). Enquanto carrega, mostra o último valor gravado; os avisos são discretos: conquistas privadas
  (horas mantidas, sem barra), perfil privado e Steam indisponível (valor antigo mantido). Sem nenhuma animação nova.
- **Linha do catálogo**: só "42 h · 12/40" (`resumoDoCatalogo`, `role="img"` com o rótulo completo), a partir de `dadosPlataforma`,
  sem consultar a plataforma; só as horas quando não há total; "0 h" com 0 minutos.
- **Precedência da capa** (`lib/capa.ts` + `GameCover`): a enviada, depois a oficial (`library_600x900.jpg`), depois o
  `header.jpg` do mesmo app (derivado da URL oficial, só na CDN conhecida) e por fim a gerada (cor e inicial). O `GameCover` tenta
  a próxima quando uma falha ao carregar (`onError`); nada é gravado, então remover a enviada faz a oficial reaparecer.
- **Testes** (Vitest): `components/BlocoSteam.test.tsx`, `lib/capa.test.ts`, `lib/conquistas.test.ts`, `games/components/GameCover.test.tsx`, `components/BibliotecaSteamDialog.test.tsx`, `lib/biblioteca.test.ts`, `games/components/GameForm.steam.test.tsx`, `components/ContaSteamCard.test.tsx` (todos os estados, o desvio da URL fora da Steam, o
  diálogo, Atualizar, privacidade), `lib/lib.test.ts` (URL da Steam, avisos, horas, classificação),
  `pages/PerfilPage.test.tsx` (a seção entre Conta e Preferências e os avisos do retorno; a API de integrações é
  mockada).

---

## 6. `packages/shared`

Consumido como dependência normal de workspace (`"@checkpoint/shared": "*"`), sempre buildado
antes de `api`/`web` (§2). Hoje tem:

- `games.ts` — contrato do catálogo de jogos: `GAME_STATUS`/`GameStatus` (códigos `ZERADO`,
  `JOGANDO`, `QUERO_JOGAR`, sem rótulo de tela), `Game`, `CreateGameRequest`, `UpdateGameRequest`,
  `ListGamesQuery`, `ApiErrorResponse` (formato dos erros 400/409, com `fields` por campo), as
  constantes de limite e `statusAllowsRating` (regra das notas, usada pela API e pelo formulário).
  **Avaliação** (spec `avaliacao-de-jogos`): `GAME_RATING_CRITERIA` (chave, rótulo e descrição curta dos cinco
  critérios, fonte única de API e web), `GameRatingKey`, `GameRatings`, `GAME_RATING_STEP` (0,1),
  `GAME_DESCRIPTION_MAX_LENGTH` (1000) e as funções puras `isValidRating` (0 a 10, no máximo 1 casa) e
  `notaMedia` (média dos critérios preenchidos, 1 casa, arredondada para cima na metade, em décimos inteiros);
  `Game` traz `notas`, `notaMedia` e `descricao`, e `ApiErrorField` ganhou as chaves dos critérios, `notas` e
  `descricao`. O `shared` não tem runner: as funções são testadas no Jest da API e no Vitest do web.
  A capa entra como `Game.capaUrl` (URL pública ou `null`), `GAME_COVER_MAX_BYTES` (2 MB),
  `GAME_COVER_MIME_TYPES`, `GAME_COVER_FIELD` (`arquivo`) e o campo `arquivo` em `ApiErrorField`.
- `auth.ts` — contrato da autenticação e da conta: `Usuario`, `RegistroRequest`, `LoginRequest`,
  `AuthResponse`, `TrocarSenhaRequest`, **`AtualizarPerfilRequest`** (`{ nome }`, de `PATCH /api/users/me`),
  **`ExcluirContaRequest`** (`{ senha }`, de `POST /api/users/me/exclusao`),
  **`SessaoAtiva`** (`{ id, dispositivo, criadoEm, ultimoUsoEm, atual }`, de `GET /api/auth/sessoes`),
  **`EncerrarOutrasSessoesResponse`** (`{ encerradas }`), os limites (`USER_NAME_MAX_LENGTH` etc.), as regras
  puras (`normalizeEmail`, `utf8ByteLength`, `passwordProblem`), `API_ERROR_CODES`/`ApiErrorCode` (com
  `SESSAO_ATUAL` e `SESSAO_NAO_ENCONTRADA`; o web tem um texto para cada, e o `Record<ApiErrorCode, string>`
  quebra o `typecheck` se faltar) e `CSRF_HEADER`.
- `integracoes.ts` — contrato das integrações com plataformas (spec `integracao-plataformas`): `PROVEDORES`/
  `Provedor` (`STEAM`) e `PROVEDOR_SLUG`, as constantes `ATUALIZACAO_AUTOMATICA_MS` (1 h) e
  `ATUALIZACAO_MANUAL_MIN_MS` (30 s), os tipos (`ContaVinculada`, `ItemBiblioteca`, `PerfilPlataforma`,
  `DadosJogoPlataforma`, `Conquista`, `DetalheJogoPlataforma`, `AvisoPlataforma`, `VincularJogoRequest`,
  `PlataformaItemJaVinculadoError`…) e a função pura `chaveDeTitulo` (compara títulos sem caixa, acento, ™ ® © nem
  pontuação, **por igualdade**; só os acentos combinados do latim são tirados, para "ペ" não virar "ヘ").
  `API_ERROR_CODES` (em `auth.ts`) ganhou os nove `PLATAFORMA_*`, cada um com texto no web.
- `index.ts` — reexporta `auth`, `games` e `integracoes` e mantém dois exemplos herdados do esqueleto
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
| `apps/api/.env` | `STEAM_API_KEY`, `API_PUBLIC_URL`, `WEB_PUBLIC_URL`                    | Integração com plataformas (spec `integracao-plataformas`); **obrigatórias**: a API não sobe sem elas, cadastre no Render **antes** do deploy. `STEAM_API_KEY` só no backend, nunca no web nem em log. `API_PUBLIC_URL` e `WEB_PUBLIC_URL`: origens sem barra final (produção: o domínio da Vercel; §4.2)     |
| `apps/api/.env` | `DIRECT_URL`                                                           | Só o Prisma CLI lê (via `schema.prisma`); necessária apenas se `DATABASE_URL` for uma conexão pooled (ex.: Supabase)                                                                                                                                                                                          |
| `apps/api/.env` | `TRUST_PROXY_HOPS`                                                     | **Opcional**, inteiro de 0 a 10; ausente = 0 (dev, sem proxy). Quantos proxies confiáveis há entre o cliente e a API, para o limite por IP ver o cliente e não o proxy (§4.1). Em produção, o número **medido** (Vercel + Render); nunca um chute                                                             |
| `apps/web/.env` | `VITE_API_URL`                                                         | Consumida em `src/shared/lib/env.ts`, `baseURL` do `apiClient`                                                                                                                                                                                                                                                |

`CORS_ORIGIN` deixou de ter padrão e **recusa `*`** (cookie de sessão): liste as origens, ex.:
`http://localhost:5173`. Cada arquivo tem um `.env.example` correspondente, versionado. Nunca commitar `.env` real nem
colar valor real em spec, teste, commit ou log.

### 8.1 Deploy (Vercel + Render + Supabase)

**Topologia.** O web é estático na **Vercel** (`https://checkpoint-web-rust.vercel.app`). O `apps/web/vercel.json` reescreve `/api/:path*` para
`https://checkpoint-api-l0hk.onrender.com/api/:path*` (a API no **Render**) e devolve `/index.html` para o resto (SPA). Por isso o navegador só
enxerga **um** site: o cookie do refresh (`checkpoint_refresh`) e o do vínculo com a Steam (`checkpoint_vinculo`) são gravados no
host da **Vercel**, e é o domínio da Vercel (não o do Render) que vai em `API_PUBLIC_URL`, `WEB_PUBLIC_URL` e `CORS_ORIGIN`. Banco
e bucket ficam no **Supabase**. As variáveis da API vivem no painel do Render; o web só tem `VITE_API_URL` (nunca um segredo).

**Variáveis da API em produção (painel do Render)**

| Variável           | Valor                                    | Observação                                                                             |
| ------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `NODE_ENV`         | `production`                             | o cookie do vínculo passa a `Secure`                                                   |
| `CORS_ORIGIN`      | `https://checkpoint-web-rust.vercel.app` | lista de origens; `*` é recusado no boot                                               |
| `API_PUBLIC_URL`   | `https://checkpoint-web-rust.vercel.app` | sem barra final; é o `return_to` e o `realm` do OpenID da Steam                        |
| `WEB_PUBLIC_URL`   | `https://checkpoint-web-rust.vercel.app` | sem barra final; para onde o retorno do vínculo redireciona                            |
| `STEAM_API_KEY`    | 32 hexadecimais (segredo)                | gerada em `steamcommunity.com/dev/apikey`; "domínio": `checkpoint-web-rust.vercel.app` |
| `TRUST_PROXY_HOPS` | o número **medido**                      | ver o passo 2; nunca um chute e nunca `true`                                           |

As demais (`DATABASE_URL`, `DIRECT_URL`, `SUPABASE_*`, `JWT_*`, `AUTH_REGISTRATION_OPEN`, `PORT`) já existem e não mudam.

**Checklist, em ordem** (cada passo só depois do anterior):

1. **Segredos expostos** (opcional, mas recomendado antes): rotacionar o que apareceu em conversa ou log. Trocar os `JWT_*` desloga todo
   mundo; a `SUPABASE_SERVICE_ROLE_KEY` e a `STEAM_API_KEY` só valem no Render.
2. **Medir os saltos do proxy** (nunca chutar). A branch `diag/trust-proxy-medicao` tem um endpoint **temporário**, `GET /api/diag/proxy`,
   que devolve só o que a própria request trouxe (`socketRemoteAddress`, `xForwardedForEntradas`, `reqIp`, cabeçalhos de proxy). Suba-o no
   Render, chame `https://checkpoint-web-rust.vercel.app/api/diag/proxy` de uma rede cujo IP público você conhece (e outra vez com um `X-Forwarded-For` forjado) e compare:
   N = os endereços à direita do IP real, mais o socket. Esta conta é a hipótese; a prova é o passo 3.
3. **`TRUST_PROXY_HOPS=<N>`** no Render e nova chamada ao diag: `reqIp` tem que ser o IP real, e o cabeçalho forjado **não** pode mudar
   o `reqIp`. Só então remova o endpoint de diagnóstico (ele não vai para `main`).
4. **As três variáveis da Steam** no Render, **antes do deploy** (a API não sobe sem elas): `STEAM_API_KEY=<a chave>`,
   `API_PUBLIC_URL=https://checkpoint-web-rust.vercel.app` e `WEB_PUBLIC_URL=https://checkpoint-web-rust.vercel.app`, sem barra final.
5. **`CORS_ORIGIN=https://checkpoint-web-rust.vercel.app`** e **`NODE_ENV=production`**.
6. **Migration `integracao_plataformas`: conferir, não aplicar de novo.** Ela já foi aplicada no banco na etapa 1 (aditiva), e esse
   banco provavelmente é o de produção. Com o `DIRECT_URL` (porta 5432, modo session) em `apps/api/.env`, rode
   `npx prisma migrate status` em `apps/api`: **deve mostrar "Database schema is up to date", sem migrations pendentes**. Assim, o
   `npx prisma migrate deploy` seria um **no-op**. Se aparecer qualquer migration pendente, **pare** e confirme qual banco é o do
   `DIRECT_URL` antes de aplicar (`RULES.md` §3).
7. **Deploy do Render** (com as variáveis já cadastradas) e **depois o da Vercel**. Confirme que o destino do rewrite em `vercel.json`
   continua `https://checkpoint-api-l0hk.onrender.com`. As etapas 3 e 4 da spec vão juntas nesse deploy.
8. **Fumaça:** `GET https://checkpoint-web-rust.vercel.app/api/health` (200), `GET https://checkpoint-web-rust.vercel.app/api/integracoes` sem token (401) e o Swagger em `https://checkpoint-web-rust.vercel.app/api/docs`. O Render dorme quando
   ocioso: a primeira request demora, e os caches em memória (biblioteca da Steam, conquistas, limite por usuário) recomeçam vazios.
9. **`/qa-verify`** contra o app no ar, pelo roteiro da spec `integracao-plataformas` (seção "Verificação em produção").

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
