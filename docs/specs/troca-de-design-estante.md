# Spec: troca de design — "Estante de console"

> Status: rascunho (2026-09-25). Escrita a partir da direção **aprovada** em `docs/design/estante-de-console/`. Só vira
> `aprovada` com um "ok" explícito, depois das respostas às **Questões em aberto**. Nenhum código foi escrito.

## Objetivo

Trocar a identidade visual do checkpoint (hoje "Neon arcade": rosa e ciano, Orbitron e Rajdhani, orbes, _scanlines_,
catálogo em linhas) pela direção **"Estante de console"** (azul, Outfit e Manrope, catálogo em prateleiras de capas em pé),
**sem perder nenhuma funcionalidade existente** (auth, catálogo, avaliação por 5 critérios, capas, perfil, PWA e integração
com a Steam). É uma mudança de **apresentação**: nenhuma rota, DTO, migration ou dependência nova. A única regra de produto
nova é o **destaque "Continue de onde parou"** (seção "Estrutura do catálogo").

## Stack

Padrão da casa (`ARCHITECTURE.md`): Tailwind 4 com tokens no `@theme`, React, TanStack Query. O que muda ou se confirma:

- **Fontes por `<link>` do Google Fonts** no `index.html` (Outfit, Manrope e Material Symbols Rounded), **sem pacote npm**, como
  hoje. Ver a questão 2 (fallback e efeito no PWA offline).
- **Nenhuma dependência nova** (`RULES.md` §9): o "há 12 minutos" do bloco Steam usa `Intl.RelativeTimeFormat` nativo, e os
  anéis de nota usam `conic-gradient` de CSS (ou SVG inline), sem biblioteca de gráfico.
- **Nenhuma mudança** em `apps/api`, `packages/shared` nem `prisma/schema.prisma`. O web só passa a ler o que já vem em
  `GET /api/games` (`atualizadoEm`, `notaMedia`, `dadosPlataforma`).
- Toca o **armazenamento local** (uma migração de `checkpoint:prefs`, questão 1) e o **manifest/`theme-color`** do PWA.

## Referência visual

`docs/design/estante-de-console/` (versionada no primeiro commit desta spec, **sem alterar o conteúdo**: a pasta entra no
`.prettierignore` para o hook de pré-commit não reformatá-la). Quatro telas em HTML com estilos inline: `Main.dc.html`
(catálogo desktop, 1280 px), `CatalogoMobile.dc.html` (celular, 390 px), `Detalhe.dc.html` (detalhe com o bloco Steam) e
`Formulario.dc.html` ("Novo jogo"). Textos, jogos, horas e nomes de conquistas são exemplos. O canvas
`https://claude.ai/artifact/LHq2bxFPkwPhCdbhUYTnNT` **abriu**: tem os mesmos quatro arquivos e o `canvas.json`, com o mesmo
tamanho em bytes que a cópia versionada, sem notas nem pranchas extras. Nada além da pasta é fonte de verdade.

**Onde a spec diverge do desenho, e por quê** (cada divergência está também em "Suposições" ou em "Questões em aberto"):

| No desenho                                      | Na spec                                | Motivo                                                              |
| ----------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| Borda de controle `#3a4468`                     | `#606a8e`                              | o desenho reprova a WCAG 1.4.11: 1,86:1 sobre o painel (mínimo 3:1) |
| Contador da aba inativa `#6b7391`               | `texto-suave`                          | 3,78:1 sobre o painel (mínimo 4,5:1)                                |
| Botões de contorno e tracejado `#2a3452`        | `borda-controle`                       | 1,44:1 sobre o painel                                               |
| Chips do destaque em branco a 12%               | chips escuros (fundo a 72%)            | sobre capas claras o texto cai a 2,29:1                             |
| Trilho do anel da média em branco a 25%         | trilho escuro (fundo a 60%)            | arco sobre trilho: 1,24 a 1,93:1 (mínimo 3:1)                       |
| Botão "Trocar" no cartão "Ligado à Steam"       | "Trocar" **e** "Remover ligação"       | "Remover ligação" existe hoje e não pode se perder                  |
| "12/40 conquistas" no cartão "Ligado à Steam"   | só as horas                            | a biblioteca não traz conquistas por item (só `minutosJogados`)     |
| Ícones das conquistas em Material Symbols       | o ícone real da conquista (`iconeUrl`) | os ícones do desenho são só marcadores                              |
| "Capa enviada · a oficial da Steam é o plano B" | não entra                              | anotação do desenhista, não interface                               |

## Escopo: o que muda e o que não muda

**Muda (apresentação):** tokens de cor, fontes, forma (pílulas e cantos), remoção dos efeitos neon, catálogo (barra superior,
destaque, prateleiras, capa em pé), detalhe do jogo, formulário, barra inferior, e o que herda o tema (lista abaixo).

**Não muda:** rotas (`/`, `/jogos/:id`, `/perfil`, `/perfil/senha`, `/login`, `/registro`, `/status`), contrato da API,
regras de negócio (notas, status, duplicidade, capa, integração Steam), filtro na URL (`?status=`), `?novo=1`, cache e
consultas, textos de erro pelo `code`, ponto de quebra único de **768 px**, alvos de toque ≥ 44 px, zoom livre, foco visível,
`aria-current` na navegação, `prefers-reduced-motion`.

**Sai da interface** (a funcionalidade que ela carregava continua, em outro lugar): os **painéis de contagem grandes**
(as contagens vivem nas pílulas de filtro e nos contadores das prateleiras); a **barra de 10 segmentos** da linha e do
detalhe (vira o anel e a barra contínua do desenho); a **linha do jogo** (`GameRow`, vira o _tile_ da prateleira); o texto
"Última atualização primeiro" (a ordem continua a mesma).

## Fases (proposta; questão 3)

Cada fase é implantável sozinha, fecha com o gate (`typecheck`, `lint`, `npm test`, `build`) e com `ARCHITECTURE.md` no mesmo
commit que muda o comportamento descrito.

| Fase                         | Entrega                                                                                                                                                                                                                                                                                                                     | Não entra                                                                                                   | Estado visível depois do deploy                                                                            | CAs                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **F1** tokens e efeitos      | `@theme` novo (cores, status, borda de controle corrigida), Outfit e Manrope, remoção de orbes, _scanlines_, pulso, ponto piscando e `glow-*`, `theme-color`/manifest, cor de destaque (4 novas) com a migração do storage, "Animações" no lugar de "Efeitos", `tokens.test.ts` atualizado                                  | layout em linhas (a `GameRow` continua, já nas cores novas), formas (cantos ainda como hoje), capa quadrada | o app inteiro com a paleta e as fontes novas, ainda em linhas; nada quebra                                 | CA-01 a CA-12, CA-55 a CA-57, CA-60 |
| **F2** catálogo em estante   | barra superior, filtros em pílulas, destaque, prateleiras, _tiles_ com capa em pé, anel da média, "horas · conquistas", ações no hover e no foco, "Adicionar" ao fim da prateleira, celular (filtros e prateleiras rolam), `BottomNav` redesenhada, capa gerada em pé, densidade compacta, prévias do modal de preferências | detalhe e formulário (ficam nas cores novas, com o layout de hoje; o detalhe já ganha a capa em pé)         | o catálogo novo; detalhe e formulário "no meio do caminho" (consistentes nas cores, com os cantos antigos) | CA-13 a CA-41, CA-58, CA-59         |
| **F3** detalhe e formulários | `/jogos/:id` (anel, barras, bloco Steam, lista de conquistas), formulário "Novo jogo/Editar", diálogos de confirmação                                                                                                                                                                                                       | telas herdadas (perfil, login…)                                                                             | as quatro telas desenhadas prontas                                                                         | CA-40 a CA-54                       |
| **F4** herdado e fechamento  | conferência visual de tudo que herda (lista abaixo), ajuste de formas nas telas herdadas, `/qa-verify` no app rodando, `ARCHITECTURE.md` e status da spec                                                                                                                                                                   | nada novo                                                                                                   | direção completa                                                                                           | CA-61 a CA-70                       |

**Riscos, para quem implementar.** (1) O rename de tokens toca ~39 arquivos (mecânico; o `tsc` e os testes são a rede de
segurança). (2) `hover: translateY` e a sombra do anel são cortados por contêineres com `overflow` (as prateleiras do
celular): dar folga ao contêiner. (3) O `<dialog>` aninhado ("Buscar na Steam" dentro de "Novo jogo") já foi corrigido em
`ModalDialog`; manter o teste. (4) Trocar a fonte muda larguras: conferir títulos de 120 caracteres sem espaço.

## Comportamento esperado

### 1. Tokens de cor

Todos vivem no `@theme` de `src/styles/index.css`, **o único lugar do web com hex** (CA-87 do catálogo continua valendo);
componentes usam só classes de token, e brilhos e sobreposições são `color-mix()` dos tokens (nunca hex nem `rgba` solto).

| Token                | Hex                                                              | Uso                                                                                                     |
| -------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `fundo`              | `#0b0f1a`                                                        | fundo da página; texto sobre o preenchimento de destaque                                                |
| `painel`             | `#121829`                                                        | cartões, diálogos, barra de filtros                                                                     |
| `painel-2`           | `#0f1524`                                                        | contêineres internos, barra inferior, cartões de dados                                                  |
| `painel-3`           | `#1a2135`                                                        | contadores, ícones em quadrado, hover de botão, esqueleto (`acao-hover` e `esqueleto` viram alias dele) |
| `borda`              | `#1e2640`                                                        | só divisória e contorno **decorativo** de painel; nunca de controle                                     |
| `borda-controle`     | `#606a8e`                                                        | contorno de controles (campos, botões de contorno, pílulas do celular, tracejado do "Adicionar")        |
| `texto`              | `#eef2ff`                                                        | texto principal; fundo da pílula de filtro ativa                                                        |
| `texto-suave`        | `#a3abc7`                                                        | texto secundário, aba inativa, contadores, rótulos                                                      |
| `acento`             | `#4f8cff`                                                        | valor padrão do `destaque`                                                                              |
| `destaque`           | `var(--color-acento)`                                            | cor que a pessoa troca no `/perfil` (questão 1)                                                         |
| `status-jogando`     | `#7fb0ff`                                                        | status Jogando                                                                                          |
| `status-quero-jogar` | `var(--color-ouro)` (`#ffd166`)                                  | status Quero jogar                                                                                      |
| `status-zerado`      | `#5ee6a8`                                                        | status Zerado                                                                                           |
| `ouro`               | `#ffd166`                                                        | conquistas, estrela da média, avisos                                                                    |
| `erro`               | `#ff4d6d`                                                        | borda e mensagem de erro; preenchimento do botão de perigo                                              |
| `erro-texto`         | `#ff8fa3`                                                        | texto e ícone de botão de contorno de perigo ("Desvincular", "Excluir")                                 |
| `apagado-2`          | `#6b7391`                                                        | **só** controle desabilitado; nunca cor de texto                                                        |
| `capa-1` a `capa-6`  | `#8ab4f8`, `#f472b6`, `#fb923c`, `#f87171`, `#facc15`, `#a78bfa` | paleta fixa da capa gerada (inalterada; o hash não muda)                                                |

**Tokens que saem:** `magenta`, `ciano`, `vermelho-neon`, `painel-hover`, `apagado` (o último some com a barra de segmentos, na F2).
O antigo `ciano` se divide: o **status Jogando** vira `status-jogando`; o que era acento de interface (filtro ativo, hover, foco,
link) vira `destaque` ou `texto`, conforme o desenho. O antigo `ouro` (Zerado) vira `status-zerado`; o `ouro` novo é a cor das
conquistas. O antigo `magenta` vira `destaque`.

**Cores do desenho que NÃO viram token** (e o que usam no lugar): `#8b93b0` → `texto-suave`; `#6b7391` como texto (reprova) →
`texto-suave`; `#2a3452` → `borda-controle`; `#d3d9ee` (descrição) → `texto`; `#8fd9b8` ("Desbloqueada em") → `status-zerado`;
`#cfe0ff` e `#b6d0ff` (tintas do acento) → `color-mix(in srgb, var(--color-destaque) 40%, var(--color-texto))`;
`rgba(11,15,26,x)` → `color-mix(in srgb, var(--color-fundo) x%, transparent)`; `rgba(79,140,255,x)` → o mesmo com `destaque`.

**Contrastes** (fórmula WCAG 2.x, a mesma do `tokens.test.ts`; calculados em 2026-09-25 com o script da conversa, e os testes
os repetem). Texto exige 4,5:1 (3:1 acima de 24 px, ou 18,66 px em negrito); contorno de controle, anel de foco e gráfico
informativo exigem 3:1 (WCAG 1.4.11).

| Par                                                   | `fundo` | `painel` | `painel-2` | `painel-3` |
| ----------------------------------------------------- | ------- | -------- | ---------- | ---------- |
| `texto` `#eef2ff`                                     | 17,11   | 15,80    | 16,29      | 14,30      |
| `texto-suave` `#a3abc7`                               | 8,39    | 7,75     | 7,99       | 7,01       |
| `acento` `#4f8cff` (texto, ícone, foco)               | 5,95    | 5,49     | 5,66       | 4,97       |
| `status-jogando` `#7fb0ff`                            | 8,71    | 8,04     | 8,29       | 7,28       |
| `status-quero-jogar` / `ouro` `#ffd166`               | 13,27   | 12,26    | 12,63      | 11,09      |
| `status-zerado` `#5ee6a8`                             | 12,17   | 11,24    | 11,59      | 10,18      |
| `erro` `#ff4d6d`                                      | 5,95    | 5,50     | 5,67       | 4,98       |
| `erro-texto` `#ff8fa3`                                | 8,85    | 8,17     | 8,42       | 7,40       |
| `borda-controle` `#606a8e` (3:1)                      | 3,60    | 3,32     | 3,43       | 3,01       |
| `borda-controle` do desenho `#3a4468` (**reprova**)   | 2,01    | 1,86     | 1,91       | —          |
| `#2a3452` do desenho (**reprova**)                    | 1,56    | 1,44     | 1,48       | —          |
| `borda` `#1e2640` (só decorativa)                     | 1,28    | 1,18     | 1,22       | —          |
| `apagado-2` `#6b7391` (desabilitado; **não** é texto) | 4,09    | 3,78     | 3,89       | 3,42       |

Outros pares que a implementação deve respeitar (todos medidos):

| Par                                                                                                        | Contraste                                              | Regra                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| texto `fundo` sobre o preenchimento `acento`                                                               | 5,95                                                   | texto sobre o botão principal é **escuro**; `texto` (branco) daria 2,88 (e `#ffffff`, 3,22) |
| texto `fundo` sobre `destaque` violeta / rosa / laranja                                                    | 7,03 / 7,22 / 8,45                                     | as quatro cores de destaque passam de 4,5:1                                                 |
| `destaque` como texto, ícone e anel de foco sobre `painel`: azul / violeta / rosa / laranja                | 5,49 / 6,49 / 6,67 / 7,81                              | ≥ 4,5:1 (texto) e ≥ 3:1 (foco)                                                              |
| rótulo do destaque: `mix(destaque 40%, texto)` sobre `fundo` (azul / violeta / rosa / laranja)             | 11,48 / 12,31 / 12,08 / 12,83                          | ≥ 4,5:1                                                                                     |
| chip de status: texto da cor do status sobre `status` a 18% sobre `fundo` (jogando / quero jogar / zerado) | 6,36 / 8,83 / 8,24                                     | sobre `painel`: 5,72 / 7,94 / 7,41                                                          |
| iniciais da capa gerada (`fundo` a 78%) sobre cada cor com o brilho de 28% (capa-1 a capa-6)               | 6,99 / 6,23 / 6,75 / 6,12 / 8,06 / 6,21                | ≥ 3:1 (texto grande) e também ≥ 4,5:1                                                       |
| chip da plataforma (`texto` sobre `fundo` a 78%) sobre a capa gerada escurecida                            | 13,90 a 15,09                                          | sobre uma **imagem** qualquer: 8,71 (branca), 13,18 (cinza), 17,48 (preta)                  |
| arco do anel (`texto`) sobre trilho `fundo` a 60% sobre a capa gerada                                      | 5,99 a 8,51                                            | sobre uma imagem branca 4,49, cinza 9,85, preta 17,79 (≥ 3:1)                               |
| título do destaque (`texto`) sobre a cor da capa escurecida a 70% (na largura de 50% do bloco)             | ≥ 8,14 (pior caso, a capa-5 amarela; a capa-1 dá 9,29) | ≥ 3:1; a coluna de texto do destaque **não passa de 50% da largura**                        |
| chip do destaque (fundo a 72%) sobre a cor da capa, escurecimento de 5% a 55%                              | 9,08 a 14,70                                           | ≥ 4,5:1                                                                                     |
| barra do detalhe: `acento` sobre o trilho `borda`                                                          | 4,64                                                   | gráfico ≥ 3:1                                                                               |
| barra de conquistas: `ouro` sobre o trilho `borda`                                                         | 10,35                                                  | gráfico ≥ 3:1                                                                               |

Regras derivadas (são regras, não sugestões):

1. **Texto informativo** usa só `texto`, `texto-suave`, `destaque`, `status-*`, `ouro`, `erro`, `erro-texto`. `apagado-2` e
   `borda` **nunca** são cor de texto.
2. **Contorno de controle e anel de foco** usam `borda-controle` (contorno) e `destaque` (foco). `borda` não é usada em
   controle.
3. **Texto sobre preenchimento** (`destaque`, `erro`) usa `fundo`, no estado normal **e no hover**.
4. **Hover nunca troca para texto claro sobre o acento** (2,88:1): o hover do botão principal muda elevação e sombra, não a cor do texto.
5. **A informação nunca depende só de cor:** o status aparece com ícone e rótulo, e o anel da média com o número.

### 2. Fontes, ícones, forma e movimento

- **Fontes:** `--font-display` = **Outfit** (títulos, números, botões; pesos 600 a 900) e `--font-corpo` = **Manrope**
  (corpo; 500 a 700), ambos com `system-ui, sans-serif` de reserva. Ícones: Material Symbols Rounded, como hoje
  (`aria-hidden` no decorativo, `aria-label` no botão só com ícone). Hoje o número da nota usa a Rajdhani porque o "0" e o "8" da Orbitron ficam
  ambíguos; com a Outfit essa exceção pode sair, **mas a F1 confere** que "0,0", "8,3" e "10,0" seguem legíveis nos anéis de 36 a 40 px.
- **Tamanhos mínimos:** campos ≥ 16 px (regra existente); rótulos e textos de apoio ≥ 12 px; o desenho usa 11 px em alguns
  chips do celular, que passam a 12 px (suposição).
- **Forma:** botões e pílulas totalmente arredondados (`rounded-full`); capas de 12 a 14 px de raio (12 no celular, 14 no
  desktop, 20 no detalhe); cartões de 14 a 22 px; diálogo do formulário 24 px. Sem cantos de 4 px no que foi redesenhado.
- **Movimento:** saem orbes, _scanlines_, pulso do botão, ponto piscando do "Jogando" e todo `glow-*`. **Ficam, e saem com
  `prefers-reduced-motion` ou com "Animações: reduzidas":** a elevação do _tile_ e do botão no hover (`translateY`), a
  transição de cor e sombra de 0,15 a 0,22 s, a subida da folha (`sheet-up`), o brilho do esqueleto e o tremor do campo
  com erro. A **regra de movimento reduzido continua uma só** (variante `movimento-reduzido`, `tokens.test.ts`).
- **Halo do topo:** o desenho tem um degradê radial estático atrás do topo (não anima). Ver a questão 6.

### 3. Estrutura do catálogo (`/`, ≥ 768 px)

Medidas do desenho a 1280 px, com o `safe-x` de 56 px que já existe.

- **Barra superior:** logo (círculo de 44 px na cor do destaque com a bandeira em `fundo`, e o nome **"checkpoint"**, Outfit 800,
  26 px); o grupo **"Filtrar por status"** (`role="group"`, contêiner em pílula `painel` com `borda`, padding 5 px) com quatro
  botões de 44 px de altura, ícone + rótulo + contagem (Todos, Jogando, Quero jogar, Zerado; `aria-pressed`); o ativo tem fundo
  `texto` e texto `fundo`, os inativos, fundo transparente e `texto-suave`; **"Adicionar jogo"** (pílula de 48 px, `destaque`, texto
  `fundo`) e o acesso ao **Perfil** (botão redondo de 48 px, `aria-label="Perfil"`, leva a `/perfil`).
- **Destaque "Continue de onde parou"** (regra nova): o jogo com status **Jogando** de **maior `atualizadoEm`** (a lista já vem
  ordenada por `atualizadoEm` desc, `criadoEm` desc, então é o primeiro Jogando). **Sem nenhum Jogando, o destaque some** e a
  estante começa direto. **Só aparece com o filtro "Todos" ou "Jogando"**, mesmo havendo jogos Jogando nos outros filtros. O jogo
  do destaque **continua na prateleira** "Jogando agora". Cartão de 230 px de altura, raio 24, fundo na cor da capa do jogo com o
  degradê escuro à esquerda; rótulo "Continue de onde parou" (ícone `play_circle`, 13 px, maiúsculas), título (Outfit 800, 52 px, até
  2 linhas), chips escuros de 32 px: plataforma (só se houver), estrela + média (só se houver), relógio + "42 h 30 min na Steam"
  e troféu + "12/40 conquistas" (**só se ligado à Steam**, e o segundo só com total > 0), e o botão **"Ver detalhes"** (pílula clara de
  44 px) para `/jogos/:id`. A coluna de texto ocupa **no máximo 50%** da largura (contraste, ver tabela).
- **Prateleiras** (`Jogando agora`, `Quero jogar`, `Zerados`, nessa ordem): título com ícone de 26 px na cor do status, `h2` (Outfit
  700, 22 px) e contador em pílula (`painel-3`). Com "Todos", **só aparece a prateleira com pelo menos 1 jogo**; com um filtro de
  status, só a dele. A ordem dentro da prateleira é a da lista (`atualizadoEm` desc). A prateleira cheia (rolagem ou quebra em
  linhas) é a **questão 4**.
- **Tile** (150 × 200 no confortável, raio 14, gap de 22 px): a capa; o **anel da média** no canto superior direito (40 px, arco em
  `texto` sobre trilho escuro, número em Outfit 700, 13 px; **sem média, sem anel**; média 0 é nota e mostra o anel com "0,0");
  o **chip da plataforma** no canto inferior esquerdo (ícone + nome, 26 px, fundo `fundo` a 78%; **sem plataforma, sem chip**); o
  **título** (Outfit 600, 16 px, até 2 linhas, `overflow-wrap: anywhere`) e, **só nos jogos ligados à Steam**, a linha
  **"42 h · 12/40"** com o ícone `sports_esports` (`resumoDoCatalogo`, o mesmo `aria-label`: "Tempo jogado na Steam: 42 horas,
  12 de 40 conquistas"; só as horas quando não há total; "0 h" com 0 minutos). O tile inteiro é um link para `/jogos/:id` (o título
  é o `<Link>` real, esticado sobre o tile; as ações ficam por cima).
- **Editar e Remover:** dois botões redondos de 44 px, empilhados no canto inferior direito da capa (`aria-label` "Editar {título}" e
  "Remover {título}"). **Aparecem no hover do tile e no foco por teclado** (`:hover` e `:focus-within`); o hover também eleva o tile
  (−6 px) e desenha o anel (`texto` de 3 px e `destaque` a 55% de 7 px). Só em aparelho com hover
  (`@media (hover: hover)`); **em toque, os botões não existem na tela**, e o caminho é abrir o jogo (o detalhe já tem **Editar** e
  **Excluir**). Ver a questão 5.
- **Botão-bloco "Adicionar"** ao fim de cada prateleira (150 × 200, borda tracejada `borda-controle` de 2 px, raio 14, ícone `add` e o
  texto): abre o formulário de novo jogo **já com o status da prateleira** (suposição; o "Adicionar jogo" do topo continua abrindo
  com o padrão de hoje).
- **Estados:** carregando (esqueleto de uma prateleira, `role="status"`, "Carregando jogos"); erro de API com "Tentar de novo" (e a
  mensagem sem conexão); vazio sem nenhum jogo ("Nenhum jogo cadastrado") e vazio com filtro ("Nenhum jogo neste status"), com os
  textos de hoje, já no visual novo.
- **Contagens:** vêm da mesma lista completa (uma query), nas pílulas de filtro e nos contadores das prateleiras, e acompanham
  criar, editar e remover **sem recarregar**.
- **Densidade "compacta"** (questão 1): _tiles_ menores (120 × 160 no desktop, 108 × 144 no celular) e espaços menores; as ações e
  os links continuam com alvo ≥ 44 px.

### 4. Estrutura do catálogo no celular (< 768 px)

- Cabeçalho: logo de 36 px e "checkpoint" (Outfit 800, 22 px). **Sem** "Adicionar jogo" nem botão de perfil no topo (a
  `BottomNav` os tem).
- **Filtros** numa fileira que **rola na horizontal dentro dela** (pílulas de 44 px; a ativa com fundo `texto`, as inativas em
  `painel` com **`borda-controle`**, não a `borda` do desenho). `?status=ZERADO` traz a pílula "Zerado" à vista sem rolar.
- **Destaque compacto** (176 px, raio 20, o cartão **inteiro** é um link para o detalhe): rótulo de 12 px, título de 32 px, chips de 26
  px (média, horas, `12/40`).
- **Prateleiras** com rolagem horizontal (tile de 132 × 176, raio 12, gap de 14, título de 15 px, linha "42 h · 12/40" de 12 px, anel de
  36 px). **A página não rola na horizontal; só as prateleiras.**
- **Barra inferior** (68 px com a safe-area; fundo `painel-2`, topo `borda`): **Jogos** (`aria-current="page"`, ícone cheio e cor do
  `destaque`), **Adicionar** e **Perfil**, cada um com ≥ 88 × 44 px, rótulo de 12 px, ícone de 26 px. Continua no `#overlay-root` e
  some com o teclado aberto fora de diálogo.
- O formulário e os diálogos continuam **folha inferior** no celular.

### 5. Capa

- **Capa gerada em pé (3:4)**, mesma regra de cor (hash FNV-1a do título, `capa-1` a `capa-6`) e de iniciais (`game-cover.ts`,
  **inalterado**). Tamanhos: tile 150 × 200 (132 × 176 no celular; 120 × 160 e 108 × 144 no compacto), detalhe 300 × 400, miniatura do
  formulário 44 × 58 ou 56 × 74. Iniciais no canto superior esquerdo (Outfit 900, `fundo` a 78%, 50/42/96 px conforme o tamanho), um
  brilho diagonal (branco a 28% no canto) e um anel decorativo no canto inferior esquerdo.
- **Precedência inalterada** (`integracao-plataformas`, CA-42): enviada; depois a oficial da Steam (`library_600x900`, já em pé);
  depois a gerada. A queda para `header.jpg` é a **questão 9** (em pé, ele vira um recorte do meio de uma imagem larga).
- **Capa enviada de qualquer proporção** (2 MB, JPEG, PNG ou WebP, regras inalteradas) **entra cortada**: `object-fit: cover`, recorte
  centralizado, na proporção 3:4. **Efeito no CA-73 do catálogo** ("a linha mostra a imagem 52×52"): passa a "o tile mostra a imagem
  em 3:4, cortada". Imagem larga perde as laterais; imagem alta perde topo e base. O formulário avisa isso (ver "Formulário").
- Falha ao carregar qualquer imagem cai para a próxima da cadeia, e a gerada é o último recurso (CA-73 do catálogo).

### 6. Detalhe do jogo (`/jogos/:id`)

- **Cabeçalho da página:** logo e a **navegação principal** em pílulas (Jogos com `aria-current="page"`, Adicionar, Perfil; a mesma
  fonte de destinos, `nav-items.ts`), e **Voltar** (≥ 44 px), como no desenho.
- **Desktop (≥ 1024 px):** duas colunas, capa de **300 × 400 em pé (3:4)**, raio 20, sombra; à direita, título (Outfit 800, 52 px), chips
  de plataforma e de **status** (ícone, rótulo, cor do status a 18% sobre o fundo, texto na cor do status), o **anel da média** de 92
  px (arco em `destaque`, número Outfit 800 de 28 px e "de 10"; **sem média, sem anel**, e o texto "A nota geral é a média dos
  critérios que você preencher." de hoje continua), os botões **Editar** (pílula de `destaque`) e **Excluir** (contorno), o cartão
  **Avaliação** e a **Descrição**.
- **Avaliação:** cinco linhas (grade rótulo com descrição curta · barra · nota): barra de 10 px em `destaque` sobre o trilho `borda`,
  nota em Outfit 800 com vírgula e uma casa; critério sem nota mostra **"sem nota"** e barra vazia (0 é nota; vazio não é 0).
- **Descrição:** texto (nunca HTML) com `white-space: pre-line`, ou o convite "Adicionar descrição" (que abre o formulário).
- **Bloco Steam** (só com vínculo; comportamento da `integracao-plataformas` inalterado): cartão de raio 22; cabeçalho com o ícone em
  quadrado de 44 px, **"Steam"** e **"Atualizado há 12 minutos"** (novo texto, a partir de `dadosPlataforma[].atualizadoEm`,
  `Intl.RelativeTimeFormat` pt-BR: "Atualizado agora" abaixo de 1 min; minutos, horas e dias); os botões **Atualizar**, **Abrir na
  Steam** (`rel="noopener noreferrer"`) e **Desvincular** (`erro-texto`); três cartões de dados ("Tempo jogado na Steam", "Último jogo
  em" ou "Nunca jogado", e "Conquistas · 12 de 40" com a **barra `role="progressbar"`** em `ouro` e a porcentagem); e as listas
  **Desbloqueadas** e **Faltam** com contador, cada item com o **ícone real da conquista** (52 px, raio 10; cadeado ou
  `visibility_off` quando não há ícone), nome, descrição ("Conquista oculta" quando oculta e bloqueada), "Desbloqueada em
  dd/mm/aaaa" e a raridade ("62,1%" e "dos jogadores", ou "Raridade indisponível"). Em ≥ 1024 px as duas listas ficam **em duas
  colunas**; abaixo, uma. Os avisos discretos (conquistas privadas, perfil privado, Steam indisponível) e o esqueleto continuam como
  hoje, no visual novo. `<details>` ou sempre aberto: **questão 8**.
- **Celular:** coluna única (capa, título e chips, anel, botões, avaliação, descrição, bloco Steam), sem rolagem horizontal. Não foi
  desenhado: herda a linguagem e exige conferência (lista abaixo).

### 7. Formulário "Novo jogo" / "Editar jogo"

Diálogo `<dialog>` (o `ModalDialog` de hoje), largura de até 640 px no desktop e folha inferior no celular (inalterado); raio 24, borda
`borda`, sombra de `fundo`.

- **Cabeçalho:** `h2` ("Novo jogo" ou "Editar jogo", Outfit 800, 26 px) e fechar redondo de 44 px (`aria-label="Fechar"`).
- **Buscar na Steam** (só com conta vinculada; sem ela, o link "Vincule sua Steam no perfil" de hoje): botão de 52 px com borda
  tracejada em `destaque`, fundo `destaque` a 8%, ícone `search`.
- **"Ligado à Steam: «…»"** (depois de escolher um item): cartão com a miniatura em pé (44 × 58, a capa oficial só como **prévia**), o
  ícone `link`, o texto **"Ligado à Steam: «Hollow Knight»"**, a linha **"42 h 30 min. A capa oficial é só prévia."** (só as horas;
  a biblioteca não traz conquistas) e os botões **"Trocar"** (reabre a busca) e **"Remover ligação"** (como hoje).
- **Campos:** rótulos em maiúsculas de 13 px (`texto-suave`, com espaçamento), campos de 52 px, raio 12, fonte de 16 px, borda
  `borda-controle`, fundo `fundo`. **Foco:** borda em `destaque` e anel de 3 px (`destaque` a 35%). **Erro:** borda `erro`, a
  mensagem de hoje junto do campo e o tremor (que sai com movimento reduzido).
- **Status:** três botões de 52 px na ordem **Jogando, Quero jogar, Zerado** (a do desenho e a dos filtros; hoje é Zerado, Jogando,
  Quero jogar: suposição), `aria-pressed` (exatamente um), o ativo com fundo `texto` e texto `fundo`.
- **Avaliação** (só com Zerado ou Jogando): cartão `painel-2` com "Avaliação" e **"Média 8,3"** ao vivo (Outfit 800, 22 px; "—" sem
  nota); por critério, o rótulo com a descrição, o **slider** (44 px, `accent-color: destaque`), o campo de texto (76 px, Outfit 700,
  centralizado) e **Limpar** (76 × 44). Comportamento de `avaliacao-de-jogos` (CA-16 a CA-22) **inalterado**.
- **Descrição:** textarea de 110 px com o contador **n/1000**.
- **Capa:** área tracejada com a miniatura em pé (56 × 74), "Prévia da capa oficial da Steam" (quando é o caso), o texto "Envie um
  arquivo (JPEG, PNG ou WebP, até 2 MB) para usar a sua." e **Enviar**; **Remover capa** continua. **Novo:** uma linha de ajuda
  "A capa aparece em pé (3:4); imagens de outra proporção são cortadas no centro."
- **Rodapé fixo:** **Cancelar** (contorno de 52 px) e **Salvar** (`destaque`, Outfit 800), `sheet-footer` como hoje.
- **Preservado sem mudança de regra:** título obrigatório, duplicidade (409), plataforma em seleção (com favoritas), confirmação de
  plataforma ≠ PC ao ligar à Steam, "salvo mas a ligação/capa falhou" (o próximo Salvar é `PATCH`), foco inicial no Título,
  Esc fecha, `?novo=1`.

### 8. Preferências do aparelho (`/perfil`, modal de preferências)

Decisões da **questão 1**; abaixo o que a spec propõe (recomendação). Nada vai para a API; muda o formato de `checkpoint:prefs`.

- **Cor de destaque:** as quatro continuam, mapeadas para tokens novos: **Azul** (`acento` `#4f8cff`, **padrão**), **Violeta** (`capa-6`),
  **Rosa** (`capa-2`) e **Laranja** (`capa-3`). Os valores gravados passam a `azul | violeta | rosa | laranja`. O antigo `magenta`
  (o padrão de antes) e o antigo `azul` (`capa-1`, azul-claro) **viram `azul`** na migração; `violeta` e `laranja` ficam.
- **Efeitos** viram **"Animações"** (`completas` / `reduzidas` na tela; o valor gravado continua `completos` / `reduzidos`, então
  **nenhuma migração** dessa chave). "Reduzidas" desliga a elevação e as transições novas, como o `prefers-reduced-motion`.
- **Densidade:** continua, agora com o sentido de **capas menores** (medidas acima); valores gravados inalterados.
- **Migração:** `STORAGE_SCHEMA_VERSION` de 1 para 2, com `MIGRATIONS[1]` (`shared/lib/storage/migrations.ts`) reescrevendo o
  `destaque` de cada entrada de `porUsuario`. Entrada inválida continua voltando aos padrões, só para o dono dela (CA-21 do perfil).
- **Prévias do modal:** a prévia da densidade mostra dois _tiles_ sintéticos nas medidas novas, e a da animação mostra um _tile_
  que se eleva (ou não). O modal usa `destaque` na borda e na bolinha marcada, como hoje.
- **O que o `destaque` pinta:** logo, "Adicionar jogo", "Salvar" e botões principais, item ativo da `BottomNav`, anel de foco,
  bordas em foco, o anel da média e as barras de avaliação no detalhe, o `accent-color` dos sliders, o anel do hover do _tile_ e a
  borda do "Buscar na Steam". **Não muda:** as cores de status, as conquistas (`ouro`), a pílula de filtro ativa (`texto`) e o anel
  da média do _tile_ (`texto`).

### 9. O que herda o novo tema e não foi desenhado

Não se inventa layout novo: **herda tokens, fontes e formas** (F4 ajusta os cantos e confere). Cada item exige conferência visual
(CA-61 a CA-70) e não pode perder nenhuma função, nome acessível nem alvo de toque:

1. `/perfil`: cabeçalho (avatar de iniciais com a paleta da capa), **Conta** (Trocar senha, Sessões ativas, Sair), **Contas vinculadas**
   (cartão Steam: estados vinculado, privado, erro, esqueleto), **Preferências** (linha e o modal com abas), Instalar app, **Zona de
   perigo** e o diálogo de exclusão de conta;
2. `/login`, `/registro` e `/perfil/senha` (o `AuthLayout` e o `AuthCard`, o logo `BrandLogo`);
3. o diálogo **"Buscar na Steam"** (biblioteca, busca, estados vazio, privado e erro; o aviso de confirmação de plataforma e o "Mover
   o vínculo");
4. o **detalhe no celular**;
5. o **estado vazio** do catálogo e os estados de **carregando** e de **erro** (catálogo, detalhe, listas);
6. os avisos: `ConnectionBanner`, `UpdatePrompt` e `InstallNudge` (posição acima da barra inferior mantida);
7. os **diálogos de confirmação** (`DeleteGameDialog`, "Desvincular", "Encerrar sessões", "Excluir conta");
8. a página **`/status`**;
9. o `GameForm` dentro do diálogo aninhado com o "Buscar na Steam" (o `ModalDialog` já trata o `close` do diálogo interno).

### 10. PWA

- `theme_color` e `background_color` do manifest, o `<meta name="theme-color">` e o token `fundo` passam a `#0b0f1a` (o
  `pwa.config.test.ts` confere que os três são iguais).
- **Ícones e favicon** (`public/favicon.svg` e `public/icons/*`) hoje são magenta sobre `#07040f`. O desenho só define o **logo do
  cabeçalho** (círculo azul com bandeira). Trocar os ícones instaláveis é a **questão 11**; até lá ficam como estão.
- O precache (`generateSW`, só o shell) e a política offline **não mudam**. As fontes vêm do Google (não entram no precache): offline
  cai a fonte de reserva, como hoje com Orbitron e Rajdhani.

## Requisitos de saída

Tela ↔ arquivo (nomes sugeridos; quem implementar pode dividir de outro jeito, desde que os papéis e nomes acessíveis abaixo
existam). **Nomes acessíveis e papéis preservados** (os testes existentes continuam cobrindo os mesmos comportamentos):

| Tela e elemento           | Papel e nome acessível                                                                                        | Notas                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Filtros                   | `group` "Filtrar por status"; `button` "Todos", "Jogando", "Quero jogar", "Zerado" com `aria-pressed`         | ícone + rótulo + contagem                         |
| Lista de jogos            | `list` "Jogos" (uma por prateleira, ou uma no total: definir na implementação e manter a consulta `listitem`) | tile = `listitem`                                 |
| Título do tile            | `link` "{título}" para `/jogos/:id`                                                                           | esticado sobre o tile                             |
| Ações do tile             | `button` "Editar {título}" e "Remover {título}"                                                               | só em aparelho com hover                          |
| Anel da média             | `img` "Nota 8,3 de 10"                                                                                        | ausente sem média                                 |
| Linha da Steam            | `img` "Tempo jogado na Steam: 42 horas, 12 de 40 conquistas"                                                  | só nos ligados                                    |
| Destaque                  | `link` "Ver detalhes" (desktop); o cartão todo é `link` (celular)                                             | rótulo "Continue de onde parou"                   |
| Navegação                 | `nav` "Navegação principal" com `aria-current="page"` no ativo                                                | `BottomNav` (< 768 px) e barra do topo (≥ 768 px) |
| Perfil (topo do catálogo) | `link` "Perfil"                                                                                               | botão redondo                                     |
| Detalhe                   | `heading` 1 = título; `heading` 2 "Avaliação", "Descrição", "Steam"; `progressbar` de conquistas              | inalterado                                        |
| Formulário                | `dialog` com `heading` "Novo jogo" ou "Editar jogo"; `button` "Fechar", "Cancelar", "Salvar"                  | inalterado                                        |

**Estados de tela do catálogo:** carregando; erro (com e sem conexão); vazio; vazio com filtro; com jogos e sem Jogando (sem destaque);
com jogos e com Jogando (destaque) e filtro Todos ou Jogando; com filtro Quero jogar ou Zerado (sem destaque).

## Modelo de dados

n/a. Nenhum campo, model ou migration de banco. (A única migração é a do **armazenamento local** do navegador, em "Preferências".)

## Contrato compartilhado

n/a. Nenhuma alteração em `packages/shared`. O web usa só campos que `Game` já tem.

## Critérios de aceite (testáveis, em BDD)

Legenda: **[T]** coberto por teste automatizado; **[N]** só verificável no app rodando (navegador, 360/390/1024 px, aparelho real,
verificador de contraste), registrado como **"só provável no app rodando"** até o `/qa-verify`.

### F1 — tokens, fontes e efeitos

- [ ] **CA-01** [T] — **Dado** o `@theme` de `styles/index.css`, **quando** o leio, **então** ele declara `fundo`, `painel`, `painel-2`,
      `painel-3`, `borda`, `borda-controle`, `texto`, `texto-suave`, `acento`, `destaque`, `status-jogando`, `status-quero-jogar`,
      `status-zerado`, `ouro`, `erro`, `erro-texto`, `apagado-2` e `capa-1` a `capa-6` com os valores da tabela; **e** não existem
      `magenta`, `ciano`, `vermelho-neon` nem `painel-hover`.
- [ ] **CA-02** [T] — **Dado** `apps/web/src`, **quando** procuro literais hexadecimais (`#[0-9a-fA-F]{3,8}`) fora do `@theme`, **então**
      não há nenhum (CA-87 do catálogo, atualizado); **e** nenhum arquivo usa uma classe de token removida (`text-ciano`, `bg-magenta`,
      `border-vermelho-neon`, `glow-*`, `tint-*`).
- [ ] **CA-03** [T] — **Dado** os tokens, **quando** o `tokens.test.ts` calcula os contrastes WCAG, **então** falha se: `texto` ou
      `texto-suave` sobre `fundo`, `painel`, `painel-2` ou `painel-3` for < 4,5; `destaque`, `status-*`, `ouro`, `erro` ou `erro-texto`
      sobre `painel` for < 4,5; `fundo` sobre cada uma das quatro cores de destaque for < 4,5; ou `borda-controle` sobre `fundo`, `painel`
      ou `painel-2` for < 3.
- [ ] **CA-04** [N] — **Dado** o app rodando, **quando** meço com um verificador de contraste os pares realmente usados em `/`,
      `/jogos/:id`, o formulário e `/perfil`, **então** todo texto tem ≥ 4,5:1 (≥ 3:1 acima de 24 px), todo contorno de controle e anel
      de foco tem ≥ 3:1 contra o fundo em que está, e os números batem com as tabelas desta spec.
- [ ] **CA-05** [T] — **Dado** `apps/web/index.html`, **quando** o leio, **então** carrega **Outfit**, **Manrope** e **Material Symbols
      Rounded** por `<link>` de `fonts.googleapis.com` (com `display=swap`) e **não** carrega Orbitron nem Rajdhani; **e** o `package.json`
      do web não ganhou dependência.
- [ ] **CA-06** [T] — **Dado** o `@theme`, **então** `--font-display` começa por `Outfit` e `--font-corpo` por `Manrope`, ambos com
      `system-ui` de reserva; **e** campos (`input`, `select`, `textarea`) continuam com `font-size` ≥ 16 px.
- [ ] **CA-07** [T] — **Dado** o `index.css` e o `Backdrop`, **então** não existem `.orb`, `.scanlines`, `.cta-pulse`, `.dot-blink`, os
      `@keyframes` `drift`, `scan`, `neon-pulse` e `blink`, nem orbes ou _scanlines_ no `AppFrame`.
- [ ] **CA-08** [T] — **Dado** `prefers-reduced-motion: reduce` **ou** "Animações: reduzidas", **então** a variante `movimento-reduzido` desliga
      toda `animation` e `transition` (o `tokens.test.ts` confere as duas entradas e que nenhum pseudo-elemento anima).
- [ ] **CA-09** [N] — **Dado** `prefers-reduced-motion: reduce` emulado no DevTools, **quando** passo o mouse pelos _tiles_ e botões,
      abro o formulário e provoco um erro de campo, **então** nada se move (sem elevação, subida da folha, brilho de esqueleto nem
      tremor), e o estado final (anel do hover, borda de erro) aparece.
- [ ] **CA-10** [T] — **Dado** `#0b0f1a`, **então** o `<meta name="theme-color">`, `theme_color` e `background_color` do manifest e o
      `--color-fundo` são iguais (`pwa.config.test.ts`).
- [ ] **CA-11** [T] — **Dado** o `git diff` da fase, **então** `apps/api`, `packages/shared` e `prisma/` não mudaram.
- [ ] **CA-12** [T] — **Dado** o app no fim da F1, **quando** abro `/`, o detalhe, o formulário e `/perfil`, **então** tudo funciona como
      antes (o mesmo conjunto de testes de página passa), agora nas cores e fontes novas, com a linha do jogo ainda em linhas.

### F2 — catálogo em estante

- [ ] **CA-13** [T] — **Dado** ≥ 768 px e jogos nos três status, **quando** abro `/`, **então** a barra superior tem o logo, o grupo
      "Filtrar por status" com quatro botões (ícone, rótulo e contagem, "Todos" = total, exatamente o ativo com `aria-pressed="true"`),
      "Adicionar jogo" e o link "Perfil".
- [ ] **CA-14** [T] — **Dado** o filtro "Zerado", **quando** clico nele, **então** a URL vira `/?status=ZERADO` e só a prateleira
      "Zerados" aparece; **e** recarregar mantém; `?status=PAUSADO` vale como "Todos" (CA-45 a CA-47 do catálogo e CA-16 do perfil continuam).
- [ ] **CA-15** [T] — **Dado** dois jogos Jogando, "A" atualizado depois de "B", **quando** abro `/` com "Todos", **então** o destaque
      "Continue de onde parou" mostra **A** (título, chips de plataforma e de média quando existem) e "Ver detalhes" leva a `/jogos/<A>`; **e** A
      também aparece em "Jogando agora".
- [ ] **CA-16** [T] — **Dado** o destaque de um jogo ligado à Steam com 2550 min e 12 de 40 conquistas, **então** os chips mostram
      "42 h 30 min na Steam" e "12/40 conquistas"; **e** num jogo não ligado esses dois chips não existem.
- [ ] **CA-17** [T] — **Dado** jogos sem nenhum Jogando, **quando** abro `/`, **então** não há destaque e a primeira prateleira começa
      logo abaixo da barra.
- [ ] **CA-18** [T] — **Dado** jogos Jogando, **quando** escolho o filtro "Quero jogar" ou "Zerado", **então** o destaque não aparece; com
      "Todos" ou "Jogando", aparece.
- [ ] **CA-19** [T] — **Dado** o destaque de A, **quando** edito outro jogo Jogando "B" (o `atualizadoEm` de B passa a ser o maior),
      **então** o destaque passa a ser B, sem recarregar.
- [ ] **CA-20** [T] — **Dado** jogos só em Jogando e Zerado, **quando** abro `/` com "Todos", **então** vejo as prateleiras "Jogando
      agora" e "Zerados", cada uma com ícone na cor do status, título e contador, e **não** vejo "Quero jogar".
- [ ] **CA-21** [T] — **Dado** um jogo com média 8,3 e plataforma PC, **então** o _tile_ mostra o anel com "8,3" (`img` "Nota 8,3 de 10"),
      o chip "PC" e o título; **e** um jogo sem média não tem anel, e um sem plataforma não tem chip; **e** um jogo com média 0 mostra o anel
      com "0,0".
- [ ] **CA-22** [T] — **Dado** um jogo ligado com 2550 min e 12 de 40, **então** o _tile_ mostra "42 h · 12/40" com o `aria-label` "Tempo
      jogado na Steam: 42 horas, 12 de 40 conquistas"; com total 0, só "42 h"; com 0 min, "0 h"; e um jogo não ligado não mostra nada.
- [ ] **CA-23** [T] — **Dado** um _tile_, **quando** clico no título ou na capa, **então** vou a `/jogos/<id>`; **quando** clico em Editar
      ou Remover, **então** abre o formulário ou a confirmação **sem navegar**.
- [ ] **CA-24** [T+N] — **Dado** um aparelho com hover, **quando** passo o mouse num _tile_, **então** Editar e Remover aparecem, o _tile_
      sobe 6 px e ganha o anel; **e** navegando só por Tab, ao focar o título as duas ações aparecem e são focáveis, com o anel de foco visível.
- [ ] **CA-25** [T+N] — **Dado** um aparelho **sem** hover (toque), **então** o _tile_ não mostra Editar nem Remover e os botões não
      ocupam nem interceptam toque; **e** abrir o jogo mostra **Editar** e **Excluir** funcionando (o caminho sem hover).
- [ ] **CA-26** [T] — **Dado** a prateleira "Jogando agora", **quando** clico no botão-bloco "Adicionar" ao fim dela, **então** abre o
      formulário de novo jogo com o status **Jogando** já marcado; **e** o "Adicionar jogo" do topo abre o formulário com o padrão de hoje.
- [ ] **CA-27** [T+N] — **Dado** a prateleira com mais jogos do que cabem numa linha, **então** [comportamento decidido na questão 4: o
      desktop quebra em linhas **ou** rola na horizontal] **e** a página nunca ganha rolagem horizontal.
- [ ] **CA-28** [T] — **Dado** o catálogo vazio, **então** vejo "Nenhum jogo cadastrado" com o convite a adicionar; **dado** um filtro sem
      jogos, "Nenhum jogo neste status"; **dado** a API fora do ar, a mensagem com "Tentar de novo" (CA-41, CA-46 e CA-50 do catálogo).
- [ ] **CA-29** [T] — **Dado** 2 Jogando, 1 Zerado e 0 Quero jogar, **então** as pílulas mostram Todos 3, Jogando 2, Quero jogar 0,
      Zerado 1 e as prateleiras 2 e 1; **quando** crio um Jogando, os números sobem para 4, 3, 0, 1 e 3, 1, **sem recarregar**; editar para
      Zerado e remover também os atualizam. (Substitui o CA-79 do catálogo.)
- [ ] **CA-30** [T] — **Dado** ≥ 768 px, **então** os painéis grandes de contagem e o texto "Última atualização primeiro" **não** existem, e a
      ordem dos jogos continua `atualizadoEm` decrescente.
- [ ] **CA-31** [N] — **Dado** 390 px, **quando** abro `/`, **então** `document.documentElement.scrollWidth` é igual a `clientWidth` (a página
      não rola na horizontal); a fileira de filtros e cada prateleira rolam na horizontal **dentro delas**.
- [ ] **CA-32** [T+N] — **Dado** `/?status=ZERADO` no celular, **então** a pílula "Zerado" já está visível na fileira, sem rolar.
- [ ] **CA-33** [T] — **Dado** < 768 px, **então** o destaque compacto é um único `link` para o detalhe, sem "Ver detalhes"; e as regras de
      aparecer (CA-15 a CA-18) valem igual.
- [ ] **CA-34** [T] — **Dado** < 768 px, **então** a `BottomNav` tem "Jogos" (`aria-current="page"` em `/` e em `/jogos/:id`), "Adicionar"
      e "Perfil", cada um com ≥ 88 × 44 px; o ativo usa `destaque`; "Adicionar" abre o formulário como folha inferior (`?novo=1` continua
      funcionando); e a barra some com o teclado aberto fora de diálogo.
- [ ] **CA-35** [T] — **Dado** 767 px e 768 px, **então** 767 usa o layout de celular (barra inferior, prateleiras com rolagem) e 768 o de
      desktop (barra superior, `BottomNav` ausente); não há outro ponto de quebra no catálogo.
- [ ] **CA-36** [N] — **Dado** 360×640 e 1024 px, **quando** meço filtros, _tiles_ (links), botões e itens da barra, **então** todo alvo tem
      ≥ 44 × 44 px e o texto de apoio tem ≥ 12 px.

### Capa (F2)

- [ ] **CA-37** [T] — **Dado** um jogo sem capa, **então** o _tile_ mostra a capa gerada **em pé (3:4)** com as iniciais no canto superior
      esquerdo ("Hollow Knight" → "HK"; "Celeste" → "C") sobre uma cor da paleta; **e** a cor é a mesma ao recarregar e para outro jogo com
      o mesmo título (o hash não mudou). (Substitui o CA-72 do catálogo.)
- [ ] **CA-38** [T] — **Dado** um jogo com `capaUrl` de uma imagem larga (ex.: 16:9) ou alta, **então** o _tile_ mostra a imagem em 3:4
      com `object-fit: cover` (recorte centralizado); **e** se ela falhar ao carregar, cai para a próxima da cadeia e, por fim, para a gerada.
      (Substitui o CA-73 do catálogo.)
- [ ] **CA-39** [T] — **Dado** um jogo ligado à Steam e **sem** capa enviada, **então** o _tile_ mostra a capa oficial; **e** com capa
      enviada, a enviada; **e** removendo a enviada, a oficial reaparece (CA-42 da `integracao-plataformas`, inalterado).
- [ ] **CA-40** [T] — **Dado** o formulário com uma capa, **então** o preview é em 3:4 e há a linha "A capa aparece em pé (3:4); imagens
      de outra proporção são cortadas no centro."; **e** escolher um GIF ou um arquivo de 3 MB continua mostrando o erro sem enviar nada
      (CA-74 e CA-77 do catálogo).
- [ ] **CA-41** [T] — **Dado** as seis cores da capa, **então** as iniciais têm ≥ 4,5:1 sobre cada uma (tabela).

### F3 — detalhe e formulário

- [ ] **CA-42** [T] — **Dado** um jogo Zerado com `gameplay 9,2`, `historia 8` e os outros vazios, **quando** abro `/jogos/<id>` em ≥ 1024
      px, **então** vejo a capa em pé (300 × 400, 3:4), o título, o chip de plataforma e o de status, o anel da média com "8,6" e "de 10", e
      o cartão Avaliação com cinco linhas: Gameplay "9,2" e História "8,0" com barra, e os outros três com "sem nota". (Substitui o
      CA-25 da `avaliacao-de-jogos` na parte visual.)
- [ ] **CA-43** [T] — **Dado** um jogo sem média, **então** não há anel e vejo "A nota geral é a média dos critérios que você preencher."
- [ ] **CA-44** [T] — **Dado** uma descrição `"<b>oi</b>\nlinha 2"`, **então** ela aparece como **texto** (`<b>oi</b>` literal) com a
      quebra; sem descrição, o convite "Adicionar descrição" abre o formulário.
- [ ] **CA-45** [T] — **Dado** um jogo ligado com `atualizadoEm` de 12 minutos atrás, **então** o bloco Steam mostra "Atualizado há 12
      minutos"; com 30 s, "Atualizado agora"; com 3 h, "Atualizado há 3 horas"; e o formatador nunca mostra "Invalid Date".
- [ ] **CA-46** [T] — **Dado** o bloco Steam, **então** mostra "Tempo jogado na Steam" ("42 h 30 min"), "Último jogo em"
      (dd/mm/aaaa) ou "Nunca jogado", a barra `role="progressbar"` com "12 de 40", **Atualizar**, **Abrir na Steam** e **Desvincular**;
      **e** todos os comportamentos dos CA-43 a CA-54 da `integracao-plataformas` (1 h, 30 s, avisos, sem 502 no detalhe, Desvincular) passam
      sem alteração de regra.
- [ ] **CA-47** [T] — **Dado** as conquistas, **então** as listas "Desbloqueadas" e "Faltam" têm contador; cada item mostra o ícone real
      (52 × 52, `loading="lazy"`, com `width` e `height`), o nome, a descrição (ou "Conquista oculta"), "Desbloqueada em dd/mm/aaaa" quando
      houver, e "62,1% dos jogadores" ou "Raridade indisponível"; em ≥ 1024 px as duas listas ficam lado a lado e abaixo disso em uma
      coluna.
- [ ] **CA-48** [T] — **Dado** o formulário aberto, **então** o cabeçalho tem "Novo jogo" (ou "Editar jogo") e o botão redondo "Fechar"
      (≥ 44 px); o rodapé fixo tem "Cancelar" e "Salvar" (52 px); Esc fecha e o foco volta ao botão que abriu.
- [ ] **CA-49** [T] — **Dado** uma conta Steam vinculada, **quando** escolho um item em "Buscar na Steam", **então** vejo "Ligado à
      Steam: «título»" com a miniatura em pé, as horas e "A capa oficial é só prévia.", e os botões "Trocar" e "Remover ligação"; **quando**
      clico em "Trocar", a busca reabre; **quando** clico em "Remover ligação", o cartão some; **e** sem conta vinculada vejo o link "Vincule
      sua Steam no perfil".
- [ ] **CA-50** [T] — **Dado** um campo com erro (ex.: título duplicado), **então** ele tem borda `erro`, a mensagem junto e o tremor;
      com movimento reduzido, só a borda e a mensagem. **Dado** o foco num campo, **então** ele tem a borda `destaque` e o anel de 3 px.
- [ ] **CA-51** [T] — **Dado** o formulário, **então** o Status tem três botões na ordem Jogando, Quero jogar, Zerado com `aria-pressed`
      (exatamente um); com Quero jogar a seção Avaliação some e o aviso "As notas preenchidas serão apagadas ao salvar como Quero jogar"
      continua (CA-16 e CA-21 da `avaliacao-de-jogos`).
- [ ] **CA-52** [T] — **Dado** critérios `9`, `8,5` e dois vazios, **então** "Média" mostra `8,8` ao vivo, e `—` sem nenhum; o slider, o campo
      e o "Limpar" de cada critério têm ≥ 44 px de altura e o mesmo comportamento de hoje (CA-17 a CA-20 da `avaliacao-de-jogos`).
- [ ] **CA-53** [T] — **Dado** a descrição, **então** o contador mostra `n/1000` e não passa de 1000.
- [ ] **CA-54** [T] — **Dado** o formulário de novo jogo ligado à Steam com plataforma "PlayStation 5", **quando** salvo, **então** vejo a
      confirmação **antes** de qualquer request (CA-37 da `integracao-plataformas`, inalterado); e o formulário aninhado com "Buscar na Steam"
      não fecha ao fechar o diálogo interno.

### Preferências (F1 e F2)

- [ ] **CA-55** [T] — **Dado** o modal de preferências na aba Aparência, **então** vejo as cores **Azul, Violeta, Rosa e Laranja** (Azul marcada
      no padrão) e **Animações** (Completas e Reduzidas) e **Densidade**; **quando** escolho Violeta, **então** `html[data-destaque]` vira
      `violeta` **na hora** e o logo, "Adicionar jogo", o item ativo da barra e o anel de foco ficam violeta, os status **não** mudam e nenhuma
      request sai. (Substitui os CA-14 e CA-36 do perfil.)
- [ ] **CA-56** [T] — **Dado** `checkpoint:prefs` gravada na versão 1 com `destaque` `magenta` (uma entrada) e `violeta` (outra), **quando**
      o app abre, **então** a primeira vale `azul` e a segunda `violeta`, `checkpoint:versao` vira 2 e nenhuma outra chave `checkpoint:*`
      some; **e** uma entrada corrompida volta aos padrões só para o dono (CA-21 do perfil), e o storage bloqueado continua valendo até
      recarregar (CA-22).
- [ ] **CA-57** [T] — **Dado** "Animações: reduzidas" e o sistema **sem** `prefers-reduced-motion`, **quando** abro `/`, **então** nenhuma
      animação nem transição roda (elevação, folha, esqueleto, tremor). (Substitui os CA-18, CA-37 na parte de efeitos e CA-41 do perfil.)
- [ ] **CA-58** [T] — **Dado** densidade Compacta, **então** os _tiles_ medem 120 × 160 (desktop) e 108 × 144 (celular), o catálogo fica mais
      baixo, e os links e ações continuam com ≥ 44 px. (Substitui o CA-17 do perfil.)
- [ ] **CA-59** [T] — **Dado** "Restaurar padrões" na aba Aparência, **então** voltam Azul, Confortável e Completas, e as outras abas ficam
      como estavam (CA-40 do perfil, com o padrão novo); **e** a mini-prévia do modal muda com a densidade e com as animações, na hora.
- [ ] **CA-60** [T] — **Dado** as quatro cores de destaque, **então** o texto `fundo` sobre cada uma dá ≥ 4,5:1 (`tokens.test.ts`; CA-23 do perfil).

### F4 — herdado e fechamento (conferência visual)

- [ ] **CA-61** [N] — **Dado** `/perfil`, **então** o cabeçalho (avatar de iniciais), a seção Conta, o cartão Steam nos seus estados
      (esqueleto, vinculado, perfil privado, erro), Preferências, Instalar app e Zona de perigo aparecem no visual novo, sem rolagem
      horizontal em 360 px, com todo botão ≥ 44 × 44 px.
- [ ] **CA-62** [N] — **Dado** `/login`, `/registro` e `/perfil/senha`, **então** o logo, os campos, os erros e os botões estão no visual
      novo, com campos de 16 px, botão "mostrar senha" de 44 px e nenhum efeito neon.
- [ ] **CA-63** [N] — **Dado** o diálogo "Buscar na Steam", **então** a busca, os itens, "Criar jogo", "Vincular a este", "Vincular a outro jogo
      que já tenho", os estados vazio, privado e erro e o "Mover o vínculo" estão no visual novo, sem rolagem horizontal em 360 px.
- [ ] **CA-64** [N] — **Dado** o detalhe em 360 px, **então** coluna única, sem rolagem horizontal, botões ≥ 44 px, o bloco Steam com a lista
      de conquistas legível (uma coluna).
- [ ] **CA-65** [N] — **Dado** os estados carregando, erro e vazio do catálogo e do detalhe, **então** estão no visual novo e mantêm os
      papéis (`role="status"`, `role="alert"`).
- [ ] **CA-66** [N] — **Dado** o `ConnectionBanner` (offline e "Conexão restabelecida"), o `UpdatePrompt` e o `InstallNudge`, **então** ficam
      legíveis (≥ 4,5:1), acima da barra inferior no celular e no canto no desktop.
- [ ] **CA-67** [N] — **Dado** os diálogos de confirmação (remover jogo, desvincular, encerrar sessões, excluir conta), **então** o foco
      inicial, o Esc e o texto são os de hoje, no visual novo.
- [ ] **CA-68** [N] — **Dado** `/status`, **então** o diagnóstico de health aparece no visual novo.
- [ ] **CA-69** [N] — **Dado** o app instalado (PWA), **então** a barra de status, a tela de abertura e a cor do tema são `#0b0f1a`; e os
      ícones (questão 11) estão coerentes com o resultado.
- [ ] **CA-70** [N] — **Dado** um celular Android e um iPhone reais, **quando** uso o catálogo, o formulário (com o teclado aberto) e o
      detalhe, **então** as prateleiras rolam com o dedo sem mover a página, os campos não dão zoom e o retrato e a paisagem respeitam a
      safe-area.

### Transversais

- [ ] **CA-71** [T] — **Dado** os testes existentes de `GamesPage`, do substituto da `GameRow`, `GameForm`, `GameDetailPage`, `AppLayout`,
      `BottomNav` e `BlocoSteam`, **então** continuam cobrindo os mesmos comportamentos com o layout novo (mesmos papéis e nomes
      acessíveis da tabela de "Requisitos de saída"); nenhum teste é apagado sem substituto.
- [ ] **CA-72** [T] — **Dado** cada fase, **quando** rodo `npm run typecheck`, `npm run lint`, `npm test` e `npm run build`, **então**
      passam, e `ARCHITECTURE.md` descreve o que a fase mudou (§5.5, §5.6, §5.11, §5.12 e §5.13).
- [ ] **CA-73** [T] — **Dado** o `<meta name="viewport">`, **então** continua sem `maximum-scale` nem `user-scalable` (zoom livre) e o
      ponto de quebra único é 768 px.
- [ ] **CA-74** [T] — **Dado** `apps/web/package.json`, **então** não ganhou nenhuma dependência de runtime, de fonte, de ícone, de UI, de
      gráfico ou de animação.
- [ ] **CA-75** [N] — **Dado** o app rodando com `prefers-reduced-motion: reduce` e com o zoom do navegador em 200%, **então** o catálogo, o
      detalhe e o formulário continuam utilizáveis, sem sobreposição nem texto cortado.

## Substitui ou atualiza critérios de outras specs

Os critérios abaixo, lidos nas specs de origem, **deixam de valer como escritos** quando a fase correspondente for implantada; a
implementação atualiza o texto de origem com uma nota "_superado por `troca-de-design-estante`, CA-xx_", como as specs anteriores fizeram.

| Spec                     | Critério                                                                                                                | Muda para                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `catalogo-jogos`         | CA-72, CA-73 (capa 52 × 52)                                                                                             | CA-37, CA-38 (capa em pé, 3:4, `cover`)                      |
| `catalogo-jogos`         | CA-79 (painéis de contagem em dois dígitos)                                                                             | CA-29 (contagens nas pílulas e nas prateleiras)              |
| `catalogo-jogos`         | CA-80, CA-92 (filtro `ciano`, cores de status)                                                                          | CA-13, tokens de status (CA-01)                              |
| `catalogo-jogos`         | CA-84, CA-89 (orbes, _scanlines_, pulso do botão)                                                                       | CA-07, CA-08, CA-09                                          |
| `catalogo-jogos`         | CA-86, CA-88 (tokens `#796ca0`, Orbitron e Rajdhani)                                                                    | CA-03, CA-04, CA-05                                          |
| `catalogo-jogos`         | "Diretrizes visuais" (tokens, componentes, movimento)                                                                   | esta spec, seções 1 a 3                                      |
| `avaliacao-de-jogos`     | CA-23 (barra de 8 segmentos), CA-25 e CA-30 na parte visual                                                             | CA-21, CA-42, CA-36                                          |
| `perfil`                 | CA-14, CA-17, CA-18, CA-36, CA-37, CA-40, CA-41 (cores, densidade, efeitos, padrões)                                    | CA-55 a CA-60                                                |
| `perfil`                 | CA-20, CA-31 e CA-40 que citam "Magenta"                                                                                | "Azul" (o novo padrão)                                       |
| `pwa-e-mobile`           | CA-02, CA-06 e CA-14 (barra inferior, alvos, hover) na parte visual; e o teste das cores do manifest e do `theme-color` | CA-34 e CA-36 **desta spec** (barra e alvos) e CA-10 (cores) |
| `integracao-plataformas` | CA-41 (a linha do catálogo com "42 h · 12/40"), CA-42 (cadeia da capa), CA-51 a CA-53 na parte visual                   | CA-22, CA-39, CA-46, CA-47 desta spec                        |

## Plano de testes

- **Unitário (Vitest + Testing Library, `apiClient` mockado):**
  - `styles/tokens.test.ts` (**atualizado, não removido**): nenhum hex fora do `@theme`; os tokens novos existem e os removidos não;
    função de contraste com os números desta spec (CA-01, CA-02, CA-03, CA-60); regra de movimento reduzido e nenhum pseudo-elemento
    animado (CA-08); links de fontes (CA-05); nenhuma classe de token removida no `src`. `styles/keyframes.test.ts` segue valendo.
  - `pwa.config.test.ts` (CA-10); `shared/lib/prefs/prefs.test.ts` e `shared/lib/storage/migrations.test.ts` (a migração 1→2, entradas
    inválidas, storage bloqueado: CA-56); `PreferenciasModal.test.tsx` (cores e rótulos novos, prévias, Restaurar padrões: CA-55, CA-59).
  - `GamesPage.test.tsx` (destaque, prateleiras, filtros na URL, contagens, estados, "Adicionar" da prateleira: CA-13 a CA-30) e o teste do
    _tile_ (substituto da `GameRow`: anel, chip, linha da Steam, ações, link: CA-21 a CA-25); `resumoDoCatalogo` (já testado);
    `AnelDeNota` e o formatador de "Atualizado há" (`lib/`, CA-45); `GameCover.test.tsx` (3:4, cadeia de capas, `cover`: CA-37 a CA-41);
    `game-cover.test.ts` (o hash e as iniciais **não mudam**).
  - `AppLayout.test.tsx`, `nav-items.test.ts` e o teste da `BottomNav` (papéis, `aria-current`, alvos: CA-34, CA-35);
    `GameDetailPage.test.tsx`, `BlocoSteam.test.tsx` e `GameForm.test.tsx` (+ `GameForm.steam.test.tsx`: CA-42 a CA-54, CA-71).
  - `ModalDialog.test.tsx` (o `close` aninhado, já existe) continua.
- **Manual (`/qa-verify`, app rodando):** CA-04, CA-09, CA-24, CA-25, CA-27, CA-31, CA-32, CA-36, CA-61 a CA-70 e CA-75: contraste medido
  com verificador, 360 × 640, 390 e 1024 px, `prefers-reduced-motion` emulado, toque e hover reais, aparelhos reais (iOS e Android) e o
  app instalado. Os itens que dependem de aparelho real ficam como "pendente: aparelho real", como nas specs anteriores.

Loop de verificação por tarefa: `npm run typecheck -w @checkpoint/web` → `npm test -w @checkpoint/web` → `npm run lint` →
`npm run build` → commit. Gate completo a cada 2 commits.

## Fora de escopo

- Qualquer mudança em `apps/api`, `packages/shared`, `prisma/schema.prisma`, rotas, DTOs ou regras de negócio; dependência nova.
- **Tema claro** ou alternância claro/escuro (o app segue com tema escuro fixo).
- Layouts novos para o que não foi desenhado (perfil, login, detalhe no celular etc.): herdam a linguagem e são conferidos, não
  redesenhados.
- Novas funções: busca por texto no catálogo, ordenação por outro campo, arrastar para reordenar prateleiras, prateleira "por
  plataforma", "última vez jogado" da Steam como critério do destaque.
- Empacotar as fontes no app (self-host) e prover fonte offline (questão 2).
- Trocar os ícones instaláveis do PWA (questão 11), salvo decisão em contrário.
- Passos de processo (não são critérios): atualizar `ARCHITECTURE.md`, `README` e specs, rodar o `/qa-verify`, o deploy.

## Notas de ambiente

- Nenhuma variável de ambiente nova, nenhuma dependência nova (`RULES.md` §9), nenhuma migration de banco (`RULES.md` §3).
- **Uma migração do armazenamento local** (`STORAGE_SCHEMA_VERSION` 1 → 2, `shared/lib/storage/migrations.ts`) e a atualização de
  `PREFS_PADRAO`/`DESTAQUES` em `shared/lib/prefs/prefs.ts`.
- `docs/design/` entra no `.prettierignore` (o hook `lint-staged` roda `prettier --write` em `md`, `json` e `html` e reformataria a
  referência); é a única mudança de configuração de ferramenta desta spec.
- O `README.md`, o `ARCHITECTURE.md` (§5.5, §5.6, §5.11, §5.12, §5.13 e o parágrafo do tema) e as specs da tabela acima mudam junto de
  cada fase.

## Suposições

Tudo que a spec assumiu sem pergunta (cada uma tem um padrão razoável; corrija o que discordar):

1. **A borda de controle passa a `#606a8e`** (o desenho traz `#3a4468`, que dá 1,86:1). `#606a8e` é o menor ajuste do mesmo matiz que passa
   de 3:1 sobre os quatro fundos (mínimo 3,01 sobre `painel-3`).
2. **A cor de destaque padrão é `#4f8cff` ("Azul")** e o foco visível usa `destaque`, não `borda-controle` (mais visível: 5,49:1 sobre o
   painel).
3. **Rename dos tokens** (`ciano`, `magenta`, `ouro`, `vermelho-neon` → nomes semânticos), feito na F1 de uma vez, em vez de manter os
   nomes antigos com valores novos (um `text-ciano` azul confunde).
4. **Cor de chip de status** = texto na cor do status sobre o status a 18% (o desenho só mostra Jogando, com `#cfe0ff`); fica igual
   para os três.
5. **Chips do destaque escuros**, **trilho do anel escuro** e **coluna de texto do destaque ≤ 50%** (números na tabela).
6. **Só há chip de plataforma quando há plataforma** (como hoje; o desenho mostra "Sem plataforma" numa prateleira e nada em outras).
7. **Prateleira vazia some** com "Todos"; o "Adicionar" ao fim da prateleira abre o formulário **com o status dela**.
8. **Ordem dos botões de status do formulário** = a dos filtros (Jogando, Quero jogar, Zerado).
9. **Rótulos e apoio ≥ 12 px** (o desenho tem chips de 11 px no celular).
10. **Sombras** viram `color-mix` de `fundo` (sem `rgba`).
11. **"Atualizado há N minutos"** usa `dadosPlataforma[].atualizadoEm` (não há campo novo).
12. **A capa da Steam** (`library_600x900`, 2:3) é cortada de leve para 3:4.
13. **O destaque usa a capa do jogo** (enviada, oficial ou gerada) como fundo com o degradê escuro; o desenho só mostra a cor com a
    marca d'água das iniciais (questão 10).
14. **O `header.jpg`** sai da cadeia de capas em contextos em pé (questão 9).
15. **"Perfil" no topo do catálogo** é um `link` (o desenho mostra um botão redondo); `aria-current` da navegação vale onde há a
    navegação em pílulas (questão 7).

## Questões em aberto

**Decisões que você pediu para perguntar** (cada uma com a recomendação; responda "ok" para aceitar todas):

- [ ] **1. Preferências do perfil.**
  - **(a) Cor de destaque:** manter as quatro, com **Azul** (`#4f8cff`) no lugar do padrão magenta, **Violeta** (`capa-6`), **Rosa**
    (`capa-2`) e **Laranja** (`capa-3`), e migrar o storage (1 → 2: `magenta` e o antigo `azul` viram `azul`; `violeta` e `laranja` ficam).
    _Recomendado._ Alternativas: (i) manter o antigo `azul` (`capa-1`, azul-claro) como uma quinta cor; (ii) reduzir a três cores.
    Não dá para distinguir quem **escolheu** magenta de quem só ficou no padrão, então todos vão para o novo padrão.
  - **(b) "Efeitos reduzidos":** virar **"Animações"** (completas ou reduzidas: elevação e transições novas), mesmo valor gravado, sem
    migração. _Recomendado._ Alternativas: remover a opção (sobra só `prefers-reduced-motion`), ou mantê-la sem efeito algum.
  - **(c) "Densidade compacta":** virar **capas menores** (120 × 160 e 108 × 144), mesmo valor gravado. _Recomendado._ Alternativa:
    remover.
- [ ] **2. Fontes.** Confirmar `<link>` do Google Fonts (sem pacote npm), com `display=swap` (o desenho usa `block`, que esconde o
      texto por até 3 s numa rede lenta) e `system-ui, sans-serif` de reserva. **Efeito no PWA offline:** nenhum novo. As fontes não
      entram no precache (`runtimeCaching: []`, só o shell): offline cai a fonte do sistema, como hoje com Orbitron e Rajdhani, e os ícones
      (Material Symbols, também por `<link>`) aparecem como texto de ligadura, como hoje. Trocar isso (fontes empacotadas em `public/`,
      que o `woff2` do precache já cobriria) é um trabalho à parte. _Recomendado: confirmar assim._
- [ ] **3. Fases.** Confirmar a divisão da tabela: **F1** tokens, fontes e efeitos (layout em linhas); **F2** catálogo em estante e capa em
      pé; **F3** detalhe e formulários; **F4** herdado, conferência e fechamento. Cada uma implantável sozinha. Ponto de atenção: entre a
      F2 e a F3, o detalhe e o formulário ficam nas cores novas com os cantos antigos.

**Achados do design, com padrão sugerido:**

- [ ] **4. Prateleira com muitos jogos** (o desenho só mostra 1 a 3 por prateleira). Opções: (a) rolagem horizontal em todos os
      tamanhos (esconde jogos; no desktop o mouse rola mal; a elevação e o anel do hover são cortados se não houver folga); (b) quebra em
      linhas em todos os tamanhos (mostra tudo; a página cresce); (c) **quebra em linhas no desktop (≥ 768 px) e rolagem horizontal no
      celular**, como o desenho do celular. _Recomendado: (c)._ Com (c) a prateleira do desktop é uma grade de colunas de 150 px (o
      botão-bloco "Adicionar" fecha a última linha) e a do celular rola.
- [ ] **5. Ações no celular, sem hover.** O desenho do celular não tem Editar nem Remover no _tile_. Proposta: **o caminho é abrir o
      jogo** (o detalhe já tem Editar e Excluir), e em aparelho sem hover os botões nem são renderizados na estante. Alternativa: um botão
      "⋯" de 44 px por _tile_ abrindo uma folha com as duas ações (mais toques, mais ruído visual, mais teste).
- [ ] **6. Halo do topo.** O desenho tem um degradê radial **estático** atrás do topo de cada tela (`rgba(79,140,255,0.16 a 0.2)`), e você
      pediu "sem orbes". Proposta: manter como decoração fixa, sem animação (`color-mix` de `destaque` a 16%), sem nada em movimento;
      ou remover.
- [ ] **7. Barra superior no desktop.** O catálogo desenhado tem logo, filtros, "Adicionar jogo" e um botão de perfil, **sem** a
      navegação em pílulas (Jogos, Adicionar, Perfil) que o detalhe desenhado tem. Proposta: no catálogo, a barra do desenho; nas demais
      telas, a navegação em pílulas; o botão redondo de perfil é um `link` "Perfil"; e o `aria-current="page"` fica no logo (link para `/`)
      no catálogo. Alternativa: navegação em pílulas em todas as telas, com os filtros numa segunda fileira.
- [ ] **8. Conquistas no detalhe: `<details>` ou sempre abertas?** Hoje (`integracao-plataformas`, CA-52) "Desbloqueadas" é um `<details>`
      fechado e "Faltam" um aberto. O desenho mostra as duas abertas, lado a lado, com contador. Proposta: **manter os `<details>`** (uma
      lista de 200 itens fecha), estilizando o `summary` como o cabeçalho do desenho, e em ≥ 1024 px colocá-los em duas colunas.
      Alternativa: as duas sempre abertas (muda o CA-52).
- [ ] **9. Fallback `header.jpg`.** A cadeia da capa hoje é enviada → oficial → `header.jpg` → gerada. Numa capa em pé, o `header.jpg`
      (largo) vira um recorte do meio. Proposta: **tirar o `header.jpg`** (enviada → oficial → gerada). Alternativa: manter.
- [ ] **10. Destaque de um jogo com capa de imagem.** O desenho mostra o fundo na cor da capa gerada com as iniciais como marca d'água.
      Proposta: com capa de imagem (enviada ou oficial), usá-la como fundo, com o mesmo degradê escuro à esquerda (o contraste do texto
      vem do degradê e dos chips escuros, não da imagem). Alternativa: o destaque **sempre** com a cor e a marca d'água, ignorando a imagem.
- [ ] **11. Ícones e favicon do PWA** (`public/favicon.svg`, `public/icons/*`) são magenta sobre `#07040f`. O desenho só define o logo do
      cabeçalho. Proposta: **fora desta spec** (ficam como estão) e uma tarefa própria com o desenho dos ícones. Alternativa: incluir na F4 um
      ícone simples (a bandeira em `fundo` sobre o círculo `acento`).
- [ ] **12. "Sem plataforma" e o "Adicionar" com status.** (a) Sem plataforma: **sem chip** (padrão desta spec) ou o chip "Sem
      plataforma" do desenho. (b) O botão-bloco "Adicionar" da prateleira abre o formulário **com o status dela** (padrão desta spec, que
      para "Zerados" obriga a preencher ao menos uma nota, como já obriga hoje) ou sempre com o padrão.
- [ ] **13. Anotação do desenho** "Capa enviada · a oficial da Steam é o plano B" (sob a capa do detalhe): tratada como **anotação**, não
      como interface. Confirmar.
- [ ] **14. O destaque é "o último Jogando por `atualizadoEm`".** Editar qualquer campo de um jogo (até a descrição) o torna o destaque,
      porque toda edição atualiza `atualizadoEm`; e a "última vez jogado" da Steam não entra. É a regra que você definiu; registrado como
      consequência.
