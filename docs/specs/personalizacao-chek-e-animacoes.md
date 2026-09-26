# Spec: personalização com o Chek e sistema de animações

> Status: 🚧 em andamento (aprovada em 2026-09-26). **F1 a F5 implementadas** na branch `feat/personalizacao-chek` (cadeia a partir de `feat/ajustes-catalogo`), cada
> uma com o gate verde e uma passada visual (360 e 1280 px, API mockada). Faltam o `/qa-verify` completo, os critérios de aparelho real e a captura de quadros
> fina do CA-59. O desenho das 5 expressões foi aprovado pelo humano.

## Objetivo

Dar personalidade ao checkpoint com o mascote **Chek** (um cartucho de jogo com carinha e uma bandeira dourada de checkpoint como
antena), presente na marca, nas telas de entrada, na espera, nos estados vazios e de erro e nas comemorações, e dar ao app um
**sistema de movimento** único (tokens, feedback de clique, carregamento, erro, sucesso, criação e remoção de jogos) que o deixe mais
profissional sem nunca atrasar nem bloquear uma ação. É **apresentação e feedback**: nenhuma regra de negócio nova.

## Stack

Padrão da casa (`ARCHITECTURE.md` §5): React 19, Tailwind 4 com tokens no `@theme`, TanStack Query, React Router 7. O que diverge ou se
confirma:

- **Nenhuma dependência nova** (`RULES.md` §9): nada de framer-motion, lottie ou GSAP. Movimento é CSS (`@keyframes`, `transition`,
  `@starting-style`) e no máximo **três hooks pequenos** (aba visível, atraso de 300 ms, e o FLIP da remoção, esse último com plano B).
  A troca de tela usa `viewTransition` do React Router 7 (já instalado), que só chama a View Transitions API se o navegador a tem.
- **O Chek em React é um componente SVG inline** (`shared/components/Chek/`), com as cores por **tokens** (`var(--color-...)` em `fill`,
  `stroke` e `stop-color`), e não um `<img>` de `public/`. Por quê: as partes precisam se mexer (a bandeira balança, o rosto troca de
  expressão sobre o mesmo corpo) e um `<img>` não expõe as partes. O `tokens.test.ts` **não é enfraquecido**: os hex do Chek que ainda
  não têm token entram no `@theme` (lista em "Requisitos de saída"). Os arquivos estáticos (`og-image`, `favicon.ico`) ficam em
  `apps/web/public`, fora do escopo do teste.
- Um **`Aviso` global** (pilha única de avisos de sucesso no `#overlay-root`), à maneira de `ConnectionBanner` e `UpdatePrompt`.
- **Um formato de storage não muda**; nenhuma chave nova (os marcos não são gravados; ver "Suposições" 9).
- Sem mudança em `apps/api`, `prisma/schema.prisma`, DTO ou migration. Em `packages/shared` não muda nada (o `APP_NAME` já é "Checkpoint").

## Coordenação e ponto de partida

- **Base da implementação:** a branch `feat/ajustes-catalogo` (a partir da `main`, com o nome "Checkpoint" com C maiúsculo, os filtros em
  grade 2 × 2 e o "Ver mais" nas prateleiras, commitados depois do gate verde). Worktree `../checkpoint-chek`, branch
  `feat/personalizacao-chek`, com junctions para os `node_modules`. O commit `1e3904c` da `feat/logo-chek` (troca `favicon.svg` e os PNGs
  de `apps/web/public/icons` pelos do Chek) foi trazido por `cherry-pick` para essa branch, porque a base pedida não o continha. Esta spec
  entra no primeiro commit do Chek. Sem push e sem PR.
- Quando o Chek chegar à `main`, a pendência do `INDEX.md` sobre os ícones do PWA em magenta fecha (é o que o commit `1e3904c` faz).

## Uma spec ou duas?

**Uma, em 5 fases.** "Marca" e "animações" se tocam nos estados de espera, erro e sucesso (o Chek _é_ o personagem da animação), e as
fases são implantáveis sozinhas. O tamanho é grande (≈ 70 critérios); se você preferir, divido em `marca-chek` (F1) e
`animacoes-e-microinteracoes` (F2 a F5) sem perder nada.

## Material do Chek

Em `C:\Users\lucas\OneDrive\Área de Trabalho\PrograminFolder\logo-checkpoint\` (fora do repositório; lido: `LEIAME.md`, os SVGs mestres
e `4-marca/svg`). Paleta do mascote: azul-noite `#0b0f1a` (fundo e painel do rosto), azul `#4f8cff` com degradê `#8fbaff` → `#3f79f0`
(corpo), dourado `#ffd166` com degradê `#ffe08a` → `#ffbf47` (bandeira, pinos e bochechas), gelo `#eef2ff` (olhos e boca), base do
cartucho `#2a4fa3` e mastro `#dfe8ff`. Regras de uso do `LEIAME`: respiro de pelo menos a largura do olho, **24 px é a altura mínima
com rosto** (abaixo disso, o favicon), não girar, não esticar, não trocar as cores.

- **Versionar** em `docs/design/marca/` uma cópia dos SVGs mestres (`fonte-svg/*.svg`, `4-marca/svg/*.svg`) e do `LEIAME.md`, **sem
  alterar o conteúdo**. `docs/design` **já está** no `.prettierignore`, então o caminho novo **não precisa** de linha nova.
- **O logo horizontal e o `og-image` são regenerados pelo humano com "Checkpoint"**, que avisa quando estiverem em `logo-checkpoint`; a F1 só
  copia o `og-image` **depois desse aviso** (o mock e o resto da F1 não dependem dele).
- **`favicon.ico` e `og-image-1200x630.png`** vêm de `1-projeto-web/favicon.ico` e `6-redes-sociais/og-image-1200x630.png` para
  `apps/web/public`. O `og-image` tem **355 KB** e o `globPatterns` do Workbox inclui `png`: ele entraria no precache do PWA. A F1
  o tira do precache (`globIgnores`), porque só robôs de compartilhamento o pedem.

## Onde o Chek entra (proposta)

| # | Lugar                                                                                       | O que muda                                                                                                                                                  |
| - | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | Logo do `TopNav` e do cabeçalho do catálogo (`GamesPage`); `BrandLogo` (telas fora do app)  | O círculo com a bandeira vira o Chek (36 a 44 px) + o nome. Link continua para `/` (com `aria-current="page"` no catálogo) e o alvo de toque continua ≥ 44 px |
| 2 | `/login` e `/registro` (`AuthCard`)                                                         | Chek maior (96 px) acima do cartão, feliz                                                                                                                   |
| 3 | `LoadingScreen` (boot da sessão)                                                            | Chek com a bandeira balançando, **só depois de 300 ms**                                                                                                     |
| 4 | Catálogo vazio; prateleira sem jogos; filtro sem resultado; sem conexão; erro de tela; 404; perfil Steam privado; 100% das conquistas | Um Chek por estado, com a expressão da tabela abaixo. **Não existe página 404 hoje** (as rotas não têm `path: '*'`): propõe-se `NaoEncontradaPage` |
| 5 | `index.html`                                                                                | `description`, `og:title`, `og:description`, `og:image`, `og:type`, `twitter:card`, `link rel="icon"` do `.ico`, `apple-mobile-web-app-title`                 |
| 6 | Manifest do PWA                                                                             | Confere `name`, `short_name`, ícones e os atalhos; sem quebrar `pwa.config.test.ts`                                                                         |

**Expressões** (mesmo corpo, só o rosto muda; o mestre é a feliz). Conjunto mínimo proposto, **5**:

| Expressão      | Rosto                                                     | Usada em                                                                                   |
| -------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `feliz`        | o do mestre                                               | marca, telas de entrada, sucesso, carregamento                                             |
| `dormindo`     | olhos fechados em arco, boca pequena, um "z"              | catálogo vazio, prateleira sem jogos, filtro sem resultado                                 |
| `confuso`      | um olho maior, sobrancelha torta, boca ondulada, um "?"   | erro de tela, falha de rede, sem conexão, 404, falha ao carregar a lista                   |
| `comemorando`  | olhos em "^ ^", boca aberta, duas estrelas douradas       | marcos (primeiro jogo, Zerado, 100% das conquistas)                                        |
| `cadeado`      | olhos normais, um cadeado dourado no lugar da boca        | perfil Steam privado                                                                       |

A `triste` **fica para depois** (Q1): erro e falta de conexão usam a `confuso`. **Antes de aplicar em qualquer tela**, a F1 entrega um
mock estático (`docs/design/marca/expressoes.html`, aberto no navegador) com as 5 expressões em 24, 44 e 96 px, sobre `fundo` e `painel`,
e **para** até você aprovar o desenho.

## Sistema de movimento

**Tokens** (variáveis CSS em `:root`, em `src/styles/index.css`; nenhuma duração ou curva solta fora deles):

| Token                 | Valor                             | Para quê                                             |
| --------------------- | --------------------------------- | ---------------------------------------------------- |
| `--mov-rapida`        | `120ms`                           | pressão, hover de cor                                |
| `--mov-padrao`        | `200ms`                           | entrada e saída de aviso, banner, diálogo, tile      |
| `--mov-enfase`        | `320ms`                           | tile novo "assentando", marco                        |
| `--mov-max`           | `600ms`                           | teto de qualquer feedback (o teste vigia)            |
| `--ease-entrada`      | `cubic-bezier(0.2, 0.8, 0.2, 1)`  | o que aparece (é a curva do hover do tile de hoje)   |
| `--ease-saida`        | `cubic-bezier(0.4, 0, 1, 1)`      | o que sai                                            |
| `--ease-elastica`     | `cubic-bezier(0.34, 1.4, 0.64, 1)`| retorno da pressão e do "assentar"; leve (≤ 1,4)     |

**Regras:**

1. **Laços (`infinite`) e `@keyframes` animam só `transform` e `opacity`**, nada de `width`, `height`, `top`, `left` nem `box-shadow`.
   **Transições de uma vez só** (hover, foco) podem, além disso, mudar `color`, `background-color`, `border-color` e `box-shadow`
   (barato e sem _reflow_: o anel do tile de hoje). Exceção nomeada: nenhuma.
2. **Nunca bloqueia a ação.** O clique já vale, o resultado aparece na hora e a animação só acompanha. Nada de `await` por animação;
   nada de atraso em Esc, Enter, retorno de foco ou navegação. Onde a saída precisa de tempo (remoção de jogo), o dado já mudou.
3. **Movimento reduzido** = `prefers-reduced-motion: reduce` **ou** "Animações: Reduzidas" no `/perfil`, pela variante única
   `movimento-reduzido` (§5.12), **sem regra duplicada**. A regra global de hoje (`animation: none` e `transition: none` em tudo)
   **continua**; **cada animação ganha o seu equivalente estático**, definido na tabela abaixo (o estado final aparece de uma vez; o que
   antes chamava atenção pelo movimento passa a chamar pela **cor** ou por um **realce estático que dura o mesmo tempo**).
4. **Sem pseudo-elemento animado** (`::before`/`::after`; o `tokens.test.ts` já vigia). A troca de tela via View Transitions usa o
   _cross-fade_ padrão do navegador, **sem CSS nosso** em `::view-transition-*` (não muda o teste).
5. **Laços só na espera:** o Chek do carregamento, o esqueleto e o ícone de "Atualizar" enquanto há requisição. Fora disso, nada em
   laço, **exceto** a amostra `previa-elevar` do modal de preferências (já existe; só existe com o modal aberto). Um hook `useAbaVisivel`
   marca `data-aba-oculta` no `<html>` e o CSS põe `animation-play-state: paused` nos laços com a aba oculta.
6. **Nada pisca mais de 3 vezes por segundo.** O tremor do campo é 1 ciclo de 240 ms (hoje são 3 de 350 ms = 1,05 s: **passa a 1**).

**Animação → equivalente em movimento reduzido:**

| Animação                                   | Duração / curva                  | Em movimento reduzido                                                        |
| ------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------- |
| Pressão (`scale: 0.97`)                    | rápida / elástica                | sem escala; o fundo do botão muda de cor (hover/ativo) sem transição         |
| Elevação do tile no hover (já existe)      | padrão / entrada                 | sem elevação; o anel continua                                                |
| Esqueleto (brilho)                         | 1,4 s, laço (opacity)            | esqueleto parado, na cor `esqueleto`                                         |
| Chek do carregamento                       | 1,6 s, laço lento (transform)    | Chek parado (feliz)                                                          |
| Botão pendente (indicador)                 | laço (rotate)                    | o texto "Salvando…" já diz; sem giro                                         |
| Tremor do campo com erro                   | 240 ms, 1 ciclo                  | só a borda `erro` e o texto (já é assim)                                     |
| Aviso de sucesso entra e sai               | padrão / entrada e saída         | aparece e some de uma vez; **o tempo na tela é o mesmo**                     |
| Tile novo "assenta" + realce               | ênfase / elástica                | sem movimento; o realce vira **anel `destaque` estático por 2 s**            |
| Tile removido + espaço fechando            | padrão / saída                   | some de uma vez                                                              |
| Contador troca                             | rápida                           | troca de uma vez                                                             |
| Marco com o Chek                           | ≤ 1,2 s, uma vez                 | Chek `comemorando` **estático** dentro do aviso                              |
| Diálogo e folha entram e saem              | padrão / entrada e saída         | abre e fecha de uma vez                                                      |
| Troca de tela (View Transitions)           | padrão do navegador              | desligada (`viewTransition` falso)                                           |

## Comportamento esperado

### F1 — Marca

- **Componente `Chek`** (`shared/components/Chek/`): `expressao` (`feliz`, `dormindo`, `confuso`, `comemorando`, `cadeado`), `tamanho`
  (altura em px), `animado` (só a bandeira) e `titulo` opcional. Decorativo por padrão (`aria-hidden="true"`, `focusable="false"`); com
  `titulo`, vira `role="img"` com esse nome. **Não segue a cor de destaque** escolhida no `/perfil` (ele é a marca, fica azul; Q1 do
  briefing, confirmada como suposição 7). Gradientes com `id` único por instância (`useId`), sem colisão com várias instâncias na tela.
- **Logo do topo:** `Chek` de 36 px (celular) e 44 px (≥ 768 px) + "Checkpoint" (Q1: C maiúsculo, como já está no código). Mesma estrutura de `Link` de hoje,
  `min-h-11`, `aria-current="page"` no catálogo. O nome acessível do link continua sendo o nome do app; o Chek é `aria-hidden`.
- **`/login` e `/registro`:** `Chek` de 96 px, feliz, centralizado acima do cartão; **sem** mudar formulário, foco inicial nem textos.
- **`index.html`:** as tags da tabela, com `og:image` **absoluta** (URL da constante `SITE_URL`) e `og:image:width/height/alt`;
  `twitter:card` = `summary_large_image`; `link rel="icon" href="/favicon.ico" sizes="48x48"` junto dos atuais; `theme-color` e demais
  meta ficam. O `pwa.config.test.ts` continua conferindo `theme_color`/`background_color`. **A URL do site
  (`https://checkpoint-web-rust.vercel.app`) mora num lugar só:** a constante `SITE_URL` em `apps/web/site.config.ts`, injetada no
  `index.html` (`%SITE_URL%`) por um plugin `transformIndexHtml` no `vite.config.ts`; nenhum outro arquivo a repete.
- **Manifest:** `name` e `short_name` seguem a Q1; os ícones já são os do Chek (commit `1e3904c`); os `shortcuts` **não ganham `icons`**
  (o comentário de hoje diz que os PNGs de 96 px não existem; o Android usa o do app) a menos que você peça (Q1, "depois").

### F2 — Movimento (a base)

- Os **tokens** da tabela acima; **nenhum** `animation`/`transition` do `index.css` com duração ou curva literal; os existentes
  (`banner-in`, `update-in`, `sheet-up`, `shake`, `previa-elevar`, `shimmer`, hover do tile) migram para os tokens sem mudar de aparência
  (exceto o `shake`, de 3 ciclos para 1, e o `shimmer`, ver "Suposições" 4).
- **Pressão:** em `button`, `[role='button']`, pílulas, links de navegação e no `.tile` (o cartão inteiro, por causa do link esticado),
  `:active` aplica `scale: 0.97` (a **propriedade** `scale`, para não brigar com o `transform` da elevação e com o `translate` do
  Tailwind), voltando com `--ease-elastica`. Foco visível intacto; sem _ripple_; desabilitado não reage.
- **Diálogos e folhas:** entrada e **saída** por CSS puro (`@starting-style` + `transition-behavior: allow-discrete` no `dialog.modal`):
  o `<dialog>` fecha **na hora** para o Esc e o foco (nada é atrasado), e o visual acompanha; sem suporte, é instantâneo. O `sheet-up`
  do celular migra para o mesmo mecanismo. O `::backdrop` fica como está (sem animar pseudo-elemento).
- **Troca de tela:** `viewTransition` do React Router (`Link` e `navigate`) nas navegações catálogo ⇄ detalhe, **só** com movimento
  completo; o botão Voltar e o foco continuam como hoje (`GameDetailPage` usa `location.key`).
- **Hooks:** `useAbaVisivel` (atributo no `<html>`), `useAtraso(ativo, ms)` (verdadeiro só depois de `ms` contínuos ativo), e
  `useMovimentoReduzido()` (une `matchMedia` e a preferência do `/perfil`, para o que decide em JS: `viewTransition` e `scrollIntoView`).

### F3 — Carregamento

- **Esqueletos** no lugar de spinners soltos, sem mudança de layout quando o conteúdo chega (mesmas alturas): prateleiras
  (`ListLoading`, com a forma de 3 tiles), detalhe (`DetailLoading`, já existe), `/perfil` (cabeçalho e contas) e a biblioteca da Steam
  (`BibliotecaSteamDialog`); os cartões da Steam (`ContaSteamCard`, `BlocoSteam`) já têm esqueleto e entram no mesmo sistema.
- **`LoadingScreen`:** `Chek` feliz parado na hora; com `useAtraso(…, 300)`, a bandeira balança em laço lento (rotação pequena, ≤ 8°, em
  torno do pé do mastro). Carregamento de menos de 300 ms **nunca** anima. Mantém `role="status"` e `aria-label="Carregando"`.
- **Botões pendentes** ("Salvando…", "Entrando…", "Criando…", "Atualizando…", "Saindo…"): um indicador de 16 px dentro do botão à
  esquerda do texto, **largura preservada** (o botão reserva o maior dos dois textos: `min-w` calculado ou o indicador ocupa o espaço do
  ícone, sem "pular"), `disabled` como hoje, `aria-busy="true"`.
- **"Atualizar" da Steam** (`ContaSteamCard`, `BlocoSteam`): o ícone gira **só enquanto** `atualizar.isPending`.

### F4 — Erro, vazio e sucesso

- **Campo com erro:** o tremor de 1 ciclo (`shake`), o texto do erro em região `aria-live` (já há `role="alert"` em `form-parts.tsx`;
  confere), borda `erro` e ícone; **nunca depende do movimento** (em reduzido, só borda e texto).
- **Estados com o Chek** (tabela de expressões), sempre com o **texto que já existe** ao lado (o Chek é `aria-hidden`): `ListEmpty`
  (catálogo vazio: `dormindo`; filtro sem resultado: `dormindo`), prateleira sem jogos (`dormindo`, pequeno), `ListError`/sem
  conexão (`confuso`, **Tentar de novo**), `ErrorBoundary` (`confuso`; mantém o erro real, "Tentar de novo" e "Ir para o catálogo"; o
  `Chek` é SVG inline, sem depender de fonte nem de rede, porque o boundary roda quando algo já quebrou), **404** (`NaoEncontradaPage`,
  rota `path: '*'` dentro do `AppLayout`, `confuso`, link para `/`), perfil Steam privado em `ContaSteamCard` (`cadeado`, mantém o passo
  a passo e **Tentar de novo**). **Nenhuma animação de erro em laço nem que assuste.**
- **`ConnectionBanner`:** entrada e saída suaves (a de entrada já existe: `banner-in`; ganha a **saída** de `--mov-padrao`).
- **`Aviso` global** (Q5): uma pilha única no `#overlay-root`, `role="status"` + `aria-live="polite"` que **existe sempre**, vazia
  quando não há aviso (como `ConnectionBanner`); um aviso de cada vez por mensagem, **≥ 4 s** na tela (mais se o texto for longo: 1 s
  a cada 20 caracteres acima de 60), fecha sozinho, com **Fechar** e pausa no hover e no foco. **Onde aparece:** no celular, **acima da
  `BottomNav`** (`bottom: calc(68px + env(safe-area-inset-bottom) + 12px)`), de 16 px a 16 px das laterais; no desktop, centralizado
  embaixo. Acima do `UpdatePrompt` e do `InstallNudge` quando coexistem (a pilha os empurra), sem cobri-los. **Onde é usado:** salvar e
  editar jogo, remover jogo, vincular, atualizar e desvincular Steam, salvar nome, trocar senha e sair. O que já tem aviso próprio
  (retorno da Steam em `/perfil?steam=…`) passa a usá-lo **sem perder o `role="alert"` do erro**: erro **continua** em `role="alert"`
  no lugar (não vira toast).
- **Check de sucesso:** um "pop" do ícone de check (`transform` + `opacity`, `--mov-enfase`) no aviso; o traço "desenhado"
  (`stroke-dashoffset`) **não entra**, para manter a regra 1 sem exceção.

### F5 — Criar e remover jogo; marcos

- **Criar:** ao salvar, o formulário fecha **na hora**; o tile novo entra na prateleira certa, **assenta** (`translateY(8px) scale(0.96)`
  → normal, `--mov-enfase`, `--ease-elastica`) e recebe um **realce** de 2 s (anel `destaque` que some por `opacity`); o contador da
  prateleira e o da pílula do filtro trocam com um _crossfade_ curto. Se o tile estiver fora da vista, `scrollIntoView({ block:
  'center', behavior })` (com `behavior: 'auto'` em movimento reduzido), **sem mover o foco**. Se o **filtro ativo esconde** a
  prateleira do jogo novo, não há tile para animar: o aviso diz "Adicionado em <status>" com o botão **Ver**, que troca o filtro.
- **Remover:** o tile sai (`opacity` e `scale` até 0.96, `--mov-padrao`) e os vizinhos **fecham o espaço** por FLIP (`transform`
  medido antes e depois, num hook `useFlip`); **plano B**, se o FLIP não ficar estável na grade: só a saída do tile. A lista já está
  atualizada por dentro (a animação é uma cópia visual de ≤ 200 ms do tile removido).
- **Marcos com o Chek `comemorando`**, uma vez, dentro do `Aviso` (Chek de 40 px + texto), sem tela cheia e **sem confete** (Q7):
  1. **Primeiro jogo criado:** o salvar que cria o jogo quando a lista estava vazia.
  2. **Marcado como Zerado:** o salvar que muda o status de um jogo para Zerado (não ao carregar a lista com um Zerado).
  3. **100% das conquistas:** o detalhe de um jogo Steam cujo total desbloqueado **passa** a igualar o total depois de um **Atualizar**
     ou de recarregar o detalhe na sessão (nunca ao abrir um jogo que já estava em 100%).
  Duas comemorações não se acumulam: a segunda entra na fila do `Aviso`.

## Requisitos de saída

**Tokens novos no `@theme`** (só o que falta; o resto reusa `fundo`, `texto`, `ouro`, `acento`):

| Token                   | Valor     | Uso no Chek                           |
| ----------------------- | --------- | ------------------------------------- |
| `--color-chek-corpo-1`  | `#8fbaff` | início do degradê do corpo            |
| `--color-chek-corpo-2`  | `#3f79f0` | fim do degradê do corpo               |
| `--color-chek-base`     | `#2a4fa3` | a base com os pinos                   |
| `--color-chek-mastro`   | `#dfe8ff` | o mastro da bandeira                  |
| `--color-ouro-1`        | `#ffe08a` | início do degradê dourado             |
| `--color-ouro-2`        | `#ffbf47` | fim do degradê dourado                |

Corpo `#4f8cff` do briefing = `acento`, rosto `#0b0f1a` = `fundo`, olhos e boca `#eef2ff` = `texto`, pinos e bochechas `#ffd166` = `ouro`.

**Telas e estados** (o que `/qa-verify` confere):

| Onde                      | Elemento                                             | Detalhe                                                                          |
| ------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| Topo, catálogo e `TopNav` | link para `/` com o Chek + nome                      | Chek 36 (< 768) / 44 px (≥ 768), `aria-hidden`; link `min-h-11`; `aria-current`  |
| `/login`, `/registro`     | Chek 96 px acima do cartão                           | `aria-hidden`; o `h1` e os campos não mudam                                      |
| `LoadingScreen`           | Chek + `role="status"` "Carregando"                  | bandeira balança só após 300 ms                                                  |
| `ListEmpty` (2 variantes) | Chek `dormindo` + título + texto                     | os textos de hoje não mudam                                                      |
| `ListError`               | Chek `confuso` + título + texto + **Tentar de novo** | `role="alert"` mantido                                                           |
| `ErrorBoundary`           | Chek `confuso` + título + erro real + 2 ações        | `role="alert"`, `data-state="render-error"` mantidos                             |
| `*` (404)                 | Chek `confuso`, "Página não encontrada", link `/`    | dentro do `AppLayout`; **sem** revelar se a rota existe para outra conta         |
| `ContaSteamCard` privado  | Chek `cadeado` + passo a passo + **Tentar de novo**  | o texto existente não muda                                                       |
| `Aviso`                   | `role="status"`, ícone, texto, **Fechar**            | ≥ 4 s; acima da `BottomNav` no celular                                          |
| `index.html`              | 8 tags (lista na F1)                                 | `og:image` absoluta, 1200 × 630                                                  |

Sem rota, DTO, response ou código de erro novos (n/a).

## Modelo de dados

n/a. Nada em `schema.prisma`, nenhuma migration. Nenhuma chave nova de armazenamento local.

## Contrato compartilhado

n/a. **Nenhuma mudança** (o `APP_NAME` já é "Checkpoint", commitado em `feat/ajustes-catalogo`). Se mudar um dia, `ambiente.test.tsx` e o build do
`shared` acompanham (`RULES.md` §2: rebuild do shared antes de assumir o valor novo nos apps).

## Critérios de aceite (testáveis, em BDD)

Legenda: **[T]** por teste automatizado; **[N]** só no navegador (360 e 1280 px, API mockada com `docs/verificacao-navegador`, sem tocar no
Supabase nem nas portas 3333 e 5173).

### F1 — Marca

- [ ] **CA-01** [T] — **Dado** o componente `Chek`, **quando** renderizo cada uma das 5 expressões, **então** o SVG tem `aria-hidden="true"`,
      nenhum atributo `fill`/`stroke`/`stop-color` contém hex literal (só `var(--color-…)`) e duas instâncias na mesma página não repetem `id`.
- [ ] **CA-02** [T] — **Dado** o `Chek` com `titulo="Chek feliz"`, **então** ele tem `role="img"` e esse nome acessível, e sem `titulo` não é anunciado.
- [ ] **CA-03** [T] — **Dado** `styles/tokens.test.ts`, **então** ele **não foi enfraquecido** (mesma varredura de hex fora do `@theme`, sobre todo o
      `src`), os 6 tokens novos existem no `@theme` com os hex da tabela e o texto do Chek continua passando os contrastes da spec.
- [ ] **CA-04** [N] — **Dado** o mock `docs/design/marca/expressoes.html` aberto no navegador, **então** as 5 expressões aparecem em 24, 44 e 96 px sobre
      `fundo` e `painel`, e as diferenças estão só no rosto; **a F1 não aplica nas telas antes do seu "ok" nesse desenho**.
- [ ] **CA-05** [T] — **Dado** o catálogo (`/`) e o `TopNav` (`/perfil`), **quando** renderizo, **então** o logo é um `link` para `/` com o Chek, o
      nome do app, `min-h-11` e, no catálogo, `aria-current="page"`.
- [ ] **CA-06** [N] — **Dado** 360 e 1280 px, **então** o Chek do topo mede 36 e 44 px de altura, o alvo de toque do logo tem ≥ 44 px e nada corta ou
      sobrepõe as pílulas de filtro.
- [ ] **CA-07** [T] — **Dado** `/login` e `/registro`, **quando** renderizo, **então** há um Chek acima do cartão e o `h1`, os campos e o botão mantêm
      papéis e nomes acessíveis de hoje.
- [ ] **CA-08** [T] — **Dado** o `index.html`, **então** ele tem `meta name="description"`, `og:title`, `og:description`, `og:image` (URL absoluta
      `${SITE_URL}/og-image-1200x630.png`; o domínio aparece **só** em `site.config.ts`), `og:type`, `twitter:card` = `summary_large_image`, `link rel="icon"` para `/favicon.ico` e
      `apple-mobile-web-app-title` = "Checkpoint".
- [ ] **CA-09** [T] — **Dado** `apps/web/public`, **então** existem `favicon.ico` e `og-image-1200x630.png`, este último **fora do precache**
      (`globIgnores` no `pwaOptions`, conferido em `pwa.config.test.ts`).
- [ ] **CA-10** [T] — **Dado** o manifest, **então** `name`, `short_name`, `theme_color`, `background_color`, ícones e `shortcuts` seguem passando
      `pwa.config.test.ts` (atualizado só para a grafia da Q1).
- [ ] **CA-11** [T] — **Dado** `docs/design/marca/`, **então** os SVGs mestres e o `LEIAME.md` estão lá **byte a byte iguais** aos de origem e
      `docs/design` continua no `.prettierignore`.
- [ ] **CA-12** [T] — **Dado** o grafo do repositório, **então** `apps/web/package.json` não ganhou dependência de runtime nem de dev.

### F2 — Movimento

- [ ] **CA-13** [T] — **Dado** `styles/index.css`, **então** existem `--mov-rapida` (120 ms), `--mov-padrao` (200 ms), `--mov-enfase` (320 ms),
      `--mov-max` (600 ms), `--ease-entrada`, `--ease-saida` e `--ease-elastica`, e **nenhum** `animation` ou `transition` fora deles usa
      duração literal (`motion.test.ts` varre o CSS).
- [ ] **CA-14** [T] — **Dado** cada `@keyframes` do `index.css`, **então** só anima `transform`, `opacity` e as propriedades individuais `scale`/
      `translate`/`rotate`; nenhum anima `width`, `height`, `top`, `left`, `box-shadow` nem `background-position` (o `shimmer` de hoje sai;
      "Suposições" 4).
- [ ] **CA-15** [T] — **Dado** toda duração do `index.css`, **então** nenhuma passa de `--mov-max` (as de laço, do esqueleto e do Chek, são
      declaradas à parte e listadas no teste como laços de espera).
- [ ] **CA-16** [T] — **Dado** `keyframes.test.ts`, **então** continua passando (nomes sem colidir com `pulse`/`spin`/`ping`/`bounce`, toda
      animação com um `@keyframes` que existe).
- [ ] **CA-17** [T] — **Dado** o modo reduzido (variante `movimento-reduzido`), **então** a regra que zera `animation` e `transition` continua **uma
      só**, e cada linha da tabela "Animação → equivalente" tem o estado estático aplicado (teste por animação: a classe existe e a regra
      reduzida a anula).
- [ ] **CA-18** [T] — **Dado** o app com o `<html data-efeitos="reduzidos">`, **quando** a pessoa aperta um botão, **então** não há `scale`; e sem
      o atributo, `:active` aplica `scale: 0.97` (a regra CSS existe no `index.css` com `--mov-rapida`).
- [ ] **CA-19** [N] — **Dado** um botão, uma pílula, um item de navegação e um tile no celular, **quando** eu seguro o toque, **então** encolhem de leve
      e voltam ao soltar, com o foco visível intacto e sem atraso na ação.
- [ ] **CA-20** [T] — **Dado** um diálogo aberto, **quando** aperto Esc ou clico em Cancelar, **então** o `<dialog>` deixa de estar aberto **no mesmo
      tick** e o foco volta ao botão que o abriu (a saída suave é só CSS).
- [ ] **CA-21** [N] — **Dado** o formulário "Novo jogo" no celular e no desktop, **então** a folha e o cartão entram e saem suavemente e, sem suporte a
      `@starting-style`, abrem e fecham de uma vez sem quebrar nada.
- [ ] **CA-22** [T] — **Dado** navegar do catálogo ao detalhe e voltar, **quando** o movimento é completo, **então** o `Link` leva `viewTransition`; em
      movimento reduzido não leva; o botão Voltar e a regra de `location.key` seguem como hoje.
- [ ] **CA-23** [T] — **Dado** `useAtraso(true, 300)`, **então** devolve `false` até 300 ms contínuos ativo e `true` depois; com `ativo` `false` a qualquer
      momento, volta a `false` (timers falsos).
- [ ] **CA-24** [T] — **Dado** a aba oculta, **então** `<html>` ganha `data-aba-oculta` e os laços de espera ficam com `animation-play-state: paused`.

### F3 — Carregamento

- [ ] **CA-25** [T] — **Dado** `LoadingScreen`, **quando** renderiza, **então** mostra o Chek parado e `role="status"` "Carregando"; **depois de 300 ms**
      a bandeira ganha a classe de balanço; **antes**, não.
- [ ] **CA-26** [T] — **Dado** que o boot resolve em menos de 300 ms, **então** a classe de balanço nunca é aplicada.
- [ ] **CA-27** [N] — **Dado** "Animações: Reduzidas" ou `prefers-reduced-motion`, **então** o Chek do carregamento e os esqueletos ficam parados.
- [ ] **CA-28** [T] — **Dado** o catálogo carregando, **então** `ListLoading` mostra o esqueleto com a forma de tiles (`role="status"`,
      `aria-busy`), e o detalhe, o `/perfil` e a biblioteca da Steam mostram o seu, sem spinner solto.
- [ ] **CA-29** [N] — **Dado** o conteúdo chegando, **então** a altura da página muda no máximo 1 px na troca do esqueleto pelo conteúdo (medida por
      `getBoundingClientRect` em `/`, `/jogos/:id` e `/perfil`).
- [ ] **CA-30** [T] — **Dado** um botão pendente ("Salvando…", "Entrando…", "Criando…", "Atualizando…", "Saindo…"), **então** mostra o indicador,
      `aria-busy="true"`, `disabled`, e a **largura é a mesma** nos dois estados (`min-w` ou espaço reservado; no navegador, `getBoundingClientRect().width` igual).
- [ ] **CA-31** [T] — **Dado** "Atualizar" da Steam, **quando** a requisição está em andamento, **então** o ícone tem a classe de giro; quando resolve
      (com sucesso ou erro), a classe sai.
- [ ] **CA-32** [N] — **Dado** o app carregando em rede lenta emulada, **então** a bandeira do Chek balança só depois de ≈ 300 ms, num laço lento sem
      salto, e para quando a tela aparece.

### F4 — Erro, vazio e sucesso

- [ ] **CA-33** [T] — **Dado** um campo com erro, **quando** o erro aparece, **então** há `aria-invalid`, o texto em região `role="alert"`, a borda
      `erro`, e o tremor é **1 ciclo** de ≤ 240 ms (`shake-error` com `--mov-padrao`, `animation-iteration-count: 1`).
- [ ] **CA-34** [T] — **Dado** o catálogo vazio, **então** `ListEmpty` mostra o Chek `dormindo` e os **mesmos** textos ("Nenhum jogo cadastrado"…);
      com filtro sem resultado, o Chek `dormindo` e "Nenhum jogo neste status".
- [ ] **CA-35** [T] — **Dado** a lista com erro, **então** `ListError` mostra o Chek `confuso`, mantém `role="alert"` e **Tentar de novo**, que chama
      `refetch` uma vez.
- [ ] **CA-36** [T] — **Dado** uma tela que lança no render, **então** o `ErrorBoundary` mostra o Chek `confuso`, o erro real, **Tentar de novo** e
      **Ir para o catálogo**, e continua com `role="alert"` (o `ErrorBoundary.test.tsx` atual passa sem mudança de nomes).
- [ ] **CA-37** [T] — **Dado** uma URL sem rota (ex.: `/qualquer-coisa`), **quando** abro, **então** aparece "Página não encontrada" com o Chek
      `confuso` e um link para `/`; `/login` e `/registro` continuam como rotas próprias, e a `RequireAuth` decide login **antes** do 404
      para quem não tem sessão (sem revelar rotas).
- [ ] **CA-38** [T] — **Dado** o cartão Steam em perfil privado, **então** mostra o Chek `cadeado` e mantém o passo a passo e **Tentar de novo**.
- [ ] **CA-39** [T] — **Dado** cada estado com o Chek, **então** o texto que explica o estado existe **sem o Chek** (o teste remove os `svg` e as mesmas
      consultas por papel e nome continuam achando tudo).
- [ ] **CA-40** [T] — **Dado** o `ConnectionBanner`, **quando** a conexão cai e volta, **então** o banner entra e **sai** com animação (classe de saída
      aplicada), o contêiner `role="status"` existe o tempo todo e "Conexão restabelecida" continua 3 s.
- [ ] **CA-41** [T] — **Dado** o `Aviso`, **quando** disparo um sucesso, **então** o contêiner `role="status"` (que já existia vazio) recebe o texto, o
      aviso fica ≥ 4 s, fecha sozinho, tem **Fechar** e não rouba o foco (`document.activeElement` não muda).
- [ ] **CA-42** [T] — **Dado** um aviso com texto de mais de 60 caracteres, **então** o tempo na tela é maior que 4 s (1 s por 20 caracteres acima de 60).
- [ ] **CA-43** [T] — **Dado** o hover ou o foco sobre o aviso, **então** o tempo pausa e recomeça ao sair.
- [ ] **CA-44** [N] — **Dado** o celular em 360 px, **quando** aparece um aviso, **então** ele fica **acima** da `BottomNav` (sem cobrir os itens) e,
      com o `UpdatePrompt` ou o `InstallNudge` visíveis, não os cobre.
- [ ] **CA-45** [T] — **Dado** salvar e editar jogo, remover, vincular, atualizar, desvincular, salvar nome, trocar senha e sair, **quando** o pedido
      dá certo, **então** aparece o aviso com o texto próprio de cada ação; **quando** falha, o erro **continua** no lugar em `role="alert"`
      (nenhum erro vira aviso).
- [ ] **CA-46** [T] — **Dado** o modo reduzido, **então** o aviso aparece e some de uma vez, **com o mesmo tempo na tela**.
- [ ] **CA-47** [N] — **Dado** todos os estados com o Chek em 360 e 1280 px, **então** o Chek e o texto não se sobrepõem, nada é cortado e o contraste do
      texto continua ≥ 4,5:1.

### F5 — Criar, remover, marcos

- [ ] **CA-48** [T] — **Dado** o formulário de novo jogo, **quando** salvo com sucesso, **então** o diálogo fecha **na hora** (sem esperar animação) e o
      tile novo aparece na prateleira do status, com `data-novo="true"` por 2 s.
- [ ] **CA-49** [T] — **Dado** a criação, **então** o contador da prateleira e o da pílula mostram o número novo **de imediato** (a troca suave é só visual).
- [ ] **CA-50** [N] — **Dado** um jogo criado numa prateleira fora da tela, **então** a página rola até ela sem salto, o foco **não** muda e o realce
      aparece por ≈ 2 s.
- [ ] **CA-51** [T] — **Dado** o filtro "Zerado" ativo e um jogo criado como Jogando, **quando** salvo, **então** o aviso diz que foi adicionado em
      Jogando com o botão **Ver**, que troca o filtro para Jogando (`?status=JOGANDO`).
- [ ] **CA-52** [T] — **Dado** um jogo removido, **quando** confirmo, **então** o item some da lista e da contagem **no mesmo instante**, a cópia
      visual de saída dura ≤ 200 ms e some sozinha, e nenhum outro clique é atrasado.
- [ ] **CA-53** [N] — **Dado** a remoção de um tile no meio de uma prateleira em 1280 px, **então** os vizinhos deslizam para fechar o espaço sem
      pular; se o FLIP não ficou estável, o critério vale **só para a saída do tile** (plano B registrado na evidência).
- [ ] **CA-54** [T] — **Dado** o primeiro jogo criado numa lista vazia, **então** aparece **uma** comemoração com o Chek `comemorando`; criar o
      segundo jogo **não** dispara outra.
- [ ] **CA-55** [T] — **Dado** um jogo que passa a Zerado no salvar, **então** aparece a comemoração; carregar a lista com jogos já Zerados **não**
      dispara nenhuma.
- [ ] **CA-56** [T] — **Dado** o detalhe de um jogo Steam que **passa** a ter 100% das conquistas depois de **Atualizar**, **então** aparece a comemoração;
      abrir um jogo que já estava em 100% **não** a dispara.
- [ ] **CA-57** [T] — **Dado** duas comemorações seguidas, **então** a segunda espera a primeira sair do `Aviso` (fila), sem empilhar nem cobrir a tela.
- [ ] **CA-58** [T] — **Dado** o modo reduzido, **então** o tile novo tem **anel estático** por 2 s, a remoção é instantânea e a comemoração mostra o
      Chek `comemorando` sem movimento.
- [ ] **CA-59** [N] — **Dado** cada momento das fases F2 a F5 em captura de quadros (3 quadros por animação), **então** o movimento é suave, sem
      salto de layout e sem nada acima de `--mov-max`, e no modo reduzido não há movimento algum.

### Transversais (todas as fases)

- [ ] **CA-60** [T] — **Dado** cada fase, **quando** rodo `npm run typecheck`, `npm run lint`, `npm test` e `npm run build`, **então** passam, e
      `ARCHITECTURE.md` descreve o que a fase mudou (§5.1, §5.5, §5.6 e §5.12; o `Chek` e o `Aviso` em §5.4).
- [ ] **CA-61** [T] — **Dado** os testes existentes, **então** continuam passando com os **mesmos papéis e nomes acessíveis**; nenhum é apagado sem
      substituto (só os que citam a grafia do nome mudam, conforme a Q1).
- [ ] **CA-62** [T] — **Dado** o `<meta name="viewport">`, **então** continua sem `maximum-scale`/`user-scalable`, e o ponto de quebra único segue 768 px.
- [ ] **CA-63** [T] — **Dado** o build, **então** o `og-image` não está no precache do Workbox e o tamanho do precache não cresce mais que o do
      `Chek` (SVG inline pequeno) e do `favicon.ico`.
- [ ] **CA-64** [N] — **Dado** o app em 200% de zoom e com o movimento reduzido, **então** nada do Chek nem dos avisos sobrepõe ou corta texto.
- [ ] **CA-65** [T] — **Dado** nenhuma mudança em `apps/api`, `prisma/`, DTO ou migration, **então** `git diff --stat` da branch não toca esses caminhos
      (nem `packages/shared`, salvo `APP_NAME`).

## Plano de testes

- **Unitário (Vitest + Testing Library; o jsdom não anima):** testa **classes, atributos e ordem**, não o movimento.
  - `shared/components/Chek/Chek.test.tsx` (CA-01, CA-02: expressões, `aria-hidden`, `id` único, sem hex).
  - `styles/tokens.test.ts` (**acréscimos, sem enfraquecer**: CA-03, tokens novos e contraste) e `styles/motion.test.ts` (novo: CA-13 a CA-15,
    CA-17: tokens, só `transform`/`opacity` nos `@keyframes`, teto de duração, equivalente reduzido por animação). `keyframes.test.ts` segue (CA-16).
  - `shared/hooks/use-atraso.test.ts`, `use-aba-visivel.test.ts` e `use-movimento-reduzido.test.ts` (CA-22, CA-23, CA-24; timers falsos).
  - `app/layout/LoadingScreen.test.tsx` (CA-25, CA-26), `AuthCard`/`LoginForm`/`RegistroForm` (CA-07), `TopNav`/`GamesPage` (CA-05), `ListStates`,
    `ErrorBoundary`, `NaoEncontradaPage` e `routes.test.tsx` (CA-34 a CA-37, CA-39), `ContaSteamCard.test.tsx` (CA-31, CA-38),
    `ConnectionBanner.test.tsx` (CA-40), `Aviso.test.tsx` (CA-41 a CA-43, CA-45, CA-46), `GamesPage.test.tsx` (CA-48 a CA-52, CA-54 a CA-58),
    `BlocoSteam.test.tsx` (CA-56), `ModalDialog.test.tsx` (CA-20), `pwa.config.test.ts` (CA-09, CA-10).
  - `index.html`: teste que lê o arquivo e confere as 8 tags (CA-08), no padrão do `tokens.test.ts` que já lê o `index.html`.
- **Manual (`/qa-verify`; `docs/verificacao-navegador` com API mockada; 360 e 1280 px; sem Supabase e sem as portas 3333 e 5173):** CA-04, CA-06,
  CA-19, CA-21, CA-27, CA-29, CA-32, CA-44, CA-47, CA-50, CA-53, CA-59 e CA-64. Captura de quadros (3 por animação) para o movimento;
  emulação de `prefers-reduced-motion` e o atributo `data-efeitos="reduzidos"` para o caminho reduzido; rede lenta emulada para o CA-32.
  Aparelho real (iOS e Android): fica "pendente: aparelho real", como nas specs anteriores.

Loop por tarefa: `npm run typecheck -w @checkpoint/web` → `npm test -w @checkpoint/web` → `npm run lint` → `npm run build` → commit.
**Cada fase termina com o gate completo** (typecheck, lint, `npm test`, build) **e a conferência visual**, e é implantável sozinha.

## Fases (proposta final)

| Fase | Conteúdo                                                                                                                       | Depende de |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| F1   | `Chek` (5 expressões) + **mock aprovado por você**, logo do topo, `/login` e `/registro`, `index.html` (og, favicon), manifest | aviso do og-image |
| F2   | tokens de movimento, migração do CSS existente, pressão, diálogos, troca de tela, hooks, `motion.test.ts`                        | —          |
| F3   | esqueletos, `LoadingScreen` com o Chek, botões pendentes, ícone de "Atualizar"                                                 | F1, F2     |
| F4   | `Aviso`, campo com erro, `ConnectionBanner`, estados vazios e de erro com o Chek, 404                                          | F1, F2     |
| F5   | criar e remover jogo, contadores, marcos com o Chek, conferência final                                                        | F2, F4     |

Cada fase é um commit (ou mais) numa cadeia de branches, como fez a `troca-de-design-estante` (`feat/personalizacao-chek-f1` … `-f5`, a
partir de `feat/logo-chek`).

## Fora de escopo

- **Confete** (Q7) e qualquer efeito que cubra a tela; **som e vibração** no celular (Q8).
- **Balão de fala** com frases do Chek (Q2) e a expressão `triste` (Q1): ficam para depois.
- **Tema claro**; o Chek `fundo-claro` e as versões `uma-cor` só são versionadas em `docs/design/marca/`, não usadas no app.
- **Ícones dos atalhos** do manifest (96 px) e **ícones do iOS** além dos já trocados no commit `1e3904c`.
- **Lottie, GSAP, framer-motion** e qualquer biblioteca de animação (`RULES.md` §9): pedem aprovação própria.
- **Animar troca de rota com carregamento** (as rotas não são `lazy`, então não há tela de espera entre rotas; só o boot da sessão espera).
- **Comemoração persistida** (lembrar "já comemorei o primeiro jogo" entre sessões): exigiria uma chave nova de storage.
- Mudança de comportamento do catálogo (ordem, filtros, regras de status, notas, Steam), da API ou do banco.
- **Passos de processo** (não são critérios): atualizar `ARCHITECTURE.md` e o `INDEX.md`, rodar o `/qa-verify`, o deploy.

## Notas de ambiente

- **Nenhuma variável de ambiente nova.** O domínio de produção é a constante `SITE_URL` (`apps/web/site.config.ts`), num único lugar.
- **Nenhuma dependência nova** (`RULES.md` §9); **nenhuma migration** (`RULES.md` §3).
- Ao aplicar, o `vite.config` do Workbox ganha `globIgnores: ['og-image-*.png']` (não é dependência).
- `docs/design/marca/` já está coberto pelo `.prettierignore` (`docs/design`); o mock `expressoes.html` também.
- `ARCHITECTURE.md` (§5.1 rota `*`, §5.4 `Chek` e `Aviso`, §5.5 estados, §5.6 logo e sistema de movimento, §5.12 variante e tokens de movimento)
  e `docs/specs/INDEX.md` mudam junto de cada fase. `README.md` só se citar o nome.
- Testes de `GamesPage`, `LoadingScreen`, `AuthCard` e afins citam "checkpoint"/"Checkpoint" no nome acessível: ajustam-se à grafia da Q1.

## Suposições

Tudo que a spec assumiu sem perguntar (corrija o que discordar):

1. **Uma spec só**, em 5 fases (dividir é barato, ver "Uma spec ou duas?").
2. **O Chek é SVG inline em React com tokens**, não `<img>` de `public/` (precisa animar partes e trocar o rosto).
3. **Cinco expressões** na 1ª entrega (`feliz`, `dormindo`, `confuso`, `comemorando`, `cadeado`); erro e sem conexão usam a `confuso`.
4. **O brilho do esqueleto deixa de ser um `linear-gradient` deslizante** (`background-position` não é `transform`/`opacity`) e vira **um pulso
   de `opacity`** entre `painel-2` e `esqueleto` (1,4 s, laço). Sai o `shimmer`. Visualmente é menos "brilho" e mais "respiro".
5. **Transições de uma vez** (hover, foco) podem mudar cor e `box-shadow`; **laços e `@keyframes`** só `transform` e `opacity`.
6. **Diálogos** animam por `@starting-style` + `allow-discrete` (Chromium 117+, Safari 17.4+, Firefox 129+); antes disso, instantâneo.
7. **O Chek não segue a cor de destaque** do `/perfil` (fica azul); o `Aviso` e o anel de realce **seguem** o `destaque`.
8. **Sem balão de fala** na 1ª entrega: o texto que já existe basta (tom atual, direto e curto).
9. **Marcos sem persistência:** "primeiro jogo" = criar com a lista vazia; "Zerado" = o salvar que muda o status; "100%" = passar de menos a 100%
   nesta sessão. Repetem se a pessoa apagar tudo e recomeçar. É o preço de não criar chave nova de storage.
10. **O `Aviso` é um toast global**, um de cada vez; erro **não** vira aviso.
11. **Um 404 novo** (`NaoEncontradaPage`) é necessário e cabe nesta spec (hoje o React Router mostra a página padrão dele).
12. **Sem chave de armazenamento local nova.**
13. **O `og-image` sai do precache** (355 KB que só robôs pedem).
14. **Troca de tela por View Transitions com o _cross-fade_ padrão do navegador**, sem CSS nosso, desligada em movimento reduzido.
15. **Sem confete** (Q7) e **sem som nem vibração** (Q8).

## O que ficou diferente do escrito (implementação)

- **"Saindo…" do Sair** (`/perfil`): a linha continua com o texto; sem o indicador (a linha não é um botão com rótulo trocável). O texto já diz o estado.
- **Voltar por histórico** (`navigate(-1)`) não leva `viewTransition` (a API do React Router não aceita opções nessa chamada); os links do catálogo ao detalhe levam.
- **100% das conquistas** comemora depois de **Atualizar** (o caminho que a spec descreve de forma mais clara); recarregar o detalhe sozinho não compara com o valor anterior.
- **Trocar senha e o retorno da Steam** mantêm o aviso que já tinham (na `/perfil`, em `role="status"`); não passam pelo `Avisos`.
- **"Prateleira sem jogos"**: a prateleira vazia nunca é desenhada (some), então o Chek dormindo só aparece no catálogo vazio e no filtro sem resultado.
- **Banner de conexão**: ganhou a saída suave, mas sem o Chek (é uma faixa compacta); o Chek confuso vive no erro da lista e no `ErrorBoundary`.
- **Esqueleto do /perfil**: o cabeçalho usa a sessão (já carregada) e o cartão Steam já tinha esqueleto; não há esqueleto novo no perfil.

## Decisões tomadas e questões resolvidas

Respondidas pelo humano em 2026-09-26 (nenhuma questão em aberto):

- **Q1 (grafia):** **"Checkpoint" com C maiúsculo** em todo lugar; o código fica como está. O humano regenera o logo horizontal e o `og-image`
  com essa grafia e avisa quando estiverem em `logo-checkpoint`; usar os arquivos novos só depois do aviso.
- **Q2:** sem balão de fala na 1ª entrega. **Q3:** no cabeçalho em ≥ 768 px, o Chek vai junto do nome.
- **Q4:** as 5 fases entram, na ordem, cada uma implantável. **A F1 para no mock das expressões até o "ok" do desenho**; F2 a F5 seguem sem
  parar entre si, só com o gate e a conferência visual de cada fase.
- **Q5:** toast global (`Aviso`), acima da `BottomNav` no celular, `role="status"`.
- **Q6:** comemoração nos três marcos, "uma vez cada". **Interpretação adotada:** uma vez **por ocorrência** (primeiro jogo criado com a lista
  vazia; cada jogo que passa a Zerado; cada jogo que chega a 100%), **sem persistência** (suposição 9). Se a intenção era "uma vez na vida
  da conta", a F5 precisa de uma chave nova de armazenamento local e volta a pedir aprovação antes de gravá-la.
- **Q7:** sem confete. **Q8:** som e vibração fora do escopo.
- **Q9:** domínio de produção `https://checkpoint-web-rust.vercel.app`, num único lugar (constante `SITE_URL`, ver F1).
- **Também aprovados:** `og-image` fora do precache do PWA; a página 404; o pulso de opacidade no lugar do `shimmer`; o tremor do campo com
  1 ciclo; o Chek nas trocas de rota só no boot da sessão (as rotas não são `lazy`).
