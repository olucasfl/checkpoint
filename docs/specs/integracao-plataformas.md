# Spec: integracao-plataformas

> Status: 🚧 em andamento (aprovada em 2026-09-25). **Etapa 1 implementada**, com o CA-63 parcial (faltam os
> fixtures de perfil privado e de conquistas negadas, que dependem de a conta de teste trocar a privacidade). **Etapa 2
> implementada**, com o CA-15 e o CA-22 só prováveis depois do deploy (fluxo real com a Steam e 360 px no
> navegador). Etapas 3 a 5 não começaram.

## Objetivo

Vincular a conta do usuário numa plataforma de jogos (a primeira é a **Steam**) ao usuário do checkpoint e
enriquecer os jogos do catálogo com dados dela: **horas jogadas, conquistas, última vez jogado e capa
oficial**. A base é genérica por **provedor** (interface `GameProvider`), para PlayStation, Xbox e Epic
entrarem depois só implementando a interface. **Esta spec cobre apenas a Steam.**

Toca `apps/api` (módulo novo `modules/integrations/`, `modules/games/` só para devolver os dados junto do
`Game`), `apps/web` (`features/integracoes/`, `/perfil`, `/jogos/:id`, formulário e linha do catálogo),
`packages/shared` (contrato) e `prisma/schema.prisma` (**só aditivo**).

**Só vincula, nunca substitui:** título, status, notas, descrição e capa enviada continuam do usuário. Os
dados da plataforma são uma camada por cima; desvincular desfaz a camada sem perder nada do jogo. Nenhum
dado da Steam muda `status` nem notas, nem por sugestão automática.

## Stack

Padrão da casa, **sem dependência nova** (`RULES.md` §9): `fetch` nativo para a Steam, como o
`StorageService`. Reaproveita `@nestjs/jwt` (já instalado) para o `state` do vínculo e o
`@nestjs/throttler`. Nada de biblioteca de OpenID nem SDK da Steam.

Divergências do padrão, com o porquê:

- **Vínculo por Steam OpenID 2.0, só para vincular.** O login do app continua e-mail e senha. O SteamID
  chega **comprovado** (`check_authentication`); o usuário nunca digita o ID.
- **Cache em memória** dos dados da Steam (Map com TTL e teto de entradas), como o throttler já é em
  memória: uma instância, perdido quando o Render dorme. Sem Redis, sem tarefa agendada.
- **Limite por usuário** (não por IP) nas rotas novas: não depende do `trust proxy`, que é uma chore
  separada, fora desta spec (Q1).
- **Intervalos e tempos como constantes nomeadas**, num lugar só (ver "Custo e cache" e "Contrato
  compartilhado"): fáceis de mudar sem caçar número solto.

## Steam Web API: o que foi confirmado e o que falta

Confirmado na documentação oficial (`partner.steamgames.com/doc/webapi`), caminhos e parâmetros:

| Chamada                                 | Caminho (host público: `api.steampowered.com`)                                            | Chave | Uso                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------- |
| `GetPlayerSummaries`                    | `ISteamUser/GetPlayerSummaries/v2/?steamids=`                                             | sim   | nome, avatar, URL do perfil, visibilidade (`communityvisibilitystate`)                                           |
| `GetOwnedGames`                         | `IPlayerService/GetOwnedGames/v1/?steamid=&include_appinfo=1&include_played_free_games=1` | sim   | biblioteca; `appids_filter` (via `input_json`) restringe a um app; `playtime_forever` (min), `rtime_last_played` |
| `GetPlayerAchievements`                 | `ISteamUserStats/GetPlayerAchievements/v1/?steamid=&appid=&l=brazilian`                   | sim   | conquistas do jogador: `apiname`, `achieved`, `unlocktime`                                                       |
| `GetSchemaForGame`                      | `ISteamUserStats/GetSchemaForGame/v2/?appid=&l=brazilian`                                 | sim   | nome, descrição, ícone e ícone cinza de cada conquista; `hidden`                                                 |
| `GetGlobalAchievementPercentagesForApp` | `ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=`                       | não   | % global de cada conquista (raridade)                                                                            |

A documentação **não** descreve o formato do corpo nem as respostas de erro. Isso fica **como primeira tarefa
da etapa 1**: uma chamada real, com uma conta Steam de teste, para fixar os _fixtures_ dos testes. O que a
spec assume (a confirmar):

- Perfil ou "detalhes do jogo" privados: `GetOwnedGames` responde 200 com `{"response":{}}` (sem
  `game_count`); biblioteca pública e realmente vazia traz `game_count: 0`. Sem `game_count` = privado.
- `GetPlayerAchievements`: jogo sem conquistas → 400 com `playerstats.success = false` ("no stats"); perfil
  com "detalhes do jogo" privados → **a confirmar** com o fixture de "conquistas negadas" (403 ou `success =
false`?). Vira estado, não erro (ver "Erros").
- `GetSchemaForGame` de um jogo sem conquistas vem sem `availableGameStats.achievements`.
- Conquista oculta (`hidden = 1`) vem sem descrição até ser desbloqueada.
- Capa oficial sem chamada de API, pela CDN da Steam por `appid`: `library_600x900.jpg` (retrato); se a
  imagem não existir, o web cai em `header.jpg`, e depois na capa gerada (`onError`). Confirmar o host da CDN
  e que o _hotlink_ funciona. A capa **não** é copiada para o bucket.
- Cota: o limite documentado por chave é da ordem de 100 mil chamadas por dia (confirmar). Um usuário
  abrindo um detalhe gasta de 1 a 4 chamadas (ver "Custo e cache"), e a resposta 429 da Steam é tratada.

**Resultado da chamada real (2026-09-25, conta de teste com perfil público, sem gravar o SteamID).**

- **Confirmado como assumido:** jogo sem conquistas → HTTP 400 com
  `{"playerstats":{"error":"Requested app has no stats","success":false}}`; o schema de um jogo sem conquistas
  traz `availableGameStats` vazio, sem `achievements`; a conquista **oculta** vem **sem** `description` no
  schema e com `""` na resposta do jogador; `GetOwnedGames` de perfil público traz `game_count` e `games`
  (`appid`, `name`, `playtime_forever` em minutos, `rtime_last_played`).
- **Diferiu do assumido (spec ajustada em 2026-09-25):**
  1. **Chave inválida devolve HTTP 401, não 403**, com corpo **HTML** ("Unauthorized… verify your `key=`
     parameter"), não JSON. O `SteamClient` não pode fazer `JSON.parse` cego: confere status e `content-type`.
  2. **`percent` dos globais vem como string** (`"40.7"`): o cliente converte para número (1 casa decimal).
  3. **SteamID malformado devolve 400 HTML** ("Missing required routing parameter"): o cliente valida o
     formato (17 dígitos, prefixo `7656`) **antes** de chamar a Steam, e um ID malformado é **erro de
     validação**, nunca "perfil privado".
  4. "Nunca jogado" vem como `playtime_forever: 0` **e** `rtime_last_played: 0` (chave presente): `0` vira
     `null` em `ultimaVezJogadoEm`.
  5. Os ícones das conquistas vêm de `steamcdn-a.akamaihd.net` (não de `steamstatic.com`).
- **Ainda pendente (fixtures da etapa 1, CA-63):** perfil **privado** e conquistas **negadas** (a conta de teste
  troca a privacidade e avisa; o código exato de "negado", 403 ou `success:false`, sai desse fixture).
  **Biblioteca vazia**: sem conta para capturar, fica pendente para a etapa 4, com teste `todo`.

**Dependência dos fixtures (decisão de 2026-09-25).** A **primeira tarefa da etapa 1** é uma chamada real,
com uma conta Steam de teste, que grava respostas **sanitizadas** (sem SteamID, nome de exibição nem avatar
reais; `RULES.md` §8) como fixtures dos testes, para: perfil privado, biblioteca pública **vazia**, jogo
**sem conquistas**, conquistas **negadas** e **chave inválida (401)** (este, com uma chave inválida, não precisa de conta).
Os critérios de privacidade e de mapeamento de erro **dependem** desses fixtures: **CA-03, CA-16, CA-20,
CA-30, CA-47, CA-48 e CA-50**, e as duas tabelas de mapeamento de erro. Se a resposta real **diferir do que
está assumido acima**, a spec é revista (`/spec-sync`) **antes** de seguir com a implementação, em vez de
adaptar o código a uma suposição errada (CA-63).

## Fluxo do vínculo (OpenID 2.0 atrás do rewrite da Vercel)

O retorno da Steam é um **GET do navegador sem Bearer** e o cookie `checkpoint_refresh` tem
`Path=/api/auth`, então não chega nessa rota. Portanto:

1. **Iniciar** — o web chama `POST /api/integracoes/steam/vinculo` (Bearer). A API cria o `state`: um JWT
   HS256 (`@nestjs/jwt`, `JWT_ACCESS_SECRET`) com `{ sub: userId, typ: 'vinculo', prov: 'STEAM', nonce }` e
   **10 min** de vida (o `typ` diferente de `access` faz o guard global recusá-lo como token de acesso, e a
   rota de retorno recusa qualquer `typ` que não seja `vinculo`). Responde `{ url }` (o endereço do OpenID da
   Steam com `return_to`) e **`Set-Cookie: checkpoint_vinculo=<nonce>`** (`HttpOnly`, `SameSite=Lax`,
   `Secure` em produção, `Path=/api/integracoes`, 10 min). O web faz `window.location.assign(url)`.
2. **`return_to`** = `${API_PUBLIC_URL}/api/integracoes/steam/retorno?state=<jwt>`, e `openid.realm` =
   `API_PUBLIC_URL`. Em produção `API_PUBLIC_URL` é o **domínio da Vercel** (o `/api` passa pelo rewrite até o
   Render), **não** o `onrender.com`: o cookie do passo 1 foi gravado no host da Vercel e só volta para ele.
   Em dev é `http://localhost:3333`.
3. **Retornar** — `GET /api/integracoes/steam/retorno` (`@Public()`). A API: confere o `state` (assinatura,
   validade, `typ`, `prov`); confere que o **nonce do cookie é igual ao do `state`** (sem isso, um atacante
   poderia entregar à vítima o `return_to` dele e vincular a Steam da vítima à conta do atacante); valida a
   resposta OpenID (abaixo); grava o vínculo; limpa o cookie; e responde **302** para
   `${WEB_PUBLIC_URL}/perfil?steam=vinculada` ou `/perfil?steam=erro&motivo=<cancelado|invalido|expirado|indisponivel|ja-vinculada>`.
4. **Validação da resposta OpenID** (nenhum parâmetro `openid.*` é confiável antes do passo f):
   a. `openid.ns` = `http://specs.openid.net/auth/2.0`; `openid.mode` = `id_res` (`cancel` → `cancelado`);
   b. `openid.op_endpoint` = `https://steamcommunity.com/openid/login`;
   c. `openid.return_to` **idêntico** ao que a API montou para aquele `state`;
   d. `openid.claimed_id` e `openid.identity` iguais e no formato `https://steamcommunity.com/openid/id/<17 dígitos>`;
   e. `openid.signed` cobre `claimed_id`, `identity`, `return_to`, `op_endpoint` e `response_nonce`;
   f. `POST https://steamcommunity.com/openid/login` (form-urlencoded, todos os `openid.*` recebidos, com
   `openid.mode=check_authentication`, `redirect: 'manual'`, timeout de 8 s) devolve `is_valid:true`. A
   Steam invalida o _nonce_ na primeira checagem, o que barra o replay.
5. **Depois** — o web abre em `/perfil` com `?steam=`; a página mostra o aviso (`role="status"`) e troca a
   URL por `/perfil` com `replace` (o aviso não vai em `state` de navegação, porque a origem é um redirecionamento externo).
6. Conta Steam já vinculada com **outro** SteamID → `ja-vinculada` (desvincule antes). Mesmo SteamID →
   sucesso idempotente. **O mesmo SteamID em outra conta do checkpoint não conflita** (ver "Modelo de dados" e
   CA-65). Falha ao ler o nome (`GetPlayerSummaries`) **não** desfaz o vínculo já comprovado:
   grava o nome "Conta Steam", corrigido na próxima leitura do perfil.

**Reuso do `JWT_ACCESS_SECRET` só é seguro com os dois sentidos travados** (decisão de 2026-09-25):
(1) o guard global **rejeita** um token `typ: 'vinculo'` usado como access token (CA-61); (2) o fluxo do
retorno **rejeita** um access token (e um refresh token) usado como `state` (CA-62). Se qualquer um dos dois
não puder ser garantido por teste, a implementação **para** e pede um segredo próprio (variável nova, decisão
do humano).

## Comportamento esperado

- **Perfil (`/perfil`)** ganha a seção **Contas vinculadas**, entre "Conta" e "Preferências". Sem vínculo:
  linha "Steam" com **Vincular conta**. Com vínculo: cartão Steam (avatar, nome, total de jogos, horas
  totais, conquistas e os 3 mais jogados) com **Atualizar** e **Desvincular** (confirmação no `<dialog>`). As
  conquistas do cartão são **as somadas dos jogos vinculados**, com o texto "X conquistas em N jogos
  vinculados", só com dado já gravado e **sem chamada extra à Steam** (Q2).
- **Três caminhos para ligar um jogo à Steam** (nunca automático):
  a. **Jogo novo a partir da biblioteca** — no formulário de novo jogo, **Buscar na Steam** abre o diálogo da
  biblioteca; **Criar jogo** com um item abre o formulário **pré-preenchido** (título, plataforma "PC" se
  vazia, capa oficial só como prévia, status sugerido) já ligado ao item; ao salvar: cria o jogo e **só depois**
  liga (mesmo padrão do `save-game` com a capa: se a ligação falha, o jogo fica salvo e o formulário passa a
  editá-lo, com o erro).
  b. **Jogo já existente** — na página do jogo, **Vincular à Steam** abre a biblioteca; escolher um item liga
  **àquele** jogo.
  c. **Nome parecido** — no diálogo aberto pelo formulário de novo jogo, o item cujo título (sem caixa, acento
  nem símbolos ™ ® ©, e sem pontuação) bate com o de um jogo do catálogo mostra **"já no seu catálogo"** e o
  botão **Vincular a este**. **Sempre** existe também **Vincular a outro jogo que já tenho** (seletor com os
  jogos do catálogo ainda sem vínculo Steam), porque o nome pode ser diferente. Vinculando a um jogo existente,
  o formulário de novo jogo fecha e o web vai para `/jogos/:id`.
- **Sugestão de status** ao criar da biblioteca (o usuário escolhe; a sugestão só pré-seleciona): 0 minutos →
  **Quero jogar**; mais de 0 → **Jogando**. **Nunca** sugere Zerado (a API exige nota para Zerado).
- **1 para 1** — unicidade por (usuário, provedor, id externo) e por (jogo, provedor). Ligar um item já ligado
  a outro jogo → 409 com o jogo atual; o web avisa ("«Celeste» já está ligado a «Celeste (PS5)». Mover o
  vínculo?") e oferece **Mover o vínculo** (reenvia com `mover: true`). Ligar um jogo que **já tem** vínculo →
  409 (desvincule antes; o "mover" **não** resolve este caso).
  **A regra do "mover" (decisão de 2026-09-25):**
  - O jogo **antigo** não perde nada do que é do usuário (título, status, notas, descrição, capa enviada): perde
    só a camada da plataforma (horas, conquistas e a capa oficial de fallback), e pode ser ligado de novo depois.
  - **Nada é copiado** do jogo antigo para o novo: os dados do novo vêm frescos da plataforma.
  - **A ordem das checagens** poupa a cota: (1) o jogo é do usuário e a conta está vinculada; (2) o jogo não tem
    vínculo; (3) o item já ligado a outro jogo (sem `mover` → 409 `PLATAFORMA_ITEM_JA_VINCULADO`, **sem chamar a
    plataforma**); (4) só então a plataforma (o item está na biblioteca e o resumo dele); (5) grava numa transação
    (com `mover`: apaga a linha do jogo antigo e cria a do novo). Se a plataforma falha no passo 4, **nada muda**:
    o vínculo continua no jogo antigo.
  - Uma corrida no banco (`P2002`) é traduzida pela restrição violada: `(gameId, provedor)` →
    `PLATAFORMA_JOGO_JA_VINCULADO`; `(userId, provedor, idExterno)` → `PLATAFORMA_ITEM_JA_VINCULADO`.
- **Só liga a item da biblioteca do usuário**: o `idExterno` é conferido contra `GetOwnedGames` (com
  `appids_filter`). Não dá para ligar um `appid` qualquer.
- **`Game.plataforma` convive com o vínculo** (Q3, decidida): o vínculo **não** altera `plataforma`, e um
  jogo de **qualquer** plataforma ("PlayStation 5", "Nintendo Switch"…) pode ser ligado a um item da Steam.
  Quando a plataforma do jogo não é vazia nem "PC", o web pede **confirmação** antes de ligar: "Este jogo está
  cadastrado como PlayStation 5. As horas e conquistas mostradas serão as da Steam. Vincular mesmo assim?";
  cancelar não envia nada. Jogo novo criado da biblioteca começa com plataforma **"PC"** (editável). A
  confirmação é de tela: a API não olha a `plataforma` e o `PUT` não depende dela. No **formulário de novo jogo**, a mesma
  confirmação vem **ao salvar**, antes de criar qualquer coisa, se a pessoa trocou a plataforma pré-preenchida
  para algo diferente de vazio ou "PC" (decisão de 2026-09-25).
- **Capa** — precedência: **1º a capa enviada pelo usuário** (`capaUrl`); **2º a capa oficial da Steam**
  (fallback); **3º** a capa gerada (cor + iniciais). Remover a capa enviada faz a Steam voltar a aparecer. **Na etapa 3 a capa oficial é só a prévia do formulário
  de novo jogo** (nunca vai ao bucket, e um arquivo escolhido pela pessoa a substitui); a precedência na lista e
  no detalhe é da **etapa 4** (CA-42).
- **Catálogo (linha)** — só **horas** e **X/Y conquistas** (ex.: "42 h · 12/40"), vindas do último valor
  gravado, na mesma query `['games']`. Sem vínculo, nada muda. Sem conquistas no jogo (Y = 0) ou nunca
  consultadas, mostra só as horas.
- **Página do jogo (`/jogos/:id`)** — bloco **Steam** (só com vínculo): horas, última vez jogado, barra de
  progresso das conquistas, **Atualizar**, **Desvincular**, "Abrir na Steam"; e a **lista completa de
  conquistas**, buscada **só ao abrir o detalhe**: ícone, nome, descrição, data de desbloqueio e raridade,
  com **Desbloqueadas** separadas das que **Faltam**.
- **Atualização** — o último valor fica gravado (`atualizadoEm`). Ao abrir o detalhe, se `atualizadoEm` tem
  mais de **1 h**, a API refaz horas e contagem antes de responder. **Atualizar** força a consulta, no máximo 1
  vez a cada **30 s** por jogo (antes disso devolve o que está gravado, sem chamar a Steam). Sem tarefa em
  segundo plano. Os dois intervalos são **constantes nomeadas** no `shared` (`ATUALIZACAO_AUTOMATICA_MS` =
  1 h e `ATUALIZACAO_MANUAL_MIN_MS` = 30 s), lidas por API e web: mudar o valor é mudar uma linha (Q5).
- **Privacidade** — os dados só vêm com perfil e "detalhes do jogo" públicos na Steam. Biblioteca privada
  (ou sem `game_count`) ou conquistas negadas mostram **"Seu perfil Steam está privado"** com o passo a
  passo (Steam → Perfil → Editar perfil → Configurações de privacidade → "Meu perfil" e "Detalhes do jogo"
  em **Público**; pode levar alguns minutos) e **Tentar de novo**. Nada quebra nem dá 500. Quando **só as
  conquistas** são negadas (horas legíveis), a página do jogo **mantém as horas** e mostra um **aviso
  discreto** no bloco Steam ("Suas conquistas estão privadas na Steam. Deixe os "Detalhes do jogo" públicos
  para vê-las."), com o mesmo passo a passo num `<details>`, e não o bloco grande de "perfil privado" (Q6).
- **Steam fora do ar** — timeout, 5xx, 429 ou chave recusada: **502**, nunca 500. O catálogo, os detalhes
  gravados e o resto do app continuam funcionando: o detalhe de um jogo devolve o último valor gravado com o
  aviso `INDISPONIVEL` (200), e só as rotas que **dependem** da Steam (biblioteca, perfil, Atualizar) dão 502.
- **Desvincular a conta** — numa transação, apaga o `ContaVinculada` e **todos** os `JogoPlataforma` do
  provedor daquele usuário. Os jogos, notas, status, descrição e capas enviadas ficam intactos. Desvincular
  **um jogo** remove só a camada Steam dele.
- **Excluir a conta do checkpoint** — vínculos e dados por provedor caem por `onDelete: Cascade` (ver testes).
- **Mobile-first e acessibilidade** — tema Neon (só tokens), ponto de quebra único **768 px**, alvos ≥ 44 px,
  `prefers-reduced-motion`/efeitos "Reduzidos" respeitados. A lista de conquistas é **uma coluna no
  celular** (ícone 48 px + texto; data e raridade abaixo do texto) e vira linha com data e raridade à direita
  a partir de 768 px; imagens `loading="lazy"` com `width`/`height`; raridade sempre em **texto** ("12,4% dos
  jogadores"), nunca só cor; barra de progresso com `role="progressbar"`, `aria-valuenow`, `aria-valuemax` e
  nome acessível ("12 de 40 conquistas"); seções em `<details>` (Faltam aberta, Desbloqueadas fechada);
  diálogos pelo `ModalDialog`; avatar e ícones vindos da Steam com `alt` vazio quando decorativos e
  `referrerPolicy="no-referrer"`.

## Requisitos de saída

### API (`apps/api/src/modules/integrations/`, tag Swagger `integracoes`, prefixo `/api/integracoes`)

Todas protegidas pelo guard global (Bearer), **exceto** `GET .../retorno` (`@Public()`). `:provedor` é o
_slug_ minúsculo (`steam`), validado por um pipe (valor desconhecido → 400 `VALIDACAO`, como o `sessao-id.pipe`);
`:jogoId` é UUID (`ParseUUIDPipe` com `exceptionFactory`, 400 `VALIDACAO`). Toda rota com DTO
`class-validator` e `@ApiOperation`/`@Api*Response`. **Limite por usuário** (`getTracker` = `userId`, contador
próprio): **30 por minuto** nas rotas de leitura e atualização, **5 por minuto** em `POST .../vinculo`;
excedido → 429 `LIMITE_TENTATIVAS`. Nenhuma resposta inclui `userId`, a chave da Steam ou o `state`.

| Método e caminho                                            | Corpo / query                                 | Sucesso                                            | Erros                                                                                                                                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/integracoes`                                      | —                                             | 200 `ContaVinculada[]`                             | 401                                                                                                                                                                                                       |
| `POST /api/integracoes/:provedor/vinculo`                   | — (sem corpo)                                 | 200 `IniciarVinculoResponse` + `Set-Cookie`        | 400 (provedor) · 401 · 409 `PLATAFORMA_JA_VINCULADA` · 429                                                                                                                                                |
| `GET /api/integracoes/:provedor/retorno`                    | query do OpenID (`state`, `openid.*`)         | 302 para `/perfil?steam=…`                         | nunca JSON de erro: falha vira 302 com `motivo`                                                                                                                                                           |
| `DELETE /api/integracoes/:provedor`                         | —                                             | 204                                                | 400 · 401 · 409 `PLATAFORMA_NAO_VINCULADA`                                                                                                                                                                |
| `GET /api/integracoes/:provedor/perfil`                     | —                                             | 200 `PerfilPlataforma`                             | 401 · 409 `PLATAFORMA_NAO_VINCULADA` · 409 `PLATAFORMA_PERFIL_PRIVADO` · 502 · 429                                                                                                                        |
| `POST /api/integracoes/:provedor/perfil/atualizacao`        | —                                             | 200 `PerfilPlataforma` (ignora o cache; mín. 30 s) | os mesmos                                                                                                                                                                                                 |
| `GET /api/integracoes/:provedor/biblioteca`                 | `busca?` (≤ 100), `limite?` (1–50, padrão 30) | 200 `ItemBiblioteca[]` (por horas, decrescente)    | 401 · 409 `NAO_VINCULADA` · 409 `PERFIL_PRIVADO` · 502 · 400 `VALIDACAO`                                                                                                                                  |
| `PUT /api/integracoes/:provedor/jogos/:jogoId`              | `VincularJogoRequest { idExterno, mover? }`   | 200 `DadosJogoPlataforma` (já com a 1ª consulta)   | 400 · 401 · 404 (jogo) · 404 `PLATAFORMA_ITEM_NAO_ENCONTRADO` · 409 `NAO_VINCULADA` · 409 `PLATAFORMA_JOGO_JA_VINCULADO` · 409 `PLATAFORMA_ITEM_JA_VINCULADO` (+`jogoAtual`) · 409 `PERFIL_PRIVADO` · 502 |
| `GET /api/integracoes/:provedor/jogos/:jogoId`              | —                                             | 200 `DetalheJogoPlataforma`                        | 400 · 401 · 404 (jogo) · 404 `PLATAFORMA_VINCULO_NAO_ENCONTRADO` · 429                                                                                                                                    |
| `POST /api/integracoes/:provedor/jogos/:jogoId/atualizacao` | —                                             | 200 `DetalheJogoPlataforma` (mín. 30 s)            | os mesmos, mais 502 `PLATAFORMA_INDISPONIVEL`                                                                                                                                                             |
| `DELETE /api/integracoes/:provedor/jogos/:jogoId`           | —                                             | 204                                                | 400 · 401 · 404 (jogo) · 404 `PLATAFORMA_VINCULO_NAO_ENCONTRADO`                                                                                                                                          |

Notas do contrato:

- **404 de jogo** é o mesmo do catálogo: inexistente **ou de outro usuário** (`where: { id, userId }`).
- **`GET .../jogos/:jogoId` nunca dá 502 por falha da Steam**: devolve o gravado com `aviso: 'INDISPONIVEL'`.
  Se a Steam responde perfil privado: `aviso: 'PERFIL_PRIVADO'` (ou `'CONQUISTAS_PRIVADAS'` se só as conquistas
  foram negadas) e a lista vem vazia. Jogo sem conquistas: `aviso: 'SEM_CONQUISTAS'`, `conquistas: []`.
- **`ItemBiblioteca`** traz `jogosParecidos` (jogos do catálogo com o mesmo título normalizado e **sem**
  vínculo Steam, no máximo 3) e `vinculadoA` (o jogo ao qual o item já está ligado, ou `null`).
- **A biblioteca usa o MESMO cache de 10 min por SteamID do cartão do perfil** (a biblioteca inteira e o perfil):
  abrir o diálogo logo depois do `/perfil` custa zero chamadas; erro (privado, 502) não entra no cache. Sem
  paginação: `limite` (1 a 50, padrão 30) e `busca` (por trecho da `chaveDeTitulo`, até 100 caracteres) limitam a
  resposta, ordenada por horas e, no empate, por título. O contrato é `ItemBiblioteca[]`, sem total: a tela diz
  "Digite para buscar entre seus jogos", sem "30 de 312". Os `jogosParecidos` são por **igualdade** da chave,
  nunca vinculam sozinhos, e um item com parecidos ainda oferece "Criar outro jogo".
- **`avatarUrl`** só é devolvido se for `https` e o host terminar em `steamstatic.com` (senão `null`).
- Erro de negócio de quem está logado **nunca é 401** (o web trata 401 como sessão perdida).

### Games (`GET/POST/PATCH /api/games`)

Aditivo: `Game` ganha `dadosPlataforma: DadosJogoPlataforma[]` (vazio sem vínculo), montado pelo `GamesService`
com um `include`, sem chamar a Steam. `Game.capaUrl` **continua sendo só a capa enviada** (a precedência é
decidida no web). Nenhum campo existente muda.

### Códigos de erro novos (`API_ERROR_CODES`; o `Record<ApiErrorCode, string>` do web quebra o typecheck se faltar texto)

| `code`                              | HTTP | Quando                                                                                                                                   |
| ----------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `PLATAFORMA_NAO_VINCULADA`          | 409  | rota que precisa da conta vinculada                                                                                                      |
| `PLATAFORMA_JA_VINCULADA`           | 409  | iniciar/concluir com conta já vinculada a **outro** ID                                                                                   |
| `PLATAFORMA_PERFIL_PRIVADO`         | 409  | biblioteca sem `game_count`, ou visibilidade ≠ pública                                                                                   |
| `PLATAFORMA_ITEM_NAO_ENCONTRADO`    | 404  | `idExterno` fora da biblioteca do usuário                                                                                                |
| `PLATAFORMA_ITEM_JA_VINCULADO`      | 409  | item já ligado a outro jogo (corpo com `jogoAtual: { id, titulo }`); com `mover: true` move                                              |
| `PLATAFORMA_JOGO_JA_VINCULADO`      | 409  | o jogo já tem vínculo com o provedor                                                                                                     |
| `PLATAFORMA_VINCULO_NAO_ENCONTRADO` | 404  | o jogo não tem vínculo com o provedor                                                                                                    |
| `PLATAFORMA_INDISPONIVEL`           | 502  | timeout, 5xx, **401** (chave recusada, logado como erro), 403 fora do caso de conquistas negadas, resposta sem JSON ou ilegível da Steam |
| `PLATAFORMA_LIMITE`                 | 502  | a Steam respondeu 429 ("muitas consultas, tente em alguns minutos")                                                                      |

Mapeamento por chamada da Steam (`SteamClient`; cada uma com timeout de **8 s**, sem _retry_ automático):

| Situação                             | GetPlayerSummaries                                           | GetOwnedGames                            | GetPlayerAchievements                         | GetSchemaForGame / Percentages                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| perfil privado                       | visibilidade ≠ 3 → estado privado                            | `{}` sem `game_count` → `PERFIL_PRIVADO` | 403 / `success:false` → `CONQUISTAS_PRIVADAS` | n/a (dado do jogo, não do usuário)                                                                                                 |
| jogo sem conquistas                  | n/a                                                          | n/a                                      | 400 "no stats" → `SEM_CONQUISTAS`             | sem `achievements` → `SEM_CONQUISTAS`                                                                                              |
| 401 (chave inválida) e 403           | `PLATAFORMA_INDISPONIVEL` (+ `error` no log: chave inválida) | idem                                     | idem                                          | idem                                                                                                                               |
| 429                                  | `PLATAFORMA_LIMITE`                                          | idem                                     | idem                                          | idem                                                                                                                               |
| timeout / 5xx / rede / JSON inválido | `PLATAFORMA_INDISPONIVEL`                                    | idem                                     | idem                                          | falha de schema/porcentagem **não** derruba o detalhe: a lista vem sem raridade (e sem nome, ver abaixo) ou o aviso `INDISPONIVEL` |

Os logs têm só o **nome da chamada e o status HTTP** — **nunca a URL** (a chave da Steam viaja na query
string), nem a chave, nem cabeçalhos, nem o corpo.

Regras do `SteamClient` (decisões de 2026-09-25, a partir da chamada real):

- **Sem `JSON.parse` cego:** só lê o corpo como JSON quando o `content-type` é JSON; erro da Steam pode vir em
  HTML (o 401 e o 400 de ID malformado vêm). Resposta 200 sem JSON, ou HTML onde se esperava JSON, é
  `PLATAFORMA_INDISPONIVEL`.
- **401** = chave recusada: `PLATAFORMA_INDISPONIVEL`, com `error` no log (é problema de configuração).
- **403** em `GetPlayerAchievements` é tratado como "conquistas negadas" **até o fixture real dizer outra
  coisa** (a confirmar); nas demais chamadas, `PLATAFORMA_INDISPONIVEL`.
- **Valida antes de chamar:** SteamID (`^7656\d{13}$`) e appid (`^\d{1,10}$`). Malformado lança um erro de
  **validação** (na rota vira 400 `VALIDACAO`) e **não** chama a Steam.
- **`percent` string → número** com 1 casa; `rtime_last_played` `0` → `null`.

### Custo e cache (protege a cota)

| Dado                              | Cache em memória | Chamadas por consulta                   |
| --------------------------------- | ---------------- | --------------------------------------- |
| Biblioteca + perfil (por SteamID) | 10 min           | `GetPlayerSummaries` + `GetOwnedGames`  |
| Schema de conquistas (por app)    | 24 h             | `GetSchemaForGame`                      |
| % globais (por app)               | 24 h             | `GetGlobalAchievementPercentagesForApp` |
| Conquistas do jogador (por app)   | 5 min            | `GetPlayerAchievements`                 |

Teto de 500 entradas por cache (descarta a mais antiga). Abrir um detalhe **velho** gasta até 4 chamadas
(horas via `appids_filter` + as três de conquistas), **1 a 2** com o cache quente. As rotas de atualização
manual ignoram o cache do próprio dado, respeitando o mínimo de 30 s. Nenhuma rota do catálogo chama a Steam.
Os TTLs, o teto de entradas e o timeout de 8 s ficam **constantes nomeadas** num só arquivo
(`integrations.constants.ts`, como o `auth.constants.ts`); os dois intervalos de atualização ficam no `shared`.

O **cartão do perfil** mostra as conquistas **dos jogos vinculados** (soma dos valores gravados no banco: "X
conquistas em N jogos vinculados"), não da biblioteca inteira: somar a biblioteca exigiria uma chamada por
jogo (ver Q2).

### Web

- **`/perfil`** — seção "Contas vinculadas" (`features/integracoes/components/`): `ContaSteamCard` com estados
  **sem vínculo**, **carregando** (esqueleto, `role="status"`), **vinculado**, **privado** ("Seu perfil Steam
  está privado", passo a passo numerado, **Tentar de novo**), **erro** ("Não foi possível falar com a Steam
  agora", **Tentar de novo**) e **sem conexão**. Os avisos de `?steam=` e `?motivo=` (`vinculada`,
  `cancelado`, `invalido`, `expirado`, `indisponivel`, `ja-vinculada`) têm texto próprio; parâmetro
  desconhecido é ignorado.
- **`BibliotecaSteamDialog`** (`ModalDialog`): busca com _debounce_ de 300 ms, lista por horas, cada item com
  capa 46 px, título, "42 h" e as ações do modo. Estados: carregando, vazia ("Nenhum jogo encontrado"),
  privada, erro. Modo **novo** (do formulário): **Criar jogo**, **Vincular a este** (se `jogosParecidos`),
  **Vincular a outro jogo que já tenho**; item com `vinculadoA` mostra "Já ligado a «X»" e **não** oferece
  Criar. Modo **vincular** (da página do jogo): só **Vincular**.
- **`GameForm`** — botão **Buscar na Steam** (só com vínculo; sem, um link "Vincule sua Steam no perfil"); com
  item escolhido, mostra "Ligado à Steam: «título»" com **Remover ligação** antes de salvar.
- **`GameRow`** — texto "42 h · 12/40" com `aria-label` ("42 horas jogadas, 12 de 40 conquistas") e ícone
  `emoji_events`. **`GameCover`** — recebe a capa oficial como segunda opção.
- **`GameDetail`** — `SteamBlock` (horas "42 h 30 min", "Último jogo em dd/mm/aaaa" ou "Nunca jogado" quando
  a data é nula, barra de progresso, botões) e `ConquistasLista` (Desbloqueadas por data decrescente; Faltam
  da mais comum para a mais rara; conquista oculta e bloqueada mostra "Conquista oculta"). Query própria
  `['plataforma', provedor, jogoId]`, habilitada **só na página de detalhes**; o `['games']` continua o do catálogo.
- Toda mutação invalida `['games']` e a query de integração afetada. Chamadas só pelo `apiClient`.

## Modelo de dados

**Só aditivo** (tabelas e enum novos; nenhuma coluna existente é tocada). Migration nova, versionada e
commitada. **Não há passo destrutivo.** Se surgir um na implementação, **parar** e registrar em `INDEX.md >
Pendências` (`RULES.md` §3, `/db-change`). Antes de `db:migrate`, confirmar qual banco é o `DATABASE_URL`
(o Supabase compartilhado, não descartável).

```prisma
enum Provedor {
  STEAM
}

// Uma conta por provedor e por usuário.
model ContaVinculada {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provedor      Provedor
  idExterno     String   @db.VarChar(40)   // SteamID64, já comprovado pelo OpenID
  nomeExibicao  String   @db.VarChar(80)
  vinculadaEm   DateTime @default(now())

  @@unique([userId, provedor])
  @@unique([userId, provedor, idExterno])
}

// A camada do provedor sobre um jogo do catálogo. 1 para 1 nos dois sentidos.
model JogoPlataforma {
  id                       String   @id @default(uuid())
  // userId repetido de Game para a unicidade por usuário; o service sempre grava com where: { id, userId }.
  userId                   String
  user                     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  gameId                   String
  game                     Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  provedor                 Provedor
  idExterno                String   @db.VarChar(40)   // appid
  minutosJogados           Int
  ultimaVezJogadoEm        DateTime?
  // null = nunca consultado ou negado; 0 = o jogo não tem conquistas.
  conquistasTotal          Int?
  conquistasDesbloqueadas  Int?
  capaUrl                  String?  @db.VarChar(300)
  atualizadoEm             DateTime

  @@unique([userId, provedor, idExterno])
  @@unique([gameId, provedor])
}
```

`User` e `Game` ganham só a relação inversa (sem coluna). `CHECK`s escritos à mão na migration, como os das
notas: `minutosJogados >= 0`; `conquistasDesbloqueadas <= conquistasTotal` quando ambos existem. A lista de
conquistas **não** é gravada (é buscada ao abrir o detalhe). Acrescentar um valor ao `Provedor` no futuro é
`ALTER TYPE … ADD VALUE`, também aditivo.

**A mesma conta Steam pode estar vinculada a mais de um usuário do checkpoint** (decisão de 2026-09-25, antes
só em "Suposições"). Não há unicidade global do SteamID: os `@@unique` são por `(userId, provedor)` e
`(userId, provedor, idExterno)`. Os dados da Steam são públicos e o OpenID prova a posse, então dois usuários que
provam ser donos da mesma conta a vinculam sem conflito, e **cada vínculo é isolado**: cada um só vê e desvincula
o seu, e os `JogoPlataforma` de um nunca aparecem para o outro (toda consulta filtra por `userId`).

## Contrato compartilhado

Novo `packages/shared/src/integracoes.ts`, reexportado em `index.ts` (agnóstico de plataforma, sem Node):

```ts
export const PROVEDORES = ['STEAM'] as const;
export type Provedor = (typeof PROVEDORES)[number];
export const PROVEDOR_SLUG: Record<Provedor, string> = { STEAM: 'steam' };

export const ATUALIZACAO_AUTOMATICA_MS = 60 * 60 * 1000; // 1 h
export const ATUALIZACAO_MANUAL_MIN_MS = 30 * 1000; // 30 s

export interface ContaVinculada {
  provedor: Provedor;
  idExterno: string;
  nomeExibicao: string;
  vinculadaEm: string;
}
export interface IniciarVinculoResponse {
  url: string;
}
export interface JogoParecido {
  id: string;
  titulo: string;
  plataforma: string | null;
}
export interface ItemBiblioteca {
  idExterno: string;
  titulo: string;
  capaUrl: string | null;
  minutosJogados: number;
  ultimaVezJogadoEm: string | null;
  jogosParecidos: JogoParecido[];
  vinculadoA: JogoParecido | null;
}
export interface PerfilPlataforma {
  provedor: Provedor;
  nomeExibicao: string;
  avatarUrl: string | null;
  perfilUrl: string | null;
  totalJogos: number;
  minutosTotais: number;
  maisJogados: {
    idExterno: string;
    titulo: string;
    capaUrl: string | null;
    minutosJogados: number;
  }[];
  conquistas: { desbloqueadas: number; total: number; jogosVinculados: number };
  consultadoEm: string;
}
export interface DadosJogoPlataforma {
  provedor: Provedor;
  idExterno: string;
  minutosJogados: number;
  ultimaVezJogadoEm: string | null;
  conquistasTotal: number | null;
  conquistasDesbloqueadas: number | null;
  capaUrl: string | null;
  atualizadoEm: string;
}
export interface Conquista {
  id: string;
  nome: string;
  descricao: string | null;
  oculta: boolean;
  desbloqueada: boolean;
  desbloqueadaEm: string | null;
  iconeUrl: string | null;
  raridadePercentual: number | null; // 1 casa decimal
}
export type AvisoPlataforma =
  'PERFIL_PRIVADO' | 'CONQUISTAS_PRIVADAS' | 'SEM_CONQUISTAS' | 'INDISPONIVEL';
export interface DetalheJogoPlataforma {
  dados: DadosJogoPlataforma;
  conquistas: Conquista[];
  aviso: AvisoPlataforma | null;
}
export interface VincularJogoRequest {
  idExterno: string;
  mover?: boolean;
}
export interface PlataformaItemJaVinculadoError extends ApiErrorResponse {
  jogoAtual: { id: string; titulo: string };
}
export function chaveDeTitulo(titulo: string): string; // sem caixa, acento, ™®©, pontuação e espaços repetidos
// games.ts: Game += dadosPlataforma: DadosJogoPlataforma[]
// auth.ts:  API_ERROR_CODES += os 9 códigos PLATAFORMA_* da tabela acima
```

O `shared` não tem runner: `chaveDeTitulo` é testada no Jest da API e no Vitest do web, como `notaMedia`.

## Interface `GameProvider` (`modules/integrations/providers/`)

```ts
interface GameProvider {
  readonly id: Provedor;
  iniciarVinculo(ctx: { state: string; returnTo: string; realm: string }): { url: string };
  concluirVinculo(
    query: Record<string, string>,
    ctx: { returnTo: string },
  ): Promise<{ idExterno: string; nomeExibicao: string }>;
  listarBiblioteca(idExterno: string): Promise<{ itens: ItemDaBiblioteca[]; perfil: PerfilBasico }>; // lança PerfilPrivadoError
  obterJogo(
    idExterno: string,
    idJogo: string,
  ): Promise<{ dados: DadosDoJogo; conquistas: Conquista[]; aviso: AvisoPlataforma | null }>;
}
```

Acréscimo **em relação à decisão 10**: `listarBiblioteca` também devolve o `perfil` (nome, avatar, visibilidade),
porque o cartão precisa dele e a detecção de privacidade cruza as duas chamadas (`GetPlayerSummaries` +
`GetOwnedGames`). Um `ProviderRegistry` resolve o provedor pelo _slug_; o `IntegrationsService` só conhece a
interface. A `SteamProvider` usa o **`SteamClient`** (`fetch` nativo, timeout de 8 s, isolado atrás de métodos
simples e **mockado nos testes**, como o `StorageService`) e o `SteamOpenId` (montagem da URL e
`check_authentication`, também mockável). Passar a chave só por dentro do `SteamClient`.

**`obterJogo` por etapas (decisão de 2026-09-25).** O CA-26 pede `conquistasTotal` na resposta do `PUT`, então
a **etapa 3** implementa só o **resumo**: horas, última vez jogado, capa e as contagens (uma chamada a
`GetPlayerAchievements`; `null` nas contagens se as conquistas forem negadas, `0` se o jogo não tiver) e o aviso
de privacidade, com `conquistas: []`. A **lista completa** (schema e raridade, com cache) é da etapa 4.

## Critérios de aceite (testáveis, em BDD)

A numeração segue a ordem de escrita; a tabela de "Etapas" diz a que etapa cada critério pertence (CA-60, CA-63 e
CA-64 são da etapa 1; CA-61, CA-62 e CA-65, da etapa 2; CA-40, CA-66 e CA-67, da etapa 3). O CA-63 só fecha quando os fixtures de perfil privado e
conquistas negadas forem capturados (a etapa 1 pode ter testes `todo` até lá); a biblioteca vazia, sem conta
de teste, fica com `todo` até a etapa 4.

`curl` contra `http://localhost:3333/api` com os jars de `autenticacao` (Ana e Bia, contas sintéticas). UI em
`http://localhost:5173`. A Steam é **mockada** em todo teste automatizado; a verificação manual usa uma conta
Steam de teste (pública, com jogos e conquistas) e outra privada. Dados de exemplo sintéticos.

### Etapa 1 — base

- [x] **CA-01** — **Dado** o esquema aplicado, **quando** rodo a migration num banco limpo, **então** existem
      `ContaVinculada` e `JogoPlataforma` com os índices únicos `(userId, provedor)`, `(userId, provedor,
idExterno)` e `(gameId, provedor)`, e nenhuma coluna de `Game`, `User` ou `RefreshSession` mudou (`git diff`
      do `schema.prisma` só tem adições).
- [x] **CA-02** — **Dado** a API sem `STEAM_API_KEY`, ou com valor fora de 32 hexadecimais, ou sem
      `API_PUBLIC_URL`/`WEB_PUBLIC_URL` (URL `http(s)` sem barra final), **quando** ela sobe, **então** o boot falha com a
      lista de erros; **e** com tudo certo, o valor da chave não aparece em nenhum log de boot.
- [x] **CA-03** — **Dado** um `SteamClient` com `fetch` mockado, **quando** a Steam responde 429, **401** (o corpo
      real: HTML "Unauthorized"), 403 (fora de `GetPlayerAchievements`), 500, demora mais de 8 s, devolve um 200 sem
      `content-type` JSON ou JSON inválido, **então** ele lança o erro tipado (`PLATAFORMA_LIMITE` para o 429,
      `PLATAFORMA_INDISPONIVEL` para os demais, sem tentar ler HTML como JSON) **e** o log do 401 é um `error`
      ("chave recusada") e todos os logs têm só o nome da chamada e o status, sem a URL nem a chave.
- [x] **CA-64** — **Dado** um SteamID malformado (`""`, `"abc"`, 16 ou 18 dígitos, prefixo diferente de `7656`) ou um
      appid malformado (`""`, `"12a"`, `"1; drop"`), **quando** chamo qualquer método do `SteamClient`, **então** ele
      lança o erro de **validação** (não o de perfil privado) **e** o `fetch` **não** é chamado; **dado** um
      `percent` `"40.7"` nos globais, **então** o cliente devolve o número 40,7; **dado** `rtime_last_played: 0`,
      **então** a última vez jogado é `null`.
- [x] **CA-04** — **Dado** `chaveDeTitulo`, **quando** comparo "Pokémon™: Legends – Arceus", "pokemon legends arceus" e
      " POKEMON Legends Arceus ", **então** as três chaves são iguais; "Celeste" e "Celeste 64" são diferentes.
- [x] **CA-05** — **Dado** o `shared` buildado, **quando** rodo `npm run typecheck`, **então** passa, **e** o
      `Record<ApiErrorCode, string>` do web tem texto para cada `PLATAFORMA_*`.
- [ ] **CA-63** — _(Parcial: existem os fixtures de perfil público, sem conquistas, oculta e chave inválida; faltam perfil privado e conquistas negadas, que dependem de a conta de teste trocar a privacidade.)_ **Dado** o fim da etapa 1, **então** existem fixtures **sanitizados** de respostas reais da Steam
      para perfil privado, biblioteca pública vazia, jogo sem conquistas, conquistas negadas e chave inválida (401); **e** nenhum
      contém SteamID, nome de exibição ou URL de avatar reais (um teste falha se algum valor tem 17 dígitos começando
      com `7656`); **e** cada critério da lista de dependentes (CA-03, CA-16, CA-20, CA-30, CA-47, CA-48, CA-50) foi
      conferido contra eles, com a spec revista (`/spec-sync`) **antes** de seguir se a resposta real difere do assumido.

### Etapa 2 — vínculo OpenID e cartão

- [x] **CA-06** — **Dado** Ana logada sem vínculo, **quando** `POST /api/integracoes/steam/vinculo`, **então** 200
      com `{ url }` apontando para `https://steamcommunity.com/openid/login` com `openid.return_to` =
      `${API_PUBLIC_URL}/api/integracoes/steam/retorno?state=…`, `openid.realm` = `API_PUBLIC_URL`, `openid.mode=checkid_setup`; **e** um
      `Set-Cookie: checkpoint_vinculo` `HttpOnly; SameSite=Lax; Path=/api/integracoes`.
- [x] **CA-07** — **Dado** o `POST .../vinculo` sem token, **então** 401; **com** `:provedor` = `xbox`, **então**
      400 `VALIDACAO`; **com** Ana já vinculada a outro SteamID, **então** 409 `PLATAFORMA_JA_VINCULADA`; **na 6ª
      chamada em 1 min**, **então** 429 `LIMITE_TENTATIVAS`.
- [x] **CA-08** — **Dado** uma resposta OpenID válida (Steam mockada com `is_valid:true`), o `state` de Ana e o
      cookie com o mesmo nonce, **quando** `GET .../retorno`, **então** 302 para `${WEB_PUBLIC_URL}/perfil?steam=vinculada`, existe
      uma `ContaVinculada` (`STEAM`, o SteamID do `claimed_id`, o nome de `GetPlayerSummaries`), e o cookie é limpo.
- [x] **CA-09** — **Dado** o retorno **sem** o cookie, **ou** com nonce diferente do `state` (o link do atacante
      aberto no navegador da vítima), **então** 302 `?steam=erro&motivo=invalido` e **nada** é gravado.
- [x] **CA-10** — **Dado** o retorno com `state` adulterado (assinatura inválida) ou vencido (> 10 min), **então**
      302 `motivo=invalido` (ou `expirado` no vencido) e nada é gravado.
- [x] **CA-11** — **Dado** o retorno com `return_to` diferente do montado, `op_endpoint` que não é o da Steam,
      `claimed_id` fora do formato, `claimed_id` ≠ `identity`, ou a Steam respondendo `is_valid:false`, **então**
      302 `motivo=invalido`, nada gravado; **e** com `is_valid:false` o `SteamOpenId` **não** é chamado uma 2ª vez
      (sem _retry_).
- [x] **CA-12** — **Dado** o retorno com `openid.mode=cancel`, **então** 302 `motivo=cancelado`; **dado** a
      Steam fora do ar no `check_authentication`, **então** 302 `motivo=indisponivel`, sem 500.
- [x] **CA-13** — **Dado** Ana com outro SteamID vinculado, **quando** o retorno traz um SteamID diferente,
      **então** 302 `motivo=ja-vinculada` e o vínculo original fica; **com o mesmo SteamID**, **então** sucesso sem
      duplicar a linha.
- [x] **CA-14** — **Dado** o retorno válido mas `GetPlayerSummaries` falhando, **então** o vínculo é gravado com
      `nomeExibicao` "Conta Steam" e o redirecionamento é `?steam=vinculada`.
- [ ] **CA-15** — _(A tela com o clique real na Steam só dá para provar depois do deploy: o teste cobre o cartão, o desvio de URL e o aviso do retorno.)_ **Dado** `/perfil` sem vínculo, **quando** clico em **Vincular conta**, **então** o navegador
      vai para a URL devolvida pela API; **dado** `/perfil?steam=vinculada`, **então** vejo o aviso de sucesso, o
      cartão carrega e a URL vira `/perfil`; **dado** `?steam=erro&motivo=cancelado`, **então** vejo o texto do
      cancelamento; **dado** `?steam=qualquer`, **então** nada aparece.
- [x] **CA-16** — **Dado** Ana vinculada e a Steam pública (mock), **quando** `GET /api/integracoes/steam/perfil`,
      **então** 200 `PerfilPlataforma` com `totalJogos`, `minutosTotais` (soma dos `playtime_forever`), os 3
      `maisJogados` por horas, `avatarUrl` só `https` da `steamstatic.com`, e `conquistas` com a soma **dos jogos vinculados**
      gravados (`jogosVinculados` = N), **sem** nenhuma chamada à Steam além de `GetPlayerSummaries` e
      `GetOwnedGames`; **e** o cartão do web mostra os números e o texto "X conquistas em N jogos vinculados". Uma 2ª chamada em menos de 10 min **não** chama a Steam.
- [x] **CA-17** — **Dado** Ana sem vínculo, **quando** `GET .../perfil`, **então** 409 `PLATAFORMA_NAO_VINCULADA`.
- [x] **CA-18** — **Dado** o cartão vinculado, **quando** clico **Atualizar** duas vezes em menos de 30 s, **então**
      a 2ª não chama a Steam (200 com o mesmo `consultadoEm`); **e** uma 3ª chamada da API em 1 min acima do limite dá 429.
- [x] **CA-19** — **Dado** Ana vinculada com 2 jogos ligados, **quando** clico **Desvincular** e confirmo,
      **então** 204, `ContaVinculada` e os 2 `JogoPlataforma` somem, os 2 `Game` continuam **idênticos** (título,
      status, notas, descrição, capa) e o cartão volta a "Vincular conta"; **quando** cancelo, **então** nada muda;
      **repetindo** o `DELETE`, **então** 409 `PLATAFORMA_NAO_VINCULADA`.
- [x] **CA-20** — **Dado** o `GET .../perfil` com perfil privado (mock: visibilidade ≠ 3, ou `GetOwnedGames`
      sem `game_count`), **então** 409 `PLATAFORMA_PERFIL_PRIVADO` e o cartão mostra "Seu perfil Steam está privado", os
      passos numerados e **Tentar de novo**, que refaz a consulta; **dado** `game_count: 0`, **então** 200 com
      `totalJogos: 0` (o cartão diz "Nenhum jogo na sua biblioteca").
- [x] **CA-21** — **Dado** a Steam com timeout (mock), **quando** `GET .../perfil`, **então** 502
      `PLATAFORMA_INDISPONIVEL` (nunca 500) e o cartão mostra o erro com **Tentar de novo**, **e** o resto do `/perfil` e
      o catálogo funcionam.
- [ ] **CA-22** — _(Só provável depois do deploy: 360 px e 1024 px no navegador. O teste confere `min-h-11`, mas não mede pixels.)_ **Dado** 360×640 e 1024 px, **quando** abro `/perfil` com o cartão, **então** não há rolagem
      horizontal e todo botão tem ≥ 44 × 44 px.
- [x] **CA-61** — **Dado** um `state` válido (`typ: 'vinculo'`, emitido pelo `POST .../vinculo` de Ana), **quando** o
      envio como `Authorization: Bearer` em `GET /api/auth/me`, `GET /api/games` e `POST /api/integracoes/steam/vinculo`,
      **então** 401 nas três (o mesmo de um token inválido) e nada é executado; **e** o `access-token.guard.spec.ts` tem
      esse caso (o guard rejeita o `typ` diferente de `access` mesmo com assinatura válida).
- [x] **CA-62** — **Dado** um access token válido de Ana (`typ: 'access'`, assinado com o mesmo segredo), **quando** o
      envio como `state` em `GET .../retorno` (com o cookie do mesmo nonce e uma resposta OpenID válida), **então** 302
      `motivo=invalido`, nada é gravado e o `check_authentication` da Steam **não** é chamado; **e** o mesmo resultado
      com um refresh token no lugar (assinatura de outro segredo).
- [x] **CA-65** — **Dado** Ana e Bia (duas contas do checkpoint) provando ser donas do MESMO SteamID, **quando** cada
      uma conclui o vínculo, **então** as duas têm uma `ContaVinculada` (mesmo `idExterno`, um `userId` cada), sem
      409; **e** `GET /api/integracoes` de cada uma devolve só a dela; **e** desvincular a da Ana (`DELETE`) não
      apaga a `ContaVinculada` nem os `JogoPlataforma` da Bia.

### Etapa 3 — biblioteca e vínculo de jogo

- [ ] **CA-23** — **Dado** Ana vinculada com biblioteca de 3 jogos, **quando** `GET .../biblioteca`, **então** 200
      com 3 `ItemBiblioteca` por horas decrescente; **com** `?busca=celeste` (sem caixa nem acento), **então** só os
      que batem; **com** `limite=51` ou `busca` de 101 caracteres, **então** 400 `VALIDACAO`.
- [ ] **CA-24** — **Dado** Ana com o jogo "Celeste" (PC) no catálogo e "Celeste" na biblioteca, **quando** listo
      a biblioteca, **então** o item traz `jogosParecidos` com esse jogo; **e** se o jogo já estiver ligado à Steam,
      ele **não** aparece em `jogosParecidos`.
- [ ] **CA-25** — **Dado** o item já ligado a um jogo da Ana, **quando** listo a biblioteca, **então** o item
      traz `vinculadoA` com esse jogo.
- [ ] **CA-26** — **Dado** o jogo "Celeste" sem vínculo, **quando** `PUT .../jogos/<id>` com `{"idExterno":"504230"}`
      (item da biblioteca), **então** 200 `DadosJogoPlataforma` (`minutosJogados`, `conquistasTotal`, `capaUrl`,
      `atualizadoEm`), uma linha `JogoPlataforma`, e `status`, notas e `plataforma` do jogo **inalterados**.
- [ ] **CA-27** — **Dado** o `PUT` com `idExterno` que **não** está na biblioteca, **então** 404
      `PLATAFORMA_ITEM_NAO_ENCONTRADO`; com `{}`, `{"idExterno":""}`, `{"idExterno":"abc; drop"}` ou campo extra, **então** 400
      `VALIDACAO`; com `:jogoId` que não é UUID, **então** 400; com o jogo de **Bia**, **então** 404 (o mesmo do
      catálogo); sem token, **então** 401; sem conta vinculada, **então** 409 `PLATAFORMA_NAO_VINCULADA`.
- [ ] **CA-28** — **Dado** o item 504230 já ligado ao jogo A, **quando** `PUT` no jogo B com o mesmo item **sem**
      `mover`, **então** 409 `PLATAFORMA_ITEM_JA_VINCULADO` com `jogoAtual` = A e nada muda; **com** `mover: true`, **então**
      200, o vínculo passa a B, A **não** tem mais camada Steam e A segue intacto.
- [ ] **CA-29** — **Dado** o jogo B que já tem vínculo, **quando** `PUT` com outro item, **então** 409
      `PLATAFORMA_JOGO_JA_VINCULADO`.
- [ ] **CA-30** — **Dado** o `PUT` com perfil privado, **então** 409 `PLATAFORMA_PERFIL_PRIVADO`; com a Steam fora do ar,
      **então** 502 `PLATAFORMA_INDISPONIVEL`, e **nenhuma** linha é criada.
- [ ] **CA-31** — **Dado** o vínculo de um jogo, **quando** `DELETE .../jogos/<id>`, **então** 204 e a camada some;
      **repetindo**, **então** 404 `PLATAFORMA_VINCULO_NAO_ENCONTRADO`.
- [ ] **CA-32** — **Dado** o formulário de novo jogo com a Steam vinculada, **quando** clico **Buscar na Steam**,
      digito "cel" e escolho **Criar jogo** num item com 0 min, **então** o formulário abre com título e capa
      preenchidos, plataforma "PC", status **Quero jogar** pré-selecionado; **com** 120 min, **Jogando**; **em nenhum caso**
      Zerado; **e** salvar cria o jogo e o liga (2 requests, nessa ordem).
- [ ] **CA-33** — **Dado** o jogo criado mas a ligação falhando, **quando** salvo, **então** o jogo existe, o
      formulário passa a editá-lo e mostra o erro da ligação (o próximo Salvar é `PATCH`, não `POST`).
- [ ] **CA-34** — **Dado** o diálogo com um item cujo nome bate com um jogo do catálogo, **então** o item mostra "já
      no seu catálogo" e **Vincular a este**; **quando** clico, **então** o jogo é ligado **sem** criar outro, o
      formulário fecha e vou para `/jogos/<id>`; **e** nada é ligado sem um clique.
- [ ] **CA-35** — **Dado** qualquer item (com ou sem nome parecido), **então** existe **Vincular a outro jogo que já
      tenho**, com um seletor só dos jogos **sem** vínculo Steam; escolher um e confirmar liga o item a ele.
- [ ] **CA-36** — **Dado** um item já ligado a outro jogo, **então** o diálogo mostra "Já ligado a «X»" e não
      oferece **Criar jogo**; **e** ao tentar **Vincular a outro jogo** ele, o web mostra o aviso do 409 com **Mover o vínculo**, que
      reenvia com `mover: true`.
- [ ] **CA-37** — **Dado** um jogo com `plataforma` "PlayStation 5", **quando** tento **Vincular à Steam**,
      **então** o web pede a confirmação com o texto da plataforma e só liga se eu confirmar; **cancelando**, nada
      é enviado; **e** a `plataforma` do jogo continua "PlayStation 5" depois de ligado. **Dado** um jogo com
      plataforma "PC" ou vazia, **então** liga sem confirmação. **Dado** o `PUT` da API para um jogo de qualquer
      plataforma, **então** 200 (a API não olha a `plataforma`). **Dado** o formulário de novo jogo pré-preenchido
      com "PC", **quando** troco a plataforma para "PlayStation 5" e salvo, **então** vejo a confirmação **antes** de
      qualquer request; **cancelando**, nada é enviado (nem o jogo é criado); **confirmando**, cria o jogo e o liga.
- [ ] **CA-38** — **Dado** a página de um jogo sem vínculo e a Steam vinculada, **então** vejo **Vincular à
      Steam** e o diálogo (modo vincular) sem **Criar jogo**; **sem** a conta vinculada, vejo o link "Vincule sua
      Steam no perfil".
- [ ] **CA-39** — **Dado** o diálogo com perfil privado ou Steam fora do ar, **então** vejo o bloco de privacidade
      (com **Tentar de novo**) ou o erro, sem quebrar o formulário; **dado** 360×640, **então** sem rolagem horizontal e ações ≥ 44 px.

- [ ] **CA-40** — _(puxado da etapa 4: o web precisa saber quais jogos já têm vínculo para os CA-35 e CA-38)_ **Dado** Ana com 1 jogo ligado e 1 sem ligação, **quando** `GET /api/games`, **então** o ligado traz
      `dadosPlataforma` com 1 item e o outro traz `[]`; **e** nenhuma chamada à Steam foi feita (mock sem chamadas).
- [ ] **CA-66** — **Dado** o item 504230 ligado ao jogo A e a plataforma **falhando** (timeout, 5xx, 429 ou perfil
      privado), **quando** `PUT` no jogo B com `mover: true`, **então** 502 (ou 409 `PLATAFORMA_PERFIL_PRIVADO`) e
      **nada muda**: o vínculo continua no jogo A e o jogo B segue sem vínculo.
- [ ] **CA-67** — **Dado** o item 504230 ligado ao jogo A, **quando** `PUT` no jogo B **sem** `mover`, **então**
      409 `PLATAFORMA_ITEM_JA_VINCULADO` com `jogoAtual` = A **e a plataforma NÃO é chamada** (as checagens de
      banco vêm antes); **dado** o jogo B que já tem vínculo, **então** 409 `PLATAFORMA_JOGO_JA_VINCULADO` também sem
      chamar a plataforma, mesmo com `mover: true`.

### Etapa 4 — horas, conquistas, atualização e privacidade

- [ ] **CA-41** — **Dado** o catálogo (`/`), **então** a linha do jogo ligado mostra "42 h · 12/40" com o
      `aria-label` completo e a do jogo sem ligação não mostra nada; **dado** Y = 0, **então** só as horas; **dado**
      0 minutos, **então** "0 h".
- [ ] **CA-42** — **Dado** um jogo com capa enviada **e** vínculo, **então** a capa mostrada é a enviada; **dado**
      só o vínculo, **então** a oficial (e se ela falhar ao carregar, a de `header.jpg`, e depois a gerada); **dado**
      que removo a capa enviada, **então** a oficial reaparece.
- [ ] **CA-43** — **Dado** um jogo ligado com `atualizadoEm` de 2 h atrás, **quando** `GET .../jogos/<id>`, **então**
      200 `DetalheJogoPlataforma`, a Steam é consultada (horas e conquistas), o `atualizadoEm` gravado é novo e
      `conquistas` traz cada uma com `nome`, `descricao`, `desbloqueada`, `desbloqueadaEm`, `iconeUrl` e `raridadePercentual`.
- [ ] **CA-44** — **Dado** `atualizadoEm` de 10 min atrás, **quando** `GET .../jogos/<id>`, **então** as horas **não**
      são reconsultadas (só a lista de conquistas, e do cache se tiver menos de 5 min).
- [ ] **CA-45** — **Dado** o detalhe, **quando** `POST .../atualizacao` duas vezes em 30 s, **então** a 1ª consulta a
      Steam e a 2ª devolve o gravado sem chamá-la; **dado** ≥ 30 s depois, **então** consulta de novo.
- [ ] **CA-46** — **Dado** `GET .../jogos/<id>` sem vínculo, **então** 404 `PLATAFORMA_VINCULO_NAO_ENCONTRADO`; com
      jogo de outro usuário, **então** 404 igual ao do catálogo; com id inválido, **então** 400.
- [ ] **CA-47** — **Dado** conquistas negadas (mock 403) com horas legíveis, **então** 200 com `aviso:
'CONQUISTAS_PRIVADAS'`, `conquistas: []`, horas atualizadas e as contagens gravadas **inalteradas**, e a página mantém as horas e mostra o aviso
      discreto de conquistas privadas (não o bloco grande de perfil privado); **dado**
      biblioteca privada, **então** 200 com `aviso: 'PERFIL_PRIVADO'` e o valor gravado.
- [ ] **CA-48** — **Dado** um jogo sem conquistas (mock 400 "no stats"), **então** 200 com `aviso: 'SEM_CONQUISTAS'`,
      `conquistas: []`, `conquistasTotal: 0`; a página não mostra barra de progresso e diz "Este jogo não tem
      conquistas".
- [ ] **CA-49** — **Dado** a Steam fora do ar (timeout, 5xx, 429, 401, 403), **quando** `GET .../jogos/<id>`, **então**
      **200** com o valor gravado e `aviso: 'INDISPONIVEL'` (nunca 502 nem 500), e a página mostra o bloco com "Não foi
      possível atualizar agora" e o valor antigo; **quando** `POST .../atualizacao`, **então** 502
      `PLATAFORMA_INDISPONIVEL` (429 da Steam: 502 `PLATAFORMA_LIMITE`).
- [ ] **CA-50** — **Dado** falha só de `GetSchemaForGame` ou dos percentuais, **então** o detalhe continua 200: sem
      percentual, a conquista mostra "Raridade indisponível"; sem schema, mostra a `apiname` como nome.
- [ ] **CA-51** — **Dado** `/jogos/:id` de um jogo ligado, **então** o bloco **Steam** mostra horas ("42 h 30
      min"), "Último jogo em dd/mm/aaaa" (ou "Nunca jogado" com data nula), a barra `role="progressbar"` com "12 de 40
      conquistas", **Atualizar**, **Desvincular** e "Abrir na Steam" (`rel="noopener noreferrer"`); **e** a lista só é
      pedida ao abrir a página (nenhuma request de conquistas ao abrir `/`).
- [ ] **CA-52** — **Dado** a lista, **então** **Desbloqueadas** (por data decrescente, fechada) e **Faltam** (da mais
      comum à mais rara, aberta) são `<details>` separados com contagem; cada item tem ícone, nome, descrição, data
      ("Desbloqueada em dd/mm/aaaa") ou nada, e "12,4% dos jogadores"; a conquista oculta bloqueada mostra "Conquista oculta"
      no lugar da descrição.
- [ ] **CA-53** — **Dado** 360×640, **quando** abro um jogo com 200 conquistas, **então** não há rolagem horizontal, a
      lista é uma coluna, os ícones têm `loading="lazy"` e `width`/`height`, e todo botão tem ≥ 44 × 44 px; **dado** 1024 px, **então**
      data e raridade ficam à direita de cada linha.
- [ ] **CA-54** — **Dado** o **Desvincular** do jogo (página) confirmado, **então** o bloco Steam some, a linha do
      catálogo volta a não ter horas, o jogo segue com título, status e notas, e **Vincular à Steam** reaparece.
- [ ] **CA-55** — **Dado** efeitos "Reduzidos" ou `prefers-reduced-motion`, **então** nenhuma animação nova (esqueletos,
      barra, `<details>`) roda; **e** `tokens.test.ts` continua verde (nenhum hex fora do `@theme`).

### Transversais

- [ ] **CA-56** — **Dado** Ana com conta e jogos vinculados à Steam, **quando** `POST /api/users/me/exclusao` com a
      senha certa, **então** 204 e **nenhuma** linha de `ContaVinculada` nem de `JogoPlataforma` dela resta
      (`SELECT count(*)` = 0); as de **Bia** continuam. Coberto por teste no fluxo de exclusão existente (o Prisma falso ganha o
      _cascade_ das duas tabelas) **e** conferido no banco real.
- [ ] **CA-57** — **Dado** qualquer rota nova sem `Authorization`, **então** 401, exceto `GET .../retorno` (302).
- [ ] **CA-58** — **Dado** os logs de uma execução completa dos testes (sucesso e todas as falhas da Steam),
      **então** nenhum contém o valor de `STEAM_API_KEY`, o `state`, o cookie `checkpoint_vinculo` nem uma URL da Steam com `key=`.
- [ ] **CA-59** — **Dado** `git grep STEAM_API_KEY apps/web`, **então** sem resultado; **e** o bundle do web
      (`npm run build`) não contém o valor da chave.
- [x] **CA-60** — **Dado** o `.env.example` da API, **então** tem `STEAM_API_KEY`, `API_PUBLIC_URL` e `WEB_PUBLIC_URL`
      documentadas e **sem valor real**.

## Plano de testes

- **API (Jest; Prisma, `SteamClient` e `SteamOpenId` mockados, nunca a rede):**
  - `steam.client.spec.ts` (fixtures das respostas reais da etapa 1, mapeamento de erros, timeout, log sem URL/chave: CA-03, CA-58, CA-63, CA-64; os fixtures sanitizados moram ao lado do spec).
  - `steam-open-id.spec.ts` (URL de saída; todas as validações de retorno: CA-06, CA-09 a CA-12).
  - `steam.provider.spec.ts` (privado × vazio, sem conquistas, oculta, raridade, avatar só `steamstatic.com`: CA-16, CA-20, CA-47, CA-48, CA-50).
  - `integrations.service.spec.ts` (1 para 1, mover, jogo de outro usuário, conferência contra a biblioteca, intervalos de 1 h e 30 s, cache, desvincular em transação: CA-13, CA-19, CA-24 a CA-31, CA-43 a CA-49).
  - `vinculo-state.spec.ts` (assinatura, `typ`, validade, nonce do cookie; access e refresh token como `state`: CA-09, CA-10, CA-62) e `access-token.guard.spec.ts` (acréscimo: token `typ: 'vinculo'` com assinatura válida → 401: CA-61).
  - `dto/*.spec.ts` (pelo pipe do `main.ts`: CA-23, CA-27) e `provider-slug.pipe.spec.ts` (CA-07).
  - `integrations.http.spec.ts` (porta local, guard global real, provider falso: 401, 302 do retorno com cookie, 429 por usuário e não por IP, corpos e logs: CA-06, CA-07, CA-08, CA-57, CA-58).
  - `games.service.spec.ts` (acréscimo: `dadosPlataforma` no `Game`, sem chamada à Steam: CA-40); `users.http.spec.ts`/`fake-auth-prisma` (acréscimo: cascade das duas tabelas: CA-56).
  - `env.validation.spec.ts` (acréscimo: CA-02).
- **shared:** `chaveDeTitulo` (CA-04), testada na API e no web (o shared não tem runner).
- **Web (Vitest, `apiClient` mockado):** `ContaSteamCard.test.tsx` (todos os estados, Atualizar, Desvincular: CA-15 a CA-21), `PerfilPage.test.tsx` (acréscimo: seção e avisos `?steam=`), `BibliotecaSteamDialog.test.tsx` (busca, modos, parecidos, outro jogo, mover: CA-32 a CA-39), `GameForm.test.tsx` (acréscimo: pré-preenchimento e sugestão de status, nunca Zerado), `lib/save-game.test.ts` (acréscimo: ligação depois do jogo, falha da ligação), `GameRow.test.tsx` (CA-41), `game-cover` (precedência: CA-42), `SteamBlock.test.tsx` e `ConquistasLista.test.tsx` (CA-48 a CA-54), `lib/format.test.ts` (horas), `styles/tokens.test.ts` (CA-55).
- **Manual (`/qa-verify`):** o fluxo OpenID **real** de ponta a ponta com uma conta Steam de teste, **em produção** (Vercel + Render, porque o comportamento do rewrite e do cookie só existe lá) e em dev; CA-01 (migration real), CA-15, CA-22, CA-39, CA-53 no navegador (360 px e desktop); CA-20/CA-47 com uma conta privada de verdade; CA-21/CA-49 derrubando a rede da API; CA-56 no banco real; CA-59 no bundle.

Loop de verificação por tarefa: `npm run typecheck -w <workspace>` → `npm test -w <workspace>` → `npm run lint` →
`npm run build` → commit.

## Etapas

Uma branch (`feat/integracao-plataformas`) e commits por etapa, parando para validação ao fim de cada uma.

| Etapa | Entrega                                                                                                                                                                                                                                                                                                              | Depende de | Critérios                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------- |
| 1     | contrato no `shared` · schema + migration (aditiva) · env (`STEAM_API_KEY`, `API_PUBLIC_URL`, `WEB_PUBLIC_URL`) · `GameProvider` + registro · `SteamClient` com mocks · **primeira tarefa: chamada real com conta Steam de teste para fixar os fixtures** · `.env.example` no mesmo commit da validação de env       | —          | CA-01 a CA-05, CA-60, CA-63, CA-64 |
| 2     | OpenID (`vinculo`, `retorno`, `state` + cookie) · `perfil`, `atualizacao`, `DELETE` da conta · seção "Contas vinculadas" com o cartão · **pré-requisito: a chore do `trust proxy` (fora desta spec) já feita**                                                                                                       | 1          | CA-06 a CA-22, CA-61, CA-62, CA-65 |
| 3     | `biblioteca` · `PUT/DELETE .../jogos/:jogoId` · `BibliotecaSteamDialog` · Buscar na Steam, parecidos, "outro jogo", mover, confirmação de plataforma · `Game.dadosPlataforma` (CA-40, puxado da etapa 4) · resumo do jogo no `obterJogo` (horas, contagens, aviso) · a rota `DELETE` sai aqui; o botão só na etapa 4 | 2          | CA-23 a CA-40, CA-66, CA-67        |
| 4     | linha do catálogo · precedência da capa · `GET/POST .../jogos/:jogoId` · bloco Steam, lista completa de conquistas (schema e raridade), botão Desvincular do jogo (CA-54), atualização, privacidade                                                                                                                  | 3          | CA-41 a CA-55                      |
| 5     | fechamento: `ARCHITECTURE.md` (ver abaixo), `INDEX.md`, exclusão de conta (CA-56 a CA-59), `/qa-verify` em produção, `/docs-sync`                                                                                                                                                                                    | 4          | CA-56 a CA-59                      |

**Ordem obrigatória de deploy (Q4).** A etapa 1 é a primeira a **exigir** as variáveis no boot
(`env.validation.ts`), então:

1. Gerar a `STEAM_API_KEY` e **cadastrar `STEAM_API_KEY`, `API_PUBLIC_URL` e `WEB_PUBLIC_URL` no Render
   ANTES do deploy** de qualquer commit que inclua a etapa 1. Deploy sem elas derruba a API, por desenho.
2. O `.env.example` é atualizado no **mesmo commit** da validação (CA-60).
3. A migration (aditiva) é aplicada no banco de produção antes ou junto desse deploy; o código antigo continua
   funcionando com as tabelas novas.
4. Enquanto o item 1 não estiver feito, a etapa 1 fica **na branch**: não vai para `main` nem para o deploy.

**As etapas 3 e 4 se implantam JUNTAS** (decisão de 2026-09-25). Só a etapa 3 deixaria a pessoa ligar jogos sem
ver as horas e as conquistas na lista e no detalhe (CA-41, CA-42, CA-51), sem o botão de desvincular o jogo
(CA-54; a rota `DELETE` já existe) e sem a capa oficial de fallback. Até a etapa 4, a etapa 3 fica na branch.

**Os fixtures de perfil privado e de conquistas negadas vêm antes do commit das rotas de vínculo de jogo**
(etapa 3, `PUT` e `DELETE`): uma captura por aviso, sem tentar em laço. Se o `GetPlayerAchievements` não responder
403 quando os "detalhes do jogo" são privados, o `obterJogo` e os CA-30 e CA-47 são ajustados **antes** de seguir.

**A chore do `trust proxy` não faz parte desta spec** (Q1): é feita **antes da etapa 2**, à parte, e está em
`INDEX.md > Pendências`. Esta spec não a implementa nem depende do resultado dela.

**`ARCHITECTURE.md` muda junto**, no commit que muda o comportamento: §1 (linha **Deploy / CI**, que hoje diz
"Não existe" mas o projeto **já está em produção**: front na Vercel com o rewrite de `/api` para o Render, API
no Render, banco e bucket no Supabase; e a linha da integração), §3 e §4.4 (módulo `integrations`), §4.2 e §8
(variáveis novas), §4.3 (models novos), §5 (`features/integracoes`, perfil, catálogo, detalhe), §6 (contrato).
A reescrita da linha de Deploy pode ir num commit `docs` próprio, antes da etapa 2, se você preferir separar.

## Fora de escopo

**Feature do produto:**

- **PlayStation, Xbox e Epic.** Cada uma entra depois só implementando `GameProvider`, com a spec própria e a
  limitação anotada: **PSN e Xbox não têm API pública oficial** (as integrações existentes dependem de
  APIs não documentadas ou de credenciais do usuário, o que exige uma decisão de risco e de termos de uso
  antes); **Epic não expõe horas jogadas**.
- **Importação da biblioteca inteira de uma vez.** A ligação é sempre um jogo por vez, por escolha do usuário.
- **Sincronização automática em segundo plano** (o Render gratuito dorme); só sob demanda.
- **Ranking e gráficos de horas**; comparação entre usuários.
- **Login com Steam como forma de entrar no app.** O OpenID serve só para vincular.
- Guardar a **lista de conquistas** no banco; copiar a **capa oficial** para o bucket; mais de uma conta
  Steam por usuário; atualizar as horas de todos os jogos vinculados ao atualizar o cartão do perfil (a
  biblioteca já traz as horas, então é uma melhoria barata para depois); conquistas totais da biblioteca
  inteira (ver Q2); jogos fora da biblioteca (Family Sharing, não-Steam).
- Trocar automaticamente `status`, notas ou `plataforma` a partir de dado da Steam.

**Passo de processo (não é critério de aceite):** gerar a `STEAM_API_KEY` e configurar as três variáveis no
Render e em `apps/api/.env`; aplicar a migration no banco de produção; atualizar `ARCHITECTURE.md` e `INDEX.md`;
o `trust proxy` **não** entra aqui: é uma chore separada, antes da etapa 2 (Q1, `INDEX.md > Pendências`).

## Notas de ambiente

- **Variáveis novas em `apps/api/.env` (e `.env.example`, sem valor real), validadas em `env.validation.ts`
  (falta ou valor inválido derruba o boot):**
  - `STEAM_API_KEY` — 32 hexadecimais. **Só o backend**; nunca no web, em log, spec, teste, commit ou PR.
  - `API_PUBLIC_URL` — o endereço em que o **navegador** alcança a API: produção = o domínio da Vercel (passa
    pelo rewrite); dev = `http://localhost:3333`. Sem barra final. Usada no `return_to` e no `realm`.
  - `WEB_PUBLIC_URL` — a origem do web, para o redirecionamento depois do retorno (produção = o domínio da
    Vercel; dev = `http://localhost:5173`). Sem barra final.
- **Render (ordem obrigatória, Q4):** as três variáveis precisam estar cadastradas **antes do deploy da etapa
  1**, a primeira que as exige no boot (senão a API não sobe, por desenho); o `.env.example` é atualizado no
  mesmo commit da validação. A `STEAM_API_KEY` se gera em `steamcommunity.com/dev/apikey`, pede um "domínio"
  (usar o da Vercel) e exige uma conta Steam sem restrições. Detalhe em "Etapas".
- **Testes:** o Jest usa valores **sintéticos** de formato válido para as três variáveis (32 hexadecimais
  óbvios, nunca a chave real).
- **Sem dependência nova.** Sem Docker.
- **`trust proxy` (Q1, chore separada):** o limite por IP do `auth` **já está quebrado em produção**: atrás da
  Vercel e do Render o `req.ip` é o do proxy, e todos os usuários dividem o mesmo contador de login e de
  registro. O número de saltos do `X-Forwarded-For` precisa ser **medido**, não chutado. As rotas novas usam
  limite **por usuário** e não dependem disso.
- Usar só contas Steam **de teste** na verificação; o SteamID e o nome de uma conta real não vão para
  fixture, teste, log nem documentação (`RULES.md` §8).

## Suposições

Assumidas ao escrever a spec e **aprovadas pelo humano em 2026-09-25**, junto com as respostas Q1 a Q6. A do
`state` com `JWT_ACCESS_SECRET` vale **condicionada a CA-61 e CA-62** (ver "Fluxo do vínculo"):

- O `state` é um JWT de `@nestjs/jwt` com `JWT_ACCESS_SECRET` e `typ: 'vinculo'` (sem segredo novo); o cookie
  `checkpoint_vinculo` amarra o retorno ao navegador que iniciou. Não amarra à `sid` da sessão.
- Uma conta Steam do checkpoint pode ser vinculada por mais de um usuário do checkpoint (não há unicidade
  global do SteamID): os dados são públicos e o OpenID prova a posse. **Agora é comportamento explícito**
  ("Modelo de dados" e CA-65).
- A biblioteca é buscada por `busca` no servidor (sem paginação, `limite` ≤ 50), porque uma biblioteca de
  milhares de jogos não cabe numa resposta.
- `jogosParecidos` compara por **igualdade** da chave normalizada, sem fuzzy (Levenshtein): "The Witcher 3" ≠
  "The Witcher 3: Wild Hunt". O caminho "outro jogo que já tenho" cobre o resto.
- A capa oficial é `library_600x900.jpg` com queda para `header.jpg`, ligada direto na CDN da Steam.
- O nome de exibição é gravado no vínculo e atualizado quando o perfil é lido.
- A ligação do jogo novo são **dois requests** (criar, depois ligar), como a capa; não há endpoint que faça os dois.
- A plataforma "PC" existe na lista de plataformas do formulário (a conferir na etapa 3).

## Questões em aberto

Nenhuma. Todas decididas pelo humano em 2026-09-25.

- [x] **Q1 — `trust proxy`: nesta spec ou numa chore à parte?** **Decidido: chore SEPARADA, fora desta spec,
      feita antes da etapa 2**, registrada em `INDEX.md > Pendências` com o alerta de que o limite por IP já está
      quebrado em produção e de que o número de saltos precisa ser medido. _Recomendação: chore à parte (`fix(api)`),
      **antes** da etapa 2._ É um problema que **já existe em produção**: sem `trust proxy`, o `req.ip` é o do
      proxy, então login (5/min), registro (3/h) e troca de senha usam **um contador para o site inteiro**.
      Configurar exige medir quantos saltos (Vercel → Render) o `X-Forwarded-For` tem, e chutar mal deixa o limite
      burlável (número alto demais) ou ainda quebrado. Esta spec não depende dele (limite por usuário; o retorno é
      protegido pelo `state`, cookie e Steam). Alternativa: incluir na etapa 1.
- [x] **Q2 — "Conquistas totais" do cartão do perfil.** **Decidido: as conquistas SOMADAS DOS JOGOS
      VINCULADOS, com o texto "em N jogos vinculados", só com dados já gravados e sem chamadas extras à Steam.** A decisão 7 pede as conquistas totais, mas a Steam só dá
      conquistas por jogo (uma chamada cada, centenas para uma biblioteca grande, o que fere a cota). _Recomendação:
      mostrar as conquistas dos **jogos vinculados** (dado já gravado, zero chamadas), rotulado "em N jogos vinculados"._
      Alternativa: tirar o número do cartão.
- [x] **Q3 — Jogo com `plataforma` "PlayStation" pode ligar a um item da Steam?** **Decidido: pode, com
      qualquer plataforma, com confirmação no web avisando que horas e conquistas são as da Steam; a plataforma do
      jogo não muda; jogo novo criado da biblioteca começa com "PC".** _Recomendação: pode, sem alterar a
      `plataforma`, com **confirmação** que avisa que horas e conquistas serão as da Steam_ (CA-37). Alternativas:
      bloquear qualquer plataforma diferente de PC/vazia, ou liberar sem aviso. Vale também para jogo novo: a
      plataforma pré-preenchida é "PC".
- [x] **Q4 — `STEAM_API_KEY` obrigatória no boot?** **Decidido: obrigatória, em `env.validation.ts`. Ordem
      obrigatória: cadastrar a variável no Render ANTES do deploy da etapa que a exige (a 1) e atualizar o
      `.env.example` no mesmo commit.** _Recomendação: obrigatória (como as chaves do Supabase), o que
      exige configurar o Render antes do deploy._ Alternativa: opcional, com as rotas devolvendo 502
      `PLATAFORMA_INDISPONIVEL` e o cartão dizendo "integração não configurada".
- [x] **Q5 — Intervalos: 1 h (automática) e 30 s (manual).** **Decidido: 1 h e 30 s, ambos como constantes
      nomeadas (`ATUALIZACAO_AUTOMATICA_MS`, `ATUALIZACAO_MANUAL_MIN_MS`), fáceis de mudar.** Os caches de 10 min (perfil) e
      5 min (conquistas do jogador) seguem como estão.
- [x] **Q6 — Aviso de privacidade na página do jogo quando só as conquistas são negadas (horas legíveis).**
      **Decidido: mostrar um aviso discreto no bloco Steam, mantendo as horas.**
