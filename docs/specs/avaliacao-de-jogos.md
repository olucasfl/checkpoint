# Spec: avaliacao-de-jogos

> Status: implementada (2026-09-25). As três etapas estão feitas, a migration foi aplicada com backup e "sim" explícito, e o `/qa-verify` conferiu **29 de 32 critérios ao vivo**, sem nenhuma falha. Os outros três (CA-13, CA-20 e CA-28) têm a prova em Jest/Vitest, por decisão do dono do produto em 2026-09-25: a conferência ao vivo deles pede uma segunda conta (ver "Critérios provados só por teste").

## Objetivo

Trocar a nota única (inteiro de 0 a 10) por **cinco notas por critério** (gameplay, história, gráficos,
trilha sonora, performance técnica), cada uma de 0 a 10 com uma casa decimal, com **nota geral calculada
como média**; acrescentar uma **descrição** de texto ao jogo; e dar a cada jogo uma **página de detalhes**
(`/jogos/:id`).

**Estende** `catalogo-jogos` (não cria entidade nova): altera o contrato do `Game`, e por isso **supera**
critérios daquela spec (lista em "Critérios do catálogo superados"). Toca `apps/api`
(`modules/games/`), `apps/web` (`features/games/`, `pages/`), `packages/shared` (contrato e a função
`notaMedia`) e **`prisma/schema.prisma` (mudança destrutiva: remove a coluna `nota`)**.

Implementada em **três etapas**, cada uma com commit próprio e parando para validação:
(1) banco + shared + API, (2) formulário e lista no web, (3) página de detalhes.

## Stack

Padrão da casa. **Nenhuma dependência nova**: o slider é um `<input type="range">` nativo e o campo
numérico é um `<input>` nativo. Sem endpoint novo (ver "Requisitos de saída").

## Comportamento esperado

- **Cinco critérios, todos opcionais**, cada um de **0 a 10 com passo 0,1** (ex.: 7,3). Chaves, rótulos e
  descrições curtas são constantes em `packages/shared/src/games.ts` (fonte única de API e web):

  | Chave          | Rótulo              | Descrição curta                                                  |
  | -------------- | ------------------- | ---------------------------------------------------------------- |
  | `gameplay`     | Gameplay            | Jogabilidade, controles, mecânicas e o quanto é divertido jogar. |
  | `historia`     | História            | Enredo, roteiro, personagens e ritmo da narrativa.               |
  | `graficos`     | Gráficos            | Direção de arte, visual, animações e identidade estética.        |
  | `trilhaSonora` | Trilha sonora       | Música, efeitos sonoros e dublagem.                              |
  | `performance`  | Performance técnica | Estabilidade, desempenho, bugs e tempo de carregamento.          |

- **Nota geral = média dos critérios preenchidos** (em branco não entra), com **1 casa decimal**, arredondada
  para cima na metade (8,75 → 8,8). **Nunca é gravada**: é a função pura `notaMedia(notas)` de
  `packages/shared`, usada pela API (campo `notaMedia` da resposta) e pelo web. Sem critério preenchido,
  `notaMedia` é `null`. **0 é uma nota válida** e entra na média; "sem nota" (`null`) não.
- **Regras por status, sobre o estado final** (registro atual + body, como a regra da nota de hoje):
  - `QUERO_JOGAR` **não aceita nenhuma nota**. `PATCH { status: "QUERO_JOGAR" }` num jogo com notas é 400, a
    menos que o mesmo body traga **todas** as notas preenchidas como `null`. A API nunca apaga nota por conta
    própria.
  - `ZERADO` exige **pelo menos 1** critério preenchido, **quando a escrita mexe nisso**: o **status passa a
    ZERADO** (criando, ou vindo de outro status) ou **algum critério tem valor diferente do gravado**. "Mexer" é
    o valor **mudar**, e **não** o campo vir no body (o formulário envia todos os campos a cada salvamento).
    Assim, um `PATCH` que não muda status nem nota de um Zerado sem critério (os jogos que já existem,
    depois de as notas antigas serem descartadas) passa: editar só o título, a plataforma, a descrição ou a
    capa dá 200. As demais regras continuam sobre o estado final.
  - `JOGANDO` aceita de 0 a 5.
  - Valor fora de 0–10, ou com mais de 1 casa decimal (7,55), é 400 com `fields.<critério>`. A API só aceita
    **número JSON**; o web converte vírgula em ponto antes de enviar.
  - No `PATCH`, cada critério aceita `null` (limpa); `titulo` e `status` continuam sem aceitar `null`.
- **Descrição** (`descricao`): opcional, texto simples de até **1000 caracteres**, com `trim`; quebras de linha
  preservadas; vazia, só espaços ou `null` viram `null`. Sem Markdown e sem HTML: o web a mostra como
  **texto** (nunca `dangerouslySetInnerHTML`). Vale em qualquer status (inclusive Quero jogar).
- **Formulário (adicionar/editar)**: seção **Avaliação**, só com status Zerado ou Jogando, e o campo
  **Descrição** (textarea com contador `n/1000`). Por critério: rótulo + descrição curta, **slider** (0 a 10,
  passo 0,1) e **campo numérico** sincronizados (aceita **vírgula e ponto**), e o botão **Limpar**. "Sem nota"
  é diferente de 0: o critério só passa a valer depois que a pessoa mexe no slider ou digita no campo. Mostra
  a **média ao vivo** do que já foi preenchido. Alvos de toque ≥ 44 px.
- **Mudar para Quero jogar com notas preenchidas**: o formulário avisa e, ao salvar, envia `null` em cada
  critério (explícito, como o `nota: null` de hoje).
- **Lista**: cada linha mostra só a **média** (ex.: 8,3, com a barra de 10 segmentos que já existe) e "—"
  sem média. A linha inteira leva ao detalhe (o título é um `<Link>` real; o restante da linha usa o
  mesmo link por sobreposição; editar e excluir continuam funcionando sem navegar).
- **Página de detalhes `/jogos/:id`**: capa grande (com o fallback de cor + iniciais), título, plataforma e
  status; **média em destaque**; os **5 critérios**, cada um com rótulo, nota (ex.: 9,2) e barra, ou "sem
  nota"; a **descrição** (ou o convite discreto "Adicionar descrição"); **Editar** (o mesmo `GameForm` em
  `ModalDialog`), **Excluir** (a confirmação existente) e **Voltar**. Coluna única no celular; a partir de
  1024 px a capa fica ao lado das notas.
  - O jogo vem da query `['games']` que o catálogo já usa. Carregando: esqueleto. Id inexistente **ou de outro
    usuário**: "Jogo não encontrado" com link para `/`. O item **"Jogos"** da navegação continua marcado como
    ativo em `/jogos/:id`.

## Requisitos de saída

### API (`/api/games`, protegidas pelo guard de `autenticacao`; escopo por dono inalterado)

Nenhuma rota nova: `GET /api/games/:id` **não** é criado (a página de detalhes acha o jogo na lista já
carregada; o custo é o de uma lista que o catálogo já busca, e a lista de uma pessoa é pequena).

**`POST /api/games`** — corpo `CreateGameRequest`:

| Campo                                                             | Tipo           | Regra                                                         |
| ----------------------------------------------------------------- | -------------- | ------------------------------------------------------------- |
| `titulo`, `status`, `plataforma`                                  | como hoje      | inalteradas                                                   |
| `gameplay`, `historia`, `graficos`, `trilhaSonora`, `performance` | número \| null | opcional; 0 a 10; no máximo 1 casa decimal; regras por status |
| `descricao`                                                       | string \| null | opcional; aparada; até 1000; vazia vira `null`                |

**`PATCH /api/games/:id`** — os mesmos campos, todos opcionais, ao menos um; **só** `plataforma`, os cinco
critérios e `descricao` aceitam `null`.

**Resposta (`Game`)** — perde `nota`; ganha:

```json
{
  "id": "…",
  "titulo": "Celeste",
  "plataforma": "PC",
  "status": "ZERADO",
  "notas": {
    "gameplay": 9,
    "historia": 8.5,
    "graficos": null,
    "trilhaSonora": null,
    "performance": null
  },
  "notaMedia": 8.8,
  "descricao": "Escalada difícil e trilha marcante.",
  "capaUrl": null,
  "criadoEm": "…",
  "atualizadoEm": "…"
}
```

**Erros** (400 com `fields`; mensagens-padrão):

| Situação                                       | `fields`                 | Mensagem                                                                        |
| ---------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| critério fora de 0–10, >1 casa ou não número   | `<chave do critério>`    | `A nota de <Rótulo> deve ser um número de 0 a 10, com no máximo 1 casa decimal` |
| Quero jogar com nota (estado final)            | cada critério preenchido | `Notas só podem ser preenchidas quando o status é Zerado ou Jogando`            |
| Zerado sem nenhum critério (estado final)      | `notas`                  | `Preencha ao menos um critério para marcar como Zerado`                         |
| descrição > 1000                               | `descricao`              | `A descrição deve ter no máximo 1000 caracteres`                                |
| campo desconhecido (inclusive o antigo `nota`) | —                        | 400 do `ValidationPipe` (`whitelist + forbidNonWhitelisted`)                    |

404 (jogo inexistente ou de outro usuário), 409 (duplicata) e 401 continuam como no catálogo.

### Web

- **Rota nova** `/jogos/:id` (`RequireAuth` + `AppLayout`), em `app/routes.tsx`; página em
  `pages/GameDetailPage.tsx`, componentes em `features/games/components/`.
- **`GameForm`**: seção Avaliação (5 linhas: rótulo, descrição curta, slider, campo, Limpar), média ao vivo,
  Descrição com contador. Erros por `fields` de cada critério, de `notas` (na seção) e de `descricao`.
- **`GameRow`**: média com a barra, "—" sem média, título como `<Link to="/jogos/:id">`.
- **Barra de nota** (`RatingBar`): aceita valor decimal; preenche `round(valor)` segmentos; o número mostra a
  vírgula (8,3); `role="img"` com `aria-label` "<Rótulo> 9,2 de 10" (critério) ou "Nota 8,3 de 10" (média).

## Modelo de dados

**Mudança destrutiva** (remove uma coluna com dados): **exige aprovação humana explícita e passa por
`/db-change`** (`RULES.md` §3), com backup antes e conferência de qual banco é o `DATABASE_URL` (o Supabase
compartilhado, não descartável). **Registro da decisão do dono do produto (2026-09-25): as notas antigas são
descartadas; os jogos, títulos, plataformas e capas ficam.** A aprovação de rodar a migration é um passo à
parte, pedido na etapa 1.

`Game`:

- **remove** `nota Int?` e os `CHECK`s `Game_nota_range_check` e `Game_nota_status_check`;
- **acrescenta** (aditivo): `notaGameplay`, `notaHistoria`, `notaGraficos`, `notaTrilhaSonora`,
  `notaPerformance`, todos `Int?`, **em décimos** (0 a 100; 7,3 → 73), evitando `Decimal` e ponto flutuante
  no Prisma; e `descricao String? @db.VarChar(1000)`;
- a conversão décimos ↔ número 0–10 acontece só na fronteira do `GamesService` (`toGame` e escrita), e a
  API expõe sempre 0–10;
- `CHECK` por coluna `nota… IS NULL OR nota… BETWEEN 0 AND 100`, e
  `CHECK` de que `QUERO_JOGAR` tem as cinco nulas — escritos à mão na migration, como os atuais.

Nenhuma outra tabela muda. A migration é commitada em `prisma/migrations/`.

## Contrato compartilhado

Em `packages/shared/src/games.ts`:

- `GAME_RATING_CRITERIA` (as cinco chaves com `rotulo` e `descricao`, `as const`), `GameRatingKey`,
  `GameRatings` (`Record<GameRatingKey, number | null>`), `GAME_RATING_MIN`/`MAX` (já existem),
  `GAME_RATING_STEP = 0.1`, `GAME_DESCRIPTION_MAX_LENGTH = 1000`;
- `notaMedia(notas): number | null` e `isValidRating(valor): boolean` (0 a 10, no máximo 1 casa; usa décimos
  inteiros internamente, sem erro de ponto flutuante);
- `Game`: troca `nota` por `notas: GameRatings`, `notaMedia: number | null` e `descricao: string | null`;
- `CreateGameRequest`/`UpdateGameRequest`: trocam `nota` pelos cinco critérios (planos, no topo do corpo) e
  `descricao`;
- `ApiErrorField`: sai `nota`; entram as cinco chaves, `descricao` e `notas`;
- `statusAllowsRating` continua (mesma regra: só `QUERO_JOGAR` bloqueia).

`packages/shared` **não tem runner de teste**: `notaMedia` e `isValidRating` são testadas pelos dois lados que
as usam (Jest na API e Vitest no web), sem configurar runner novo (registrado aqui, como pede o `RULES.md` §5).

## Critérios do catálogo superados

Para aprovação: estes critérios de `docs/specs/catalogo-jogos.md` citam a `nota` inteira e **deixam de valer
como estão**; na implementação (etapa que os afeta) cada um ganha a marca "superado por
`avaliacao-de-jogos`, CA-xx" e o texto novo fica nesta spec.

| Critério do catálogo | O que dizia                                                       | Substituído por                                |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| CA-01                | response com `nota: null`                                         | CA-02                                          |
| CA-02                | `POST` com `nota: 9` devolve `nota: 9`                            | CA-01                                          |
| CA-08                | (fixture com `nota`) "demais campos ficam iguais"                 | CA-06 (fixture nova)                           |
| CA-10                | `PATCH` `{status:"QUERO_JOGAR", nota:null}`                       | CA-06                                          |
| CA-16                | nota 11, -1 ou 7.5 → 400 `fields.nota`                            | CA-04                                          |
| CA-19                | `QUERO_JOGAR` com `nota: 8` → 400 `fields.nota`                   | CA-05                                          |
| CA-21                | `PATCH` só `status: QUERO_JOGAR` com `nota: 7` → 400              | CA-06                                          |
| CA-22                | `PATCH` só `nota: 5` em `QUERO_JOGAR` → 400                       | CA-07                                          |
| CA-23                | `QUERO_JOGAR` → `ZERADO` com `nota: 5` → 200                      | CA-08                                          |
| CA-35                | `PATCH` `{nota:8, status:"ZERADO"}` não conflita consigo mesmo    | CA-08 (mesma ideia com critério)               |
| CA-36                | `CHECK` `nota BETWEEN 0 AND 10` e com `QUERO_JOGAR`               | CA-14                                          |
| CA-43                | formulário: Nota desabilitada e limpa em Quero jogar, `nota:null` | CA-17 e CA-22                                  |
| CA-52                | "só `nota` e `plataforma` aceitam `null`"                         | CA-10 (`titulo`/`status` continuam sem `null`) |
| CA-60                | exemplo `PATCH {"nota":8}`; `capaUrl` igual nas respostas         | mesmo critério, com `{"gameplay":8}`           |
| CA-81                | barra "NOTA N/10", "SEM NOTA"                                     | CA-24 e CA-25                                  |
| CA-82                | em Quero jogar, o campo Nota bloqueado com cadeado                | CA-17                                          |

Também mudam no texto do catálogo (sem CA próprio): "Comportamento esperado" (regra da nota), a tabela de
campos, o `schema.prisma` descrito, o `CHECK` da decisão A, o campo Nota do formulário e o tipo `Game`.

## Critérios de aceite (testáveis, em BDD)

`curl` contra `http://localhost:3333/api` com o jar de uma conta sintética (`autenticacao`); UI contra
`http://localhost:5173`. Dados sintéticos.

### Etapa 1 — banco, shared e API

- [x] **CA-01** — **Dado** o catálogo vazio, **quando** `POST /api/games` com `{"titulo":"Celeste","status":"ZERADO","gameplay":9,"historia":8.5}`, **então** 201; `notas` = `{"gameplay":9,"historia":8.5,"graficos":null,"trilhaSonora":null,"performance":null}`; `notaMedia` = `8.8` (média 8,75 arredondada para cima); `descricao: null`; e o response **não** tem `nota`.
- [x] **CA-02** — **Dado** `POST` com `{"titulo":"Hades","status":"JOGANDO"}`, **então** 201 com as cinco `notas` `null`, `notaMedia: null` e `descricao: null`.
- [x] **CA-03** — **Dado** `POST` com `{"titulo":"Tetris","status":"JOGANDO","gameplay":0}`, **então** 201 com `notas.gameplay: 0` e `notaMedia: 0` (0 é nota, não "sem nota").
- [x] **CA-04** — **Dado** `POST` com `gameplay` `7.3`, **então** 201 com `7.3`; **e** com `7.55`, `10.1`, `-0.1`, `"7,3"` (string) ou `"8"` (string), **então** 400 com `fields.gameplay` = `"A nota de Gameplay deve ser um número de 0 a 10, com no máximo 1 casa decimal"` e nenhum jogo criado.
- [x] **CA-05** — **Dado** `POST` com `{"titulo":"Hades","status":"QUERO_JOGAR","historia":8}`, **então** 400 com `fields.historia` = `"Notas só podem ser preenchidas quando o status é Zerado ou Jogando"`, e nenhum jogo é criado.
- [x] **CA-06** — **Dado** um jogo `JOGANDO` com `gameplay: 7`, **quando** `PATCH` com **só** `{"status":"QUERO_JOGAR"}`, **então** 400 com a mensagem do CA-05 em `fields.gameplay` e o jogo continua `JOGANDO` com `gameplay: 7`; **quando** `PATCH` com `{"status":"QUERO_JOGAR","gameplay":null}`, **então** 200, `status: "QUERO_JOGAR"` e as cinco `notas` `null`.
- [x] **CA-07** — **Dado** um jogo `QUERO_JOGAR` sem notas, **quando** `PATCH` com **só** `{"graficos":5}`, **então** 400 com `fields.graficos` e o jogo continua sem notas.
- [x] **CA-08** — **Dado** `POST` com `{"titulo":"Hades","status":"ZERADO"}` (sem critério), **então** 400 com `fields.notas` = `"Preencha ao menos um critério para marcar como Zerado"`; **e** dado um jogo `QUERO_JOGAR` sem notas, **quando** `PATCH` com `{"status":"ZERADO","historia":6}`, **então** 200 com `status: "ZERADO"`, `notas.historia: 6` e `notaMedia: 6`; **e** `PATCH` no próprio jogo com `{"titulo":"HADES"}` continua 200 (não conflita consigo mesmo).
- [x] **CA-09** — **Dado** `POST` com `JOGANDO` e os cinco critérios `10`, `9.9`, `8`, `7.5`, `0`, **então** 201 e `notaMedia` = `7.1` (35,4 / 5 = 7,08 → 7,1).
- [x] **CA-10** — **Dado** o jogo do CA-09, **quando** `PATCH` com `{"gameplay":null}`, **então** 200, `notas.gameplay: null` e `notaMedia` recalculada só com os quatro restantes (6,35 → `6.4`); **e** dado um jogo `ZERADO` com um único critério, **quando** `PATCH` que o limpa (`null`) sem mudar o status, **então** 400 com `fields.notas`; **e** `PATCH` com `{"titulo":null}` ou `{"status":null}` continua 400 com `fields.titulo`/`fields.status`.
- [x] **CA-11** — **Dado** `PATCH`/`POST` com `descricao` `"  Ótimo\n\njogo  "`, **então** a resposta traz `"Ótimo\n\njogo"` (aparada, quebras preservadas); com `""`, `"   "` ou `null`, **então** `descricao: null`; com 1000 caracteres, **então** aceita; com 1001, **então** 400 com `fields.descricao` = `"A descrição deve ter no máximo 1000 caracteres"`.
- [x] **CA-12** — **Dado** o corpo antigo `{"titulo":"X","status":"ZERADO","nota":8}`, **então** 400 (campo desconhecido) e nenhum jogo criado; **e** nenhum response de `GET/POST/PATCH` contém `nota` nem `capaPath`.
- [x] **CA-13** — **Dado** dois usuários com jogos, **quando** o segundo faz `GET` na lista, `PATCH` ou `DELETE` num id do primeiro, **então** a lista só traz os dele e o `PATCH`/`DELETE` dão 404; **sem** token, 401. _(Prova do "outro usuário → 404": Jest, `games.http.spec.ts`, bloco "jogo de outro usuário". Ao vivo foram conferidos 401 sem credencial, 404 para id inexistente e a lista só do dono.)_
- [x] **CA-14** — **Dado** a migration aplicada, **quando** um `INSERT` direto em `"Game"` grava `notaGameplay = 101`, `-1`, ou qualquer nota com `status = 'QUERO_JOGAR'`, **então** o banco rejeita (`CHECK`). _Verificação manual._
- [x] **CA-15** — **Dado** o banco com N jogos antes da migration, **quando** ela é aplicada, **então** continuam N jogos, com os mesmos `titulo`, `plataforma`, `status`, `capaPath` e `userId`; as notas antigas não existem mais; e `\d "Game"` não tem a coluna `nota`. _Verificação manual, com a contagem antes e depois._

- [x] **CA-32** — **Dado** um jogo `ZERADO` **sem nenhum critério** (o caso dos jogos que já existiam, depois da migration), **quando** `PATCH` com **só** `{"titulo":"Novo nome"}`, **então** 200; **e** `PATCH` com o corpo completo do formulário (`titulo`, `status: "ZERADO"`, `plataforma`, os cinco critérios `null` e `descricao`) mudando **só** o título, **então** 200 (os critérios vieram no body como `null`, mas o valor não mudou); **e** `PATCH` `{"status":"ZERADO"}` num jogo `JOGANDO` sem critérios, **então** 400 com `fields.notas`; **e**, num jogo `ZERADO` com **um único** critério, `PATCH` que o limpa (`null`: o valor mudou e não sobra nenhum), **então** 400 com `fields.notas`.

### Etapa 2 — formulário e lista

- [x] **CA-16** — **Dado** o formulário aberto, **quando** o status é Zerado ou Jogando, **então** a seção Avaliação mostra cinco critérios, cada um com rótulo, descrição curta, slider, campo numérico e "Limpar"; **quando** escolho Quero jogar, **então** a seção some.
- [x] **CA-17** — **Dado** um jogo novo em Jogando, **então** os cinco campos começam vazios e o slider mostra "sem nota" (`aria-valuetext`); **quando** mexo o slider do Gameplay até 0, **então** o campo mostra `0` e o envio leva `gameplay: 0`; **quando** clico em **Limpar**, **então** volta a vazio e o envio leva `gameplay: null`.
- [x] **CA-18** — **Dado** o campo do Gameplay, **quando** digito `8,7` ou `8.7`, **então** o slider vai a 8,7 e o envio leva o número `8.7` (JSON); **quando** movo o slider para 8,7, **então** o campo mostra `8,7` (vírgula).
- [x] **CA-19** — **Dado** critérios preenchidos com `9`, `8,5` e dois vazios, **então** a média ao vivo mostra `8,8`; **quando** limpo um deles, **então** a média se recalcula na hora; sem nenhum, mostra "—".
- [x] **CA-20** — **Dado** o campo com `10,5` ou `7,55`, **então** o campo mostra o erro do critério na hora e o formulário **não envia**; **dado** o 400 da API com `fields.historia`, **então** a mensagem aparece junto da História; **dado** `fields.notas` (Zerado sem critério), **então** aparece na seção Avaliação. _(Prova do `fields.<critério>` vindo da API: Vitest, `GameForm.test.tsx`; ao vivo a validação local barra antes de enviar, e só o `fields.notas` da API foi visto na tela.)_
- [x] **CA-21** — **Dado** um jogo Zerado com notas, **quando** troco o status para Quero jogar, **então** o formulário avisa que as notas serão limpas e, ao salvar, a request leva `null` nos cinco critérios; **e** o jogo fica sem notas.
- [x] **CA-22** — **Dado** o campo Descrição, **quando** digito, **então** o contador mostra `n/1000` e não passa de 1000; **quando** salvo com quebras de linha, **então** reabrir o formulário mostra as mesmas quebras.
- [x] **CA-23** — _(atualizado por `troca-de-design-estante`, F2: a média do tile é o anel, não mais a barra de segmentos; ver CA-21)_ **Dado** um jogo com média 8,3 e outro sem notas, **quando** a lista carrega, **então** a linha do primeiro mostra `8,3` com a barra (8 segmentos) e `aria-label` "Nota 8,3 de 10", e a do segundo mostra "—".
- [x] **CA-24** — **Dado** a lista, **então** o título de cada linha é um link para `/jogos/<id>`; **quando** clico na linha (fora dos botões), **então** vou ao detalhe; **quando** clico em Editar ou Excluir, **então** abre o formulário/confirmação **sem** navegar.

### Etapa 3 — página de detalhes

- [x] **CA-25** — _(atualizado por `troca-de-design-estante`, F3: a parte visual do detalhe (capa em pé, anel, barras); ver CA-42)_ **Dado** um jogo Zerado com `gameplay 9,2`, `historia 8` e os outros vazios, **quando** abro `/jogos/<id>`, **então** vejo capa grande, título, plataforma, status, a média (`8,6`) em destaque e os cinco critérios: Gameplay `9,2` e História `8,0` com barra, e os outros três com "sem nota"; cada barra tem `aria-label` "<Rótulo> <nota> de 10".
- [x] **CA-26** — **Dado** um jogo sem descrição, **então** vejo o convite "Adicionar descrição", que abre o formulário; **dado** uma descrição `"<b>oi</b>\nlinha 2"`, **então** ela aparece como **texto** (`<b>oi</b>` literal, sem negrito) com a quebra de linha.
- [x] **CA-27** — **Dado** a página aberta, **quando** clico **Editar**, mudo uma nota e salvo, **então** o modal fecha e a página mostra a nota nova sem recarregar; **quando** clico **Excluir** e confirmo, **então** o jogo some e vou para `/`; **quando** clico **Voltar**, **então** volto ao catálogo.
- [x] **CA-28** — **Dado** um link direto, **quando** a lista ainda carrega, **então** vejo um esqueleto; **dado** um id inexistente ou de outro usuário, **então** vejo "Jogo não encontrado" com um link para `/` (sem revelar qual dos dois é). _(Prova do "de outro usuário": Vitest, `GameDetailPage.test.tsx`, "id inexistente (ou de outro usuário)"; ao vivo foram vistos o esqueleto e o id inexistente.)_
- [x] **CA-29** — **Dado** `/jogos/<id>` (inclusive após recarregar), **então** o item "Jogos" da navegação (barra inferior e topo) está marcado como ativo.
- [x] **CA-30** — _(atualizado por `troca-de-design-estante`, F3: o layout do detalhe mudou (grade de 300 px e coluna única); ver CA-42 e CA-64)_ **Dado** 375 px, **então** não há rolagem horizontal, a coluna é única e todo botão, link e campo tem ≥ 44 px de alto; **dado** ≥ 1024 px, **então** a capa fica ao lado das notas.
- [x] **CA-31** — **Dado** o app, **então** nenhuma cor nova fora do `@theme` (`tokens.test.ts` verde), nenhuma animação nova sem a variante `movimento-reduzido`, e `package.json` não mudou.

## Critérios provados só por teste

Aceitos pelo dono do produto em 2026-09-25 (depois do `/qa-verify` e do `/review-pr`), porque a conferência ao
vivo deles exige uma **segunda conta**, e o agente não cria conta:

| Critério | O que fica só no teste                                               | Onde                                                                               |
| -------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| CA-13    | PATCH/DELETE de um jogo de **outro usuário** → 404                   | `games.http.spec.ts` (bloco "jogo de outro usuário") e `games.service.spec.ts`     |
| CA-20    | `fields.<critério>` **devolvido pela API** aparece junto do critério | `GameForm.test.tsx` ("400 de um critério aparece junto do campo daquele critério") |
| CA-28    | "Jogo não encontrado" para o jogo de **outro usuário**               | `GameDetailPage.test.tsx` ("id inexistente (ou de outro usuário …)")               |

O resto desses três critérios foi visto ao vivo (401 sem credencial, 404 para id inexistente, a lista só do dono, a
validação de digitação, o `fields.notas` da API na tela, o esqueleto e o "não encontrado").

## Plano de testes

- **API (Jest, Prisma e Storage mockados):**
  - `games.service.spec.ts`: média (vazia, parcial, arredondamento a 1 casa, 0 como nota), conversão
    décimos ↔ 0–10, regra do estado final (Quero jogar, Zerado ≥ 1, Jogando parcial), `null` limpando, descrição
    (aparada, vazia → `null`), dono em todo `where` (CA-01 a CA-13);
  - `create-game.dto.spec.ts` / `update-game.dto.spec.ts` pelo `ValidationPipe` do `main.ts`: passo 0,1
    (7,55 → 400), faixa, tipo, campo antigo `nota`, 1000/1001 caracteres, `titulo`/`status` sem `null`;
  - `games.http.spec.ts`: guard real, 401, 404 cruzado entre usuários, o shape novo do response.
  - `notaMedia`/`isValidRating` (de `shared`): testadas aqui e no web (sem runner no `shared`).
- **Web (Vitest + Testing Library):** `GameForm.test.tsx` (slider e campo sincronizados, vírgula e ponto,
  0 ≠ sem nota, Limpar, a seção some em Quero jogar, aviso e `null`s, contador); `GameRow` (média, "—", link);
  `GameDetailPage.test.tsx` (cinco critérios, "sem nota", descrição como texto, Editar, Excluir, "não
  encontrado", esqueleto, "Jogos" ativo); libs puras (`form-values`, `api-error`, formatação com vírgula).
- **Manual (`/qa-verify`):** CA-14 e CA-15 no banco real (depois da aprovação da migration); a nota 8,7 por
  slider e por campo, salvar, ver a média na lista e os cinco critérios no detalhe, em 375 px e ≥ 1024 px
  (uma sessão logada por você: o agente não digita senha nem cria conta).

Loop de verificação por tarefa:
`npm run typecheck -w <workspace>` → `npm test -w <workspace>` → `npm run lint` → `npm run build` → commit.

## Fora de escopo

**Feature do produto:**

- Peso diferente por critério, critério personalizado, ou nota geral escolhida à mão (a geral é sempre a média).
- Migrar as notas antigas para os critérios (decisão do dono: descartar).
- Descrição com Markdown/HTML, imagem, ou histórico de edições.
- Ordenar ou filtrar o catálogo pela média; estatísticas de notas.
- `GET /api/games/:id` (só se a lista deixar de servir; hoje não é necessário).

**Passo de processo (não é critério de aceite):** rodar a migration (só depois do "sim" explícito e do
backup), `npm run db:generate`, atualizar `ARCHITECTURE.md` (§4.3, §4.4, §5.4/§5.5, §6), `INDEX.md` e
marcar os critérios superados em `catalogo-jogos.md`.

## Notas de ambiente

- **Nenhuma variável de ambiente nova. Nenhuma dependência nova.**
- **Uma migration destrutiva** (`Game.nota` sai; cinco colunas e `descricao` entram): passa por `/db-change`,
  com backup do banco antes e confirmação de que o `DATABASE_URL` é o Supabase compartilhado.
- Depois de editar `packages/shared/src`, `npm run build -w @checkpoint/shared` antes de tipar `api` e `web`.

## Questões em aberto

- [x] **Q1 — Jogos Zerado que já existem.** **Decidido (2026-09-25): a recomendação, com uma precisão.** "Zerado exige
      ≥ 1" só vale quando a escrita **muda** o status para Zerado ou o valor de algum critério em relação ao
      gravado; o campo vir no body não conta (o formulário envia tudo sempre, e checar presença reabriria o
      bloqueio). Ver CA-32.
- [x] **Q2 — Erro de "Zerado sem critério".** **Decidido: `fields.notas`**, campo próprio da seção Avaliação
      (novo em `ApiErrorField`).

## Suposições

Para aprovação junto da spec:

- **Requisição plana, resposta agrupada:** o corpo do `POST`/`PATCH` leva os cinco critérios no topo
  (`gameplay`, `historia`…), um campo por critério (o `ValidationPipe` é `whitelist + forbidNonWhitelisted` e o
  erro sai em `fields.<critério>`), e a **resposta** os agrupa em `notas`. A assimetria é de propósito.
- **Décimos inteiros** no banco (`Int?`, 0 a 100), como você propôs: sem `Decimal`, sem ponto flutuante.
- **Média:** calculada em décimos inteiros, arredondada para cima na metade (8,75 → 8,8), tanto na API quanto
  no web (a mesma função). A barra da média preenche `round(média)` segmentos (8,3 → 8; 8,5 → 9).
- **Vírgula na tela** (`8,3`) e **ponto no JSON** (`8.3`); a formatação é uma função pura do web.
- **Descrição:** `\r\n` vira `\n` antes de contar e gravar, para os 1000 caracteres valerem igual em qualquer
  navegador; o limite conta unidades de texto do JavaScript (`length`), como o resto da API.
- **Sem `GET /api/games/:id`:** a página de detalhes usa a query `['games']`. Um link direto carrega a lista
  toda, que é o que o catálogo já faz.
- **Link da linha:** título como `<Link>` real e o restante da linha clicável por sobreposição do mesmo link
  (sem `<a>` aninhado nem `onClick` em `<li>`); editar e excluir ficam acima dele.
- **Item "Jogos" ativo em `/jogos/:id`:** a navegação usa `end` hoje; passa a usar uma regra própria
  (ativo em `/` e em `/jogos/*`). Isso altera `BottomNav`/`TopNav` e os testes do layout.
- **`statusAllowsRating`** mantém o nome e a regra (só `QUERO_JOGAR` bloqueia).
