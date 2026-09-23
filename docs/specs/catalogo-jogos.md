# Spec: catálogo de jogos

> Status: aprovada

## Objetivo

Permitir registrar jogos manualmente e classificá-los em três status (zerado, jogando, quero jogar),
com plataforma e nota opcionais, e listar, filtrar, editar e remover esse catálogo pessoal.

Esta é a primeira feature de domínio do checkpoint. Toca `apps/api`, `apps/web`, `packages/shared`
e `apps/api/prisma/schema.prisma`.

> **Aviso de segurança:** o catálogo é único e sem dono, e a API fica **sem autenticação nem
> proteção**. Até existir uma spec de auth, a aplicação só deve rodar local ou em rede confiável.

## Stack

Padrão da casa (`ARCHITECTURE.md`), sem biblioteca de runtime nova. Diferenças:

- **Runners de teste** (Jest na API, Vitest no web) entram como devDependencies, em **commit
  separado e anterior** ao da feature (ver "Notas de ambiente"). É a exceção prevista em
  `RULES.md` §9.
- **Sem biblioteca de UI, de formulário ou de modal.** Tailwind + `<dialog>` nativo (ou componente
  próprio). Se alguma for julgada necessária, perguntar antes (`RULES.md` §9).
- **Node 20.19+** (mantido; não sobe para 22/24). As versões dos runners de teste do web foram
  escolhidas pelo `engines` de cada pacote para rodar em Node 20.19 (ver "Notas de ambiente").

## Comportamento esperado

- Cadastrar um jogo informando título e status (obrigatórios), plataforma e nota (opcionais) → o
  jogo aparece na lista.
- A lista mostra todos os jogos, do mais recentemente alterado para o mais antigo. Filtrar por status
  mostra só os jogos daquele status.
- Editar um jogo (título, plataforma, status ou nota) altera só os campos enviados.
- **Transição de status é livre:** qualquer status pode ir para qualquer outro, sem restrição.
- **Regra da nota:** a nota (inteiro de 0 a 10) só pode existir quando o status **final** do jogo é
  `ZERADO` ou `JOGANDO`. "Final" significa o registro atual mesclado com o body da request, não só
  o body. Logo, um `PATCH { status: "QUERO_JOGAR" }` num jogo que já tem nota é rejeitado (400),
  a menos que o mesmo body traga `nota: null`. A API nunca apaga a nota por conta própria.
- **Duplicidade:** dois jogos não podem ter o mesmo título e a mesma plataforma, ignorando
  maiúsculas/minúsculas e espaços nas pontas. Jogo sem plataforma conta como plataforma "vazia".
  `POST` ou `PATCH` que gere duplicata é rejeitado (409).
- Remover apaga o jogo de forma definitiva (sem lixeira). A tela pede confirmação antes.
- Recurso inexistente (`PATCH`/`DELETE` com id inexistente) → 404. Valor inválido de status, no body
  ou no filtro → 400.
- Lista vazia (sem jogos, ou filtro sem resultados) → estado vazio na tela; a API devolve `[]`.

## Requisitos de saída

### API (prefixo global `/api`, tag Swagger `games`, módulo `apps/api/src/modules/games/`)

Todos os DTOs de entrada usam `class-validator` (o `ValidationPipe` global é
`whitelist + forbidNonWhitelisted`, então campo não declarado retorna 400).

**`POST /api/games`** — corpo `CreateGameRequest`:

| Campo        | Tipo                                     | Regra                                                                                  |
| ------------ | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `titulo`     | string                                   | obrigatório; após `trim`, 1 a 120 caracteres                                           |
| `status`     | `"ZERADO" \| "JOGANDO" \| "QUERO_JOGAR"` | obrigatório                                                                            |
| `plataforma` | string \| null                           | opcional; após `trim`, até 60 caracteres; vazio, só espaços ou `null` = sem plataforma |
| `nota`       | inteiro \| null                          | opcional; 0 a 10; só se o status for `ZERADO` ou `JOGANDO`                             |

- Sucesso: **201** + `Game`.
- Erros: **400** (payload inválido, campo desconhecido, nota com `QUERO_JOGAR`), **409** (duplicata).

**`GET /api/games?status=<GameStatus>`** — `status` opcional.

- Sucesso: **200** + `Game[]`, ordenado por `atualizadoEm` decrescente (desempate por `criadoEm`
  decrescente). Sem jogos → `[]`.
- Erro: **400** se `status` não for um dos três valores.

**`PATCH /api/games/:id`** — corpo `UpdateGameRequest`: os mesmos campos de `CreateGameRequest`,
todos opcionais; ao menos um campo é obrigatório. **Só `nota` e `plataforma` aceitam `null`**
(`nota: null` remove a nota; `plataforma: null` remove a plataforma). `titulo: null` e
`status: null` são inválidos.

- Sucesso: **200** + `Game` atualizado.
- Erros: **400** (payload inválido, campo desconhecido, body vazio `{}`, `titulo` ou `status`
  `null`, `id` que não é UUID, estado final com nota e `QUERO_JOGAR`), **404** (UUID válido sem jogo correspondente), **409**
  (a edição gera duplicata de outro jogo).

**`DELETE /api/games/:id`**

- Sucesso: **204**, sem corpo.
- Erros: **400** (`id` que não é UUID), **404** (UUID válido sem jogo correspondente).

**`Game` (response):**

```json
{
  "id": "uuid",
  "titulo": "Hollow Knight",
  "plataforma": "PC",
  "status": "ZERADO",
  "nota": 9,
  "criadoEm": "2026-09-23T12:00:00.000Z",
  "atualizadoEm": "2026-09-23T12:00:00.000Z"
}
```

`plataforma` e `nota` são `null` quando ausentes. As colunas normalizadas (ver "Modelo de dados")
**não** aparecem no response.

**Formato de erro (400 e 409) — `ApiErrorResponse`:**

```json
{
  "statusCode": 409,
  "message": "Já existe esse jogo nesta plataforma",
  "fields": { "titulo": "Já existe esse jogo nesta plataforma" }
}
```

- `fields` é opcional e mapeia o nome do campo (`titulo`, `plataforma`, `status`, `nota`) para uma
  mensagem. Todo 400 de validação de campo traz `fields`; o 404 traz só `statusCode` e `message`.
- Mensagens literais (verificáveis):
  - 409 de duplicata: `fields.titulo` = `"Já existe esse jogo nesta plataforma"`.
  - 400 de nota incompatível: `fields.nota` = `"Nota só pode ser preenchida quando o status é Zerado ou Jogando"`.
  - 404: `message` = `"Jogo não encontrado"`.
- As demais mensagens de validação têm texto livre, mas em português e associadas ao campo certo.

### Web (`apps/web`)

- **Rota `/`:** catálogo (`features/games/`, página em `pages/`). **Rota `/status`:** a página de
  diagnóstico de health que hoje é a `/` (`HomePage`), sem mudar o conteúdo dela.
- **Filtro:** opções, nesta ordem, "Todos", "Jogando", "Quero jogar", "Zerado". Fica na URL
  (`/?status=JOGANDO`) e sobrevive a reload. "Todos" = sem parâmetro. Valor inválido em `?status=` é
  tratado como "Todos" e não chega à API.
- **Cada item da lista:** título, plataforma (omitida se vazia), selo do status ("Zerado",
  "Jogando", "Quero jogar"), nota (omitida se vazia) e as ações Editar e Remover.
- **Adicionar jogo:** botão que abre um `<dialog>` com o formulário. Editar abre o **mesmo**
  formulário preenchido.
- **Formulário:** campos Título, Plataforma, Status (seleção) e Nota (número, 0 a 10).
  - Com status "Quero jogar", o campo Nota fica desabilitado e limpo, e o cliente envia
    `nota: null`.
  - Erros 400 e 409 aparecem junto do campo indicado em `fields`; sem `fields`, aparecem como
    mensagem geral no formulário. O diálogo permanece aberto com os dados digitados.
- **Remover:** pede confirmação; ao confirmar, o item some da lista.
- **Estados da lista:** carregando; erro de API (com opção de tentar de novo); vazio sem nenhum jogo
  ("nenhum jogo cadastrado"); vazio com filtro ativo ("nenhum jogo neste status").
- Depois de criar, editar ou remover, a lista é atualizada sem recarregar a página. Um jogo editado
  para um status fora do filtro ativo deixa de aparecer na lista.
- Os textos "Zerado", "Jogando" e "Quero jogar" existem só no web. O contrato usa os códigos.

## Modelo de dados

**Classificação: aditivo.** Enum novo e model novo, sem linhas existentes. Nada removido, nada
alterado. Não requer aprovação de mudança destrutiva (`RULES.md` §3), mas o `/db-change` ainda é o
caminho da implementação.

```prisma
enum GameStatus {
  ZERADO
  JOGANDO
  QUERO_JOGAR
}

model Game {
  id                   String     @id @default(uuid())
  titulo               String     @db.VarChar(120)
  plataforma           String     @default("") @db.VarChar(60)
  status               GameStatus
  nota                 Int?
  tituloNormalizado    String     @db.VarChar(120)
  plataformaNormalizada String    @default("") @db.VarChar(60)
  criadoEm             DateTime   @default(now())
  atualizadoEm         DateTime   @updatedAt

  @@unique([tituloNormalizado, plataformaNormalizada])
  @@index([status])
}
```

**Normalização (feita no service, nunca pelo cliente):**

- `titulo` e `plataforma` são gravados já com `trim`. Sem plataforma → `""`.
- `tituloNormalizado = titulo.toLowerCase()` e `plataformaNormalizada = plataforma.toLowerCase()`
  (sobre o valor já aparado). O service recalcula as duas colunas a partir do **estado final** em
  todo `POST` e em todo `PATCH` que toque título ou plataforma.
- Espaços internos e acentos **não** são normalizados: "Zelda" e "Zélda" são jogos diferentes, e
  "Hollow Knight" (dois espaços) é diferente de "Hollow Knight".
- A unicidade é o `@@unique` acima, declarado no `schema.prisma`, sem índice com `lower()` escrito à
  mão. Assim o Prisma enxerga toda a estrutura de colunas e índices.

**SQL escrito à mão na migration** (o Prisma não modela `CHECK`; é defesa em profundidade contra
gravação fora do service):

```sql
ALTER TABLE "Game" ADD CONSTRAINT "Game_nota_range_check"
  CHECK ("nota" IS NULL OR ("nota" BETWEEN 0 AND 10));
ALTER TABLE "Game" ADD CONSTRAINT "Game_nota_status_check"
  CHECK ("nota" IS NULL OR "status" <> 'QUERO_JOGAR');
```

**Sem drift:** depois de gerar e aplicar a migration, um **segundo** `npm run db:migrate` **não pode
gerar nenhuma migration nova** (deve informar que o schema já está em sincronia). Isso é critério de
aceite (CA-40). A migration é commitada em `apps/api/prisma/migrations/`.

## Contrato compartilhado

Vai para `packages/shared/src` (código puro, sem `window`/Node/`@prisma/client`); `apps/api` e
`apps/web` importam de `@checkpoint/shared`, sem duplicar shape:

- `GAME_STATUS` (array `as const` com `"ZERADO" | "JOGANDO" | "QUERO_JOGAR"`) e o tipo `GameStatus`.
  **Sem rótulos de tela** — "Quero jogar" vive só no web.
- `Game` (response; datas como string ISO), `CreateGameRequest`, `UpdateGameRequest` e
  `ListGamesQuery` (`{ status?: GameStatus }`).
- `ApiErrorResponse` (`statusCode`, `message`, `fields?: Partial<Record<'titulo' | 'plataforma' | 'status' | 'nota', string>>`).
- Constantes: `GAME_TITLE_MAX_LENGTH` (120), `GAME_PLATFORM_MAX_LENGTH` (60), `GAME_RATING_MIN` (0),
  `GAME_RATING_MAX` (10).
- Função pura `statusAllowsRating(status: GameStatus): boolean` (`false` só para `QUERO_JOGAR`), usada
  pelo service e pelo formulário.

As colunas `tituloNormalizado` e `plataformaNormalizada` **não** entram no contrato.

## Critérios de aceite (testáveis, em BDD)

`curl` contra `http://localhost:3333/api` e passos de UI contra `http://localhost:5173`.

### API — caminho feliz

- [ ] **CA-01** — **Dado** o catálogo vazio, **quando** `POST /api/games` com `{"titulo":"Hollow Knight","status":"JOGANDO"}`, **então** 201, `Game` com `plataforma: null`, `nota: null` e `id` UUID.
- [ ] **CA-02** — **Dado** o catálogo vazio, **quando** `POST /api/games` com `{"titulo":"Celeste","status":"ZERADO","plataforma":"PC","nota":9}`, **então** 201 e o response traz `plataforma: "PC"` e `nota: 9`.
- [ ] **CA-03** — **Dado** `POST` com `{"titulo":"  Outer Wilds  ","status":"QUERO_JOGAR"}`, **quando** a resposta chega, **então** `titulo` é `"Outer Wilds"` (sem espaços nas pontas).
- [ ] **CA-04** — **Dado** `POST` com `plataforma: "   "` (só espaços), **quando** a resposta chega, **então** `plataforma` é `null`.
- [ ] **CA-05** — **Dado** jogos nos três status, **quando** `GET /api/games`, **então** 200 com todos, do `atualizadoEm` mais recente para o mais antigo.
- [ ] **CA-06** — **Dado** jogos nos três status, **quando** `GET /api/games?status=JOGANDO`, **então** 200 só com jogos `JOGANDO`.
- [ ] **CA-07** — **Dado** nenhum jogo `ZERADO`, **quando** `GET /api/games?status=ZERADO`, **então** 200 e `[]`.
- [ ] **CA-08** — **Dado** um jogo `QUERO_JOGAR` sem nota, **quando** `PATCH /api/games/:id` com `{"status":"JOGANDO"}`, **então** 200, `status: "JOGANDO"` e `atualizadoEm` maior que antes; os demais campos ficam iguais.
- [ ] **CA-09** — **Dado** um jogo `ZERADO`, **quando** `PATCH` com `{"status":"JOGANDO"}`, **então** 200 (transição de volta é permitida).
- [ ] **CA-10** — **Dado** um jogo `JOGANDO` com `nota: 7`, **quando** `PATCH` com `{"status":"QUERO_JOGAR","nota":null}`, **então** 200, `status: "QUERO_JOGAR"` e `nota: null`.
- [ ] **CA-11** — **Dado** um jogo com `plataforma: "PC"`, **quando** `PATCH` com `{"plataforma":null}`, **então** 200 e `plataforma: null`.
- [ ] **CA-12** — **Dado** um jogo existente, **quando** `DELETE /api/games/:id`, **então** 204 sem corpo, e um `GET /api/games` seguinte não o inclui.

### API — erros de validação (400)

- [ ] **CA-13** — **Dado** `POST` sem `titulo`, com `titulo: ""` ou com `titulo: "   "`, **quando** enviado, **então** 400 e `fields.titulo` presente.
- [ ] **CA-14** — **Dado** `POST` com `titulo` de 121 caracteres, **quando** enviado, **então** 400 e `fields.titulo` presente.
- [ ] **CA-15** — **Dado** `POST` sem `status` ou com `status: "PAUSADO"`, **quando** enviado, **então** 400 e `fields.status` presente.
- [ ] **CA-16** — **Dado** `POST` com `nota: 11`, `nota: -1` ou `nota: 7.5`, **quando** enviado, **então** 400 e `fields.nota` presente.
- [ ] **CA-17** — **Dado** `POST` com `plataforma` de 61 caracteres, **quando** enviado, **então** 400 e `fields.plataforma` presente.
- [ ] **CA-18** — **Dado** `POST` com um campo não declarado (ex.: `"capa":"x"`), **quando** enviado, **então** 400.
- [ ] **CA-19** — **Dado** `POST` com `{"titulo":"Hades","status":"QUERO_JOGAR","nota":8}`, **quando** enviado, **então** 400 com `fields.nota` = `"Nota só pode ser preenchida quando o status é Zerado ou Jogando"`, e nenhum jogo é criado.
- [ ] **CA-20** — **Dado** `GET /api/games?status=PAUSADO`, **quando** enviado, **então** 400 e `fields.status` presente.
- [ ] **CA-21** — **Dado** um jogo `JOGANDO` com `nota: 7`, **quando** `PATCH` com **só** `{"status":"QUERO_JOGAR"}`, **então** 400 com a mesma mensagem de `fields.nota` do CA-19, e o jogo continua `JOGANDO` com `nota: 7` (validação sobre o estado final, não só o body).
- [ ] **CA-22** — **Dado** um jogo `QUERO_JOGAR` sem nota, **quando** `PATCH` com **só** `{"nota":5}`, **então** 400 com `fields.nota`, e o jogo continua sem nota.
- [ ] **CA-23** — **Dado** um jogo `QUERO_JOGAR` sem nota, **quando** `PATCH` com `{"status":"ZERADO","nota":5}`, **então** 200 com `status: "ZERADO"` e `nota: 5`.
- [ ] **CA-24** — **Dado** um jogo existente, **quando** `PATCH` com `{}`, **então** 400.
- [ ] **CA-25** — **Dado** um jogo existente, **quando** `PATCH` com `{"status":"PAUSADO"}`, **então** 400 e `fields.status` presente.
- [ ] **CA-52** — **Dado** um jogo existente, **quando** `PATCH` com `{"titulo":null}`, **então** 400 com `fields.titulo` presente; **quando** `PATCH` com `{"status":null}`, **então** 400 com `fields.status` presente; em ambos os casos o jogo não muda. (Só `nota` e `plataforma` aceitam `null`.)
- [ ] **CA-26** — **Dado** `PATCH /api/games/abc` ou `DELETE /api/games/abc` (id que não é UUID), **quando** enviado, **então** 400.

### API — recurso inexistente (404)

- [ ] **CA-27** — **Dado** um UUID válido sem jogo correspondente, **quando** `PATCH /api/games/:id` com `{"titulo":"X"}`, **então** 404 com `message` = `"Jogo não encontrado"`.
- [ ] **CA-28** — **Dado** um UUID válido sem jogo correspondente, **quando** `DELETE /api/games/:id`, **então** 404 com `message` = `"Jogo não encontrado"`.
- [ ] **CA-29** — **Dado** um jogo já removido, **quando** `DELETE` no mesmo id de novo, **então** 404.

### API — duplicidade (409)

- [ ] **CA-30** — **Dado** o jogo `{titulo:"Celeste", plataforma:"PC"}`, **quando** `POST` com o mesmo título e plataforma, **então** 409 com `fields.titulo` = `"Já existe esse jogo nesta plataforma"`, e nenhum jogo novo é criado.
- [ ] **CA-31** — **Dado** o jogo `{titulo:"Celeste", plataforma:"PC"}`, **quando** `POST` com `{"titulo":"  cELESTE ","plataforma":"pc "}`, **então** 409 (ignora caixa e espaços nas pontas).
- [ ] **CA-32** — **Dado** o jogo `{titulo:"Celeste", plataforma:"PC"}`, **quando** `POST` com o mesmo título e `plataforma: "Switch"`, **então** 201 (plataforma diferente não é duplicata).
- [ ] **CA-33** — **Dado** o jogo `{titulo:"Celeste"}` (sem plataforma), **quando** `POST` com `{"titulo":"celeste","plataforma":"   "}`, **então** 409 (sem plataforma equivale a "vazia").
- [ ] **CA-34** — **Dado** os jogos `Celeste/PC` e `Hades/PC`, **quando** `PATCH` no `Hades` com `{"titulo":"celeste"}`, **então** 409 e o `Hades` continua com o título original.
- [ ] **CA-35** — **Dado** o jogo `Celeste/PC`, **quando** `PATCH` nele mesmo com `{"titulo":"CELESTE"}` ou `{"nota":8,"status":"ZERADO"}`, **então** 200 (não conflita consigo mesmo).

### Banco e migration

- [ ] **CA-36** — **Dado** a migration aplicada, **quando** um `INSERT` direto em `"Game"` viola `nota BETWEEN 0 AND 10` ou combina `nota` com `status = 'QUERO_JOGAR'`, **então** o banco rejeita (`CHECK`). _Verificação manual; não coberta por teste unitário._
- [ ] **CA-37** — **Dado** a migration aplicada, **quando** dois `INSERT` diretos usam o mesmo par (`tituloNormalizado`, `plataformaNormalizada`), **então** o segundo é rejeitado pelo `@@unique`. _Verificação manual._
- [ ] **CA-38** — **Dado** duas requests `POST` simultâneas com o mesmo título e plataforma, **quando** ambas passam pela checagem prévia, **então** exatamente uma retorna 201 e a outra retorna 409 (não 500).
- [ ] **CA-39** — **Dado** `apps/api/prisma/migrations/`, **quando** a migration do `Game` é gerada, **então** existe um diretório novo commitado e o SQL dos dois `CHECK` está nele.
- [ ] **CA-40** — **Dado** a migration aplicada, **quando** `npm run db:migrate` roda uma segunda vez, **então** nenhuma migration nova é gerada (schema já em sincronia; sem drift).

### Web

- [ ] **CA-41** — **Dado** o catálogo vazio, **quando** abro `/`, **então** vejo o estado "nenhum jogo cadastrado" e o botão "Adicionar jogo".
- [ ] **CA-42** — **Dado** o diálogo aberto, **quando** preencho título, escolho "Jogando" e envio, **então** o diálogo fecha e o jogo aparece na lista com o selo "Jogando", sem recarregar a página.
- [ ] **CA-43** — **Dado** o formulário com status "Zerado" e nota 8, **quando** troco o status para "Quero jogar", **então** o campo Nota fica desabilitado e vazio, e ao enviar a request leva `nota: null`.
- [ ] **CA-44** — **Dado** o jogo `Celeste/PC` existente, **quando** cadastro outro `celeste`/`pc`, **então** o diálogo continua aberto com os dados digitados e a mensagem "Já existe esse jogo nesta plataforma" aparece junto do campo Título.
- [ ] **CA-45** — **Dado** jogos nos três status, **quando** clico no filtro "Zerado", **então** a URL vira `/?status=ZERADO` e só os jogos zerados aparecem; ao recarregar a página, o filtro e a lista continuam iguais.
- [ ] **CA-46** — **Dado** o filtro "Zerado" com nenhum jogo zerado, **quando** a lista carrega, **então** vejo "nenhum jogo neste status".
- [ ] **CA-47** — **Dado** a URL `/?status=PAUSADO`, **quando** a página abre, **então** o filtro "Todos" está ativo e a lista mostra todos os jogos.
- [ ] **CA-48** — **Dado** um jogo `JOGANDO` filtrado por "Jogando", **quando** o edito para "Zerado", **então** ele deixa de aparecer na lista filtrada.
- [ ] **CA-49** — **Dado** um jogo na lista, **quando** clico em Remover e cancelo a confirmação, **então** o jogo continua na lista; **quando** confirmo, o jogo some.
- [ ] **CA-50** — **Dado** a API fora do ar, **quando** abro `/`, **então** vejo a mensagem de erro com a opção de tentar de novo.
- [ ] **CA-51** — **Dado** o app rodando, **quando** abro `/status`, **então** vejo a página de diagnóstico de health (o conteúdo que antes era `/`).

## Plano de testes

- **Unitário — API (Jest, `PrismaService` mockado como objeto de `jest.fn()`; nenhum teste toca o Postgres de desenvolvimento):**
  - `games.service.spec.ts`: criar com e sem plataforma/nota; normalização (`trim`, caixa, plataforma vazia → `""`);
    listar com e sem filtro e a ordenação pedida ao Prisma; regra da nota sobre o **estado final**
    (os quatro casos de CA-21 a CA-23 e CA-10); 404 em `PATCH`/`DELETE` inexistente; duplicata
    detectada na checagem prévia → 409 (CA-30/31/33/34); **`PrismaService` mockado lançando o erro
    `P2002` → o service devolve 409** (CA-38, lado do código); edição do próprio registro não
    conflita (CA-35).
  - `create-game.dto.spec.ts` / `update-game.dto.spec.ts`: passam os DTOs pelo `ValidationPipe`
    com as opções do `main.ts` e cobrem CA-13 a CA-18, CA-24 a CA-26 e CA-52.
  - `packages/shared`: `statusAllowsRating` (sem runner próprio; coberto pelos specs do service e
    do formulário).
- **Unitário — web (Vitest + React Testing Library, `apiClient` mockado; escopo enxuto, só o que tem
  lógica):** `GameForm.test.tsx` — nota desabilitada e limpa em "Quero jogar" e envio de
  `nota: null` (CA-43); mapeamento de `fields` da `ApiErrorResponse` para o campo certo e mensagem
  geral quando não há `fields` (CA-44). Sem teste de snapshot nem de estilo.
- **Manual (`curl`/UI, via `/qa-verify`):** CA-36, CA-37, CA-39, CA-40 (banco e migration, que o mock
  não alcança), CA-38 (corrida real) e CA-41 a CA-51 (UI de ponta a ponta).

Loop de verificação por tarefa:
`npm run typecheck -w <workspace>` → `npm test -w <workspace>` → `npm run lint` → `npm run build`
→ commit.

## Fora de escopo

**Feature do produto (specs futuras):**

- Busca externa de jogos (RAWG ou IGDB) para preencher título/plataforma, e tudo que ela traria:
  capa e demais metadados.
- Capa, datas de início e de zerado, horas jogadas.
- **Autenticação e multiusuário** (model `User`, sessão, `Game.userId`, proteção de rota). Adicionar
  `userId` depois exige migration com backfill.
- Paginação, lixeira/soft-delete, `GET /api/games/:id` (sem tela que use), ordenação escolhida pelo
  usuário, busca por texto.
- Cobertura de código (`test:cov`), que exigiria `@vitest/coverage-v8`.

**Passo de processo (não é critério de aceite):**

- Rodar `db:migrate` e commitar a migration; o commit separado que configura os runners;
  atualizar `ARCHITECTURE.md`, `CLAUDE.md` e `docs/specs/INDEX.md` conforme `RULES.md` §7.

## Notas de ambiente

**Nenhuma variável de ambiente nova** (`.env` e `.env.example` não mudam).

**Banco:** `DATABASE_URL` aponta para um Postgres possivelmente compartilhado/remoto (`RULES.md`
§3). A mudança é aditiva, mas confirmar qual banco é antes de rodar `db:migrate`. Se a conexão for
pooled, `DIRECT_URL` é necessária para o Migrate.

**Node 20.19+.** A máquina de desenvolvimento continua no Node 20.19.0, por decisão do humano. O
piso 20.19 vem do `jsdom@27` (`engines: ^20.19.0 || ^22.12.0 || >=24.0.0`). Os pacotes de teste
foram escolhidos conferindo o `engines` de cada um no registry (2026-09-23); as versões mais novas
`vitest@5` (`^22.12.0 || ...`), `jsdom@30` (`^22.22.2 || ...`) e `@testing-library/jest-dom@7` /
`6.10.0` (`>=22`) **não** rodam em Node 20 e ficam de fora. Se o Node subir no futuro, essas
versões podem ser reavaliadas em spec própria. Node 20 já saiu da janela de manutenção
(abril de 2026); manter nele é risco assumido, não recomendação.

**Commit 1 (`chore(test)`), separado e anterior à feature — dependências aprovadas na entrevista
(`RULES.md` §9), versões consultadas no registry em 2026-09-23:**

| Workspace         | devDependencies                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| raiz              | nenhuma; só o script `"test": "npm test --workspaces --if-present"`                                                                                                            |
| `apps/api`        | `jest@^30.5.2`, `ts-jest@^29.4.13`, `@types/jest@^30.0.0`, `@nestjs/testing@^11.2.6`                                                                                           |
| `apps/web`        | `vitest@^4.1.11`, `jsdom@^27.4.0`, `@testing-library/react@^16.3.3`, `@testing-library/dom@^10.4.2`, `@testing-library/jest-dom@~6.9.1`, `@testing-library/user-event@^14.6.7` |
| `packages/shared` | nenhuma                                                                                                                                                                        |

- `@nestjs/testing` fica em `^11` para casar com `@nestjs/core@11`; a última do registry é a 12.
- `@testing-library/jest-dom` usa `~6.9.1` (só patches de 6.9.x), **não** `^6`: o `^6` resolveria
  para a 6.10.0, que exige Node ≥ 22.
- `vitest@^4.1.11` casa com o `vite@6.4.3` já instalado (`vite: ^6 || ^7 || ^8`) e com
  `@types/node@^22`.
- `jest@^30` (`engines: ^18.14 || ^20 || ^22 || >=24`) e `ts-jest@^29.4.13` (`>=20`, aceita
  `jest ^29 || ^30` e `typescript >=4.3 <7`) rodam em Node 20.19 sem mudança.
- `@vitejs/plugin-react` já existe em `apps/web`.
- **Node, no mesmo commit:** `engines.node` da raiz muda de `">=22"` para `">=20.19"`; `.nvmrc`
  muda de `24` para `20.19` (não `20`: um Node 20 anterior ao 20.19 já instalado quebraria o
  `jsdom@27`); `package-lock.json` acompanha a mudança de `engines`; e `ARCHITECTURE.md`
  §1 passa a dizer Node 20.19+ (a tabela hoje não cita Node; a linha é acrescentada).
- Script `"test"` em cada workspace de app (`jest` na API, `vitest run` no web) e na raiz.
- Ajustes de config, sem dependência: `types` de `jest` no `tsconfig` da API; `tsconfig.build.json`
  para `*.spec.ts` não ir para `dist/`; globals de teste no `eslint.config.mjs`.
- Docs atualizadas **no mesmo commit**: `ARCHITECTURE.md` §1 (linha "Testes"), `CLAUDE.md` (seção
  "O que este projeto ainda não tem" e comandos), e — **apenas a frase que deixou de ser
  verdadeira, sem alterar nenhuma regra** — `RULES.md` §5 e `.claude/skills/checkpoint-testing/SKILL.md`.
  A aprovação do humano para essas duas edições foi dada na entrevista.

**Commit(s) da feature:** `ARCHITECTURE.md` atualizado no mesmo commit que cria cada peça (módulo
`games` em §4.4, feature em §5.4, model em §7, rotas em §5.1/§3, `packages/shared` em §6).

## Suposições

Marcadas explicitamente. As de A a E foram aprovadas pelo humano na entrevista; o restante entra na
aprovação desta spec.

- **A (aprovada)** — `CHECK` no banco: `nota` entre 0 e 10 e `nota` nula quando `status = QUERO_JOGAR`.
- **B (aprovada)** — `id` que não é UUID retorna 400; UUID válido e inexistente retorna 404.
- **C (aprovada)** — `PATCH` com body vazio `{}` retorna 400.
- **D (aprovada)** — plataforma `null`, ausente ou só espaços vira "sem plataforma"; a API expõe `null`
  (o banco guarda `""`).
- **E (aprovada)** — formato `ApiErrorResponse` com `fields`; o 409 de duplicata aponta `fields.titulo`.
  O mecanismo (`exceptionFactory` do `ValidationPipe` ou filtro em `common/filters/`) é decisão da
  implementação.
- **F (aprovada, revisada)** — o catálogo vai para `/`; a página de diagnóstico de health vai para
  `/status`.
- Limites de tamanho: título até 120 e plataforma até 60 caracteres, escolhidos por padrão razoável
  (não vieram do pedido).
- Acentos e espaços internos não entram na normalização de duplicidade (só `trim` e minúsculas).
- IDs são UUID (`@default(uuid())`).
- Desempate da ordenação: `criadoEm` decrescente.
- `DELETE` devolve 204 sem corpo.
- Valor inválido em `?status=` na URL do web é tratado como "Todos".
- Nenhuma dependência de runtime nova; o formulário e o diálogo usam o que já existe.

## Questões em aberto

Nenhuma.
