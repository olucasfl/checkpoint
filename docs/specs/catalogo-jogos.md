# Spec: catálogo de jogos

> Status: aprovada

## Objetivo

Permitir registrar jogos manualmente e classificá-los em três status (zerado, jogando, quero jogar),
com plataforma, nota e capa (imagem enviada por upload) opcionais, e listar, filtrar, editar e
remover esse catálogo pessoal, numa interface escura "Neon arcade".

Esta é a primeira feature de domínio do checkpoint. Toca `apps/api`, `apps/web`, `packages/shared`,
`apps/api/prisma/schema.prisma` e o Supabase Storage (bucket de capas). É implementada em **três
etapas**, cada uma parando para validação (ver "Ordem de implementação").

> **Aviso de segurança:** o catálogo é único e sem dono, e a API fica **sem autenticação nem
> proteção**. Até existir uma spec de auth, a aplicação só deve rodar local ou em rede confiável.
>
> Com a capa, o risco cresce: a API passa a **escrever no Supabase Storage** em nome de qualquer
> requisição (o backend usa a service role key). Quem alcançar a API consegue enviar arquivos ao
> bucket (até 2 MB cada) e apagar capas existentes. O limite de tamanho, a lista de tipos aceitos e
> a regra "uma capa por jogo" reduzem o dano, mas **não** substituem autenticação. A service role
> key vive só em `apps/api/.env`: nunca vai para o web (nem como `VITE_*`), nunca para log, spec,
> teste ou commit (`RULES.md` §8).

## Stack

Padrão da casa (`ARCHITECTURE.md`). **Nenhuma dependência de runtime nova**; a única dependência
nova é `@types/multer` (dev, `apps/api`, etapa 2). Diferenças:

- **Supabase Storage** guarda as capas (mesmo projeto do banco), num bucket público `capas`: leitura
  pública; escrita só pelo backend, com a service role key. O `StorageService` fala com a **API REST
  do Storage pelo `fetch` nativo do Node 20**, sem `@supabase/supabase-js` (ver "Notas de
  ambiente").
- **`multer` já vem com `@nestjs/platform-express`** (`multer@2.4.0`, confirmado em
  `node_modules`); não é adicionado. Só `@types/multer` entra, como devDependency.
- **Fontes e ícones do Google Fonts** (Orbitron, Rajdhani, Material Symbols Rounded) por `<link>` em
  `apps/web/index.html`, sem pacote npm.
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
- **Capa (opcional, uma por jogo):** enviada por arquivo, em requisição separada do JSON do jogo.
  Só JPEG, PNG e WebP, identificados pelo **conteúdo** do arquivo (assinatura/magic bytes) e não
  pelo `Content-Type` nem pela extensão; até 2 MB. Trocar a capa apaga a imagem antiga do storage;
  remover a capa, ou remover o jogo, também apaga o arquivo.
- **Falha no envio da capa não desfaz o jogo:** no web, criar/editar primeiro salva o jogo e só
  depois envia a capa. Se o envio falhar, o jogo continua salvo e o erro aparece no campo da capa.
- **Falha do storage é 502, nunca 500.** Remover um jogo apaga a capa em _best effort_: se o storage
  falhar, o jogo é removido mesmo assim e a falha vai para o log.
- **Sem capa,** o web mostra uma capa gerada: cor derivada do título (paleta fixa) + iniciais.
- **Painéis de contagem no web** mostram quantos jogos há em Zerado, Jogando e Quero jogar; as
  contagens vêm da lista completa, sem endpoint novo.
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
- Se o jogo tinha capa, o arquivo é removido do storage depois de apagar a linha (_best effort_: se
  falhar, ainda **204** e a falha vai para o log, sem segredos).

**Capa (etapa 2)** — rotas separadas do JSON do jogo. `@ApiConsumes('multipart/form-data')` e
`@ApiBody` documentam o upload no Swagger.

**`PUT /api/games/:id/capa`** — `multipart/form-data` com **um** arquivo no campo `arquivo`.

- Regras do arquivo: JPEG, PNG ou WebP, pela **assinatura** (JPEG `FF D8 FF`; PNG
  `89 50 4E 47 0D 0A 1A 0A`; WebP `RIFF` + 4 bytes + `WEBP`); até 2 MB (2 × 1024 × 1024 bytes).
  A checagem é feita sobre o buffer, sem confiar em `Content-Type` nem no nome do arquivo.
- Sucesso: **200** + `Game` com `capaUrl` preenchida.
- Erros (todos, exceto `id` e 404, trazem `fields.arquivo`):
  - **400** — `id` que não é UUID; campo `arquivo` ausente, com outro nome ou arquivo vazio; tipo
    fora de JPEG/PNG/WebP. Mensagem do tipo: `"A capa deve ser uma imagem JPEG, PNG ou WebP"`.
  - **413** — arquivo maior que 2 MB. Mensagem: `"A capa deve ter no máximo 2 MB"`.
  - **404** — UUID válido sem jogo correspondente (`"Jogo não encontrado"`).
  - **502** — falha do storage. Mensagem: `"Falha ao acessar o armazenamento de capas"`. Nunca 500.
- **Ordem das checagens** (a real do Nest, em que o interceptor lê o multipart **antes** dos
  pipes): limite de tamanho e campo no parse do multipart (413/400) → `id` (400) → jogo existe (404)
  → assinatura do arquivo (400) → storage (502). Portanto um arquivo grande enviado para um id
  inexistente retorna 413, um arquivo inválido para um id inexistente retorna 404, e um arquivo
  grande enviado para um id que nem é UUID retorna 413 (não 400).
- Objeto no bucket: `<gameId>/<uuid>.<ext>`, com `<ext>` = `jpg`, `png` ou `webp` conforme a
  assinatura detectada, e `Content-Type` gravado = o tipo detectado. O `<uuid>` novo a cada envio
  evita problema de cache.
- Fluxo: envia o objeto novo → atualiza `capaPath` no banco → remove o objeto antigo, se houver
  (_best effort_: se a remoção falhar, ainda **200** e a falha vai para o log).

**`DELETE /api/games/:id/capa`**

- Sucesso: **200** + `Game` com `capaUrl: null`. Idempotente: jogo sem capa também devolve 200, sem
  chamar o storage.
- Erros: **400** (`id` que não é UUID), **404** (jogo inexistente), **502** (falha do storage;
  `fields.arquivo` presente; a capa continua associada ao jogo).
- Fluxo: remove o objeto do storage → zera `capaPath` no banco.

**`Game` (response):**

```json
{
  "id": "uuid",
  "titulo": "Hollow Knight",
  "plataforma": "PC",
  "status": "ZERADO",
  "nota": 9,
  "capaUrl": "https://<ref>.supabase.co/storage/v1/object/public/capas/<gameId>/<uuid>.png",
  "criadoEm": "2026-09-23T12:00:00.000Z",
  "atualizadoEm": "2026-09-23T12:00:00.000Z"
}
```

`plataforma`, `nota` e `capaUrl` são `null` quando ausentes. `capaUrl` (a partir da etapa 2) é a URL
pública montada a partir de `SUPABASE_URL`, do bucket e do `capaPath`; o `capaPath` cru **nunca**
aparece em response. As colunas normalizadas (ver "Modelo de dados") também **não** aparecem. Trocar
ou remover a capa atualiza `atualizadoEm` do jogo (o `@updatedAt` do Prisma) e o reordena na lista.
`POST` e `PATCH` do JSON **não** aceitam `capaUrl` nem `capaPath` (campo desconhecido → 400).

**Formato de erro (400 e 409) — `ApiErrorResponse`:**

```json
{
  "statusCode": 409,
  "message": "Já existe esse jogo nesta plataforma",
  "fields": { "titulo": "Já existe esse jogo nesta plataforma" }
}
```

- `fields` é opcional e mapeia o nome do campo (`titulo`, `plataforma`, `status`, `nota`, e
  `arquivo` para erros de capa) para uma mensagem. Todo 400 de validação de campo traz `fields`; o 404 traz só `statusCode` e `message`.
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
  tratado como "Todos".
- **Dados:** o web busca a lista **completa** uma única vez (`GET /api/games`, sem `status`) e
  aplica o filtro e as contagens no cliente. Assim as contagens dos painéis e dos filtros vêm da mesma
  query e continuam corretas depois de criar, editar ou remover, sem endpoint novo. O filtro
  `?status=` da API continua existindo (para `curl` e usos futuros), mas o web não o envia.
- **Cada item da lista:** capa 52×52 (a imagem enviada ou a capa gerada), título, plataforma
  (omitida se vazia), selo do status, nota como barra + número ("SEM NOTA" se vazia) e as ações
  Editar e Remover. O detalhe visual está em "Diretrizes visuais".
- **Adicionar jogo:** botão que abre um `<dialog>` com o formulário. Editar abre o **mesmo**
  formulário preenchido.
- **Formulário:** campos Título, Plataforma, Status (três botões de opção), Nota (número, 0 a 10) e
  Capa (arquivo).
  - **Capa:** escolher um arquivo mostra um **preview** antes de salvar; nada é enviado até
    Salvar. "Remover capa" descarta o arquivo escolhido e, num jogo que já tem capa, marca a capa
    para ser removida ao salvar. O web confere tipo e tamanho antes de enviar (comodidade; a API
    continua sendo a autoridade) usando as constantes de `@checkpoint/shared`.
  - **Salvar com capa:** `POST`/`PATCH` do jogo primeiro; depois `PUT /capa` (se há arquivo novo) ou
    `DELETE /capa` (se marcada para remover). Se o jogo foi salvo e a capa falhou, o diálogo
    **continua aberto**, o formulário passa a editar **aquele jogo** (o próximo Salvar é `PATCH`, não
    `POST`, para não gerar 409 de duplicata) e o erro aparece no campo da capa. A lista já mostra o
    jogo salvo.
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

**Classificação: aditivo, em duas migrations.** Migration 1 (etapa 1): enum novo e model novo, sem
linhas existentes. Migration 2 (etapa 2): um campo opcional novo (`capaPath`). Nada removido, nada
alterado, nenhum campo obrigatório novo em tabela com linhas. Não requer aprovação de mudança
destrutiva (`RULES.md` §3), mas o `/db-change` ainda é o caminho da implementação.

O bloco abaixo é o schema da **migration 1**; a migration 2 está logo depois do bloco de `CHECK`.

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

**Migration 2 (etapa 2) — capa:** acrescenta ao model `Game`

```prisma
  capaPath String? @db.VarChar(120)   // caminho do objeto no bucket: "<gameId>/<uuid>.<ext>"
```

`VarChar(120)` cobre 36 (UUID do jogo) + 1 + 36 (UUID do arquivo) + até 5 (`.webp`). O campo guarda
o **caminho**, não a URL: a URL pública (`capaUrl`) é montada em tempo de resposta a partir de
`SUPABASE_URL` e do bucket, então trocar de projeto ou de bucket não exige migrar dados. Linhas
existentes ficam com `capaPath = NULL`.

**Sem drift:** depois de gerar e aplicar **cada** migration (a da etapa 1 e a da etapa 2), um
**segundo** `npm run db:migrate` **não pode gerar nenhuma migration nova** (deve informar que o
schema já está em sincronia). Isso é critério de aceite (CA-40 e CA-70). Cada migration é commitada
em `apps/api/prisma/migrations/`.

## Contrato compartilhado

Vai para `packages/shared/src` (código puro, sem `window`/Node/`@prisma/client`); `apps/api` e
`apps/web` importam de `@checkpoint/shared`, sem duplicar shape:

- `GAME_STATUS` (array `as const` com `"ZERADO" | "JOGANDO" | "QUERO_JOGAR"`) e o tipo `GameStatus`.
  **Sem rótulos de tela** — "Quero jogar" vive só no web.
- `Game` (response; datas como string ISO), `CreateGameRequest`, `UpdateGameRequest` e
  `ListGamesQuery` (`{ status?: GameStatus }`).
- `ApiErrorResponse` (`statusCode`, `message`, `fields?: Partial<Record<'titulo' | 'plataforma' | 'status' | 'nota' | 'arquivo', string>>`).
- Constantes: `GAME_TITLE_MAX_LENGTH` (120), `GAME_PLATFORM_MAX_LENGTH` (60), `GAME_RATING_MIN` (0),
  `GAME_RATING_MAX` (10).
- **A partir da etapa 2:** `Game` ganha `capaUrl: string | null`; constantes
  `GAME_COVER_MAX_BYTES` (`2 * 1024 * 1024`) e `GAME_COVER_MIME_TYPES`
  (`['image/jpeg', 'image/png', 'image/webp']`), usadas pelo web para a pré-checagem e pela API
  como fonte única do limite. O `PUT /capa` não tem DTO JSON (é multipart); o campo `arquivo` é o
  nome do campo do formulário.
- Função pura `statusAllowsRating(status: GameStatus): boolean` (`false` só para `QUERO_JOGAR`), usada
  pelo service e pelo formulário.

As colunas `tituloNormalizado` e `plataformaNormalizada` **não** entram no contrato.

## Diretrizes visuais

Direção **"Neon arcade"**, baseada no mockup A aprovado pelo humano (lista + formulário). Vale para a
etapa 3 (`apps/web`).

Mockup visual (privado): https://claude.ai/artifact/McB5PwRtXHfp4eDFkoTwyW, direção A

As diretrizes escritas abaixo continuam sendo a **referência verificável**; o mockup é só apoio
visual e não está no repositório.

### Tokens

Tema escuro fixo (sem alternância claro/escuro). Os tokens são declarados no `@theme` do Tailwind 4,
em `apps/web/src/styles/index.css`, **e esse é o único lugar onde um hex aparece**: os componentes
usam só as classes/variáveis dos tokens.

| Token            | Hex       | Uso                                                                                   | Contraste sobre `fundo` / `painel` |
| ---------------- | --------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| `fundo`          | `#07040f` | fundo da página                                                                       | n/a                                |
| `painel`         | `#110a20` | painéis, linhas da lista, diálogo                                                     | n/a                                |
| `painel-2`       | `#0f0a1c` | contêineres internos e campos                                                         | n/a                                |
| `borda`          | `#2a1d45` | divisórias e contorno de painéis (decorativo)                                         | 1,32 / n/a                         |
| `texto`          | `#ece6ff` | texto principal                                                                       | 16,77 / 15,93                      |
| `texto-suave`    | `#9a8cc2` | texto secundário, placeholder, "SEM NOTA"                                             | 6,68 / 6,35                        |
| `apagado`        | `#5d5080` | só decorativo: segmentos vazios da barra de nota                                      | 2,83 / 2,69                        |
| `apagado-2`      | `#6e6194` | só controle e ícone **desabilitados**                                                 | 3,68 / 3,49                        |
| `borda-controle` | `#796ca0` | contorno de inputs, botões de status, área da capa, botões de ação e **anel de foco** | 4,32 / 4,10 (`painel-2`: 4,13)     |
| `magenta`        | `#ff3ea5` | acento primário (logo, botão principal)                                               | 6,28 / 5,96                        |
| `ciano`          | `#22d3ee` | status Jogando, filtro ativo                                                          | 11,25 / 10,68                      |
| `lima`           | `#a3e635` | status Zerado                                                                         | 13,48 / 12,80                      |
| `ambar`          | `#fbbf24` | status Quero jogar                                                                    | 12,17 / 11,56                      |
| `erro`           | `#ff4d6d` | erro (borda do campo, mensagem)                                                       | 6,32 / 6,01                        |

Contrastes calculados pela fórmula WCAG 2.x. Consequências (regras, não sugestões):

1. **Texto informativo** usa só `texto`, `texto-suave` ou um acento (todos ≥ 4,5:1). `apagado` e
   `apagado-2` (2,7 a 3,7:1) **não** podem ser cor de texto: ficam abaixo de AA.
2. **Contorno de controles e anel de foco** (inputs, botões de status, área da capa, botões de
   ação) usam `borda-controle` (`#796ca0`): 4,32:1 sobre `fundo`, 4,10:1 sobre `painel` e 4,13:1
   sobre `painel-2`, acima do mínimo de 3:1 (WCAG 1.4.11). `borda` (1,32:1) só serve de divisória e
   contorno decorativo de painel, **nunca** de controle. `apagado-2` só aparece em controle
   **desabilitado** (exceção da WCAG).
3. **Texto sobre preenchimento `magenta`** usa `fundo` (6,28:1), não `texto` (2,67:1).

`borda-controle` foi calculado por interpolação entre `apagado-2` e `texto-suave`: fica com margem
sobre o mínimo de 3:1 e abaixo de `texto-suave` na hierarquia visual. (O `apagado-2` sozinho já dava
3,49:1 sobre `painel`, mas com pouca folga e com o nome ligado a "apagado".)

### Fontes e ícones

- `--font-display`: **Orbitron** (títulos, números, botões). `--font-corpo`: **Rajdhani** (texto).
  Carregadas por `<link>` do Google Fonts em `apps/web/index.html` (`display=swap`, com `system-ui`
  de reserva). Sem pacote npm.
- Ícones: **Material Symbols Rounded**, também por `<link>` do Google Fonts. Ícone decorativo leva
  `aria-hidden="true"`; botão só com ícone leva `aria-label`.

### Componentes

- **Fundo:** _scanlines_ e orbes de brilho, decorativos, só em CSS.
- **Topo:** logo "CHECKPOINT" (Orbitron) com ícone de bandeira; botão "Adicionar jogo" (preenchimento
  `magenta`, texto `fundo`) com brilho pulsando.
- **Painéis de contagem:** três, "Zerados" (`lima`), "Jogando" (`ciano`) e "Quero jogar" (`ambar`),
  com o número em Orbitron. Contagens derivadas da lista completa no web (ver "Requisitos de saída").
- **Filtros:** botões com ícone, rótulo e contagem: Todos (total), Jogando, Quero jogar, Zerado. O
  ativo fica `ciano` com brilho e `aria-pressed="true"`.
- **Linha do jogo:** capa 52×52; título; plataforma com ícone; selo de status com ícone (Jogando com
  um ponto piscando); nota como **barra de 10 segmentos + número** (`role="img"` com
  `aria-label="Nota 8 de 10"`; nota 0 = nenhum segmento preenchido e "0"; "SEM NOTA" quando vazia);
  ações editar e remover (ícone + `aria-label`). Hover da linha com destaque.
- **Capa gerada** (jogo sem imagem): quadrado 52×52 com cor escolhida de uma **paleta fixa de 6
  tokens** (`capa-1` a `capa-6`) por hash determinístico do título normalizado (`trim` + minúsculas),
  e as iniciais em Orbitron (primeira letra de cada uma das duas primeiras palavras, maiúsculas; uma
  palavra só → uma letra). O texto das iniciais tem contraste ≥ 4,5:1 sobre a cor. O mesmo título
  gera sempre a mesma capa.
- **Formulário (`<dialog>`):** status como **3 botões com ícone** (`aria-pressed`; exatamente um
  ativo); campo com erro ganha borda `erro`, mensagem e uma **animação curta de tremer**; Nota
  **bloqueada com ícone de cadeado** quando o status é "Quero jogar"; área da capa com preview,
  escolher arquivo e "Remover capa".

### Movimento

Todas as animações são só CSS/Tailwind, **sem biblioteca**: _scanlines_, orbes de fundo, pulso do
botão, ponto piscando do "Jogando", tremer do campo com erro e o hover das linhas. Sob
`prefers-reduced-motion: reduce` **todas ficam desligadas** e o estado estático equivalente
permanece: ponto fixo, brilho do botão sem pulso, campo com erro só com a borda `erro` (sem tremer).

### Acessibilidade

- Contraste AA no texto (≥ 4,5:1) e ≥ 3:1 nos contornos de controles (regras acima).
- **Foco visível** em tudo que é clicável (anel de 2 px em `borda-controle`, com _offset_ de 2 px, que o distingue do contorno de 1 px do
  estado normal).
- **Alvo de toque ≥ 44 × 44 px** em botões, filtros e ações da linha.
- **Esc fecha o diálogo** (`<dialog>` aberto com `showModal()`), e o foco volta ao botão que o abriu.

## Ordem de implementação

Três etapas. **Cada uma termina com `typecheck`, `lint`, `build` e testes verdes e PARA**: a
seguinte só começa com um "ok" explícito do humano depois de validar. Cada etapa é um ou mais
commits na branch `feat/catalogo-jogos`, com `ARCHITECTURE.md` atualizado junto do que ela criar.

| Etapa | Entrega                                                                                                                                                                                                                | Critérios de aceite                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1     | Commit 1 `chore(test)` (runners, Node, docs) · `packages/shared` sem capa · schema do `Game` + migration 1 · API CRUD sem capa · testes da API                                                                         | CA-01 a CA-40 e CA-52                                       |
| 2     | `@types/multer` (dev) · migration 2 (`capaPath`) · `StorageService` · envs `SUPABASE_*` · rotas `PUT`/`DELETE /capa` · limpeza da capa ao remover o jogo · `capaUrl` no contrato · testes com `StorageService` mockado | CA-53 a CA-71 e CA-90 (e CA-40 de novo, para a migration 2) |
| 3     | Web completo "Neon arcade": tokens, fontes, ícones, catálogo em `/`, diagnóstico em `/status`, painéis, filtros, formulário com capa, capa gerada, movimento e acessibilidade · testes do web                          | CA-41 a CA-51 e CA-72 a CA-89                               |

Antes de **verificar** a etapa 2 são necessários dois passos humanos (registrados em "Pendências de
execução humana" no `INDEX.md`): criar o bucket `capas` no Supabase e preencher as três variáveis
`SUPABASE_*` em `apps/api/.env`. Os testes unitários da etapa 2 não dependem disso (nada fala com o
Supabase real).

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
- [ ] **CA-18** — **Dado** `POST` com um campo não declarado (ex.: `"cor":"x"`), **quando** enviado, **então** 400.
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
- [ ] **CA-39** — **Dado** `apps/api/prisma/migrations/`, **quando** a migration 1 do `Game` é gerada, **então** existe um diretório novo commitado e o SQL dos dois `CHECK` está nele.
- [ ] **CA-40** — **Dado** cada migration aplicada (a da etapa 1 e a da etapa 2), **quando** `npm run db:migrate` roda uma segunda vez, **então** nenhuma migration nova é gerada (schema já em sincronia; sem drift).

### API — capa (etapa 2)

Os que dependem do Supabase real são verificação manual; os demais têm teste unitário com
`StorageService` mockado.

- [ ] **CA-53** — **Dado** um jogo sem capa, **quando** `PUT /api/games/:id/capa` com um PNG válido de 200 KB no campo `arquivo`, **então** 200, `capaUrl` não nula, cujo caminho termina em `/<gameId>/<uuid>.png`, e `GET` nessa URL devolve 200 com `Content-Type: image/png`. _Manual (bucket real)._
- [ ] **CA-54** — **Dado** um jogo sem capa, **quando** envio um JPEG válido e depois (em outro jogo) um WebP válido, **então** as `capaUrl` terminam em `.jpg` e `.webp`, respectivamente.
- [ ] **CA-55** — **Dado** um PNG válido enviado com `Content-Type: application/octet-stream` e nome `foto.bin`, **quando** `PUT /capa`, **então** 200 (a assinatura vale, não o cabeçalho nem o nome). **Dado** um arquivo de texto chamado `falso.png` enviado com `Content-Type: image/png`, **quando** `PUT /capa`, **então** 400 com `fields.arquivo` = `"A capa deve ser uma imagem JPEG, PNG ou WebP"` e nenhum objeto é criado no bucket.
- [ ] **CA-56** — **Dado** um GIF, um SVG ou um PDF, **quando** `PUT /capa`, **então** 400 com a mesma mensagem de `fields.arquivo` do CA-55.
- [ ] **CA-57** — **Dado** um PNG válido de 2 MB + 1 byte, **quando** `PUT /capa`, **então** 413 com `fields.arquivo` = `"A capa deve ter no máximo 2 MB"`, e o jogo (inclusive a capa antiga, se havia) não muda. **Dado** um PNG válido de ~1,9 MB, **então** 200.
- [ ] **CA-58** — **Dado** `PUT /capa` sem o campo `arquivo`, com o arquivo em outro campo (ex.: `file`) ou com um arquivo vazio, **quando** enviado, **então** 400 com `fields.arquivo` presente.
- [ ] **CA-59** — **Dado** `PUT /api/games/abc/capa` (id que não é UUID), **então** 400. **Dado** um UUID válido sem jogo e um PNG válido, **então** 404 com `message` = `"Jogo não encontrado"`. **Dado** o mesmo UUID e um arquivo de 2 MB + 1 byte, **então** 413 (o limite de tamanho vem antes da checagem do jogo).
- [ ] **CA-60** — **Dado** um jogo com capa, **quando** `GET /api/games` e `PATCH /api/games/:id` (ex.: `{"nota":8}`), **então** os dois trazem o mesmo `capaUrl` e **nenhum** response contém `capaPath`; **e** `POST /api/games` devolve `capaUrl: null`.
- [ ] **CA-61** — **Dado** um jogo com capa, **quando** `PUT /capa` com outra imagem, **então** 200, o novo `capaUrl` tem `<uuid>` diferente, o objeto antigo não está mais no bucket (listagem do bucket para o prefixo `<gameId>/` mostra só o novo; ou `GET` na URL antiga **com um parâmetro de query novo** dá status ≠ 200; a URL original pode continuar respondendo 200 por até ~1 min por causa do CDN), e `atualizadoEm` avança. _Manual (bucket real)._
- [ ] **CA-62** — **Dado** um jogo com capa e o `StorageService` mockado falhando ao remover o objeto antigo, **quando** `PUT /capa` com imagem válida, **então** 200 com a capa nova ativa, e o log registra um aviso (sem segredos).
- [ ] **CA-63** — **Dado** o `StorageService` falhando no upload, **quando** `PUT /capa`, **então** 502 com `fields.arquivo` = `"Falha ao acessar o armazenamento de capas"`, o `capaPath` do jogo fica como estava, e **nunca** 500. _Manual: com o nome do bucket errado no `.env`._
- [ ] **CA-64** — **Dado** um jogo com capa, **quando** `DELETE /api/games/:id/capa`, **então** 200 com `capaUrl: null` e o objeto some do bucket (prova: listagem do bucket para o prefixo `<gameId>/` vazia; a URL original pode servir a imagem em cache por até ~1 min); **quando** repito, **então** 200 de novo (sem chamada ao storage). **Dado** id inexistente, **então** 404; id não UUID, **então** 400.
- [ ] **CA-65** — **Dado** o `StorageService` falhando na remoção, **quando** `DELETE /capa`, **então** 502 com `fields.arquivo` presente e a capa continua associada ao jogo.
- [ ] **CA-66** — **Dado** um jogo com capa, **quando** `DELETE /api/games/:id`, **então** 204 e o objeto some do bucket (prova: listagem do bucket para o prefixo `<gameId>/` vazia; a URL original pode servir a imagem em cache por até ~1 min). **Dado** o `StorageService` falhando na remoção, **então** ainda 204, o jogo some da lista e o log registra um aviso sem segredos.
- [ ] **CA-67** — **Dado** `POST` ou `PATCH /api/games` com `capaUrl` ou `capaPath` no body, **quando** enviado, **então** 400 (campo desconhecido).
- [ ] **CA-68** — **Dado** `apps/api/.env` sem `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_STORAGE_BUCKET`, **quando** a API sobe, **então** ela falha listando a variável ausente; e `apps/api/.env.example` lista as três **sem valor real**.
- [ ] **CA-69** — **Dado** o código e o build, **quando** procuro `SUPABASE_SERVICE_ROLE_KEY` e `service_role` em `apps/web/src` e `apps/web/dist`, **então** não há ocorrência, não existe nenhuma variável `VITE_SUPABASE_*`, e nenhum response ou linha de log da API contém o valor da chave.
- [ ] **CA-70** — **Dado** a migration 2, **quando** aplicada, **então** `Game` ganha `capaPath` nulável, as linhas existentes ficam com `capaPath = NULL`, a migration só adiciona (nada é removido ou alterado), e um segundo `db:migrate` não gera migration nova.
- [ ] **CA-71** — **Dado** `SUPABASE_*` ausentes no ambiente e sem rede, **quando** `npm test -w @checkpoint/api`, **então** a suíte passa (nenhum teste fala com o Supabase real).
- [ ] **CA-90** — **Dado** `SUPABASE_SERVICE_ROLE_KEY` começando com `sb_publishable_`, **quando** a API sobe (ou a validação de ambiente roda), **então** ela falha com a mensagem `"SUPABASE_SERVICE_ROLE_KEY parece a chave publishable; use a secret key (sb_secret_…) ou a service_role legada"`; **e** uma chave `sb_secret_…` (ou um JWT legado) passa na validação.

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

### Web — capa, painéis e visual (etapa 3)

- [ ] **CA-72** — **Dado** um jogo sem capa, **quando** a lista carrega, **então** a linha mostra um quadrado 52×52 com as iniciais do título ("Hollow Knight" → "HK"; "Celeste" → "C") sobre uma cor da paleta fixa; **e** recarregar a página mantém a mesma cor, e outro jogo com o mesmo título (em outra plataforma) tem a mesma cor.
- [ ] **CA-73** — **Dado** um jogo com `capaUrl`, **quando** a lista carrega, **então** a linha mostra a imagem 52×52 no lugar das iniciais; **e** se a imagem falhar ao carregar, a linha volta para a capa gerada.
- [ ] **CA-74** — **Dado** o formulário aberto, **quando** escolho um PNG válido, **então** vejo o preview da imagem, e **nenhuma** request de upload sai antes de eu clicar em Salvar.
- [ ] **CA-75** — **Dado** o formulário de novo jogo com título, status e um PNG válido escolhido, **quando** salvo, **então** o web faz `POST /api/games` e depois `PUT /api/games/:id/capa`, o diálogo fecha e a linha mostra a capa.
- [ ] **CA-76** — **Dado** que o `POST` do jogo deu certo e o `PUT` da capa falhou (ex.: 502), **quando** o formulário reage, **então** o jogo aparece na lista, o diálogo continua aberto, a mensagem de erro aparece no campo da capa, e ao salvar de novo o web faz `PATCH` (não `POST`) e a operação não retorna 409.
- [ ] **CA-77** — **Dado** o formulário aberto, **quando** escolho um GIF ou um PNG de 3 MB, **então** a área da capa mostra a mensagem de erro correspondente e **nenhuma** request é enviada.
- [ ] **CA-78** — **Dado** um jogo com capa, **quando** edito, clico "Remover capa" e salvo, **então** o web faz `DELETE /api/games/:id/capa` e a linha volta à capa gerada; **e** se eu cancelo o diálogo em vez de salvar, a capa continua.
- [ ] **CA-79** — **Dado** 2 jogos Jogando, 1 Zerado e 0 Quero jogar, **quando** abro `/`, **então** os painéis mostram Zerados 1, Jogando 2, Quero jogar 0; **quando** crio um jogo Jogando → Jogando 3; **quando** o edito para Zerado → Jogando 2 e Zerados 2; **quando** o removo → Zerados 1. Tudo sem recarregar a página.
- [ ] **CA-80** — **Dado** a lista com jogos, **quando** olho os filtros, **então** cada um mostra ícone, rótulo e contagem ("Todos" = total), e exatamente o ativo tem `aria-pressed="true"` e a cor `ciano` com brilho.
- [ ] **CA-81** — **Dado** jogos com nota 8, nota 0 e sem nota, **quando** a lista carrega, **então** a barra mostra 8 segmentos preenchidos e "8"; 0 segmentos e "0"; e "SEM NOTA" sem segmentos preenchidos. Cada barra tem `aria-label` "Nota N de 10" (quando há nota).
- [ ] **CA-82** — **Dado** o formulário aberto, **quando** olho o status, **então** há três botões com ícone e `aria-pressed`, exatamente um verdadeiro; **quando** escolho "Quero jogar", o campo Nota fica bloqueado com um ícone de cadeado visível.
- [ ] **CA-83** — **Dado** um campo com erro (ex.: título duplicado), **quando** o erro aparece, **então** o campo tem borda `erro` e a mensagem, e faz uma animação curta de tremer; **e** com `prefers-reduced-motion: reduce` a borda e a mensagem aparecem, mas **sem** tremer.
- [ ] **CA-84** — **Dado** `prefers-reduced-motion: reduce` (emulado no DevTools), **quando** a página está aberta, **então** nenhuma destas animações roda: _scanlines_, orbes de fundo, pulso do botão "Adicionar jogo", ponto piscando do "Jogando", tremer do campo e transição de hover das linhas (`animation-name: none`, sem `transition` de movimento).
- [ ] **CA-85** — **Dado** o diálogo aberto, **quando** aperto Esc, **então** ele fecha e o foco volta ao botão que o abriu; **e** navegando só por Tab, todo elemento clicável mostra o anel de foco; **e** botões, filtros e ações da linha medem ≥ 44 × 44 px; **e** todo botão só com ícone tem `aria-label` e todo ícone decorativo tem `aria-hidden="true"`.
- [ ] **CA-86** — **Dado** os tokens da tabela de "Diretrizes visuais", **quando** confiro os pares reais usados na tela com um verificador de contraste, **então** todo texto tem ≥ 4,5:1; todo contorno de controle e anel de foco (inputs, botões de status, área da capa, botões de ação) usa `borda-controle` (`#796ca0`) e tem ≥ 3:1 contra o fundo em que está (`painel`, `painel-2` ou `fundo`); `borda` não é usada em nenhum controle; e `apagado`/`apagado-2` não são a cor de nenhum texto (`apagado-2` só aparece em controle desabilitado).
- [ ] **CA-87** — **Dado** `apps/web/src`, **quando** procuro literais de cor hexadecimal (`#[0-9a-fA-F]{3,8}`) fora do bloco `@theme` de `styles/index.css`, **então** não há nenhuma.
- [ ] **CA-88** — **Dado** `apps/web/index.html`, **quando** o leio, **então** ele carrega Orbitron, Rajdhani e Material Symbols Rounded por `<link>` do Google Fonts; **e** o `package.json` do web não ganhou nenhuma dependência de runtime, de fonte, de ícone, de UI, de formulário, de modal ou de animação.
- [ ] **CA-89** — **Dado** a página `/`, **quando** ela abre, **então** o topo mostra o logo "CHECKPOINT" com o ícone de bandeira e o botão "Adicionar jogo" com brilho pulsando (estático com `prefers-reduced-motion: reduce`).

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
  - **Etapa 2 (nenhum teste fala com o Supabase real; `StorageService` é sempre um objeto simples
    de `jest.fn()`):**
    - `image-signature.spec.ts`: a função pura que detecta o tipo pelos magic bytes aceita PNG,
      JPEG e WebP; rejeita GIF, texto, buffer vazio, buffer truncado e WebP sem o marcador `WEBP`
      (CA-55, CA-56).
    - `games.service.spec.ts` (casos de capa): troca de capa remove o objeto antigo depois de gravar
      o novo (CA-61); falha ao remover o antigo ainda devolve sucesso e registra aviso (CA-62);
      falha no upload → 502 e `capaPath` intacto (CA-63); `DELETE /capa` idempotente, e 502 mantém
      a capa (CA-64, CA-65); remover o jogo apaga a capa, e a falha da remoção não impede o 204
      (CA-66); o response nunca contém `capaPath` (CA-60).
    - `storage.service.spec.ts`: com `global.fetch` substituído por `jest.fn()` (nenhuma request
      real), confere: o upload é um `POST` em `{SUPABASE_URL}/storage/v1/object/{bucket}/{path}`,
      com o cabeçalho `apikey: <chave>` (e **sem** `Authorization`), `content-type` do tipo detectado
      e o buffer como corpo;
      a remoção é um `DELETE` em `.../object/{bucket}` com `{"prefixes":[path]}`; resposta
      não-2xx, erro de rede e timeout viram `BadGatewayException`; `publicUrl` monta
      `{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}`; a chave nunca aparece em mensagem
      de erro nem em log.
    - DTO/env: `env.validation` rejeita ausência das três variáveis `SUPABASE_*` (CA-68) e uma
      `SUPABASE_SERVICE_ROLE_KEY` que comece com `sb_publishable_` (CA-90).
    - `games.controller` (ou teste equivalente com `ValidationPipe` e `FileInterceptor`): limite de
      2 MB → 413, campo ausente ou com outro nome → 400 (CA-57, CA-58).
- **Unitário — web (Vitest + React Testing Library, `apiClient` mockado; escopo enxuto, só o que tem
  lógica):** `GameForm.test.tsx` — nota desabilitada e limpa em "Quero jogar" e envio de
  `nota: null` (CA-43); mapeamento de `fields` da `ApiErrorResponse` para o campo certo e mensagem
  geral quando não há `fields` (CA-44); fluxo da capa com `apiClient` mockado: nenhum `PUT` antes de
  Salvar (CA-74), `POST` seguido de `PUT` (CA-75), falha do `PUT` mantém o diálogo aberto e o
  próximo Salvar é `PATCH` (CA-76), pré-checagem de tipo e tamanho sem request (CA-77), remover capa
  chama `DELETE` (CA-78). Funções puras da etapa 3: `game-cover` (iniciais e cor determinística do
  título; CA-72) e `count-by-status` (contagens e filtro sobre a lista completa; CA-79). Sem teste
  de snapshot nem de estilo.
- **Manual (`curl`/UI, via `/qa-verify`):** CA-36, CA-37, CA-39, CA-40, CA-70 (banco e migration, que
  o mock não alcança), CA-38 (corrida real), CA-53, CA-54, CA-61, CA-63 a CA-66 (bucket real),
  CA-69, CA-71, CA-41 a CA-51 e CA-72 a CA-89 (UI de ponta a ponta, acessibilidade e movimento;
  contraste e `prefers-reduced-motion` com as ferramentas do DevTools).

Loop de verificação por tarefa:
`npm run typecheck -w <workspace>` → `npm test -w <workspace>` → `npm run lint` → `npm run build`
→ commit.

## Fora de escopo

**Feature do produto (specs futuras):**

- Busca externa de jogos (RAWG ou IGDB) para preencher título, plataforma e **capa**, e demais
  metadados.
- Datas de início e de zerado, horas jogadas.
- Recorte, redimensionamento, _thumbnails_ ou otimização das capas; formatos AVIF, GIF e **SVG**
  (SVG pode carregar script); mais de uma imagem por jogo; bucket privado com URL assinada.
- Rotina de limpeza de objetos órfãos no storage (sobras de uma remoção _best effort_ que falhou).
- Tema claro ou seletor de tema; internacionalização; fontes e ícones hospedados localmente (uso
  offline).
- **Autenticação e multiusuário** (model `User`, sessão, `Game.userId`, proteção de rota). Adicionar
  `userId` depois exige migration com backfill.
- Paginação, lixeira/soft-delete, `GET /api/games/:id` (sem tela que use), ordenação escolhida pelo
  usuário, busca por texto.
- Cobertura de código (`test:cov`), que exigiria `@vitest/coverage-v8`.

**Passo de processo (não é critério de aceite):**

- Rodar `db:migrate` e commitar a migration; o commit separado que configura os runners;
  atualizar `ARCHITECTURE.md`, `CLAUDE.md` e `docs/specs/INDEX.md` conforme `RULES.md` §7.

## Notas de ambiente

**Variáveis de ambiente novas (etapa 2), só em `apps/api`.** Cada uma ganha um campo em
`apps/api/src/config/env.validation.ts` (senão o `ConfigService` não a expõe) e uma linha em
`apps/api/.env.example`, **sem valor real**:

| Variável                    | Validação                                                          | Exemplo no `.env.example`               |
| --------------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| `SUPABASE_URL`              | obrigatória, URL                                                   | `https://<project-ref>.supabase.co`     |
| `SUPABASE_SERVICE_ROLE_KEY` | obrigatória, não vazia, **não pode começar com `sb_publishable_`** | vazio (o valor real só no `.env` local) |
| `SUPABASE_STORAGE_BUCKET`   | obrigatória, não vazia                                             | `capas`                                 |

O nome `SUPABASE_SERVICE_ROLE_KEY` é mantido, mas o valor esperado é a **secret key** nova
(`sb_secret_…`, opaca, não é JWT), não a `service_role` JWT legada. A chave **publishable**
(`sb_publishable_…`) é a pública, sujeita a RLS: com um bucket sem policies todo upload falharia com
403, então o boot a recusa com a mensagem `"SUPABASE_SERVICE_ROLE_KEY parece a chave publishable; use
a secret key (sb_secret_…) ou a service_role legada"` (CA-90). Como as demais, faltar uma derruba o
boot com a lista de erros. Consequência: depois da etapa 2, a
API só sobe com as três preenchidas, mesmo para quem só quer mexer no CRUD. `apps/web/.env` **não**
ganha nenhuma variável do Supabase.

**Pendências humanas da capa** (também em `INDEX.md`): criar o bucket público `capas` no painel do
Supabase (mesmo projeto do banco); recomendado configurar nele um limite de 2 MB e os tipos
`image/jpeg`, `image/png`, `image/webp` como segunda barreira; preencher as três variáveis no
`.env` local.

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

**Etapa 2 — dependências (`RULES.md` §9): nenhuma de runtime; uma devDependency em `apps/api`,
aprovada pelo humano. Versão consultada no registry em 2026-09-23:**

| Tipo          | Pacote                 | Por quê                                                                    |
| ------------- | ---------------------- | -------------------------------------------------------------------------- |
| devDependency | `@types/multer@^2.2.0` | tipos de `Express.Multer.File`; casa com o `multer@2.x` que já vem no Nest |

- **`multer` não é adicionado:** `@nestjs/platform-express@11.2.6` depende de `multer@2.4.0`
  (confirmado no `node_modules`), e `FileInterceptor`/`limits` do Nest já o usam.
- **`@supabase/supabase-js` não é usado (decisão do humano).** O `StorageService` chama a API REST do
  Storage com o `fetch` nativo do Node 20. Isso também evita o problema de versão do SDK: da 2.110 em
  diante ele exige Node ≥ 22. `@supabase/storage-js` isolado também foi descartado.
- **Contrato REST** (conferido no código-fonte do cliente oficial `@supabase/storage-js@2.109.0`, sem
  instalá-lo). Base: `{SUPABASE_URL}/storage/v1`.
  - **Upload:** `POST {base}/object/{bucket}/{path}`; corpo = os bytes do arquivo; cabeçalhos
    `content-type` = tipo detectado, `cache-control: max-age=3600` e `x-upsert: false`.
  - **Remoção:** `DELETE {base}/object/{bucket}` com JSON `{"prefixes":["<path>"]}`. Objeto que não
    existe simplesmente não aparece na resposta, então remover de novo não é erro.
  - **URL pública:** `{base}/object/public/{bucket}/{path}` (montada localmente, sem chamada).
  - **Autenticação** nas chamadas de escrita: **só o cabeçalho `apikey: <secret key>`**, sem
    `Authorization`. Fonte oficial ([API keys | Supabase Docs](https://supabase.com/docs/guides/getting-started/api-keys)):
    _"Send publishable and secret keys on the `apikey` header, not on `Authorization: Bearer`."_;
    _"Publishable and secret keys aren't JWTs"_; e a secret key _"doesn't work in a browser"_
    (o Supabase olha o `User-Agent` e devolve 401; uma chamada do Node não é afetada). Ver também
    [Migrating to publishable and secret API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).
  - **Ressalva (não é documentação oficial):** a issue
    [supabase/agent-skills#576](https://github.com/supabase/agent-skills/issues/576) relata que, na
    REST do Storage chamada direto, `Bearer` sozinho dá `Invalid Compact JWS` e `apikey` sozinho pode
    dar `headers must have required property 'authorization'`, ou seja, o Storage pode exigir um
    `Authorization` que a documentação não menciona. **Regra:** implementar como a documentação
    manda (só `apikey`) e confirmar no CA-53 contra o bucket real. Se o Storage recusar, **parar e
    apresentar opções ao humano**; a chave `service_role` legada **não** é usada sem perguntar.
  - **Confirmado no bucket real (2026-09-23):** com uma secret key `sb_secret_…`, o upload só com
    `apikey` funcionou (200), assim como a listagem e a remoção. A ressalva da issue não se
    aplica a este projeto hospedado; nenhuma chave legada foi necessária.
  - **CDN (observado no bucket real):** o objeto é servido por CDN com
    `cache-control: public, max-age=3600`. Depois de apagar o objeto, a URL pública original ainda
    respondeu **200 (`cf-cache-status: HIT`)** por ~30 s, e passou a **400** quando o Supabase
    invalidou o cache; a mesma URL com outro parâmetro de query (outra chave de cache) já dava 400
    de imediato. Portanto "o objeto some" se prova **pela listagem do bucket** (ou pela URL com um
    parâmetro novo), e **não** por um `GET` imediato na URL original. A URL antiga de uma capa
    trocada não é mais referenciada por nada (cada envio gera `<uuid>` novo), então o cache
    residual é inofensivo.
- **Regras do `StorageService`:** `AbortSignal.timeout(10_000)` em toda chamada; caminho codificado
  por segmento; resposta não-2xx, erro de rede e timeout viram `BadGatewayException` com a
  mensagem fixa do 502 (sem repassar o corpo da resposta do Supabase); nunca loga cabeçalhos nem a
  chave. `fetch` e `AbortSignal.timeout` são globais no Node 20 e tipados por `@types/node@22`.
- **Isolamento:** o `StorageService` expõe só uma interface mínima (`upload`, `remove`,
  `publicUrl`); service e controller dependem dela, e os testes a mockam.

**Commit(s) da feature:** `ARCHITECTURE.md` atualizado no mesmo commit que cria cada peça (módulo
`games` em §4.4, feature em §5.4, model em §7, rotas em §5.1/§3, `packages/shared` em §6).

## Suposições

Marcadas explicitamente. As de A a F foram aprovadas pelo humano na entrevista; o restante (inclusive
tudo que veio com a capa e o visual) entra na reaprovação desta spec.

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
- Nenhuma dependência de runtime nova; só `@types/multer` (dev, etapa 2). O formulário e o diálogo
  usam o que já existe.

**Capa (etapa 2):**

- `capaPath` é `VarChar(120)` e guarda o caminho, não a URL; a `capaUrl` é montada na resposta.
- Upload em memória (`multer` com `memoryStorage`): 2 MB por request cabem sem gravar em disco.
- Os textos de erro da capa (400 de tipo, 413, 502) e a ordem das checagens (400 `id` → 413/400 do
  multipart → 404 → 400 de assinatura → 502) são propostos aqui; o humano pediu 400, 413, 404 e 502
  sem fixar mensagens nem ordem.
- `DELETE /capa` devolve 200 + `Game` (não 204) e é idempotente; remove do storage antes de zerar o
  banco, para uma falha do storage não deixar o jogo apontando para nada.
- Trocar ou remover a capa atualiza `atualizadoEm` do jogo e o reordena na lista.
- "Remover capa" no formulário só vale ao Salvar (cancelar o diálogo descarta).
- As três variáveis `SUPABASE_*` são **obrigatórias** no boot da API (falha rápida, como as
  demais), em vez de opcionais com a capa desligada. A alternativa esconderia uma configuração
  errada até alguém tentar enviar uma capa.
- O `StorageService` usa `fetch` nativo contra a API REST (decisão do humano). O timeout de 10 s
  por chamada e o `cache-control: max-age=3600` do upload são padrões meus.
- **Revisão da etapa 2 (aprovada pelo humano, reaprovada junto do commit da etapa):** a
  autenticação passou de `Authorization: Bearer` + `apikey` para **só `apikey`**, conforme a
  documentação oficial de API keys (links em "Notas de ambiente"); a ordem real das checagens do
  `PUT /capa` põe o multipart antes do `id`; e o boot passou a recusar `sb_publishable_` (CA-90).
- O `StorageService` **não** cai para a `service_role` legada se o Storage recusar só o `apikey`:
  nesse caso a implementação para e pergunta.
- Os erros do multer (413, campo errado) são convertidos para `ApiErrorResponse` com `fields.arquivo`
  por um interceptor que embrulha o `FileInterceptor` do Nest, sem importar `multer` diretamente
  (ele segue sendo dependência transitiva do Nest).

**Visual (etapa 3):**

- O web busca a lista completa e deriva filtro e contagens no cliente (alternativas descartadas: um
  endpoint de contagens, que o humano não quer, e duas queries, que duplicariam a busca).
- O mockup A é privado (link em "Diretrizes visuais"); as diretrizes escritas são a referência
  verificável.
- Os tokens são os do humano, mais o `borda-controle` (`#796ca0`, calculado), com três regras de uso
  derivadas do contraste (texto nunca em `apagado`/`apagado-2`; contorno de controles e foco em
  `borda-controle`; texto sobre `magenta` em `fundo`). O `borda` fica só para divisórias decorativas.
- Anel de foco de 2 px com _offset_ de 2 px em `borda-controle` (decisão do humano); o `ciano` fica
  para o filtro ativo e o status Jogando.
- A paleta da capa gerada tem 6 tokens (`capa-1` a `capa-6`), com valores definidos na
  implementação e verificados contra o contraste das iniciais.
- Sem tema claro e sem alternância de tema.

## Questões em aberto

Nenhuma. As duas que estavam abertas foram decididas pelo humano: Storage por `fetch` nativo, sem
`@supabase/supabase-js`; e as regras de contraste aceitas, com o token novo `borda-controle`.
