# Spec: plataformas (base global), página do jogo em seções e aba Plataformas no perfil

> Status: ✅ aprovada (2026-09-26, com as respostas de "Decisões tomadas"). Estende
> `integracao-plataformas` (não a substitui) e mexe só na **apresentação** da `troca-de-design-estante`.

## Objetivo

Dar ao checkpoint uma **base global de plataformas** (cadastro único + componente de marca) para que PlayStation, Xbox e
Epic entrem depois **sem refazer telas**; e, em cima dela, reorganizar a **página do jogo** em seções que abrem e fecham,
mostrar o **selo da plataforma** nas capas da estante e criar no perfil a aba **Plataformas** com um **popup** de
informações da conta (a da Steam, hoje).

## Stack

Padrão da casa. O que se confirma:

- **Nenhuma dependência nova** (`RULES.md` §9): `<details>` nativo, `<dialog>` nativo (`ModalDialog`), `Intl` nativo.
- **Logos como arquivos estáticos em `apps/web/public/plataformas/<slug>.svg`** (ver "Marca e logos"). Motivo: o
  `tokens.test.ts` proíbe hex fora do `@theme` no **código-fonte** do web, e a marca de terceiros **não pode mudar de cor
  nem ser redesenhada**; um arquivo em `public/` é dado, não código, e o Service Worker já o pré-cacheia. SVG com tokens
  (`currentColor`) só serve a logo monocromática que a regra da marca permitir.
- Preferência de seção aberta/fechada: uma chave nova em `shared/lib/storage` (`defineKey`), **só no aparelho**.
- **Nenhuma animação, skeleton, toast, Chek ou marca nova** (outra sessão, `checkpoint-chek`). Estados vazios e de erro
  ficam simples, com os textos e componentes que já existem; a integração com o Chek é depois do merge.

## Estado de hoje (o que a spec preserva)

- Já é **genérico**: `PROVEDORES`/`Provedor`/`PROVEDOR_SLUG` no `shared`; rotas `/api/integracoes/:provedor/...` com
  `ProvedorSlugPipe` e `ProviderRegistry`; a interface `GameProvider`; os erros `PLATAFORMA_*` e **os textos web deles**
  (`auth-errors.ts` não cita "Steam"); `ContaVinculada` e `JogoPlataforma` com `provedor`; unicidade **por jogo + provedor**
  (`@@unique([gameId, provedor])`) e `Game.dadosPlataforma` já é **lista**.
- **Steam colada nas telas** (o que a Parte A remove): `'STEAM'` literal em `use-integracoes.ts` (`useTemContaSteam`),
  `GameForm.tsx` (`useVincularJogo('STEAM')`), `BlocoSteam`, `ContaSteamCard`, `BibliotecaSteamDialog`, `avisos-steam.ts`;
  o `GameTile` mostra o ícone `sports_esports` genérico no resumo "42 h · 12/40"; `GameDetail` só desenha
  `dadosPlataforma.length > 0 && <BlocoSteam/>` (um bloco só, mesmo com vários vínculos).

## Parte A — Base global de plataformas

### Cadastro central (`packages/shared/src/plataformas.ts`, só dados)

```ts
export type CapacidadePlataforma =
  'horas' | 'conquistas' | 'biblioteca' | 'ultimaVezJogado' | 'nivel';

export interface PlataformaInfo {
  id: Provedor; // 'STEAM' | (futuro) 'PLAYSTATION' | 'XBOX' | 'EPIC'
  slug: string; // o :provedor das rotas
  nome: string; // "Steam"; texto de tela
  nomeAcessivel: string; // "Steam" (alt/aria-label); permite "PlayStation Network" etc.
  disponivel: boolean; // true só para quem tem GameProvider na API
  capacidades: readonly CapacidadePlataforma[];
  logo: {
    arquivo: string;
    largura: number;
    altura: number;
    variantes: ('icone' | 'completa')[];
  } | null;
  /** Como o texto da conta é chamado ("Conta Steam", "Gamertag"...). */
  rotuloDaConta: string;
}
export const PLATAFORMAS: Record<Provedor, PlataformaInfo>;
export const PLATAFORMAS_EM_ORDEM: readonly PlataformaInfo[];
export function plataformaPorId(id: Provedor): PlataformaInfo;
export function temCapacidade(id: Provedor, c: CapacidadePlataforma): boolean;
```

- Sem `window`, Node ou `@prisma/client` (`ARCHITECTURE.md` §6). `PROVEDORES` e `PROVEDOR_SLUG` passam a ser **derivados**
  do cadastro (uma fonte só). O `Record<Provedor, ...>` faz o typecheck **quebrar** se um provedor novo entrar sem cadastro.
- Steam: `capacidades: ['horas', 'conquistas', 'biblioteca', 'ultimaVezJogado', 'nivel']`. O `nivel` é a capacidade do
  popup (Parte C); as telas perguntam `temCapacidade(...)`, nunca `provedor === 'STEAM'`.
- **PlayStation, Xbox e Epic não entram no cadastro na F1**: `Provedor` (banco e `shared`) só ganha o valor quando a
  plataforma tiver `GameProvider`. A aba "Em breve" (Q2) precisa de uma lista **à parte** só de apresentação
  (`PLATAFORMAS_EM_BREVE: { nome, logo }[]`), para o enum não ganhar valor sem provider.

### Componente único de marca (`apps/web/src/shared/components/PlataformaMarca.tsx`)

- Props: `provedor: Provedor`, `variante: 'icone' | 'completa'`, `tamanho` (`p` 16 · `m` 20 · `g` 28 px de altura), `className`.
- `'icone'`: só a logo, `role="img"` com `aria-label={nomeAcessivel}`. `'completa'`: logo + `nome` em texto (o nome é
  texto real, então a logo vira decorativa `alt=""` para não ler duas vezes).
- Lê **só** o cadastro (`plataformaPorId`); **nenhum** `if (provedor === ...)`. Um teste (`sem-provedor-solto.test.ts`,
  no molde de `no-direct-access.test.ts`) falha se `'STEAM'` ou `"steam"` aparecer em `apps/web/src` fora de `shared/` e
  fora dos testes e do `api/` de integrações (os literais que restarem são as rotas, via `slug`).
- Imagem: `<img src="/plataformas/steam.svg" width height loading="lazy" decoding="async">`, sem `referrerPolicy` (é do
  próprio site). Falha ao carregar → cai no nome em texto (o nome nunca some).
- **Onde aparece** (trocando o que existe): selo do `GameTile` (F1); título e resumo das seções (F2); linhas e botão
  "Vincular" da aba (F3); cabeçalho do popup (F4); botão e título de `BibliotecaSteamDialog`, "Buscar na Steam"/"Vincule
  sua Steam no perfil" do `GameForm`, o cartão "Ligado à Steam", os avisos de retorno e de privacidade (F1, por serem
  pequenos).

### Marca e logos (verificado em `partner.steamgames.com/doc/marketing/branding`, 2026-09-26)

- **De onde vêm:** a Valve publica o pacote **"Steam Brand Guidelines e Logos"** (`steam_brandGuidelines.pdf` +
  `steam_brandAssets.eps`, atualizado em dez/2024). **Não há SVG oficial**: o arquivo oficial é **EPS/PDF vetorial**.
  Converter EPS → SVG **sem alterar o desenho** (só mudança de formato, feita pelo humano no Inkscape ou similar) é a
  proposta; redesenhar é proibido.
- **Regras da Valve** (da própria página): usar só o artwork aprovado; **o logo "deve ficar sozinho" e "não pode ser
  combinado com nenhum objeto, incluindo logos, palavras, gráficos ou símbolos"**; a marca leva o **®** e uma atribuição
  legal específica (o texto exato está no PDF, que **eu não li**: o humano confere).
- **Consequência de design (a decisão mais importante da Parte A):** a variante `'completa'` (logo **ao lado do nome
  em texto**) **combina o logo com palavras**, o que a regra parece vetar. Proposta: para a Steam, `'completa'` renderiza
  **o logo oficial sozinho** (ele já traz o "STEAM") mais o nome só como texto **visualmente oculto** (`sr-only`) para o
  leitor de tela e sem nenhum texto colado a ele; onde a interface precisa do nome legível (título de seção), o nome
  fica **separado** do logo por espaço e hierarquia (mesma linha, mas não "lockup"). Ver Q5b.
- **Onde ficam versionados:** o original oficial em `docs/design/plataformas/steam/` (EPS + PDF, **sem editar**, na
  `.prettierignore` como a pasta do design) com um `README.md` (fonte, data do download, versão do pacote, texto legal);
  a conversão em `apps/web/public/plataformas/steam.svg`. **Quem baixa, converte e versiona é o humano** (o agente não
  tem como baixar o pacote da Valve nem deve inventar o desenho). **Até lá, a F1 usa um marcador neutro**
  (`public/plataformas/_generico.svg`, quadrado com a inicial via `currentColor`) e o teste de `PlataformaMarca` roda com ele.
- **PlayStation, Xbox, Epic:** cada uma tem regra própria (não verificada aqui); ao entrar, a spec dela cita a fonte e o
  arquivo oficial, no mesmo padrão. Nenhum logo delas é adicionado agora.

### O que muda no backend para ser realmente genérico

| Item                                             | Hoje                                                                             | Para uma 2ª plataforma                                                                                                           | Tipo       |
| ------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `enum Provedor` (Prisma)                         | `STEAM`                                                                          | `ALTER TYPE ... ADD VALUE` (por `/db-change`)                                                                                    | aditivo    |
| `GET/POST/PUT/DELETE /integracoes/:provedor/...` | genéricas; `ProvedorSlugPipe`, `ProviderRegistry`                                | nada (registrar o provider em `GAME_PROVIDERS`)                                                                                  | **pronto** |
| Erros `PLATAFORMA_*` e textos                    | genéricos (`auth-errors.ts` já fala "plataforma"); `campo: 'steamId' \| 'appId'` | `IdExternoInvalidoError.campo` vira `'idConta' \| 'idItem'` (rótulo neutro); nada mais                                           | pequeno    |
| `GameProvider`                                   | 4 métodos (vínculo, biblioteca, jogo, detalhe)                                   | **acrescentar `obterResumoDaConta` opcional** (a F4), declarado por `capacidades`; provider sem a capacidade não o implementa    | aditivo    |
| Cache e limites                                  | `TtlCache` por SteamID; limite por usuário e rota                                | chave do cache passa a `provedor:idExterno` (hoje é só o SteamID, seguro porque só há Steam)                                     | pequeno    |
| `ContaVinculada` / `JogoPlataforma`              | `@@unique([userId, provedor])`, `@@unique([gameId, provedor])`                   | **nada**: já é uma conta por provedor e uma ligação por jogo+provedor                                                            | **pronto** |
| Vínculo OpenID/`state`                           | `typ: 'vinculo'`, `prov` no state                                                | PlayStation/Xbox usam OAuth (outro fluxo): cada provider implementa `iniciarVinculo`/`concluirVinculo`; o contrato já isola isso | **pronto** |
| `Game.plataforma` (texto livre)                  | independente de `Provedor` (chip)                                                | continua independente: "PC" com ligação Steam é normal (regra da confirmação de plataforma, já existe)                           | **pronto** |

**Nesta spec o schema NÃO muda** (só Steam existe): a mudança de `enum` fica para a spec da 2ª plataforma, via
`/db-change`, e é aditiva. A única mudança de contrato de rota é a da F4 (abaixo).

## Parte B — Página do jogo em seções (`/jogos/:id`, F2)

Sem rota nova. Os arquivos tocados são `GameDetail.tsx` (a coluna do meio) e `BlocoSteam.tsx`; **o cabeçalho (capa, título,
chips, anel, Editar/Excluir) não muda**, para reduzir o conflito com a branch do Chek.

- **Seções** (`SecaoRecolhivel`, novo em `features/games/components/`): `<details>` nativo com `<summary>` de `min-h-11`,
  seta (`expand_more`, gira 180° **sem transição**, então não depende de movimento) e o **resumo na linha fechada**.
  1. **"Avaliação e descrição"**: média (`AnelDeNota` `grande`), os 5 critérios (`BarraDeCriterio`) e a descrição (ou o
     convite "Adicionar descrição"). Resumo fechado: "Média 8,3 · 4 critérios" (ou "Sem nota").
  2. **Uma seção por `dadosPlataforma`**, na ordem do cadastro (`PLATAFORMAS_EM_ORDEM`), com `PlataformaMarca` e o nome no
     título. Resumo fechado (só o que a **capacidade** da plataforma entrega): "Steam · 42 h 30 min · 12/40 conquistas".
     O corpo é o `BlocoSteam` de hoje (horas, último jogo, barra, Atualizar, Desvincular, Abrir na Steam) **sem mudar**.
  - **Vários vínculos:** uma seção por plataforma, empilhadas; sem o vínculo, nenhuma seção daquela plataforma (o
    "Vincular à Steam" continua nas ações). A ordem com 2 ou mais é a do cadastro (Q6).
- **Conquistas dentro da seção da plataforma que tem a capacidade `conquistas`:** "Desbloqueadas (N)" e "Faltam (N)",
  **as duas fechadas por padrão** (hoje "Faltam" abre), cada `<summary>` com seta e o texto **"Toque para ver"** ao lado
  do contador (troca para "Toque para fechar" aberto, sem depender de cor). Continuam: a conquista **oculta** ("Conquista
  oculta" enquanto bloqueada), a **raridade** ("12,4% dos jogadores" / "Raridade indisponível"), a ordenação, o ícone.
  Lista vazia não renderiza o `<details>` (como hoje).
- **Estado guardado só no aparelho:** chave `checkpoint:secoes-do-jogo` (`defineKey`, escopo `dispositivo`, valor
  `Record<string, boolean>`; chaves `avaliacao`, `plataforma:steam`, `conquistas:steam:desbloqueadas`,
  `conquistas:steam:faltam`) **por tipo de seção, não por jogo** (abrir num jogo vale para todos; ver Q4). Padrões:
  ver Q4. Armazenamento bloqueado/corrompido → padrões, sem erro (o módulo de storage já garante). Nunca vai à API.
- **Erro e vazio simples:** os avisos discretos que já existem (privado, indisponível, sem conquistas) ficam **dentro** da
  seção, no lugar de hoje; sem Chek.
- **A11y:** `<summary>` é botão nativo (`aria-expanded` implícito), foco visível (`focus-visible:ring` em `destaque`),
  ≥ 44 px, o resumo está **dentro** do `<summary>` (lido junto), a seta é `aria-hidden`. `prefers-reduced-motion`:
  nenhuma animação nova (a seta gira sem transição), então nada a desligar.

### Selo da plataforma no tile (F1)

- **Só o ícone** da(s) plataforma(s), `PlataformaMarca variante='icone'` `tamanho='p'`, dentro de uma pílula `capa-chip`
  (o mesmo fundo escuro translúcido do chip de plataforma). **Posição: canto inferior direito da capa**, mas em **aparelho com
  hover** as ações Editar/Remover ocupam esse canto: lá o selo **sobe** para o canto **superior esquerdo** (o anel da média
  é o superior direito, o chip de plataforma cadastrada é o inferior esquerdo). Regra única, sem `if` de plataforma:
  selo **inferior direito**, e `.tile-acoes` (que já é `display:none` fora de hover) o cobre só em `:hover`/`:focus-within`
  com o selo escondido (`group-hover`) enquanto as ações aparecem. Ver Q1.
- **Mais de uma ligação:** os selos entram lado a lado (na ordem do cadastro), **no máximo 2 visíveis**; do 3º em diante
  vira **"+N"** (chip com o total no `aria-label`: "Ligado a Steam, PlayStation e mais 1"). Com 1 só, só o selo.
- **Acessível:** o conjunto é **um** `role="img"` no tile com `aria-label` "Ligado à Steam" / "Ligado a Steam e Xbox"
  (não um por logo); o resumo "42 h · 12/40" continua como está, agora com a logo em lugar do `sports_esports`.
- Não consulta a plataforma: vem de `game.dadosPlataforma` (já na lista). O tile de jogo sem ligação não muda.

## Parte C — Perfil, aba "Plataformas" (F3 e F4)

`/perfil` ganha, no lugar da seção "Contas vinculadas", a seção **Plataformas** (mesma posição: entre "Conta" e
"Preferências"; a decisão é seção, **não aba de tabs**, porque o `/perfil` é uma coluna de linhas e a única tela com abas
é o modal de preferências). Uma linha por plataforma do cadastro (`PLATAFORMAS_EM_ORDEM`), 56 px, no molde de
`ListaDeLinhas`.

- **Vinculada** (minimizada): `PlataformaMarca` (ícone), nome da conta (`nomeExibicao`), "atualizado há X" (o
  `tempo-relativo` que já existe, a partir do `consultadoEm` do resumo; **sem chamar a plataforma para desenhar a linha**:
  usa o `nomeExibicao` da `ContaVinculada` e, se o resumo já estiver no cache do TanStack, o horário dele; senão "—"
  discreto) e uma seta. **A linha inteira é um botão** que abre o popup.
- **Não vinculada** e `disponivel`: logo, nome e o botão **"Vincular"** (`min-h-11`, com a logo da plataforma dentro do
  botão; nome acessível "Vincular conta Steam"). Só a Steam funciona.
- **Não suportadas** (PlayStation, Xbox, Epic): "Em breve", sem botão ativo (**se** a Q2 for "mostrar"); linha com
  `aria-disabled`, sem foco em botão morto.
- O `ContaSteamCard` atual **é substituído** (seus estados de privacidade e erro migram para o popup e para a linha;
  o aviso do retorno `?steam=` continua igual em `PerfilPage`).
- **Popup** (`PlataformaDialog`, `ModalDialog` existente: Esc, foco preso, folha inferior no celular): o **conteúdo vem
  de uma lista de blocos por capacidade**, não de `if` por plataforma; o da Steam (`ResumoSteam`) é o primeiro.

### Popup da Steam (F4) — blocos

Cada item abaixo diz **de onde vem**, se **exige perfil público** e se **está confirmado**. O aviso de privacidade é o
que já existe ("Seu perfil Steam está privado", passo a passo, "Tentar de novo"): mostrado no lugar dos blocos que
dependem dele; o cabeçalho e as ações continuam.

| Bloco                                                 | Fonte                                                                           | Público? | Confirmação                                                                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cabeçalho: avatar, nome, link "Abrir perfil"          | `GetPlayerSummaries` (já no cache)                                              | não      | já em produção                                                                                                                                                             |
| "Na Steam desde <ano>", status online/offline/em jogo | `GetPlayerSummaries`: `timecreated`, `personastate`, `gameextrainfo`            | **sim**  | **falta fixture real.** `timecreated` só vem com perfil público; `personastate` é o estado que o próprio perfil expõe                                                      |
| Nível Steam e XP                                      | `GetBadges` → `player_level`, `player_xp` (+ `player_xp_needed_to_level_up`)    | sim      | doc oficial confirma o método e a chave, **não** o corpo. **Proposta:** só `GetBadges` (traz o nível), **sem `GetSteamLevel`** (uma chamada a menos); confirmar no fixture |
| Números: jogos, horas totais, já jogados              | biblioteca (`GetOwnedGames`, já no cache); já jogados = `playtime_forever > 0`  | sim      | já em produção                                                                                                                                                             |
| Atividade recente (2 semanas)                         | `GetRecentlyPlayedGames` (`count` opcional) → `playtime_2weeks`                 | sim      | doc oficial confirma o método e `count`; **corpo a confirmar por fixture**                                                                                                 |
| Mais jogados de sempre (top 5)                        | biblioteca já no cache, ordenada por `playtime_forever`                         | sim      | já em produção (hoje top 3)                                                                                                                                                |
| Backlog: nunca abertos, %, "Ver e importar"           | biblioteca no cache; `playtime_forever == 0`                                    | sim      | já em produção. "Ver e importar" abre o `BibliotecaSteamDialog` com o filtro **nunca jogados** (rota nova, abaixo)                                                         |
| "X dos seus Y jogos já estão no checkpoint"           | interseção entre a biblioteca (Y) e os `JogoPlataforma` do usuário no banco (X) | não      | 0 chamada à Steam                                                                                                                                                          |
| Conquistas (total em N jogos vinculados)              | soma gravada no banco (já é o do cartão)                                        | não      | 0 chamada à Steam                                                                                                                                                          |
| Ações: Atualizar, Importar, Desvincular               | rotas que já existem                                                            | —        | já em produção (30 s de intervalo mínimo; confirmação do Desvincular)                                                                                                      |

**Fora do popup, de propósito:** bloqueios (VAC), lista de amigos, preço, gênero e qualquer dado de loja não oficial.

**Custo e cota** (mesmo cache de 10 min por SteamID e mesmo limite por usuário, 30/min por rota):

| Situação                       | Chamadas à Steam                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Popup a **frio**               | **4**: `GetPlayerSummaries` + `GetOwnedGames` (as de hoje) **+** `GetBadges` **+** `GetRecentlyPlayedGames` (5 se mantivermos `GetSteamLevel`) |
| Popup a **quente** (≤ 10 min)  | **0** (tudo do cache; X-de-Y e conquistas vêm do banco)                                                                                        |
| Só desenhar a **linha** da aba | **0** (usa `ContaVinculada` e o cache se houver)                                                                                               |
| **Atualizar** (≥ 30 s)         | ignora o cache e refaz as 4; antes de 30 s devolve o que tem, sem chamar                                                                       |

As duas chamadas novas ficam num `CarregadorEmCache` novo (`NIVEL_E_ATIVIDADE_CACHE_TTL_MS = 10 min`, chave por SteamID,
junção de chamadas simultâneas, erro não entra no cache). **Se uma das duas falhar, o popup abre sem aquele bloco**
(nível ou atividade recente), como o schema de conquistas já faz (`enfeite`), sem derrubar o resto.

## Requisitos de saída

### `packages/shared`

- `plataformas.ts` (acima); `integracoes.ts` ganha `ResumoContaPlataforma` (F4) e `PROVEDORES`/`PROVEDOR_SLUG` derivados.

```ts
export interface ResumoContaPlataforma {
  provedor: Provedor;
  nomeExibicao: string;
  avatarUrl: string | null;
  perfilUrl: string | null;
  membroDesde: number | null; // ano (timecreated); null se privado/ausente
  status: 'online' | 'offline' | 'jogando' | null;
  jogandoAgora: string | null; // gameextrainfo; só com status 'jogando'
  nivel: { valor: number; xp: number; xpParaProximo: number | null } | null;
  totalJogos: number;
  minutosTotais: number;
  jogosJogados: number;
  nuncaJogados: number; // backlog; % calculada no web
  maisJogados: {
    idExterno: string;
    titulo: string;
    capaUrl: string | null;
    minutosJogados: number;
  }[]; // até 5
  recentes: {
    idExterno: string;
    titulo: string;
    capaUrl: string | null;
    minutos2Semanas: number;
  }[];
  noCheckpoint: { ligados: number; naBiblioteca: number };
  conquistas: { desbloqueadas: number; total: number; jogosVinculados: number };
  consultadoEm: string; // ISO 8601
}
```

### API (única rota nova; `apps/api/src/modules/integrations/`, guard global, limite por usuário)

- **`GET /api/integracoes/:provedor/resumo`** → 200 `ResumoContaPlataforma`. `POST /api/integracoes/:provedor/resumo/atualizacao`
  (mínimo 30 s, como o do perfil). Erros: 401 sem token; 400 `VALIDACAO` (provedor desconhecido, pelo
  `ProvedorSlugPipe`); 409 `PLATAFORMA_NAO_VINCULADA`; 409 `PLATAFORMA_PERFIL_PRIVADO`; 502 `PLATAFORMA_INDISPONIVEL`;
  429 `LIMITE_TENTATIVAS`. `GET /perfil` (cartão) **continua** e é o que a linha da aba usa (`consultadoEm`).
- **`GET .../biblioteca?nuncaJogados=true`** (parâmetro novo, booleano estrito): só itens com `minutosJogados === 0`.
  Valor não booleano → 400 `VALIDACAO`. Mesma rota, mesmo cache.

### Web (campos e estados)

- **Tile:** selo (1 a 2 logos, "+N"), posições e `aria-label` acima; sem selo no jogo sem ligação.
- **Página do jogo:** seções na ordem "Avaliação e descrição" → uma por plataforma; resumo na linha fechada; conquistas
  fechadas com "Toque para ver".
- **Perfil:** seção **Plataformas** com uma linha por plataforma; popup com os blocos da tabela acima, na ordem: cabeçalho,
  nível e XP, números, atividade recente, mais jogados, backlog, no checkpoint, conquistas, ações.

## Modelo de dados

**n/a nesta spec** (nenhum campo, tabela ou enum muda). A adição do valor de `Provedor` da 2ª plataforma é **aditiva**
(`ALTER TYPE ... ADD VALUE`) e passa por `/db-change` na spec dela.

## Contrato compartilhado

`PLATAFORMAS`, `PlataformaInfo`, `CapacidadePlataforma`, `plataformaPorId`, `temCapacidade`, `PLATAFORMAS_EM_BREVE` e
`ResumoContaPlataforma` em `packages/shared/src`. Depois de editar, `npm run build -w @checkpoint/shared`.

## Critérios de aceite (testáveis, em BDD)

### F1 — cadastro, marca e selo no tile

- [ ] **CA-01** — **Dado** o `shared` buildado, **quando** rodo `npm run typecheck`, **então** passa, **e** acrescentar
      um valor a `PROVEDORES` sem cadastro em `PLATAFORMAS` faz o typecheck falhar.
- [ ] **CA-02** — **Dado** o cadastro, **quando** leio `PLATAFORMAS.STEAM`, **então** tem `id`, `slug: 'steam'`, `nome`, `capacidades`
      com `horas`, `conquistas`, `biblioteca`, `ultimaVezJogado` e `nivel`, e `logo` apontando para um arquivo que **existe** em `apps/web/public/`.
- [ ] **CA-03** — **Dado** `<PlataformaMarca provedor="STEAM" variante="icone" />`, **então** há um `role="img"` com nome
      acessível "Steam"; **dado** `variante="completa"`, **então** o nome "Steam" aparece uma vez para o leitor de tela (a logo é decorativa) e o
      layout segue a decisão da Q5b.
- [ ] **CA-04** — **Dado** o código-fonte do web, **quando** rodo o teste `sem-provedor-solto`, **então** falha se `'STEAM'`
      ou `"steam"` aparecer fora das exceções nomeadas (e passa no código final).
- [ ] **CA-05** — **Dado** um jogo com `dadosPlataforma` de 1 provedor, **quando** o tile aparece na estante, **então** há um selo
      com a logo e `aria-label="Ligado à Steam"`, dentro da capa, **sem** sobrepor o anel da média nem o chip de plataforma (bounding boxes disjuntas no teste de layout e na conferência a 360 e 1280 px).
- [ ] **CA-06** — **Dado** um jogo com 3 ligações (dado sintético, com 2 provedores fictícios só no teste), **então** o tile mostra 2 selos e "+1", com `aria-label` listando os nomes.
- [ ] **CA-07** — **Dado** um jogo sem `dadosPlataforma`, **então** o tile não tem selo e fica igual ao de hoje.
- [ ] **CA-08** — **Dado** aparelho com hover, **quando** passo o mouse ou foco no tile, **então** Editar/Remover aparecem e o selo não fica escondido por baixo (some enquanto as ações estão visíveis).
- [ ] **CA-09** — **Dado** `styles/tokens.test.ts`, **então** continua passando (nenhum hex fora do `@theme`), e nenhum `.svg` de `public/plataformas/` é referenciado por cor do código.

### F2 — página do jogo em seções

- [ ] **CA-10** — **Dado** `/jogos/:id` de um jogo ligado, **então** há uma seção "Avaliação e descrição" (com o anel da média, os 5 critérios e a descrição) e uma seção da Steam com a logo e "Steam" no título.
- [ ] **CA-11** — **Dado** a seção da Steam **fechada** para um jogo com 42 h 30 min e 12 de 40 conquistas, **então** a linha mostra "Steam · 42 h 30 min · 12/40 conquistas".
- [ ] **CA-12** — **Dado** a seção da Steam de um jogo com conquistas, **quando** a abro pela primeira vez, **então** "Desbloqueadas (N)" e "Faltam (N)" estão **fechadas**, cada uma com seta e o texto "Toque para ver".
- [ ] **CA-13** — **Dado** "Faltam (N)" aberta, **então** a conquista oculta e bloqueada mostra "Conquista oculta" e cada conquista mostra "% dos jogadores" ou "Raridade indisponível".
- [ ] **CA-14** — **Dado** que abri "Faltam" e recarreguei a página, **então** ela abre como deixei; **dado** o armazenamento bloqueado, **então** abre no padrão e não há erro.
- [ ] **CA-15** — **Dado** o corpo do `checkpoint:secoes-do-jogo`, **quando** faço `GET`/`PATCH` em qualquer rota da API, **então** nada dele trafega (a chave só existe no `localStorage`).
- [ ] **CA-16** — **Dado** um jogo com duas ligações (teste com dado sintético), **então** aparecem duas seções na ordem do cadastro, cada uma com a sua logo.
- [ ] **CA-17** — **Dado** o teclado, **quando** Tab até o título de uma seção e Enter/Espaço, **então** abre e fecha, com foco visível e alvo ≥ 44 px.
- [ ] **CA-18** — **Dado** conquistas privadas, Steam indisponível ou jogo sem conquistas, **então** o aviso que já existe aparece **dentro** da seção, com as horas mantidas.
- [ ] **CA-19** — **Dado** Desvincular confirmado na seção, **então** a seção some e o "Vincular à Steam" volta (regressão do CA-54 de `integracao-plataformas`).
- [ ] **CA-20** — **Dado** `/jogos/:id` inexistente ou de outro usuário, **então** a mensagem "Jogo não encontrado" continua igual.

### F3 — aba Plataformas

- [ ] **CA-21** — **Dado** `/perfil` com a Steam vinculada, **então** a seção **Plataformas** tem uma linha da Steam com a logo, o nome da conta e "atualizado há X", e a linha inteira é um botão de ≥ 44 px.
- [ ] **CA-22** — **Dado** sem vínculo, **então** a linha mostra a logo, "Steam" e o botão "Vincular" (nome acessível "Vincular conta Steam") que leva à Steam (`vinculo`, como hoje).
- [ ] **CA-23** — **Dado** as plataformas não suportadas e a resposta da Q2 = mostrar, **então** cada uma aparece "Em breve", **sem** botão ativo e com `aria-disabled`; com a resposta = esconder, **então** não aparece nenhuma.
- [ ] **CA-24** — **Dado** o retorno `/perfil?steam=vinculada` ou `?steam=erro&motivo=…`, **então** o aviso é o mesmo de hoje e a URL é limpa (regressão).
- [ ] **CA-25** — **Dado** a linha da Steam, **quando** abre `/perfil`, **então** **nenhuma** chamada à Steam é feita só para desenhá-la (teste: 0 chamadas ao `SteamClient`).
- [ ] **CA-26** — **Dado** 360 e 1280 px, **então** não há rolagem horizontal e o nome longo da conta trunca.

### F4 — popup da Steam

- [ ] **CA-27** — **Dado** a Steam vinculada e pública (mock), **quando** `GET /api/integracoes/steam/resumo`, **então** 200 com `ResumoContaPlataforma`: `totalJogos`, `minutosTotais`, `jogosJogados`, `nuncaJogados`, `maisJogados` com no máximo 5 (ordem decrescente), `recentes` e `noCheckpoint`.
- [ ] **CA-28** — **Dado** o `resumo` a frio, **então** a Steam recebe **exatamente** `GetPlayerSummaries`, `GetOwnedGames`, `GetBadges` e `GetRecentlyPlayedGames` (contagem no mock); **dado** a segunda consulta em menos de 10 min, **então** **0** chamadas.
- [ ] **CA-29** — **Dado** `POST .../resumo/atualizacao` duas vezes em 30 s, **então** a 1ª refaz as chamadas e a 2ª devolve o que tem sem chamar a Steam.
- [ ] **CA-30** — **Dado** `GetBadges` **ou** `GetRecentlyPlayedGames` falhando (timeout, 5xx), **então** 200 com `nivel: null` ou `recentes: []` e o resto do resumo intacto.
- [ ] **CA-31** — **Dado** perfil privado, **então** 409 `PLATAFORMA_PERFIL_PRIVADO` e o popup mostra o aviso de privacidade que já existe, com **Tentar de novo**, **mantendo** o cabeçalho e as ações. _(Fica `[~]` até o fixture real do CA-63 de `integracao-plataformas`.)_
- [ ] **CA-32** — **Dado** o `resumo` sem token, **então** 401; provedor `xbox`, **então** 400 `VALIDACAO`; sem vínculo, **então** 409 `PLATAFORMA_NAO_VINCULADA`; Steam fora do ar, **então** 502 sem SteamID nem chave no corpo ou no log.
- [ ] **CA-33** — **Dado** `GET .../biblioteca?nuncaJogados=true`, **então** só itens com 0 minutos; **com** `nuncaJogados=talvez`, **então** 400 `VALIDACAO`.
- [ ] **CA-34** — **Dado** o popup, **então** mostra na ordem: cabeçalho (avatar, nome, "Na Steam desde <ano>", status, "Abrir perfil na Steam" com `rel="noopener noreferrer"`), nível e XP, números, atividade recente, mais jogados (5), backlog com %, "X dos seus Y jogos já estão no checkpoint", conquistas "em N jogos vinculados" e as ações.
- [ ] **CA-35** — **Dado** o backlog com 120 nunca abertos de 400 jogos, **então** mostra "120 nunca abertos · 30%", e **Ver e importar** abre o diálogo da biblioteca já filtrado.
- [ ] **CA-36** — **Dado** o popup, **então** **não** há VAC, amigos, preço nem gênero (busca por esses textos no DOM do teste).
- [ ] **CA-37** — **Dado** Desvincular, **então** pede confirmação com o texto do que acontece (ligações e horas somem; jogos, notas e capas ficam) e o foco em Cancelar.
- [ ] **CA-38** — **Dado** o popup aberto, **então** Esc fecha e o foco volta à linha que abriu; em 360 px é folha inferior sem rolagem horizontal.
- [ ] **CA-39** — **Dado** `git grep STEAM_API_KEY apps/web`, **então** sem resultado (regressão do CA-59).

### Transversais (cada fase)

- [ ] **CA-40** — **Dado** o fim de cada fase, **então** `npm run typecheck`, `npm test`, `npm run lint` e `npm run build` passam **e** a conferência visual a 360 e 1280 px (API mockada; sem tocar no Supabase nem nas portas 3333 e 5173) foi feita nas telas mudadas.
- [ ] **CA-41** — **Dado** `prefers-reduced-motion` ou animações "Reduzidas", **então** nenhuma animação nova existe nas telas mudadas.
- [ ] **CA-42** — **Dado** um teste HTTP de contrato (o de `Contrato web ↔ API`), **então** o `resumo` real, com fixtures sanitizados, valida contra `ResumoContaPlataforma`.

## Plano de testes

- **Vitest (web):** `plataformas.test.ts` (no `shared`, via o runner do web ou um teste do web que importa o cadastro, já que o `shared` não tem runner), `PlataformaMarca.test.tsx`, `sem-provedor-solto.test.ts`, `estante.test.tsx` (selo), `SecaoRecolhivel.test.tsx` + `GameDetail.test.tsx` (seções, "Toque para ver", persistência com armazenamento falho), `PlataformasPerfil.test.tsx`, `PlataformaDialog.test.tsx` (blocos, privacidade, Desvincular), `tokens.test.ts`.
- **Jest (api):** `steam.client.spec.ts` (`GetBadges`, `GetRecentlyPlayedGames` com **fixtures reais e sanitizados**; o SteamID não entra), `steam.provider.spec.ts` (resumo, falha parcial), `integrations.service.spec.ts`, `integrations.http.spec.ts` (`resumo`, 401/400/409/429/502, filtro `nuncaJogados`), `fixtures.spec.ts` (sem SteamID nem chave).
- **Manual (por fase, 360 e 1280 px, API mockada):** tile com selo (com e sem hover), página do jogo com seções, aba Plataformas, popup. Sem Supabase, sem portas 3333 e 5173 (usar portas próprias do worktree).

Loop por fase: `npm run typecheck` → `npm test` → `npm run lint` → `npm run build` → **um commit por fase**.

## Fases (proposta final; cada uma é implantável sozinha)

| Fase | Entrega                                                                                                                                   | Toca                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| F1   | Cadastro (`shared`), `PlataformaMarca`, marcador neutro, selo no tile, troca dos `'STEAM'` soltos, "Buscar na Steam" e avisos com a marca | `shared`, `shared/components`, `GameTile` (+ imports), `GameForm`, `BibliotecaSteamDialog` |
| F2   | `SecaoRecolhivel`, página do jogo em seções, conquistas fechadas com "Toque para ver", preferência local                                  | `GameDetail`, `BlocoSteam`, `storage`                                                      |
| F3   | Seção **Plataformas** do perfil (linhas, "Vincular" com a logo, "Em breve" conforme Q2), sem popup                                        | `PerfilPage`, `ContasVinculadas`, `ContaSteamCard` (sai)                                   |
| F4   | `GET .../resumo`, `POST .../resumo/atualizacao`, `nuncaJogados`, cache, fixtures, popup e fechamento (docs, INDEX)                        | `apps/api` integrations, `shared`, `PlataformaDialog`                                      |

**Conflito com a branch do Chek:** `GameTile` e `GameDetail` são os arquivos em comum. Regra: o selo entra como **um bloco novo e
isolado** dentro da `div.tile-capa` (`SeloDePlataformas`, componente próprio), e as seções envolvem o conteúdo existente **sem
reescrevê-lo** (`SecaoRecolhivel` em volta do `BarraDeCriterio`/`BlocoSteam`, sem mudar as props). Sem tocar em animação, esqueleto (`DetailLoading`), toast, `BrandLogo` nem no `<title>`.

## Fora de escopo

- PlayStation, Xbox, Epic (provider, OAuth, logo, valor de `Provedor`): **cada uma é spec própria**; aqui só o "Em breve".
- Mudança de schema; nova animação, esqueleto, toast, Chek ou marca; ícones do PWA.
- Compartilhar a preferência de seções entre aparelhos; rota por seção (`#hash`); `GET /api/games/:id`.
- Bloqueios (VAC), amigos, preço, gênero; nível de outras plataformas; Steam **Guard**/trocas.
- Processo (não é critério de aceite): rodar o `/qa-verify`, atualizar `ARCHITECTURE.md` §5.5/§5.11/§5.13, `INDEX.md` e o `CLAUDE.md` (só se o mapa mudar).

## Notas de ambiente

- **Nenhuma variável de ambiente nova** e **nenhuma dependência nova** (`RULES.md` §9).
- **Execução humana (antes da F1 fechar):** baixar o pacote oficial de marca da Valve, converter `steam_brandAssets.eps` em
  SVG **sem alterar o desenho**, colocar o original em `docs/design/plataformas/steam/` e o SVG em
  `apps/web/public/plataformas/steam.svg`, e ler o texto legal do PDF (para a atribuição/®).
- **Execução humana (antes da F4):** fixtures reais de `GetBadges` e `GetRecentlyPlayedGames` (e de `timecreated`/`personastate`) com
  `node apps/api/scripts/capturar-fixtures-steam.cjs` (dois modos novos); sem os fixtures, o corpo é suposição e os CAs ficam `[~]`.
- O Service Worker precisa pré-cachear `public/plataformas/*` (offline mostra o selo).

## Suposições (sinalizadas)

- **S1** — O cadastro **não** ganha PlayStation/Xbox/Epic como `Provedor` agora (o enum só cresce com um provider real).
- **S2** — O SVG oficial da Steam **não existe** (a Valve publica EPS/PDF); a conversão de formato é aceitável e fica com o humano.
- **S3** — A regra "logo sozinho" da Valve impede logo + nome colados; a variante `completa` da Steam usa o logo (que já tem a
  palavra) e o nome separado/`sr-only` (Q5b).
- **S4** — `GetBadges` traz `player_level`, então `GetSteamLevel` é dispensável (4 chamadas a frio, não 5). **Não confirmado**
  (a doc oficial não descreve o corpo).
- **S5** — `timecreated` e `personastate` de `GetPlayerSummaries` só vêm com perfil público (**sem fixture**).
- **S6** — O estado das seções é **por tipo**, não por jogo, e o escopo é `dispositivo` (sobrevive ao logout, como as preferências).
- **S7** — A aba é uma **seção** do `/perfil`, não um `tablist`.
- **S8** — O contador por rota do throttler vale também para as rotas novas (30/min por usuário e rota); nenhuma rota de leitura vira 500.
- **S9** — "X dos seus Y" usa a **interseção** com a biblioteca atual (um jogo ligado que saiu da biblioteca não conta).
- **S10** — O popup é um `ModalDialog` (o `PlataformaDialog`), com blocos escolhidos por capacidade.

## Decisões tomadas (2026-09-26)

- **Q1** — Só o ícone, sempre visível e pequeno; o canto livre do anel da média (sup. direito), do chip de plataforma (inf. esquerdo) e de Editar/Remover (inf. direito, em hover) é escolhido na conferência no navegador (a proposta de "esconder em hover" cai).
- **Q2** — Plataformas não suportadas ficam **escondidas** até existirem (sem "Em breve"; `PLATAFORMAS_EM_BREVE` e o CA-23 viram: só as `disponivel` aparecem).
- **Q3** — 1ª entrega = **F4a** (popup só com o que já temos: `GetPlayerSummaries` + `GetOwnedGames` + banco; **0 chamada nova**). **F4b** (nível/XP por `GetBadges` e atividade recente por `GetRecentlyPlayedGames`) fica **depois**, com fixtures reais; os critérios dela (CA-28 na parte das chamadas novas e CA-30) ficam `[~]`. `nivel`/`recentes` não entram no contrato da F4a.
- **Q4** — "Avaliação e descrição" e a seção da plataforma **abertas**; as listas de conquistas **fechadas**.
- **Q5/Q5b** — O humano baixa o pacote da Valve e entrega a pasta; até lá, marcador neutro; versionar em `docs/design/plataformas/steam/` quando chegar. A Steam usa só o logo, com o nome como texto acessível; ler o PDF e ajustar quando vier.
- **Q6** — Duas plataformas seguem a ordem do cadastro. **S1 a S10** aprovadas.

## Questões em aberto

- [x] **Q1 — Selo no tile:** só o ícone (proposta), ou ícone e horas? Canto inferior direito, subindo/escondendo em hover para não brigar com Editar/Remover (proposta), ou outro canto?
- [x] **Q2 — Não suportadas:** PlayStation, Xbox e Epic aparecem como "Em breve" (proposta: sim, sem botão ativo) ou ficam escondidas até existirem?
- [x] **Q3 — Blocos do popup na 1ª entrega:** proponho **todos** na F4, mas com corte possível: **F4a** (cabeçalho, números, top 5, backlog, no checkpoint, conquistas, ações; **0 chamada nova**) e **F4b** (nível/XP e atividade recente; **+2 chamadas**, dependem de fixture real). Qual?
- [x] **Q4 — Seções no primeiro acesso:** proposta: "Avaliação e descrição" **aberta**, a seção da plataforma **aberta** e as duas listas de conquistas **fechadas**. Ou outra combinação (por exemplo, plataforma fechada em toque)?
- [x] **Q5 — Logos:** confirma que o arquivo oficial da Valve (EPS/PDF, não SVG) é baixado, convertido sem redesenhar e versionado **por você** (Q5a), e que a F1 segue com o marcador neutro até lá?
- [x] **Q5b — Regra da Valve × "logo + nome":** o logo "não pode ser combinado com palavras". Aceita a Steam mostrar **só o logo** onde a variante for `completa` (nome só para leitor de tela, ou como texto separado no título da seção), em vez de "logo + Steam" colados?
- [x] **Q6 — Duas plataformas:** qual seção vem primeiro? Proposta: a ordem do cadastro (Steam, depois as outras); alternativa: a de **mais horas** ou a de **última atualização**.
