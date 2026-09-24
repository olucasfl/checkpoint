# Spec: PWA e mobile

> Status: em andamento (aprovada em 2026-09-23; etapas 1 a 3 implementadas; etapa 4 pendente)

## Objetivo

Deixar o checkpoint confortável no celular (layout mobile-first com navegação inferior, alvos de toque,
safe-area e teclado virtual) e instalável como PWA (manifest, service worker com precache versionado,
aviso de atualização na própria UI, estado offline confiável e armazenamento local tolerante a falha),
mantendo o visual Neon arcade do catálogo.

Toca **só `apps/web`** (e `apps/web/index.html`, `vite.config.ts`, `public/`). Nenhuma rota de API
nova, nenhuma mudança de schema. É a **primeira** das três specs desta rodada: `autenticacao` e
`perfil` dependem das etapas 1 e 2 desta (ver "Dependências entre specs").

Implementada em **quatro etapas**, cada uma parando para validação (ver "Ordem de implementação").

## Stack

Padrão da casa (`ARCHITECTURE.md`), com uma divergência **aprovada pelo humano em 2026-09-23** (`RULES.md` §9):

- **`vite-plugin-pwa`** (devDependency de `apps/web`, etapa 3) para gerar o service worker e o
  manifest. Traz `workbox-build` e `workbox-window` como dependências dele. Ver "Decisão: plugin ou
  SW manual" abaixo. **Aprovada em 2026-09-23** (Q-PWA-1), para entrar **só na etapa 3**.
- **Nada mais.** Sem biblioteca de UI, de gesto, de _bottom sheet_, de detecção de rede ou de
  storage (`localforage`, `idb-keyval` etc.). O `<dialog>` nativo continua sendo o único modal.
- Ícones do PWA: arquivos PNG feitos **pelo humano** depois; a spec define nomes, tamanhos e
  `purpose` (ver "Ícones"). `@vite-pwa/assets-generator` **não** entra.

### Decisão: plugin ou SW manual

| Critério                  | `vite-plugin-pwa` (`generateSW`)                                                               | SW manual (`public/sw.js`, como no Oratio)                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Versão do precache        | **automática**: cada arquivo entra com a revisão (hash) do build; nada para "lembrar de subir" | manual (`oratio-cache-v24`): a dívida que o briefing manda não copiar                      |
| Lista do precache         | gerada do build pelo plugin                                                                    | exige ler `asset-manifest.json` no `install` e montar a lista à mão                        |
| Limpeza de caches antigos | `cleanupOutdatedCaches: true`                                                                  | código próprio no `activate`                                                               |
| Fluxo de atualização      | `registerType: 'prompt'` + `useRegisterSW` (`needRefresh`, `updateServiceWorker`)              | `postMessage('SKIP_WAITING')` + `controllerchange` à mão                                   |
| Custo                     | uma devDependency (e o Workbox transitivo); roda só no build                                   | zero dependência; ~150 linhas de SW sem teste, que o Oratio mostrou ser onde os bugs moram |

**Decisão (Q-PWA-1, 2026-09-23): `vite-plugin-pwa`, estratégia `generateSW`, `registerType: 'prompt'`.**
Versões conferidas no registry em 2026-09-23: `vite-plugin-pwa@1.3.0` (`engines.node >=16`, peer
`vite ^3 … ^8`, casa com o `vite@6.4.3` instalado), que depende de `workbox-build@^7.4.1`
(`engines.node >=20.0.0`, ok no Node 20.19) e `workbox-window@^7.4.1`. Se o humano recusar a
dependência no futuro, a etapa 3 é reescrita para SW manual antes de começar (não improvisar).

## Comportamento esperado

### Mobile (etapas 1 e 2)

- Em tela estreita (< 768 px, o `md` do Tailwind), o app mostra uma **barra de navegação inferior**
  fixa; em ≥ 768 px, a barra some e o topo mostra os mesmos destinos (o desktop continua como é hoje).
- Tocar em "Adicionar" na barra abre o formulário de novo jogo (o mesmo `<dialog>` do catálogo).
- O catálogo cabe em 360 px de largura **sem rolagem horizontal da página**; os filtros viram uma
  fileira que rola na horizontal dentro dela mesma.
- Os diálogos (formulário e confirmação de remoção) viram uma **folha inferior** (_bottom sheet_) em
  tela estreita: largura total, cantos de cima arredondados, conteúdo com rolagem própria e rodapé
  (Cancelar/Salvar) fixo embaixo. Em ≥ 768 px continuam centralizados como hoje.
- Todo alvo de toque mede ≥ 44 × 44 px (já é regra do catálogo; passa a valer para a barra inferior,
  a folha e os avisos novos).
- O conteúdo respeita a _safe-area_ (entalhe, barra de gestos do iOS/Android): nada clicável fica
  embaixo dela, inclusive em paisagem.
- Com o teclado virtual aberto, o campo focado fica visível; no formulário, o botão Salvar também.
  A barra inferior **não** flutua sobre o teclado.
- O usuário **pode dar zoom** (pinça). Não se trava zoom (diferente do Oratio), porque isso fere a
  WCAG 1.4.4; o zoom acidental ao focar um campo no iOS é evitado com fonte ≥ 16 px nos campos.
- `prefers-reduced-motion: reduce` desliga também as animações novas (folha subindo, avisos
  deslizando), como já desliga as do catálogo.

### Armazenamento local e conectividade (etapa 2)

- Todo acesso a `localStorage` passa por **um** módulo tipado. Nenhum outro arquivo do web chama
  `localStorage`/`sessionStorage` direto.
- Chaves sempre com o prefixo `checkpoint:` (o `localhost:5173` é compartilhado com outros projetos
  em dev, como o Oratio; o prefixo evita pisar nas chaves deles e deles pisarem nas nossas).
- Cada chave é **declarada** num registro com nome, escopo (`dispositivo` ou `usuario`), valor padrão
  e validador. Valor inválido ou corrompido → devolve o padrão e apaga a chave. Nunca lança.
- Storage indisponível (modo privado, bloqueado, cota cheia) → o app funciona igual, guardando em
  memória só durante a sessão.
- **Uma** constante de versão do schema local (`STORAGE_SCHEMA_VERSION`), com migrações explícitas
  de `n` para `n + 1`, executadas no boot antes do primeiro render.
- O app distingue três estados de conexão: **online**, **offline** (o aparelho está sem rede) e
  **sem servidor** (o aparelho tem rede, mas a API não responde). Um aviso no topo mostra os dois
  últimos; ao voltar, mostra "Conexão restabelecida" por 3 s e recarrega os dados da tela.
- A detecção **não** confia só em `navigator.onLine` (que diz `true` em rede sem internet e em
  captive portal): uma request à API que falha sem resposta também leva a "sem servidor", e a volta
  é confirmada por uma sonda (`GET /api/health`) com espera crescente.
- Salvar sem conexão **não** enfileira nada: o formulário mostra "Sem conexão. Nada foi salvo — tente
  de novo quando a conexão voltar." e continua aberto com o que foi digitado.

### PWA (etapas 3 e 4)

- O app é instalável (Chrome/Edge no Android e desktop; "Adicionar à Tela de Início" no iOS), abre em
  janela própria (`standalone`) com as cores do tema Neon e **o shell abre sem rede** (a tela do app,
  não a do navegador).
- O service worker **só serve arquivos do próprio app** (mesma origem, gerados pelo build). Nunca
  intercepta a API, as fontes do Google nem as capas do Supabase.
- Quando há versão nova publicada, aparece um aviso na própria UI: "Nova versão disponível" com
  **Atualizar** e **Depois**. O app **nunca recarrega sozinho**: só ao clicar em Atualizar. O aviso
  não aparece enquanto um diálogo está aberto (para não perder um formulário sendo preenchido); aparece
  quando ele fecha.
- Um convite para instalar aparece de vez em quando (com intervalo mínimo), nunca para quem já
  instalou ou já está no app instalado. No iOS, que não tem prompt nativo, o convite mostra o passo a
  passo.

## Requisitos de saída

### Etapa 1 — layout mobile-first

**`apps/web/index.html`**

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">`.
  **Sem** `maximum-scale` e **sem** `user-scalable=no`.
- `<div id="overlay-root"></div>` **irmão** de `#root` (fora dele), depois dele no `<body>`. Alvo dos
  elementos `position: fixed` (barra inferior, avisos, convite de instalação), via portal. Fica fora
  do `#root` para que um `transform`/`filter` de um ancestral nunca vire _containing block_ e "prenda"
  o `fixed`. Os `<dialog>` com `showModal()` continuam no _top layer_ nativo, sem portal.

**Layout compartilhado** (`apps/web/src/app/layout/`)

- `AppLayout` com `<Outlet/>`: fundo (orbes + _scanlines_), topo, conteúdo e barra inferior. O router
  passa a ter rotas aninhadas nele: `/` e `/status` hoje; `/perfil` e as demais telas logadas depois
  (specs `autenticacao` e `perfil`). **Nenhuma página importa a barra à mão.**
- Os destinos da navegação vêm de **uma** lista (`app/layout/nav-items.ts`), usada pela barra
  inferior e pelo topo:

| Item      | Ícone (Material Symbols) | Ação                                                             | Existe desde                                |
| --------- | ------------------------ | ---------------------------------------------------------------- | ------------------------------------------- |
| Jogos     | `sports_esports`         | vai para `/`                                                     | etapa 1                                     |
| Adicionar | `add_circle` (destaque)  | em `/`, abre o formulário; em outra rota, navega para `/?novo=1` | etapa 1                                     |
| Perfil    | `person`                 | vai para `/perfil`                                               | `autenticacao` etapa 2 (item novo na lista) |

- `/status` **não** entra na navegação (é diagnóstico); continua acessível pela URL, dentro do layout.
- **Barra inferior** (< 768 px): `<nav aria-label="Navegação principal">`, altura 64 px +
  `env(safe-area-inset-bottom)`, fundo `painel` com borda de cima `borda`; cada item ≥ 44 × 44 px com
  ícone e rótulo; o ativo tem `aria-current="page"` e cor `ciano`. "Adicionar" é um `<button>`, não
  link. O conteúdo da página ganha `padding-bottom` = altura da barra + safe-area, para a última linha
  da lista não ficar escondida.
- A barra **some** enquanto um campo editável **fora de um diálogo** está focado (`focusin`/`focusout`
  no documento), para não flutuar sobre o teclado. Dentro do `<dialog>` modal ela já fica coberta.
- **Topo** (≥ 768 px): o de hoje, com o botão "Adicionar jogo". Em < 768 px o topo encolhe (logo
  40 px, título 22 px) e o botão "Adicionar jogo" do topo some (ele está na barra).
- `/?novo=1`: abrir `/` com `novo=1` abre o formulário de novo jogo e **remove** o parâmetro da URL
  (`replace`), para um reload não reabrir o formulário. Também é o destino do atalho do manifest
  (etapa 4).

**Catálogo em tela estreita** (360 a 767 px)

- Painéis de contagem: os três numa linha (`grid-cols-3`), número 24 px em Orbitron, rótulo ≥ 13 px.
- Filtros: uma linha só, `overflow-x: auto` com `scroll-snap`, sem barra de rolagem visível; o filtro
  ativo é rolado para a vista ao carregar. A legenda "Última atualização primeiro" vai para baixo dos
  filtros.
- Linha do jogo: capa 52 × 52 à esquerda; título (até 2 linhas, depois reticências), plataforma e selo;
  ações Editar/Remover 44 × 44 à direita; a barra de nota vai para uma segunda linha, com largura
  total. Nada da linha causa rolagem horizontal, mesmo com título de 120 caracteres sem espaço.
- Orbes do fundo com no máximo 420 px em < 768 px (os de 720/760 px pesam na GPU do celular).

**Folha inferior** (`ModalDialog` em < 768 px)

- `width: 100%`, ancorada embaixo, `max-height: calc(100dvh - env(safe-area-inset-top) - 16px)`
  (com `100vh` como reserva para navegador sem `dvh`), cantos de cima 16 px.
- Corpo com `overflow-y: auto`; rodapé com as ações fixo embaixo (`position: sticky; bottom: 0`) e
  `padding-bottom: env(safe-area-inset-bottom)`.
- Animação de subida de 200 ms, desligada com `prefers-reduced-motion: reduce`.
- Esc, foco preso, foco inicial em `[data-autofocus]` e volta do foco: iguais aos de hoje.

**Toque, teclado e safe-area** (`styles/index.css`)

- `html { touch-action: manipulation; }` (tira o atraso do toque duplo).
- Campos (`input`, `select`, `textarea`) com `font-size` ≥ 16 px (o iOS dá zoom ao focar campo menor).
- `@media (display-mode: standalone) { body { overscroll-behavior-y: none; } }`: no app instalado, o
  "puxar para atualizar" não recarrega a página no meio de um formulário. Na aba do navegador fica o
  comportamento padrão.
- Hover só com `@media (hover: hover)`. As variantes `hover:` do Tailwind 4 já fazem isso; o CSS
  próprio (ex.: `.row-hover:hover`) passa a fazer também, para o toque não deixar hover "grudado".
- Laterais com `padding-left/right: max(16px, env(safe-area-inset-left/right))` (paisagem com
  entalhe).
- `min-height: 100dvh` no layout (com `100vh` antes, como reserva).
- As animações novas entram no bloco `@media (prefers-reduced-motion: reduce)` existente.

### Etapa 2 — storage local e conectividade

**Storage** (`apps/web/src/shared/lib/storage/`)

```ts
// keys.ts — registro único; um arquivo de feature pode declarar a sua, mas sempre por defineKey
type StorageScope = 'dispositivo' | 'usuario';
interface StorageKey<T> {
  nome: string; // sem o prefixo; o nome gravado é `checkpoint:${nome}`
  escopo: StorageScope;
  padrao: T;
  validar: (valor: unknown) => valor is T;
}
defineKey<T>(def: StorageKey<T>): StorageKey<T>; // lança se o nome já estiver registrado

// storage.ts
storage.get<T>(key: StorageKey<T>): T; // nunca lança
storage.set<T>(key: StorageKey<T>, valor: T): void; // nunca lança
storage.remove(key: StorageKey<unknown>): void; // nunca lança
storage.clearScope(escopo: StorageScope): void; // apaga SÓ as chaves registradas naquele escopo

// migrations.ts
export const STORAGE_SCHEMA_VERSION = 1;
runStorageMigrations(): void; // chamada em main.tsx antes do render
```

- Valores gravados como JSON. `JSON.parse` que falha ou `validar` que devolve `false` → devolve
  `padrao` e apaga a chave.
- Todo acesso nativo (`localStorage` em si, `getItem`, `setItem`, `removeItem`, `key`, `length`)
  fica em `try/catch`. Se o acesso ao `localStorage` lança (bloqueado/modo privado), o módulo usa um
  `Map` em memória até o fim da sessão. `setItem` com cota cheia → guarda em memória e registra **um**
  `console.warn` por sessão (sem o valor).
- `clearScope` **não** varre por prefixo nem por substring: percorre o registro. Uma chave
  `checkpoint:` que não esteja registrada nunca é apagada por ela.
- **Migração:** a versão fica em `checkpoint:versao`.
  - ausente → grava a atual (primeiro uso, ou dados de antes deste módulo, que não existem hoje);
  - menor que a atual → aplica `MIGRATIONS[n]` de `n` até a atual, em ordem, e grava a atual;
  - uma migração lança, ou a versão gravada é **maior** que a atual (volta de versão) → apaga **todas
    as chaves com prefixo `checkpoint:`** (só as nossas) e grava a atual.
  - `checkpoint:versao` **ilegível ou não numérica** (`abc`, `0`, `-1`, `1.5`, vazia) → tratada como
    "maior": apaga as chaves `checkpoint:*` e grava a atual (não dá para confiar nos dados de um
    formato que não se sabe qual é). Decisão tomada na implementação e aprovada.
  - Hoje `MIGRATIONS` é vazio (versão 1). Toda mudança de formato de uma chave existente sobe
    `STORAGE_SCHEMA_VERSION` **e** acrescenta a migração no mesmo commit.
- Chaves criadas por esta spec (todas `dispositivo`):

| Chave (`checkpoint:` + …)  | Tipo                                   | Uso                                                           | Etapa |
| -------------------------- | -------------------------------------- | ------------------------------------------------------------- | ----- |
| `versao`                   | número                                 | versão do schema local (gerida pelo módulo, fora do registro) | 2     |
| `instalacao:instalado`     | booleano                               | o evento `appinstalled` já ocorreu neste navegador            | 4     |
| `instalacao:dispensado-em` | número (epoch ms) \| null              | último "Agora não" no convite                                 | 4     |
| `instalacao:dias-de-uso`   | `{ ultimoDia: string; total: number }` | dias distintos (AAAA-MM-DD local) em que o app foi aberto     | 4     |

**Conectividade** (`apps/web/src/shared/lib/connectivity.ts` + `shared/hooks/use-connectivity.ts`)

- Estado: `'online' | 'offline' | 'sem-servidor'`, num _store_ externo lido por
  `useSyncExternalStore`.
- Entradas:
  - evento `offline` → `offline`;
  - evento `online`, `visibilitychange` para visível, ou o botão "Tentar agora" → dispara a sonda;
  - erro do `apiClient` **sem resposta** (`ERR_NETWORK`, `ECONNABORTED`/timeout) → `sem-servidor`
    (ou `offline`, se `navigator.onLine === false`) e inicia a sonda;
  - qualquer resposta HTTP da API (inclusive 4xx/5xx) → `online`.
- Sonda: `GET /api/health` pelo **mesmo** `apiClient` (com uma marca na config para o interceptor não
  realimentar o detector em laço), espera 5 s, 10 s, 20 s e depois a cada 30 s enquanto a aba estiver
  visível; para quando volta a `online`.
- Ao passar para `online` vindo de outro estado: `queryClient.invalidateQueries()` (as queries ativas
  recarregam).
- `queryClient`: `networkMode: 'always'` em queries e mutations. Com o padrão (`'online'`), uma query
  aberta sem rede fica **pausada** e a lista mostra o esqueleto para sempre; com `'always'` ela falha,
  e a tela mostra o estado de erro com a mensagem de conexão (abaixo).

**Aviso de conexão** (`shared/components/ConnectionBanner`, no `#overlay-root`)

| Estado           | Texto                                                        | Ação           |
| ---------------- | ------------------------------------------------------------ | -------------- |
| `offline`        | "Você está offline. O que já está na tela continua visível." | —              |
| `sem-servidor`   | "Não foi possível falar com o servidor. Tentando de novo…"   | "Tentar agora" |
| volta a `online` | "Conexão restabelecida" (some sozinho em 3 s)                | —              |

- `role="status"` e `aria-live="polite"`; ícone `wifi_off` / `cloud_off` / `wifi` com
  `aria-hidden="true"`; fica logo abaixo de `env(safe-area-inset-top)`; não cobre a barra inferior.
- Cores: fundo `painel`, borda e ícone `vermelho-neon` (offline/sem servidor) ou `ciano` (voltou);
  texto `texto`.

**Catálogo sem conexão**

- Lista já carregada continua visível (dados em memória do TanStack Query).
- Lista que falha ao carregar com estado `offline`/`sem-servidor` → o `ListError` mostra "Sem
  conexão. Seu catálogo aparece quando a conexão voltar." (em vez da mensagem genérica de erro) e o
  botão "Tentar de novo".
- `POST`/`PATCH`/`DELETE` (jogo ou capa) que falha sem resposta → mensagem geral no formulário (ou na
  confirmação de remoção): "Sem conexão. Nada foi salvo — tente de novo quando a conexão voltar." O
  diálogo continua aberto com os dados. Botões **não** ficam desabilitados por causa do estado (o
  detector pode estar atrasado; tentar de novo é sempre permitido).
- **Duas exceções ao texto acima** (decisões tomadas na implementação e aprovadas; o código e os
  testes já seguem isto):
  - **Capa que falha depois de o jogo ser salvo** (sem resposta) → "Sem conexão. O jogo foi salvo, mas
    a capa não — tente de novo quando a conexão voltar." O "Nada foi salvo" seria falso: o jogo já
    está no servidor e o próximo Salvar é `PATCH`.
  - **Timeout** (`ECONNABORTED`/`ETIMEDOUT`) → "O servidor não respondeu a tempo. Confira a lista antes
    de tentar de novo." Fica separado de `ERR_NETWORK` porque, com o tempo esgotado, o servidor pode ter
    gravado sem conseguir responder; afirmar "nada foi salvo" seria arriscado. (Só `ERR_NETWORK` diz
    "Nada foi salvo".)

### Etapa 3 — PWA base

**Configuração** (`apps/web/pwa.config.ts`, importado pelo `vite.config.ts` e pelos testes)

```ts
VitePWA({
  strategies: 'generateSW',
  registerType: 'prompt',
  injectRegister: false, // o registro é feito pelo nosso código (abaixo)
  manifest: MANIFEST, // objeto exportado deste mesmo arquivo
  includeAssets: ['icons/*.png', 'favicon.svg'],
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/api\//], // defensivo: se a API um dia vier para a mesma origem
    cleanupOutdatedCaches: true,
    runtimeCaching: [], // NADA em runtime: nem API, nem fontes, nem capas
    // skipWaiting e clientsClaim ficam false (padrão do modo prompt): a versão nova só assume
    // quando o usuário clica em Atualizar
  },
  devOptions: { enabled: false }, // sem SW no `npm run dev`; verificar com build + preview
});
```

- Versão do precache: a revisão (hash) de cada arquivo, gerada pelo Workbox no build. **Não existe
  número de versão de cache no código.**
- O `navigateFallback` faz qualquer navegação offline (`/`, `/status`, `/perfil`…) abrir o
  `index.html` do precache; o React Router resolve a rota.

**Manifest** (`MANIFEST`, publicado como `/manifest.webmanifest`)

| Campo              | Valor                                                    |
| ------------------ | -------------------------------------------------------- |
| `id`               | `/`                                                      |
| `name`             | `checkpoint`                                             |
| `short_name`       | `checkpoint`                                             |
| `description`      | `Seu registro de jogos: zerados, jogando e quero jogar.` |
| `lang` / `dir`     | `pt-BR` / `ltr`                                          |
| `start_url`        | `/`                                                      |
| `scope`            | `/`                                                      |
| `display`          | `standalone`                                             |
| `orientation`      | **omitido** (retrato e paisagem)                         |
| `theme_color`      | `#07040f` (token `fundo`)                                |
| `background_color` | `#07040f` (token `fundo`)                                |
| `categories`       | `["games", "entertainment"]`                             |
| `icons`            | tabela "Ícones"                                          |
| `shortcuts`        | etapa 4                                                  |

- `theme_color`/`background_color` e o `<meta name="theme-color">` do `index.html` repetem o hex do
  token `fundo` (o manifest não lê CSS). Um teste confere que os três são iguais ao `--color-fundo` de
  `styles/index.css`, para não divergirem. O CA-87 do catálogo (hex só no `@theme`) vale para
  `apps/web/src`; `pwa.config.ts` e `index.html` ficam fora dele, e o teste acima é a garantia.

**`index.html`** (além do viewport da etapa 1)

```html
<meta name="theme-color" content="#07040f" />
<meta name="description" content="Seu registro de jogos: zerados, jogando e quero jogar." />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black" />
<meta name="apple-mobile-web-app-title" content="checkpoint" />
<meta name="format-detection" content="telephone=no" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/icons/favicon-32.png" sizes="32x32" type="image/png" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />
```

- `black` (não `black-translucent`): a barra de status do iOS fica preta e o app começa abaixo dela;
  com o fundo `#07040f` a diferença é imperceptível e o topo não precisa somar a safe-area de cima.
- O `<link rel="manifest">` é injetado pelo plugin no build.

**Ícones** (feitos pelo humano; ficam em `apps/web/public/`)

| Arquivo                          | Tamanho | `purpose`  | Onde é usado                       | Observação                                                                          |
| -------------------------------- | ------- | ---------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| `icons/icon-192.png`             | 192×192 | `any`      | manifest                           | fundo pode ser transparente                                                         |
| `icons/icon-512.png`             | 512×512 | `any`      | manifest, tela de abertura Android | idem                                                                                |
| `icons/icon-maskable-192.png`    | 192×192 | `maskable` | manifest                           | fundo **opaco** `#07040f`; o desenho dentro do círculo central de 80% (zona segura) |
| `icons/icon-maskable-512.png`    | 512×512 | `maskable` | manifest                           | idem                                                                                |
| `icons/apple-touch-icon-180.png` | 180×180 | —          | `<link rel="apple-touch-icon">`    | **sem transparência** (o iOS preenche de preto); cantos retos (o iOS arredonda)     |
| `icons/favicon-32.png`           | 32×32   | —          | `<link rel="icon">`                |                                                                                     |
| `favicon.svg`                    | vetor   | —          | `<link rel="icon">`                | opcional; sem ele o navegador usa o PNG                                             |
| `icons/atalho-adicionar-96.png`  | 96×96   | `any`      | `shortcuts[0]` (etapa 4)           | opcional                                                                            |
| `icons/atalho-jogando-96.png`    | 96×96   | `any`      | `shortcuts[1]` (etapa 4)           | opcional                                                                            |

- `any` e `maskable` ficam em **entradas separadas** (não `"any maskable"` numa entrada só, como no
  Oratio: o ícone `any` recortado como máscara perde as bordas, e o `maskable` mostrado como `any` fica
  com fundo sobrando).
- **Enquanto os arquivos não existirem (placeholders):** o manifest e o `index.html` já apontam para
  os caminhos definitivos acima. O build **passa** (o plugin não confere a existência dos ícones; o
  `includeAssets` só não encontra nada). O DevTools → Application → Manifest mostra erro de ícone, o
  Chrome **não considera o app instalável**, o `beforeinstallprompt` não dispara e, portanto, o
  convite de instalação da etapa 4 **não aparece** (comportamento correto, não bug). O SW, o precache,
  o shell offline e o aviso de atualização funcionam normalmente. No iOS, "Adicionar à Tela de Início"
  usa uma captura da página no lugar do ícone. O agente **não** cria PNG de mentira nem commita
  binário placeholder. Criar os ícones é pendência humana (registrada no `INDEX.md`).

**Registro e atualização** (`apps/web/src/shared/lib/pwa/`)

- `use-app-update.ts`: embrulha o `useRegisterSW` de `virtual:pwa-register/react` e expõe
  `{ precisaAtualizar, atualizar(), adiar() }`. É o único arquivo que importa o módulo virtual (os
  testes mockam este arquivo, não o virtual).
- Verificação de versão nova: no registro, a cada 60 min enquanto a aba está visível
  (`registration.update()`) e ao voltar a aba para visível.
- `UpdatePrompt` (no `#overlay-root`, acima da barra inferior): cartão com "Nova versão disponível",
  botão **Atualizar** (chama `updateServiceWorker(true)`: ativa o SW novo e recarrega) e **Depois**
  (esconde até o próximo carregamento da página; o SW novo assume sozinho quando todas as abas do app
  fecharem). `role="status"`, `aria-live="polite"`.
- O `UpdatePrompt` **não aparece enquanto houver um `<dialog open>`** no documento; aparece quando o
  diálogo fecha.
- Sem `confirm()`, sem `skipWaiting` incondicional, sem `controllerchange → reload`.
- **Desvio aprovado na implementação:** `use-app-update` é mockado **globalmente** em
  `apps/web/src/test/setup.ts`, porque o módulo virtual só existe no build do Vite e qualquer teste que
  renderize o `AppLayout` (que traz o `UpdatePrompt`) tentaria resolvê-lo. O `UpdatePrompt.test.tsx`
  sobrescreve esse mock para cada estado. O módulo virtual continua sem ser mockado em teste nenhum.

### Etapa 4 — instalação

- `shared/lib/pwa/install-prompt.ts`, **importado na primeira linha** de `main.tsx` (antes de qualquer
  componente): escuta `beforeinstallprompt` (faz `preventDefault()` e guarda o evento) e `appinstalled`
  (descarta o evento e grava `instalacao:instalado = true`). O Chrome dispara o evento uma vez, cedo;
  quem começa a escutar dentro de um componente pode perdê-lo.
- Exporta `podeInstalar()`, `pedirInstalacao(): Promise<'aceito' | 'recusado' | 'indisponivel'>` e
  `assinar(cb)` (para o componente reagir quando o evento chega depois do render).
- `shared/lib/pwa/display.ts`: `estaInstalado()` = `matchMedia('(display-mode: standalone)')` ou
  `navigator.standalone === true` (iOS); `ehSafariIos()` (iPhone/iPad, Safari, não standalone).
- **Convite** (`InstallNudge`, no `#overlay-root`, cartão não modal acima da barra inferior):
  - Aparece quando **todas** valem: não `estaInstalado()`; `instalacao:instalado` falso;
    `podeInstalar()` **ou** `ehSafariIos()`; rota fora de `/login` e `/registro`; nenhum `<dialog open>`;
    `instalacao:dias-de-uso.total >= 2` (o app foi aberto em ao menos 2 dias diferentes);
    `instalacao:dispensado-em` nulo ou há ≥ 14 dias.
  - Espera 4 s depois de a página carregar antes de aparecer.
  - Chrome/Edge: "Instale o checkpoint para abrir direto da tela inicial, em tela cheia." + **Instalar**
    (chama `pedirInstalacao()`) + **Agora não**.
  - iOS: "Para instalar: toque em Compartilhar (ícone `ios_share`) e depois em _Adicionar à Tela de
    Início_." + **Entendi**.
  - "Agora não", "Entendi", ou o prompt nativo recusado → grava `instalacao:dispensado-em = agora` e
    some. Aceito → some e não volta.
- **Atalhos do manifest** (`shortcuts`): "Adicionar jogo" → `/?novo=1`; "Jogando" →
  `/?status=JOGANDO`, com os ícones de 96 px opcionais da tabela.
- **Decisões da implementação (aprovadas):**
  - **Prioridade da atualização:** se o `UpdatePrompt` está visível, o `InstallNudge` espera; os dois
    nunca aparecem juntos. O `UpdatePrompt` publica sua visibilidade num store mínimo
    (`shared/lib/pwa/update-prompt-visibility.ts`) em vez de o convite chamar `useAppUpdate`, porque
    cada chamada registraria o service worker de novo.
  - **Contagem de dias de uso:** `registrarDiaDeUso()` roda em `main.tsx`, logo depois de
    `runStorageMigrations()` e antes do render; usa o dia **local** (AAAA-MM-DD), não UTC.
  - **Atalhos sem `icons`:** os PNGs de 96 px são opcionais e não existem; o manifest não os declara.

## Modelo de dados

n/a. Nenhuma mudança em `apps/api/prisma/schema.prisma`.

## Contrato compartilhado

n/a. Nada vai para `packages/shared` (storage, conectividade e PWA dependem de `window`, o que o
`shared` não pode ter — `ARCHITECTURE.md` §6).

## Critérios de aceite (testáveis, em BDD)

Passos de UI contra `http://localhost:5173` (etapas 1 e 2) e contra o **build de produção**
(`npm run build -w @checkpoint/web && npm run preview -w @checkpoint/web`, porta 4173) nas etapas 3
e 4, porque o SW é desligado no `dev`. "Emulação" = DevTools → Device Toolbar. Larguras de referência:
**360×640** (Android pequeno), **390×844** (iPhone 12–15), 768 e 1280.

### Etapa 1 — layout mobile-first

- [ ] **CA-01** — **Dado** o catálogo com 10 jogos (um deles com título de 120 caracteres sem espaço),
      **quando** abro `/` em 360×640, **então** `document.documentElement.scrollWidth` é igual a
      `clientWidth` (sem rolagem horizontal da página).
- [ ] **CA-02** — **Dado** 360×640, **quando** abro `/`, **então** vejo a barra inferior com "Jogos"
      (`aria-current="page"`), "Adicionar" e nenhum item "Perfil" (ele só entra com `autenticacao`
      etapa 2); **e** o botão "Adicionar jogo" do topo não aparece. **Dado** 1280 px, **então** a barra
      inferior não existe e o topo mostra "Adicionar jogo" como hoje.
- [ ] **CA-03** — **Dado** 360×640, **quando** toco em "Adicionar" na barra, **então** abre o
      formulário de novo jogo como folha inferior (largura total, colada embaixo) com o foco no Título.
- [ ] **CA-04** — **Dado** que abro `http://localhost:5173/?novo=1`, **quando** a página carrega,
      **então** o formulário de novo jogo está aberto e a URL virou `/` (sem `novo`); **quando**
      recarrego, **então** o formulário não reabre. **Dado** `/status`, **quando** toco em "Adicionar",
      **então** vou para `/` com o formulário aberto.
- [ ] **CA-05** — **Dado** 360×640 com a lista rolada até o fim, **quando** olho a última linha,
      **então** ela está inteira acima da barra inferior (nada coberto).
- [ ] **CA-06** — **Dado** 360×640, **quando** meço (DevTools → inspecionar) os itens da barra
      inferior, os filtros, as ações da linha, os botões de status e os botões do rodapé da folha,
      **então** todos têm ≥ 44 × 44 px.
- [ ] **CA-07** — **Dado** 360×640 (quatro filtros com contagem), **quando** arrasto a fileira de filtros, **então**
      ela rola na horizontal sem mover a página; **e** com `/?status=ZERADO` o filtro "Zerado" está
      visível sem rolar.
- [ ] **CA-08** — **Dado** o formulário aberto em 360×640 com a capa escolhida (conteúdo maior que a
      tela), **quando** rolo o conteúdo, **então** o rodapé com Cancelar/Salvar continua visível
      embaixo; **e** a folha não passa da altura da tela.
- [ ] **CA-09** — **Dado** o emulador de iPhone com entalhe (DevTools, "iPhone 14 Pro") ou um aparelho
      real, **quando** abro `/` em retrato e em paisagem, **então** nenhum botão fica sob o entalhe ou
      sob a barra de gestos (a barra inferior tem espaço extra embaixo; as laterais em paisagem também).
- [ ] **CA-10** — **Dado** um celular Android real com Chrome, **quando** foco o Título no formulário,
      **então** o teclado abre, o campo e o botão Salvar ficam visíveis acima dele, e a página não dá
      zoom. _Manual, aparelho real._
- [ ] **CA-11** — **Dado** um iPhone real com Safari, **quando** foco qualquer campo do formulário,
      **então** a página **não** dá zoom (fonte ≥ 16 px) e o campo focado fica visível. **E** no
      DevTools, o `font-size` computado de todo `input`/`select` é ≥ 16 px. _Parte manual, aparelho real._
- [ ] **CA-12** — **Dado** o celular, **quando** faço pinça na página, **então** ela amplia (zoom não
      travado); **e** o `<meta name="viewport">` não contém `maximum-scale` nem `user-scalable`.
- [ ] **CA-13** — **Dado** `prefers-reduced-motion: reduce` emulado, **quando** abro o formulário em
      360×640, **então** a folha aparece sem animação de subida; **e** os avisos das etapas 2 a 4 também
      aparecem sem deslizar.
- [ ] **CA-14** — **Dado** o toque (emulação com toque ligado), **quando** toco numa linha da lista e
      solto, **então** ela não fica com o fundo de hover preso.
- [ ] **CA-15** — **Dado** `apps/web/index.html`, **quando** o leio, **então** `#overlay-root` existe,
      é irmão de `#root` (não está dentro dele); **e** a barra inferior está dentro de `#overlay-root`
      (DevTools → Elements).
- [ ] **CA-16** — **Dado** o código, **quando** procuro o componente da barra inferior em
      `apps/web/src/pages`, **então** nenhuma página o importa (ele vem do `AppLayout`).

### Etapa 2 — storage e conectividade

- [x] **CA-17** — **Dado** `apps/web/src`, **quando** procuro `localStorage` e `sessionStorage`,
      **então** só aparecem dentro de `shared/lib/storage/` (e nos testes dele).
- [ ] **CA-18** — **Dado** uma chave registrada gravada com JSON inválido (DevTools → Application →
      Local Storage, editar à mão para `{quebrado`), **quando** o app lê essa chave, **então** usa o
      padrão, não mostra erro na tela e a chave some do storage.
      _Pendente: verificação pela UI na etapa 4 (primeira chave registrada). Hoje coberto por teste
      unitário e pelo módulo real no navegador, sem tela que leia chave._
- [x] **CA-19** — **Dado** o storage bloqueado (Chrome → Configurações → Cookies e dados do site →
      "Bloquear" para `localhost`), **quando** abro `/`, **então** o catálogo funciona igual e não há
      erro não tratado no console.
- [x] **CA-20** — **Dado** `checkpoint:versao` = `99` e uma chave `checkpoint:qualquer`, e uma chave
      `outro-app:x` no mesmo origin, **quando** recarrego, **então** `checkpoint:versao` volta a `1`,
      `checkpoint:qualquer` some e `outro-app:x` continua lá.
- [x] **CA-21** — **Dado** o catálogo carregado, **quando** marco "Offline" no DevTools (Network),
      **então** o aviso "Você está offline…" aparece em até 1 s e a lista continua visível; **quando**
      desmarco, **então** aparece "Conexão restabelecida", some em ~3 s e a lista é recarregada (uma
      request `GET /api/games` nova no Network).
- [x] **CA-22** — **Dado** o web aberto e a **API parada** (Ctrl+C no `dev` da API; o navegador segue
      online), **quando** salvo algo, **então** aparece "Não foi possível falar com
      o servidor. Tentando de novo…" com "Tentar agora"; **quando** subo a API de novo, **então** em até
      ~30 s o aviso vira "Conexão restabelecida" sem eu recarregar a página.
- [x] **CA-23** — **Dado** o DevTools em "Offline", **quando** preencho o formulário de novo jogo e
      clico Salvar, **então** o formulário continua aberto com os dados, mostra "Sem conexão. Nada foi
      salvo — tente de novo quando a conexão voltar." e nenhum jogo novo existe depois
      (`curl http://localhost:3333/api/games`).
- [x] **CA-24** — **Dado** a API parada, **quando** abro `/` do zero, **então** vejo "Sem conexão. Seu
      catálogo aparece quando a conexão voltar." com "Tentar de novo" (e não o esqueleto de
      carregamento para sempre).

### Etapa 3 — PWA base

- [x] **CA-25** — **Dado** o build rodando no `preview`, **quando** abro DevTools → Application →
      Manifest, **então** vejo `id` `/`, `start_url` `/`, `scope` `/`, `display` `standalone`,
      `theme_color` e `background_color` `#07040f`, `lang` `pt-BR`, sem `orientation`, e ícones
      `any` e `maskable` em entradas separadas. _Ícones adicionados em 2026-09-24; app instalável
      verificado pelo humano._
- [x] **CA-26** — **Dado** o build no `preview`, **quando** a página carrega, **então** DevTools →
      Application → Service Workers mostra um SW **ativado** para `http://localhost:4173/`, e Cache
      Storage tem só um cache `workbox-precache-v2-…` cujas entradas são todas de
      `http://localhost:4173` (nenhuma de `:3333`, `fonts.googleapis.com`, `fonts.gstatic.com` ou
      `supabase.co`).
- [x] **CA-27** — **Dado** o SW ativo, **quando** uso o catálogo, **então** no Network nenhuma request
      a `:3333/api` aparece como "(ServiceWorker)" no Size; e as fontes e as capas também não.
- [x] **CA-28** — **Dado** o app aberto uma vez com o SW ativo, **quando** marco "Offline" e recarrego
      `/`, e depois abro `/status` direto pela barra de endereço, **então** em ambos aparece o shell do
      app (topo, barra inferior, aviso de offline), não a página de erro do navegador.
- [x] **CA-29** — **Dado** o app aberto no `preview`, **quando** mudo um texto qualquer do web, rodo o
      build de novo e volto à aba (ou espero a checagem), **então** aparece "Nova versão disponível" com
      **Atualizar** e **Depois**, e a página **não** recarregou sozinha; **quando** clico **Atualizar**,
      **então** a página recarrega com o texto novo; **e** Cache Storage não tem mais as entradas da
      versão anterior.
- [x] **CA-30** — **Dado** uma versão nova esperando e o formulário de jogo aberto, **quando** a
      checagem encontra a versão nova, **então** o aviso não aparece enquanto o diálogo está aberto;
      **quando** fecho o diálogo, **então** ele aparece.
- [x] **CA-31** — **Dado** o aviso de versão nova, **quando** clico **Depois**, **então** ele some e a
      página continua na versão antiga, sem recarregar; **quando** fecho todas as abas do app e abro de
      novo, **então** a versão nova está ativa.
- [x] **CA-32** — **Dado** `npm run dev -w @checkpoint/web`, **quando** abro o app, **então** não há
      SW registrado para `localhost:5173` (DevTools → Service Workers vazio para essa origem).
- [x] **CA-33** — **Dado** `apps/web/public` sem nenhum dos ícones da tabela, **quando** rodo
      `npm run build`, **então** o build conclui sem erro.
- [x] **CA-34** — **Dado** `apps/web/index.html` e o `pwa.config.ts`, **quando** rodo os testes do web,
      **então** um teste confere que `theme_color`, `background_color` e o `<meta name="theme-color">`
      são iguais ao `--color-fundo` de `styles/index.css`.
- [x] **CA-35** — **Dado** `apps/web/src` e `apps/web/public`, **quando** procuro `confirm(`,
      `skipWaiting()`, `controllerchange` e `location.reload`, **então** não há ocorrência (o único
      recarregamento é o do `updateServiceWorker(true)`, disparado pelo clique).

### Etapa 4 — instalação

Requer os ícones da etapa 3 (pendência humana) para o Chrome considerar o app instalável.

- [ ] **CA-36** — **Dado** Chrome no desktop ou Android, app não instalado, aberto em 2 dias diferentes
      (simular: `checkpoint:instalacao:dias-de-uso` = `{"ultimoDia":"2026-09-22","total":1}` e
      recarregar), **quando** ~4 s se passam em `/`, **então** aparece o convite com **Instalar** e
      **Agora não**; **quando** clico **Instalar**, **então** abre o prompt nativo do Chrome.
- [ ] **CA-37** — **Dado** o convite visível, **quando** clico **Agora não**, **então** ele some e
      `checkpoint:instalacao:dispensado-em` tem o horário atual; **quando** recarrego, **então** ele não
      aparece; **quando** mudo `dispensado-em` para 15 dias atrás e recarrego, **então** aparece de novo.
- [ ] **CA-38** — **Dado** o app aberto pelo ícone instalado (standalone), **quando** uso o app,
      **então** o convite nunca aparece. **Dado** a aba do navegador depois de instalar (evento
      `appinstalled`), **então** também não.
- [ ] **CA-39** — **Dado** um iPhone com Safari (ou o emulador com _user agent_ de iPhone Safari),
      condições de tempo atendidas, **quando** abro `/`, **então** o convite mostra o passo a passo com
      o ícone de Compartilhar e o botão **Entendi**, sem botão Instalar.
- [ ] **CA-40** — **Dado** o formulário aberto, ou a rota `/login`, **quando** as condições de tempo
      são atendidas, **então** o convite não aparece.
- [ ] **CA-41** — **Dado** o app instalado no Android, **quando** pressiono o ícone, **então** vejo os
      atalhos "Adicionar jogo" e "Jogando"; **quando** escolho "Adicionar jogo", **então** o app abre
      com o formulário aberto. _Manual, aparelho real._

## Plano de testes

- **Unitário — web (Vitest + Testing Library + jsdom):**
  - `shared/lib/storage/storage.test.ts`: com um `Storage` falso injetado: prefixo `checkpoint:`;
    JSON inválido e validador falso → padrão + chave apagada (CA-18); `getItem`/`setItem` lançando →
    memória, sem lançar (CA-19); cota cheia → um `console.warn`; `clearScope('usuario')` apaga só as
    registradas nesse escopo e não toca `checkpoint:nao-registrada` nem `outro-app:x`; `defineKey` com
    nome repetido lança.
  - `shared/lib/storage/migrations.test.ts`: ausente → grava 1; `MIGRATIONS` falsas de 1→2→3 aplicadas
    em ordem; migração que lança → apaga só `checkpoint:*`; versão maior → idem (CA-20).
  - `shared/lib/connectivity.test.ts` (timers falsos): `offline` → `offline`; erro sem resposta →
    `sem-servidor` e sonda em 5/10/20/30 s; resposta HTTP → `online` e `invalidateQueries` chamado uma
    vez; a sonda não realimenta o detector.
  - `ConnectionBanner.test.tsx`: textos e botão por estado; "Conexão restabelecida" some em 3 s.
  - `GameForm.test.tsx` (acréscimo): `apiClient` rejeitando com `ERR_NETWORK` → mensagem de sem
    conexão, diálogo aberto, dados mantidos (CA-23).
  - `app/layout/nav-items.test.ts` e `AppLayout.test.tsx`: itens e ordem; `aria-current`; "Adicionar"
    em `/` abre o formulário e fora de `/` navega para `/?novo=1`; `?novo=1` abre e limpa a URL
    (CA-04); barra some com um `input` fora de diálogo focado.
  - `pwa.config.test.ts`: `registerType` `prompt`; `runtimeCaching` vazio;
    `navigateFallbackDenylist` cobre `/api/`; `cleanupOutdatedCaches` true; ícones `any` e `maskable`
    em entradas separadas, com os caminhos da tabela; cores iguais ao token (CA-34).
  - `UpdatePrompt.test.tsx` (mock de `use-app-update`): aparece com `precisaAtualizar`; **Atualizar**
    chama `atualizar()` uma vez; **Depois** esconde sem chamar; escondido com `<dialog open>` e
    reaparece quando fecha (CA-30).
  - `install-prompt.test.ts` e `InstallNudge.test.tsx` (evento `beforeinstallprompt` falso, relógio
    falso): captura no import; cada condição de exibição isolada (standalone, instalado, dias de uso,
    14 dias, rota, diálogo aberto, iOS); gravação de `dispensado-em`.
  - `styles/tokens.test.ts` (acréscimo): regra de movimento reduzido cobre as animações novas; viewport
    sem `maximum-scale`/`user-scalable` (CA-12); `#overlay-root` fora de `#root` (CA-15).
- **Manual (checklist no DevTools e em aparelho, via `/qa-verify`):** CA-01 a CA-14 (larguras de
  referência, safe-area, teclado, zoom, toque), CA-21, CA-22, CA-24 (rede real), CA-25 a CA-33 (SW,
  manifest, precache, atualização: **sempre em aba anônima nova ou depois de "Unregister" + "Clear site
  data"**, senão um SW antigo esconde o efeito), CA-36 a CA-41 (instalação, aparelho real quando
  indicado).

Loop de verificação por tarefa:
`npm run typecheck -w @checkpoint/web` → `npm test -w @checkpoint/web` → `npm run lint` →
`npm run build` → commit.

## Ordem de implementação

Quatro etapas. **Cada uma termina com `typecheck`, `lint`, `build` e testes verdes e PARA**: a seguinte
só começa com um "ok" explícito do humano. Branch sugerida: `feat/pwa-e-mobile`.

| Etapa | Entrega                                                                                                                                              | Dependência nova             | Critérios     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------- |
| 1     | `AppLayout` + rotas aninhadas · barra inferior · `#overlay-root` · viewport/safe-area/toque · catálogo e folha inferior em tela estreita · `?novo=1` | nenhuma                      | CA-01 a CA-16 |
| 2     | storage tipado com versão e migração · conectividade + `ConnectionBanner` · `networkMode: 'always'` · mensagens de sem conexão                       | nenhuma                      | CA-17 a CA-24 |
| 3     | `vite-plugin-pwa` · `pwa.config.ts` · manifest · meta tags · SW `generateSW` · `UpdatePrompt` · caminhos dos ícones (placeholders)                   | `vite-plugin-pwa` (aprovada) | CA-25 a CA-35 |
| 4     | captura do `beforeinstallprompt` · `InstallNudge` · atalhos do manifest                                                                              | nenhuma                      | CA-36 a CA-41 |

`ARCHITECTURE.md` muda junto de cada etapa: §1 (linha "PWA / service worker" deixa de dizer "não
existe" na etapa 3), §3 e §5 (layout, `shared/lib/storage`, conectividade, `shared/lib/pwa`), §8 se
alguma env entrar (nenhuma prevista).

### Dependências entre specs

- `autenticacao` etapa 2 **depende de** esta etapa 1 (`AppLayout`, lista de navegação para o item
  "Perfil") e etapa 2 (storage com `clearScope('usuario')` para o logout; conectividade para tratar o
  refresh que falha por rede sem deslogar).
- `perfil` etapa 3 (preferências locais) **depende de** esta etapa 2 (storage) e etapa 1 (layout).
- `perfil` etapa 1 ("Instalar app" no perfil) **depende de** esta etapa 4.
- As etapas 3 e 4 desta spec não dependem de auth e podem ser feitas antes ou depois de
  `autenticacao`.

## Fora de escopo

**Feature do produto (specs futuras, se desejadas):**

- **Fila de mutações offline** (salvar sem rede e sincronizar depois), _background sync_ e
  sincronização periódica.
- **Push notifications.**
- **Cache de respostas da API no SW** (e, portanto, **leitura offline do catálogo** depois de
  recarregar a página): **fora desta rodada** (Q-PWA-2, decidida em 2026-09-23).
- Fontes e ícones hospedados localmente. Hoje vêm do Google Fonts por `<link>`, e o SW não os toca. Sem
  rede e sem cache HTTP do navegador, o texto cai para `system-ui` e os ícones Material Symbols
  aparecem como palavras (`add_circle`). Só importaria com a leitura offline, que ficou fora (Q-PWA-2).
- Telas de abertura do iOS (`apple-touch-startup-image`), `screenshots` no manifest (instalação
  "rica"), `share_target`, trava de orientação, tema claro.
- Gestos (arrastar para fechar a folha, deslizar a linha para remover).
- Geração automática de ícones (`@vite-pwa/assets-generator`).

**Passo de processo (não é critério de aceite):**

- Criar os ícones da tabela (humano). Atualizar `ARCHITECTURE.md`, `docs/specs/INDEX.md`.

## Notas de ambiente

- **Env nova:** nenhuma.
- **Dependência nova (etapa 3, `RULES.md` §9, aprovada em 2026-09-23):** `vite-plugin-pwa@^1.3.0` como
  devDependency de `apps/web` (transitivas: `workbox-build@^7.4.1`, `workbox-window@^7.4.1`). Tipos do
  módulo virtual: `"types": ["vite-plugin-pwa/react"]` em `tsconfig.app.json`.
- **Verificação do SW:** só no build (`npm run build` + `npm run preview`, porta 4173). O `preview`
  serve em `http://localhost`, contexto seguro, então o SW registra sem HTTPS. Em aparelho real na
  rede local (`http://192.168.x.x`), **o SW não registra** (não é contexto seguro): o teste em
  aparelho de SW/instalação exige HTTPS (ex.: túnel) ou a futura hospedagem.
- **Cache antigo mascarando correção:** antes de concluir que algo "não mudou", aba anônima nova, ou
  DevTools → Application → Service Workers → Unregister + Storage → Clear site data.

## Questões em aberto

Nenhuma. As duas foram decididas pelo humano em 2026-09-23:

- [x] **Q-PWA-1 — Aprovar `vite-plugin-pwa`?** **Decidido: sim** — devDependency de `apps/web`,
      `generateSW` + `registerType: 'prompt'`. Entra **só na etapa 3**; as etapas 1 e 2 não instalam
      nada. Nenhuma outra dependência foi aprovada por esta decisão.
- [x] **Q-PWA-2 — Leitura offline do catálogo?** **Decidido: fora desta rodada.** O SW continua sem
      nenhum cache de API (`runtimeCaching: []`), e as fontes continuam no Google Fonts. Se voltar, é
      etapa nova (depois de `autenticacao` etapa 2, por causa do cache por usuário).

## Suposições

Aprovadas junto da spec em 2026-09-23:

- Ponto de quebra mobile/desktop em **768 px** (`md` do Tailwind). **O catálogo muda de 900 px para
  768 px:** hoje `GamesPage` usa `max-[900px]` (espaçamento lateral e de topo); esses pontos passam a
  seguir o `md`. Ao terminar a etapa 1, rodar `/spec-sync docs/specs/catalogo-jogos.md` para conferir
  se algum critério ou diretriz do catálogo cita 900 px (pendência registrada no `INDEX.md`).
- Barra inferior com Jogos · Adicionar · Perfil (Perfil só a partir de `autenticacao` etapa 2);
  `/status` fora da navegação.
- Formulário em folha inferior no celular (em vez de tela cheia).
- `networkMode: 'always'` no TanStack Query, para a falha sem rede aparecer como erro em vez de uma
  query pausada.
- Sonda de volta com espera de 5/10/20/30 s; aviso "Conexão restabelecida" por 3 s.
- Convite de instalação: a partir do 2º dia de uso, 4 s depois de carregar, intervalo de 14 dias após
  "Agora não" (o Oratio usa 3 h + 3 telas; aqui há poucas telas, então o critério é por dias).
- `apple-mobile-web-app-status-bar-style` = `black`.
- Zoom **não** travado (diferente do Oratio), por acessibilidade.
- `overscroll-behavior-y: none` só no app instalado.
