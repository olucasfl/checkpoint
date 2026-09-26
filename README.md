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

| Arquivo         | Para quê                                                                                                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/.env` | `PORT`, `DATABASE_URL`, `CORS_ORIGIN`, `NODE_ENV`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `AUTH_REGISTRATION_OPEN`, `STEAM_API_KEY`, `API_PUBLIC_URL`, `WEB_PUBLIC_URL` e, opcionais, `AUTH_REGISTRATION_LIMIT_PER_HOUR` e `TRUST_PROXY_HOPS` |
| `apps/web/.env` | `VITE_API_URL`                                                                                                                                                                                                                                                                                                            |

> As variáveis `SUPABASE_*` são **obrigatórias** (a API não sobe sem elas) e servem só às capas dos
> jogos: `SUPABASE_URL` é a URL do projeto, `SUPABASE_STORAGE_BUCKET` é o bucket público `capas`, e
> `SUPABASE_SERVICE_ROLE_KEY` recebe a **secret key** (`sb_secret_…`, em Settings → API Keys →
> Secret keys) — não a publishable. Ela só existe no backend: nunca no web, nunca em log ou commit.

> As variáveis de autenticação também são **obrigatórias**, e a API não sobe sem elas.
> `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` têm pelo menos 32 caracteres e precisam ser **diferentes**
> entre si; gere cada um localmente com
> `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` e nunca os cole em log,
> spec ou commit. `AUTH_REGISTRATION_OPEN` é `true` ou `false` (abre ou fecha o registro de contas novas).
> `AUTH_REGISTRATION_LIMIT_PER_HOUR` é **opcional** e só serve para dev/teste (o padrão é 3 registros por
> hora por IP): em ambiente exposto, deixe-a ausente. `CORS_ORIGIN` não aceita mais `*` (cookie de sessão):
> liste as origens, ex.: `http://localhost:5173`.

> As variáveis da integração com a Steam (spec `integracao-plataformas`) também são **obrigatórias**, e a API
> não sobe sem elas: `STEAM_API_KEY` (32 hexadecimais, gerada em <https://steamcommunity.com/dev/apikey>; só o
> backend a usa, nunca o web, um log ou um commit), `API_PUBLIC_URL` (o endereço em que o **navegador** alcança a
> API, sem barra final: é o `return_to` do login da Steam) e `WEB_PUBLIC_URL` (a origem do web, para onde o retorno
> redireciona, sem barra final). Em desenvolvimento: `http://localhost:3333` e `http://localhost:5173`.
> `TRUST_PROXY_HOPS` é **opcional** (inteiro de 0 a 10; ausente = 0): quantos proxies confiáveis há entre o cliente e
> a API. Em desenvolvimento não há proxy, deixe ausente; em produção use o número **medido** (ver "Produção" abaixo).

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
> pendentes (hoje, os models de usuário, sessão, jogo e integração com plataformas) e gera uma nova quando o schema mudou.

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

### 6. (Opcional) Testar o vínculo com a Steam em localhost

Os testes automatizados (`npm test`) **não** falam com a Steam: tudo é mockado. Para ver o fluxo de verdade:

1. Gere a `STEAM_API_KEY` em <https://steamcommunity.com/dev/apikey> (o campo "domínio" é só informativo: a chave é do servidor e a Steam não o confere nas chamadas) e ponha em `apps/api/.env`, junto de `API_PUBLIC_URL=http://localhost:3333`,
   `WEB_PUBLIC_URL=http://localhost:5173` e `CORS_ORIGIN=http://localhost:5173`. Não defina `TRUST_PROXY_HOPS`.
2. Deixe **públicos**, no perfil Steam da conta de teste, o "Meu perfil" **e** os "Detalhes do jogo" (Steam →
   Perfil → Editar perfil → Configurações de privacidade). Perfil privado é um estado tratado (o cartão mostra o
   passo a passo), mas sem dados não há o que ver.
3. `npm run dev`, entre com a sua conta em <http://localhost:5173>, abra **Perfil → Plataformas** e clique em
   **Vincular conta**. Depois de entrar na Steam, o navegador volta para
   `http://localhost:5173/perfil?steam=vinculada` e o cartão mostra jogos, horas e conquistas.
4. Em **Novo jogo → Buscar na Steam** (ou no **Vincular à Steam** da página de um jogo) ligue um jogo da biblioteca; a
   página do jogo passa a mostrar o bloco **Steam** com as conquistas.

Por dentro: o `POST /api/integracoes/steam/vinculo` grava o cookie `checkpoint_vinculo` (`HttpOnly`, `SameSite=Lax`,
`Path=/api/integracoes`, sem `Domain`, 10 min) no host da API; cookie não separa portas, então o `localhost:5173` →
`localhost:3333` funciona, e o web envia `withCredentials` só nessa chamada. A Steam devolve o navegador para
`API_PUBLIC_URL/api/integracoes/steam/retorno`, que confere tudo e redireciona para `WEB_PUBLIC_URL/perfil`. O
SteamID nunca aparece na URL final nem em log.

Se a conta de teste não tiver conquistas negadas ou perfil privado à mão, o script
`node apps/api/scripts/capturar-fixtures-steam.cjs <privado|detalhes-privados|vazio>` captura, **uma vez**, as
respostas reais que ainda faltam como fixture (ele lê a chave do `apps/api/.env`, sanitiza e não grava o SteamID).

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

## Produção (Vercel + Render + Supabase)

O web está na **Vercel**, a API no **Render** e o banco e o bucket no **Supabase**. O `apps/web/vercel.json` reescreve
`/api/*` para a API no Render (o cookie de sessão fica no mesmo site do web) e devolve o `index.html` para o resto. As
variáveis da API ficam no painel do Render; **cadastre as novas antes do deploy**, porque a API não sobe sem elas.

| Variável (Render)  | Valor em produção                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `NODE_ENV`         | `production` (o cookie do vínculo passa a `Secure`)                                              |
| `CORS_ORIGIN`      | `https://checkpoint-web-rust.vercel.app` (lista, nunca `*`)                                      |
| `API_PUBLIC_URL`   | `https://checkpoint-web-rust.vercel.app` (o domínio da Vercel, não o do Render), sem barra final |
| `WEB_PUBLIC_URL`   | `https://checkpoint-web-rust.vercel.app`, sem barra final                                        |
| `STEAM_API_KEY`    | a chave gerada com o "domínio" `checkpoint-web-rust.vercel.app` (segredo)                        |
| `TRUST_PROXY_HOPS` | o número **medido** de proxies (nunca um chute, nunca `true`)                                    |

O passo a passo completo (medição do proxy, ordem do deploy, conferência da migration e o roteiro de verificação em
produção) está em `ARCHITECTURE.md`, seção **Deploy**.

---

## Próximos passos sugeridos

1. Modelar as entidades em `apps/api/prisma/schema.prisma` e rodar `npm run db:migrate`.
2. Criar um módulo por domínio em `apps/api/src/modules/`.
3. Criar a feature correspondente em `apps/web/src/features/` e registrar a rota em
   `apps/web/src/app/router.tsx`.
4. Compartilhar os contratos (tipos de request/response) em `packages/shared/src`.
