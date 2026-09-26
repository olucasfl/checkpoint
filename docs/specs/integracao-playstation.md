# Spec: integracao-playstation

> Status: 📝 rascunho (2026-09-26). Estende `integracao-plataformas` e `plataformas-e-pagina-do-jogo` (não as substitui): usa o
> mesmo `GameProvider`, o mesmo cadastro global (`PLATAFORMAS`), o mesmo `PlataformaMarca`, o mesmo `ModalDialog` e o Chek.
> Branch `feat/playstation` (a partir da `develop`), quatro fases, **um commit por fase**. Sem push e sem PR.

## Objetivo

Vincular a conta **PlayStation Network (PSN)** do usuário ao checkpoint com o **mesmo fluxo e a mesma experiência da Steam**: vincular a
conta, **Buscar na PlayStation** (criar jogo ou ligar a um que já existe), **horas jogadas**, **troféus no lugar das conquistas**, seção
própria na página do jogo, selo no tile, linha e popup na aba **Plataformas** do perfil e o marcador da plataforma.

Toca `apps/api` (`modules/integrations/`, um provider novo), `apps/web` (`features/integracoes/`, formulário, página do jogo, perfil),
`packages/shared` (contrato e cadastro) e `prisma/schema.prisma` (**só aditivo**). **Só vincula, nunca substitui:** título, status, notas,
descrição e capa enviada continuam do usuário; nenhum dado da PSN muda `status` nem notas.

## Stack

Padrão da casa, com **uma** divergência: a dependência **`psn-api`** (autorizada pelo humano, `RULES.md` §9; **nenhuma outra** entra sem OK).

- **`psn-api` fixada na versão exata `2.18.1`** (sem `^`; MIT; zero dependências próprias; Node ≥ 20; CJS + ESM + `.d.ts`, então compila no
  build CommonJS da API). Verificada em 2026-09-26 lendo o pacote publicado (`dist/index.mjs` e `index.d.ts`, baixado só para leitura),
  não só a documentação.
- **É uma API NÃO OFICIAL.** A Sony não publica API pública de PSN. O pacote usa os endpoints e o _client id_ do app móvel da Sony
  (`ca.account.sony.com`, `m.np.playstation.com`) e, em `getRecentlyPlayedGames`/`getPurchasedGames`, _persisted queries_ GraphQL com hash
  embutido, que a Sony pode trocar sem aviso. Vira **risco declarado** (ver "Riscos") e é registrado no `ARCHITECTURE.md`.
- **O que o pacote NÃO faz, e o `PsnClient` precisa fazer:** (1) **timeout** (usa `fetch` sem `AbortSignal`); (2) **conferir o status HTTP**
  (`exchange*` devolve campos `undefined` em vez de lançar, e os `get*` só lançam se o corpo tiver `error`); (3) **isolar mensagens de
  erro** (o pacote lança `Error(JSON.stringify(resposta))` em alguns caminhos); (4) **cache de _access token_** e **junção de _refresh_
  simultâneos**. Por isso **o restante do código nunca importa `psn-api`**: só o `PsnClient` (`psn/psn.client.ts`), no formato do
  `SteamClient` (métodos simples, tipos neutros, erros de domínio, mockado nos testes). Um teste de arquitetura falha se `psn-api`
  aparecer fora de `psn/psn.client.ts`.
- **Timeout por `Promise.race`** (8 s por chamada, como a Steam): o pacote não aceita cancelamento, então a `fetch` pendente termina sozinha
  em segundo plano; o resultado é descartado. Suposição S6.
- **Cifra em repouso: `node:crypto` (AES-256-GCM)**, sem biblioteca. Chave nova em variável de ambiente (ver "Notas de ambiente").
- **Cache em memória** e **limite por usuário**: os mesmos da Steam (`TtlCache`, `CarregadorEmCache`, `IntegrationsThrottlerGuard`).

## Decisões já tomadas (2026-09-26, não reabrir)

| #   | Decisão                                                                                                                                                                                                                                                                                                                                                                                  | Por quê                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Autenticação por NPSSO de cada usuário (opção A).** O NPSSO é usado **uma única vez** (troca por _access code_ → tokens) e **descartado**: nunca persistido, logado nem devolvido. Persiste-se **só o _refresh token_, cifrado** (AES-256-GCM). Refresh expirado (~60 dias) ou recusado → conta em estado **`reautenticar`**, e a UI pede um NPSSO novo, com o Chek no estado de erro. | A PSN não tem OAuth para terceiros. Uma conta "de serviço" do checkpoint só enxergaria as próprias informações; o NPSSO do próprio usuário dá acesso aos dados dele (inclusive privados). O NPSSO equivale a uma senha, então o app o trata como tal. |
| D2  | **`psn-api` 2.18.1 fixada, atrás de um `PsnClient`.** Registrada no `ARCHITECTURE.md` como API não oficial.                                                                                                                                                                                                                                                                              | Escrever o cliente OAuth e os endpoints da Sony à mão duplicaria o que o pacote já mantém; isolá-lo atrás de uma classe deixa trocar de biblioteca (ou de endpoint) mexendo num arquivo.                                                              |
| D3  | **Ligação de jogos igual à Steam:** 1 para 1 por (usuário, provedor, id externo) e por (jogo, provedor); mesma regra do "mover"; a busca **sugere** candidatos por nome normalizado (`chaveDeTitulo`), **quem confirma é sempre o usuário**, **nunca** casamento automático. **PS4 × PS5, remasters e edições são itens distintos** (cada `titleId` é um item) que o usuário escolhe.    | Reaproveita as regras, o `PUT` e os testes que já existem. O id externo do item é o **`titleId`** (`CUSA…_00` no PS4, `PPSA…_00` no PS5): a Sony o distingue por versão, então a distinção pedida vem de graça e nada agrupa versões sozinho.         |
| D4  | **Quatro fases, um commit por fase** (F1 a F4, abaixo).                                                                                                                                                                                                                                                                                                                                  | Cada fase é implantável sozinha; `disponivel: false` no cadastro mantém a PlayStation fora das telas até a F2.                                                                                                                                        |
| D5  | **Logo:** não se desenha nem se inventa. O cadastro usa o **marcador neutro** (`logo: null`) até o humano entregar o pacote oficial da Sony/PlayStation. A spec só lista as diretrizes a cumprir (pendência do humano, "Marca e logos").                                                                                                                                                 | Marca registrada de terceiros não pode ser redesenhada. `PlataformaMarca` já cai no marcador com o nome em texto quando `logo` é `null`.                                                                                                              |
| D6  | **Fixtures sintéticas** derivadas dos **tipos e do código do `psn-api`** (não há NPSSO de teste). Todo critério que dependa da resposta real da Sony fica **`[~]`**; o humano testa manualmente (login e clique) e passa os erros.                                                                                                                                                       | Sem conta real não há como capturar respostas. A spec não finge que o formato foi confirmado.                                                                                                                                                         |

## O que a Sony entrega (e o que não entrega)

Tudo abaixo é lido **da própria conta** do usuário (`accountId = "me"`, autenticada pelo NPSSO dele). Fontes: tipos e código do `psn-api`
2.18.1. **"Confirmado"** = está nos tipos/código do pacote; **nenhuma resposta real foi vista** (D6), então o corpo de cada uma é `[~]`.

| Dado                                                              | Função do `psn-api` (endpoint)                                                                           | Campos usados                                                                                                                                                                                                             | Observações                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Biblioteca e horas** (um item por `titleId` jogado)             | `getUserPlayedGames(auth, "me", { limit, offset })` (`gamelist/v2/users/me/titles`)                      | `titleId`, `name`, `category` (`ps4_game`, `ps5_native_game`, `pspc_game`, `unknown`), `playDuration` (ISO 8601, 1 s: `PT228H56M33S`), `lastPlayedDateTime`, `firstPlayedDateTime`, `playCount`, `imageUrl`, `concept.id` | `playDuration` → **minutos** (`floor(s/60)`, aceita `PnDTnHnMnS`). Paginado por `limit`/`offset` (`totalItemCount`, `nextOffset`): o **teto de `limit` não está documentado** `[~]`; o client pagina com teto de páginas. **Só PS4, PS5 e PS5 no PC**. |
| **Último jogo / atividade**                                       | mesma chamada (a lista vem por "jogado recentemente")                                                    | `lastPlayedDateTime` do primeiro item                                                                                                                                                                                     | Sem chamada extra. Não usamos `getRecentlyPlayedGames` (GraphQL com hash embutido, o ponto mais frágil do pacote).                                                                                                                                     |
| **Nível de troféu**                                               | `getUserTrophyProfileSummary(auth, "me")` (`trophy/v1/users/me/trophySummary`)                           | `accountId`, `trophyLevel` (texto → número), `progress` (% até o próximo), `tier` (1 a 10), `earnedTrophies` `{ bronze, silver, gold, platinum }`                                                                         | Vale para a conta toda, **inclusive PS3 e Vita**. É também de onde sai o `accountId` (o `idExterno` da conta).                                                                                                                                         |
| **Avatar e nome**                                                 | `getProfileFromAccountId(auth, "me")` (`userProfile/v1/internal/users/me/profiles`)                      | `onlineId`, `avatars[]` (`size`, `url`), `isPlus`                                                                                                                                                                         | `onlineId` → `nomeExibicao` (a coluna cabe 80). Sem `accountId` na resposta.                                                                                                                                                                           |
| **Troféus de UM jogo: mapa `titleId` → conjunto de troféus**      | `getUserTrophiesForSpecificTitle(auth, "me", { npTitleIds })` (`trophy/v1/users/me/titles/trophyTitles`) | `trophyTitles[]`: `npCommunicationId`, `npServiceName` (`trophy`/`trophy2`), `definedTrophies`, `earnedTrophies`, `progress`, `hiddenFlag`                                                                                | **Até 5 `titleId` por chamada.** É a chamada que **liga** o jogo: 1 chamada dá o total e os desbloqueados **por tipo**. Lista vazia ou 404 = "sem troféus ou nunca sincronizou" (não se distingue `[~]`).                                              |
| **Troféus de UM jogo: definições (nome, descrição, ícone, tipo)** | `getTitleTrophies(auth, npCommunicationId, "all", { npServiceName, limit, offset })`                     | `trophyId`, `trophyName`, `trophyDetail`, `trophyIconUrl`, `trophyType` (`bronze`/`silver`/`gold`/`platinum`), `trophyHidden`, `trophyGroupId`                                                                            | `"all"` inclui DLC. Idioma por `headerOverrides: { "Accept-Language": "pt-BR" }` (cai no inglês se não houver tradução `[~]`). Dado do **jogo**, não do usuário: cache longo, dividido entre usuários.                                                 |
| **Troféus de UM jogo: o que o usuário ganhou**                    | `getUserTrophiesEarnedForTitle(auth, "me", npCommunicationId, "all", { npServiceName })`                 | `trophyId`, `earned`, `earnedDateTime`, `trophyEarnedRate` (texto, % global), `trophyRare` (0 a 3: ultrarraro, muito raro, raro, comum)                                                                                   | Só o estado do troféu, sem nome. **A raridade sai daqui** (não precisa de chamada global à parte, ao contrário da Steam).                                                                                                                              |
| **Troféus ocultos**                                               | `trophyHidden` das duas chamadas acima                                                                   | —                                                                                                                                                                                                                         | **Sem confirmação** de como a Sony trata nome e descrição de um troféu oculto ainda bloqueado `[~]`. **A API remove `nome`/`descricao` de todo troféu oculto e bloqueado**, qualquer que seja a resposta; a UI mostra "Troféu oculto" (como a Steam).  |
| **Platina, ouro, prata, bronze; desbloqueados e faltam**          | `earnedTrophies` × `definedTrophies` (título) e `trophyType` × `earned` (lista)                          | —                                                                                                                                                                                                                         | `platinum` é `0 \| 1` por conjunto.                                                                                                                                                                                                                    |

### Privacidade: o que muda em relação à Steam

Na Steam, o app lê a conta de **outra pessoa** com uma chave dele, então tudo depende de o perfil estar público. Na PSN, o app **age
como o próprio usuário** (NPSSO dele, `accountId = "me"`), então a configuração de privacidade da conta **não deveria** bloquear a leitura
dos dados dele `[~]` (sem resposta real, é uma hipótese, não um fato). Consequências:

- **Não existe o aviso "Seu perfil está privado. Deixe-o público"** para a PSN. `PerfilPrivadoError` continua na interface, mas o
  `PsnProvider` **não o lança** na hipótese acima. Se a Sony provar o contrário (o humano vai relatar), a spec é revista (`/spec-sync`).
- Em troca, a PSN tem **avisos próprios** (texto do cadastro, não `if` por provedor): "Os troféus só aparecem depois que o console
  sincroniza com a PSN" (jogo sem troféus lidos) e "Jogos de PS3 e PS Vita não têm horas" (limitação).
- O **passo a passo do NPSSO** (abaixo) e o aviso de que ele **equivale a uma senha** entram no fluxo de vínculo, em linguagem simples.

### Limitações explícitas (a PSN **não** entrega; nada disso é inventado)

1. **Sem "membro desde"** e **sem status online/jogando agora**: não há campo na resposta usada (o status exigiria `getBasicPresence`, uma chamada
   extra, fora de escopo). `membroDesde`, `status` e `jogandoAgora` ficam `null` e os blocos **não aparecem**.
2. **Sem link público do perfil**: `getProfileShareableLink` custaria uma chamada por abertura e não há URL de perfil estável confirmada. `perfilUrl = null`
   (sem "Abrir perfil").
3. **Sem backlog** (jogos comprados e nunca abertos): a biblioteca de horas só lista o que **foi jogado**; a lista de comprados é
   `getPurchasedGames`, GraphQL com hash embutido (frágil), **fora de escopo**. O bloco "nunca abertos" e o filtro **não** aparecem; a
   capacidade `backlog` fica só na Steam.
4. **Sem horas em PS3, PS Vita e PS1/PS2/PSP**: a lista de jogados cobre `ps4_game`, `ps5_native_game` e `pspc_game`. Esses jogos têm troféus
   no resumo do nível, mas **não são itens da biblioteca** (não dá para ligá-los).
5. **Sem "quando" preciso de cada troféu além de `earnedDateTime`** e **sem progresso parcial** de troféu (`trophyProgressTargetValue`
   existe só no PS5 e só em alguns; **não usado**).
6. **Sem capa em retrato**: `imageUrl` é o **ícone quadrado** do jogo. Serve de capa oficial de _fallback_ (a capa enviada continua tendo
   prioridade); a capa gerada (cor + iniciais) segue de último recurso. O `PlataformaMarca` e o tile já tratam capa ausente.
7. **Sem dado de terceiros**: só a conta do próprio usuário (nenhum amigo, nenhuma pesquisa de outro jogador).
8. **Jogo PS4 jogado no PS5** aparece com o `titleId` do PS4; a versão nativa do PS5 é **outro item** (D3). Um jogo com troféus separados
   por versão terá **dois conjuntos**: cada item liga o seu.

## Marca e logos (PlayStation) — pendência do humano

Nenhum arquivo é criado nesta spec. Enquanto o pacote oficial não chega, `PLATAFORMAS.PLAYSTATION.logo = null` e o marcador neutro
(`videogame_asset`, glifo do Material Symbols, sem marca) aparece nos selos e nas linhas; a linha do perfil e o popup mostram o **nome
em texto** ao lado (comportamento já existente do `PlataformaMarca` sem arquivo). **O humano precisa fornecer/decidir**, e a spec
correspondente (curta, no padrão do `docs/design/plataformas/steam/LEIAME.md`) registra:

- [ ] o **pacote oficial** de marca da Sony Interactive Entertainment / PlayStation (arquivo vetorial, sem alteração de forma);
- [ ] as **regras de uso da logo** (tamanho mínimo, espaço livre, cores permitidas, uso sozinha ou com texto) e de **não sugerir
      afiliação ou patrocínio**;
- [ ] a **atribuição legal** exata (marca registrada de terceiros) para o rodapé do popup, e a linha **"Não afiliado à Sony"** (a mesma
      posição do "Não afiliado à Valve");
- [ ] se o uso do **nome "PlayStation" e dos símbolos dos botões** nas telas exige texto específico.

Até lá, o popup mostra um rodapé provisório **só com "Não afiliado à Sony Interactive Entertainment"** (sem inventar atribuição legal).
Os critérios de logo (CA de marca) ficam `[~]`.

## Fluxo do vínculo por NPSSO

Diferente da Steam (redirecionamento + `state` + cookie), a PSN **não redireciona**: o usuário cola o NPSSO **dentro do app**. Nada disso
usa o `state` nem o cookie `checkpoint_vinculo` (a rota `retorno` da PSN responde 400 `VALIDACAO`, pois não é um provedor por
redirecionamento).

**Como o usuário obtém o NPSSO (texto da tela, linguagem simples):**

> **O que é o NPSSO?** É um código que a PlayStation dá ao navegador quando você entra na sua conta. Com ele, o checkpoint consegue ler
> **seus** jogos, horas e troféus. **Trate-o como uma senha:** quem o tem acessa sua conta PSN. O checkpoint o usa **uma única vez**,
> não o guarda e nunca o mostra de novo; o que fica guardado é uma chave de renovação **cifrada**.
>
> **Como pegar:** 1) entre na sua conta em `playstation.com` neste navegador; 2) numa **outra aba**, abra `ca.account.sony.com/api/v1/ssocookie`; 3) copie o valor que aparece depois de `"npsso":` (são 64 letras e números, sem as aspas); 4) volte aqui e cole no campo.
> Você pode trocar sua senha da PSN depois para invalidar o código.

Regras da tela e da API, para o cookie **nunca** aparecer em URL ou _query string_:

- O endereço `ca.account.sony.com/api/v1/ssocookie` é **texto para o usuário abrir sozinho** (link comum, sem nada nosso na URL). O app **não**
  monta nenhuma URL com o NPSSO, **não** o lê de `location`/`search`/`hash` e **não** o aceita em `GET`. O **único** caminho é o **corpo
  de um `POST` sobre HTTPS**.
- O campo é `type="password"`, `autocomplete="off"`, `spellcheck={false}`; o valor vive **só no estado do componente**: some ao enviar,
  ao fechar o diálogo e em erro. Nunca em `localStorage`, nunca no cache do TanStack Query (a mutação **não guarda `variables`**: `reset()`
  logo depois), nunca em log do web.
- A resposta é `ContaVinculada` (sem NPSSO nem tokens). Cabeçalho `Cache-Control: no-store`.
- No servidor: o DTO lê o valor **cru** (`RawValue`), e a **mensagem de validação não ecoa o valor**; nenhum log, exceção nem
  `ApiErrorResponse` contém o NPSSO, o _access code_, o _access token_ ou o _refresh token_ (CA de segredo).

**Sequência (`PsnProvider.vincularComCredencial`):**

1. `exchangeNpssoForAccessCode(npsso)` → código; `exchangeAccessCodeForAuthTokens(code)` → `accessToken`, `refreshToken`, `refreshTokenExpiresIn`.
   Resposta sem `access_token` ou sem `Location: …?code=` = **NPSSO inválido ou expirado** (`PLATAFORMA_CREDENCIAL_INVALIDA`, 400).
2. `getUserTrophyProfileSummary("me")` → `accountId` (o `idExterno`) e o nível; `getProfileFromAccountId("me")` → `onlineId`. Falhar ao ler o nome
   **não desfaz** o vínculo (o nome vira "Conta PlayStation"), como na Steam.
3. O `IntegrationsService` grava a conta e a credencial **numa transação** (ver "Modelo de dados"): o _refresh token_ é **cifrado**
   (AES-256-GCM, IV aleatório de 12 bytes por gravação, _tag_ de 16 bytes, **AAD = id da conta**, formato `v1:<iv>:<tag>:<texto>` em
   base64url) e guardado com a data de expiração (`agora + refreshTokenExpiresIn`). O NPSSO já foi descartado (nunca saiu da função).
4. **Já vinculada:** mesmo `accountId` → **renova a credencial** (é assim que se sai do estado `reautenticar`), limpa `reautenticarDesde`
   e responde 200; **outro** `accountId` → 409 `PLATAFORMA_JA_VINCULADA` (desvincule antes). A mesma conta PSN pode ser vinculada por
   mais de um usuário do checkpoint (cada um com o próprio NPSSO): cada vínculo é isolado, como na Steam.

**Uso da credencial nas leituras (`PsnSessao`, em `psn/`):**

- Cada leitura precisa de um _access token_ (vida curta, ~1 h `[~]`). O `PsnSessao` guarda o token **só em memória**, por
  `provedor:idExterno`, até `expiresIn − 60 s`, e **junta _refresh_ simultâneos** (`CarregadorEmCache`): duas abas não gastam dois _refresh_.
- Sem token válido: lê a credencial, **decifra**, `exchangeRefreshTokenForAuthTokens`. **Se a Sony devolver um _refresh token_ novo, ele é
  cifrado e regravado** (não se sabe se a Sony rotaciona `[~]`; regravar é seguro nos dois casos).
- **Refresh expirado (`expiraEm` no passado) ou recusado pela Sony** (resposta sem `access_token`, `invalid_grant`, 400/401) → o provider lança
  `PlataformaReautenticarError`; o service grava `ContaVinculada.reautenticarDesde = agora` (se ainda nulo) e responde **409
  `PLATAFORMA_REAUTENTICAR`**. Falha de rede/5xx/timeout **não** marca reautenticar: é `PLATAFORMA_INDISPONIVEL` (502).
- **Estado `reautenticar` gravado:** as rotas que precisam da Sony respondem 409 `PLATAFORMA_REAUTENTICAR` **sem chamar a Sony**; o dado gravado
  (`JogoPlataforma`) continua visível no catálogo e na página do jogo (o `GET .../jogos/:id` devolve o gravado com `aviso: 'REAUTENTICAR'`, nunca 409).
  A UI mostra o **Chek confuso** + "Sua conexão com a PlayStation expirou" + o mesmo formulário do NPSSO.
- Chave de cifra errada/trocada (a _tag_ não confere ao decifrar) é tratada **como reautenticar** (o usuário cola um NPSSO novo e a credencial é
  regravada com a chave atual), e vira `error` no log **sem** dado do usuário. Não há rotação de chave automática (Fora de escopo).

## Backend: o que é da Steam e o que vira genérico

Levantamento feito no código de `main`/`develop` (2026-09-26). **Só muda o que a PlayStation exige.**

| Item específico da Steam hoje                                                                                                                                   | Estado                                                                                  | O que fazer                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Textos `PLATAFORMA_*` (API e `auth-errors.ts` do web)                                                                                                           | **já genéricos** ("plataforma"), exceto `PLATAFORMA_PERFIL_PRIVADO` ("Deixe-o público") | Nada. O código novo `PLATAFORMA_REAUTENTICAR` e `PLATAFORMA_CREDENCIAL_INVALIDA` entram com texto neutro. `PERFIL_PRIVADO` só é lançado pela Steam.                                                                                                                        |
| `IdExternoInvalidoError.campo: 'steamId' \| 'appId'`                                                                                                            | específico                                                                              | Vira **`'idConta' \| 'idItem'`** (rótulo neutro). O mapeamento HTTP já ignora o campo (400 `VALIDACAO`); só o `SteamClient` e seus testes mudam.                                                                                                                           |
| `PlataformaItemNaoEncontradoError` ("o appid")                                                                                                                  | comentário específico                                                                   | Só o comentário.                                                                                                                                                                                                                                                           |
| `urlDaSteamSegura` (web, `lib/steam-url.ts`)                                                                                                                    | específico, **só do vínculo por redirecionamento**                                      | Vira `urlDeVinculoSegura(provedor, url)`, lendo do cadastro `vinculo.hostDeLogin`/`caminhoDeLogin`. Plataforma por credencial não a usa.                                                                                                                                   |
| `PASSOS_DE_PRIVACIDADE`, `ATRIBUICAO_DA_VALVE`, `NAO_AFILIADO` (`ResumoSteam.tsx`)                                                                              | específicos                                                                             | Vão para o **cadastro** (`privacidade: { passos } \| null` e `rodapeLegal`), lidos pelo popup genérico. PSN: `privacidade: null`, `rodapeLegal` só com "Não afiliado à Sony…".                                                                                             |
| Chave do cache da biblioteca (`IntegrationsService.bibliotecas`)                                                                                                | **já é `${provedor}:${idExterno}`** (`obterBiblioteca`)                                 | Nada. Os caches **internos** do `SteamProvider` (`idExterno:idJogo`) são por instância de provider (sem colisão); o `PsnProvider` tem os dele.                                                                                                                             |
| Retorno `?steam=vinculada\|erro&motivo=` (`urlDoRedirecionamento`, `avisos-steam.ts`, `PerfilPage`)                                                             | específico do fluxo por redirecionamento                                                | **Fica como está.** A PSN não usa. Só o texto comentado. Não refatorar.                                                                                                                                                                                                    |
| `PROVEDOR_STEAM` (`lib/provedores.ts`), `useTemContaSteam`, `BibliotecaSteamDialog`, `BlocoSteam`, `ResumoSteam`                                                | telas presas à Steam                                                                    | Viram genéricas por **prop `provedor`** (`BibliotecaPlataformaDialog`, `BlocoPlataforma`, `ResumoPlataforma`); `provedores.ts` **acaba** e sai da exceção do `sem-provedor-solto.test.ts`. É o "refactor necessário": com dois provedores a tela **não pode** escolher um. |
| `GameForm` ("Buscar na Steam", confirmação de plataforma, "Ligado à Steam", capa oficial da Steam)                                                              | uma plataforma só                                                                       | Um botão "Buscar na <nome>" **por plataforma vinculada com capacidade `biblioteca`**; ligações pendentes por provedor; textos do cadastro.                                                                                                                                 |
| `DestaqueContinue`/`estante.ts` ("na Steam", `dadosPlataforma[0]`), `conquistas.ts` ("conquista(s)", "Tempo jogado na Steam"), `GameTile` (`data-steam-resumo`) | específicos                                                                             | Textos do cadastro (`nome`, `vocabulario`); `dadosPlataforma[0]` continua (o primeiro vínculo, ordem do cadastro).                                                                                                                                                         |
| `PlataformaDialog` e `SecoesDasPlataformas`: `Record<Provedor, ComponentType>`                                                                                  | já preparados para plataforma nova                                                      | Viram um componente só (genérico); o `Record` some.                                                                                                                                                                                                                        |
| `GameProvider` (interface)                                                                                                                                      | vínculo só por redirecionamento; leituras recebem só `idExterno`                        | **Acrescenta** `modoDeVinculo`, `vincularComCredencial?` e um **contexto opcional** nas leituras (`{ contaId }`). A Steam **não muda de código** (o TypeScript aceita implementação com menos parâmetros).                                                                 |
| `ItemBiblioteca`, `DetalheJogoPlataforma`/`Conquista`, `ResumoContaPlataforma`, `ContaVinculada`                                                                | sem tipo de troféu, sem nível, sem estado da conta                                      | Só campos **opcionais/nuláveis novos** (ver "Contrato compartilhado"); a Steam responde `null`/ausente.                                                                                                                                                                    |
| Rota `POST :provedor/vinculo` (sempre devolve `{ url }` e grava cookie)                                                                                         | específica do redirecionamento                                                          | Para provedor `credencial`, `POST .../vinculo` responde **400 `VALIDACAO`** (usa a rota nova abaixo). Nada muda para a Steam.                                                                                                                                              |

## Comportamento esperado

- **Vincular (F2):** no perfil, a linha da PlayStation mostra "Vincular". O botão abre um `ModalDialog` com o texto do NPSSO (acima), o campo e
  **Vincular**. Sucesso → o diálogo fecha, a linha vira "vinculada", com aviso `role="status"` ("Conta PlayStation vinculada."). Erro → texto
  pelo `code` no próprio diálogo (NPSSO inválido; conta já vinculada; PSN fora do ar), com o Chek no estado de erro. **O NPSSO não é reenviado
  sozinho.**
- **Reautenticar (F2):** a linha da conta com `estado: 'reautenticar'` mostra o **selo "Reconectar"** e abre o mesmo diálogo com o texto
  "Sua conexão com a PlayStation expirou" e o Chek confuso. A conta e os jogos ligados **continuam** (só a leitura nova pausa).
- **Buscar na PlayStation (F2):** no formulário de novo jogo e na página do jogo, para quem tem a conta vinculada: o diálogo da biblioteca
  (o mesmo componente, por `provedor`) lista os **jogos já jogados** (por horas), com a busca por nome, "já no seu catálogo" (nome normalizado
  igual), **Vincular a este**, **Vincular a outro jogo que já tenho** e **Criar jogo**. Sugestões de status: 0 min → Quero jogar; > 0 →
  Jogando; nunca Zerado. **Criar jogo** pré-preenche título, **plataforma sugerida** (`PS5` para `ps5_native_game`, `PS4` para `ps4_game`, `PC`
  para `pspc_game`, vazio se `unknown`; **o usuário edita**) e a capa oficial só como prévia. A confirmação de plataforma ("este jogo está
  cadastrado como Xbox…") vale quando a plataforma do jogo **não** é vazia nem uma das compatíveis do cadastro (PSN: `PS3`, `PS4`, `PS5`, `PSP`, `PS1`,
  `PS2`; Steam: `PC`, `Steam Deck`).
- **1 para 1 e "mover":** idênticos à Steam (mesma ordem de checagens; **o 409 do item já ligado não chama a Sony**).
- **Horas e troféus (F3):** a página do jogo ganha a **seção da PlayStation** (a mesma `SecaoRecolhivel` da Steam): horas, último jogo, **barra
  de troféus**, contagem por tipo (platina, ouro, prata, bronze: desbloqueados e faltam), **Atualizar**, **Desvincular**, e a lista completa
  de troféus **"Desbloqueadas (N)" / "Faltam (N)"** (fechadas por padrão, "Toque para ver"), com ícone, nome, descrição, data, **tipo em texto**
  ("Ouro") e **raridade em texto** ("Raro · 4,8% dos jogadores"), nunca só cor. O troféu oculto e bloqueado mostra "Troféu oculto".
  Vocabulário "troféu/troféus" vem do cadastro. **Sem "Abrir na PlayStation"** (não há link, limitação 2).
- **Selo no tile (F3):** o marcador neutro da PlayStation, no mesmo canto e com a mesma regra de "+N" da Steam (`aria-label` "Ligado à PlayStation");
  a linha "42 h · 12/40" usa o vocabulário do cadastro no `aria-label` ("troféus").
- **Perfil (F4):** a linha da PlayStation (marcador, foto, nome, "atualizado há X" ou "Reconectar") e o **popup** com os blocos por capacidade (abaixo).
- **PSN fora do ar** (timeout, 5xx, 429, resposta ilegível, IP bloqueado): **502** `PLATAFORMA_INDISPONIVEL`/`PLATAFORMA_LIMITE` **só nas
  rotas da PlayStation**; o catálogo, a Steam e o resto do app **não são afetados** (nenhuma rota fora de `integrations` chama a PSN, e o
  provider da PlayStation falha isolado; ver R1). O detalhe de jogo devolve o gravado com `aviso: 'INDISPONIVEL'` (200).
- **Acessibilidade e movimento:** as regras da Steam (alvos ≥ 44 px, `prefers-reduced-motion`, uma coluna no celular, `role="progressbar"`,
  imagens `loading="lazy"` com `width`/`height`, `referrerPolicy="no-referrer"`, ponto de quebra 768 px) valem sem exceção; **nenhuma animação
  nova**. Tokens do `@theme`, **sem hex fora dele**.

### Popup da PlayStation (F4): blocos, de onde vêm e custo

Mesmo `PlataformaDialog` e mesmo popup genérico; os blocos aparecem **por capacidade/dado presente**, não por `if` de provedor.

| Bloco                                                                     | Fonte                                                  | Capacidade / dado                 | Observação                                                                                                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cabeçalho: avatar, nome (`onlineId`), marcador + "PlayStation"            | `getProfileFromAccountId`                              | sempre                            | Sem "Abrir perfil" (`perfilUrl` nulo). Avatar só de `https` em host `*.playstation.com`/`*.playstation.net` `[~]`.                                               |
| **Nível de troféu** (número, % até o próximo, faixa)                      | `getUserTrophyProfileSummary`                          | `nivel` (`resumo.nivel` ≠ `null`) | Novo no contrato; a Steam responde `null` (não muda).                                                                                                            |
| **Contagem por tipo** (platina, ouro, prata, bronze) + total              | `getUserTrophyProfileSummary` (`earnedTrophies`)       | `resumo.trofeus` ≠ `null`         | Novo; da conta toda (PS3/Vita incluídos).                                                                                                                        |
| Números: jogos, horas totais, jogados                                     | biblioteca (`getUserPlayedGames`)                      | `biblioteca`                      | "Nunca abertos" **não** aparece (limitação 3).                                                                                                                   |
| Mais jogados (5)                                                          | biblioteca                                             | `horas`                           | Igual à Steam.                                                                                                                                                   |
| **Ligação com o checkpoint**: "X dos seus Y jogos já estão no checkpoint" | interseção da biblioteca com `JogoPlataforma` do banco | sempre                            | 0 chamada à Sony.                                                                                                                                                |
| **Troféus dos jogos ligados** (total em N jogos)                          | soma gravada no banco                                  | `conquistas`                      | 0 chamada à Sony; o texto usa "troféus".                                                                                                                         |
| **Atualizar**, **Desvincular**                                            | rotas existentes                                       | sempre                            | Atualizar: mín. 30 s. Desvincular: confirmação (apaga a conta, a **credencial cifrada** e as ligações).                                                          |
| Rodapé                                                                    | cadastro (`rodapeLegal`)                               | sempre                            | Provisório: "Não afiliado à Sony Interactive Entertainment" (ver "Marca e logos").                                                                               |
| Estados                                                                   | —                                                      | —                                 | Carregando: esqueleto. Erro 502: `Falha` + Tentar de novo. **`reautenticar`: Chek confuso + formulário do NPSSO**, com o cabeçalho e o **Desvincular** mantidos. |

**Não entram** (limitações 1 a 3 e escopo): "membro desde", status online, "abrir perfil", atividade recente, backlog, lista de amigos, jogos
comprados.

**Custo em chamadas à Sony** (cache generalizado **`provedor:idExterno`**, o que a Steam já usa; TTL de 10 min):

| Situação                                       | Chamadas                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Popup ou linha **a frio**, _access token_ frio | **5**: _refresh_ do token (1) + `getUserPlayedGames` (1 página; **+1 por página extra**) + `getUserTrophyProfileSummary` (1) + `getProfileFromAccountId` (1). Com o token já em memória: **3** (+ páginas).                                                                                                                                                                                                                                                   |
| Popup ou linha **a quente** (≤ 10 min)         | **0** (a biblioteca, o perfil e o nível saem do MESMO cache; "X de Y" e troféus vêm do banco). A linha do perfil e o popup dividem a resposta, como na Steam.                                                                                                                                                                                                                                                                                                 |
| **Atualizar** (≥ 30 s)                         | ignora o cache e refaz as 3 (mais o _refresh_ se o token venceu); antes de 30 s devolve o que tem, sem chamar a Sony.                                                                                                                                                                                                                                                                                                                                         |
| **Ligar** um jogo (`PUT`)                      | **1 a 2**: `getUserTrophiesForSpecificTitle` (troféus e contagens por tipo) + o _refresh_ do token se frio. As horas **vêm da biblioteca já em cache** (não há `appids_filter`: **filtra a lista em memória**).                                                                                                                                                                                                                                               |
| **Abrir o detalhe** de um jogo ligado          | **frio: 3** = mapa `titleId → npCommunicationId` (`getUserTrophiesForSpecificTitle`, cache 24 h) + definições (`getTitleTrophies`, cache 24 h, dividido entre usuários) + o que o usuário ganhou (`getUserTrophiesEarnedForTitle`, cache 5 min). **Quente: 1** (só os ganhos, 5 min) **ou 0**. **+1 por página** em conjuntos grandes (o `limit` máximo não está documentado `[~]`). Horas: só se o gravado tem > 1 h (relê a biblioteca do cache de 10 min). |

## Riscos para a produção

| #   | Risco                                                                                                                                                                        | Mitigação                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **API não oficial**: pode quebrar (hash de _persisted query_, mudança de endpoint) **ou violar os termos da Sony** (uso de _client id_ do app móvel e de NPSSO de usuários). | **Isolamento de falha:** (a) só o `PsnClient` importa o pacote; (b) todo erro do pacote vira `PlataformaError` (502 **apenas** nas rotas da PSN); (c) **nenhuma rota fora de `integrations/` chama a PSN**, e o `GET` de detalhe nunca dá 502; (d) o `SteamProvider` e o resto do módulo **não dependem** do `PsnProvider` (registrados lado a lado em `GAME_PROVIDERS`; um teste HTTP prova a Steam respondendo 200 com a PSN falhando); (e) o pacote é carregado **sob demanda** dentro do `PsnClient` (`import()` dinâmico na primeira chamada): um erro ao carregá-lo **não derruba o boot**; (f) só usamos as funções REST (troféus, perfil, jogados), **não** as GraphQL com hash embutido. **Termos:** a decisão D1 foi do humano; a spec registra que **a conformidade com os termos da Sony não foi verificada** e **não** oferece "pular" o NPSSO. Se a Sony notificar ou bloquear, o desligamento é remover o provider de `GAME_PROVIDERS` e `disponivel: false` (2 linhas, sem migration). |
| R2  | **IPs de datacenter (Render) podem ser bloqueados** pela Sony (autenticação e/ou API).                                                                                       | O primeiro sinal é o **vínculo falhar em produção com dev funcionando**: o humano testa **em produção** (Render) antes de declarar a F2 pronta. O erro vira `PLATAFORMA_INDISPONIVEL` (nunca 500) e o log tem só o **nome da chamada e o status**, para o humano distinguir 403/429/timeout. Sem contorno técnico (proxy residencial, rotação de IP, disfarce de _User-Agent_): seria driblar um bloqueio e **fora de escopo** (decisão de arquitetura própria). Plano se bloquear: a PSN fica indisponível, e o app segue como está.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| R3  | **Limites de taxa e custo dos troféus por jogo.**                                                                                                                            | (a) **Nada em lote:** não há sincronização automática nem "ler os troféus da biblioteca inteira"; troféus só ao **ligar** e ao **abrir o detalhe**; (b) a lista da biblioteca é uma chamada paginada (~1 por 200 jogos `[~]`); (c) caches: biblioteca/perfil/nível 10 min por `provedor:idExterno`, ganhos 5 min, definições e mapa `titleId → npCommunicationId` 24 h; chamadas simultâneas iguais viram uma; (d) limite por usuário existente (30/min; 5/min no vínculo); (e) **429 da Sony → `PLATAFORMA_LIMITE`** (502 com texto de espera), sem _retry_; (f) teto de páginas por leitura (10), para um laço nunca virar tempestade.                                                                                                                                                                                                                                                                                                                                                               |
| R4  | **Vazamento do NPSSO ou do _refresh token_.**                                                                                                                                | Nunca em URL, _query_, log, resposta, erro, teste, _fixture_, commit ou chat. NPSSO só no **corpo do `POST`** e **descartado** ao fim da função; o refresh é **cifrado** (AES-256-GCM, IV por gravação, AAD = conta); a chave só em variável de ambiente; `select` do Prisma com **lista branca** (a tabela da credencial tem model próprio, nunca vem em `include`); os erros do pacote **nunca** têm a mensagem repassada (o pacote embute a resposta da Sony nela); **testes travam:** logs de uma execução completa sem NPSSO/tokens/chave; nenhuma resposta HTTP os contém; `fixtures.spec` recusa valor com formato de token; o `git grep` do NPSSO fictício no bundle do web dá zero. Um NPSSO de fixture é **claramente sintético** (`NPSSO_SINTETICO_…`).                                                                                                                                                                                                                                     |
| R5  | **Expiração e reautenticação.**                                                                                                                                              | Estado `reautenticar` (coluna `reautenticarDesde`), 409 `PLATAFORMA_REAUTENTICAR` **sem gastar chamada**, dado gravado preservado, UI com Chek e o formulário do NPSSO; renovar com o mesmo `accountId` limpa o estado; outro `accountId` recusa (409). Expiração conhecida (`expiraEm`) é checada **antes** de chamar a Sony. Sem aviso antecipado por e-mail (fora de escopo).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| R6  | **Migration aditiva no banco compartilhado.**                                                                                                                                | O `DATABASE_URL`/`DIRECT_URL` de `apps/api/.env` aponta para o **Supabase (pooler, sa-east-1)**: é um banco **remoto e compartilhado, possivelmente o mesmo de produção**. Antes de migrar: (1) confirmar o **host e o projeto** (mascarando a senha) e (2) `npx prisma migrate status`; **se houver migration pendente que não seja a nova, ou _drift_, PARAR e perguntar**. A mudança é **só aditiva** (`ALTER TYPE ADD VALUE`, tabela nova, coluna nula), então o código antigo continua funcionando (nenhuma linha usa o valor novo até a F2). Ordem de deploy: **migration → variável no Render → código**.                                                                                                                                                                                                                                                                                                                                                                                       |

## Requisitos de saída

### Contrato compartilhado (`packages/shared/src`)

Tudo **aditivo** (a Steam responde `null`/ausente). Depois de editar: `npm run build -w @checkpoint/shared` e apagar `apps/web/node_modules/.vite`.

**`plataformas.ts`** — `PlataformaInfo` ganha campos (a Steam ganha valores; a PlayStation entra no cadastro):

```ts
export type CapacidadePlataforma =
  'horas' | 'conquistas' | 'biblioteca' | 'ultimaVezJogado' | 'nivel' | 'backlog'; // 'backlog' só na Steam

export type VinculoDaPlataforma =
  | { tipo: 'redirecionamento'; hostDeLogin: string; caminhoDeLogin: string } // Steam
  | { tipo: 'credencial'; rotuloDaCredencial: string }; // PlayStation: 'NPSSO'

export interface PlataformaInfo {
  /* …campos atuais… */
  vinculo: VinculoDaPlataforma;
  /** "conquista/conquistas" na Steam, "troféu/troféus" na PlayStation. */
  vocabulario: { conquista: string; conquistas: string };
  /** Textos de plataforma do jogo que combinam com esta (para a confirmação ao ligar). */
  plataformasCompativeis: readonly string[];
  /** Plataforma sugerida a um jogo novo quando o item não traz `plataformaSugerida` (Steam: 'PC'; PlayStation: null). */
  plataformaPadrao: string | null;
  privacidade: { passos: readonly string[] } | null; // PlayStation: null
  rodapeLegal: { atribuicao: string | null; naoAfiliado: string };
}

PLAYSTATION: {
  id: 'PLAYSTATION', slug: 'playstation', nome: 'PlayStation', nomeAcessivel: 'PlayStation',
  disponivel: false /* true na F2 */, capacidades: ['horas', 'conquistas', 'biblioteca', 'ultimaVezJogado', 'nivel'],
  marcador: { icone: 'videogame_asset' }, logo: null, ligadoA: 'à PlayStation', rotuloDaConta: 'Conta PlayStation',
  vinculo: { tipo: 'credencial', rotuloDaCredencial: 'NPSSO' },
  vocabulario: { conquista: 'troféu', conquistas: 'troféus' },
  plataformasCompativeis: ['PS1', 'PS2', 'PS3', 'PS4', 'PS5', 'PSP'], plataformaPadrao: null, privacidade: null,
  rodapeLegal: { atribuicao: null, naoAfiliado: 'Não afiliado à Sony Interactive Entertainment' },
}
```

**`integracoes.ts`:**

- `ContaVinculada` ganha `estado: 'ativa' | 'reautenticar'` (o servidor deriva de `reautenticarDesde`; Steam sempre `ativa`).
- `ItemBiblioteca` ganha `plataformaSugerida?: string | null`.
- `Conquista` ganha `tipo?: 'platina' | 'ouro' | 'prata' | 'bronze' | null` e `raridadeNivel?: 'ultrarraro' | 'muito-raro' | 'raro' | 'comum' | null`.
- `DetalheJogoPlataforma` ganha `porTipo?: { platina: ContagemTrofeus; ouro: ContagemTrofeus; prata: ContagemTrofeus; bronze: ContagemTrofeus } | null` (`ContagemTrofeus = { total: number; desbloqueados: number }`), **calculado na resposta, não gravado**.
- `AvisoPlataforma` ganha `'REAUTENTICAR'`.
- `ResumoContaPlataforma` ganha `nivel: { valor: number; progressoPercentual: number | null; faixa: number | null } | null` e `trofeus: { platina: number; ouro: number; prata: number; bronze: number } | null`.
- `VincularComCredencialRequest { credencial: string }` (corpo do `POST .../vinculo/credencial`).
- Códigos em `API_ERROR_CODES` (o `Record<ApiErrorCode, string>` do web quebra o typecheck se faltar texto): `PLATAFORMA_REAUTENTICAR` (409) e `PLATAFORMA_CREDENCIAL_INVALIDA` (400).

### API (`apps/api/src/modules/integrations/`)

| Método e caminho                                                                                 | Corpo                          | Sucesso                               | Erros                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/integracoes/:provedor/vinculo/credencial` **(novo)**                                  | `VincularComCredencialRequest` | 200 `ContaVinculada`                  | 400 `VALIDACAO` (provedor por redirecionamento, ou `credencial` ausente/fora do formato, com `fields.credencial`) · 400 `PLATAFORMA_CREDENCIAL_INVALIDA` (`fields.credencial`) · 401 · 409 `PLATAFORMA_JA_VINCULADA` · 429 (5/min) · 502 |
| `POST /api/integracoes/:provedor/vinculo` (existente)                                            | —                              | 200 `{ url }` (só redirecionamento)   | + 400 `VALIDACAO` se o provedor é por credencial                                                                                                                                                                                         |
| `GET /api/integracoes/:provedor/retorno` (existente)                                             | —                              | 302 (só redirecionamento)             | provedor por credencial → 400 `VALIDACAO`                                                                                                                                                                                                |
| `GET /api/integracoes` (existente)                                                               | —                              | 200 `ContaVinculada[]` (com `estado`) | 401                                                                                                                                                                                                                                      |
| Demais rotas (`perfil`, `resumo`, `biblioteca`, `PUT/GET/POST/DELETE jogos`, `DELETE :provedor`) | iguais às da Steam             | iguais                                | + 409 `PLATAFORMA_REAUTENTICAR` quando a conta está em `reautenticar` (o `GET .../jogos/:id` devolve 200 com `aviso: 'REAUTENTICAR'`)                                                                                                    |

- `:provedor` = `playstation` (o `ProvedorSlugPipe` já lê do cadastro). O DTO da credencial: `@RawValue()`, `@IsString`, `@Matches(/^[A-Za-z0-9_-]{32,128}$/)`
  (o formato real do NPSSO é `[~]`; a regra é permissiva de propósito e **só barra lixo óbvio**, a Sony decide o resto), mensagem **sem o valor**.
- **`VincularJogoDto.idExterno`** (`^[A-Za-z0-9_-]{1,40}$`) já aceita `PPSA01234_00`; o `PsnProvider` confere `^[A-Z]{4}\d{5}_\d{2}$` **antes de chamar a Sony** (`IdExternoInvalidoError`,
  `campo: 'idItem'`, 400 `VALIDACAO`). O `accountId` (`^\d{1,20}$`) é conferido no `PsnClient`.
- **`GameProvider`** (aditivo):

```ts
readonly modoDeVinculo: 'redirecionamento' | 'credencial';
vincularComCredencial?(credencial: string): Promise<{ idExterno: string; nomeExibicao: string; sessao: { refreshToken: string; expiraEm: Date } }>;
// leituras existentes ganham um 2º/3º parâmetro OPCIONAL: ctx: { contaId: string }
```

O `IntegrationsService` cifra e grava `sessao` (nunca a devolve) e passa `{ contaId }` às leituras; a Steam ignora o contexto.

- **`PsnProvider.listarBiblioteca`** → `itens` (um por `titleId`; `capaUrl` = `imageUrl` só se `https` e em host `*.playstation.com|net` e ≤ 300 caracteres, senão `null`;
  `plataformaSugerida` pela `category`) e `perfil` (`nomeExibicao`, `avatarUrl`, `perfilUrl: null`, `publico: true`, `nivel`, `trofeus`). **`obterJogo`** filtra a biblioteca (cache) e chama
  `getUserTrophiesForSpecificTitle`. **`obterDetalhe`** monta a lista (definições + ganhos), o `porTipo` e o aviso.
- **Erros do `PsnClient`** (no padrão do `SteamClient`; **log só com o nome da chamada e o status**): timeout, 5xx, 403/IP bloqueado, resposta sem os campos esperados → `PlataformaIndisponivelError`;
  429 → `PlataformaLimiteError`; NPSSO/refresh recusado → `PlataformaReautenticarError` (novo) ou `CredencialInvalidaError` (no vínculo); ID malformado → `IdExternoInvalidoError`.
- Limite por usuário, `Cache-Control: no-store` e guard global: os mesmos das rotas atuais.

### Web (campos e estados)

- **Perfil:** linha da PlayStation (`vinculo.tipo === 'credencial'` decide o botão "Vincular": abre o diálogo do NPSSO, não redireciona; a decisão é pelo **cadastro**, nunca por `if` de provedor). `estado: 'reautenticar'` → selo "Reconectar" + Chek.
- **Diálogo do NPSSO** (`ModalDialog`): texto de explicação, link `ca.account.sony.com/api/v1/ssocookie` (`target="_blank" rel="noopener noreferrer"`), campo `password`, **Vincular**, erros por `code`, Chek no erro; `prefers-reduced-motion` respeitado; alvos ≥ 44 px.
- **Formulário de jogo:** um botão "Buscar na <nome>" por plataforma vinculada com capacidade `biblioteca`; um selo "Ligado à <nome>: «título»" por ligação pendente.
- **Página do jogo:** seção da PlayStation com barra de troféus, contagem por tipo, lista com tipo e raridade em texto, avisos (sem troféus/sincronização, reautenticar, indisponível).
- **Tile e destaque:** selo neutro e textos do cadastro.
- **Popup:** blocos da tabela acima.

## Modelo de dados

**Só aditivo** (migration `integracao_playstation`, via `/db-change`); **nenhum campo, tipo ou `@@unique` existente muda**:

| Mudança                                                                                                                                                                    | Classe  | Nota                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enum Provedor` ganha `PLAYSTATION` (`ALTER TYPE "Provedor" ADD VALUE 'PLAYSTATION'`)                                                                                      | aditivo | PostgreSQL 16 aceita o `ADD VALUE`; o valor **não é usado na mesma transação** da migration.                                                                                                                                                                                                       |
| `ContaVinculada.reautenticarDesde DateTime?`                                                                                                                               | aditivo | Coluna **nula** (nada obrigatório em tabela com linhas). `null` = ativa. Steam nunca a preenche.                                                                                                                                                                                                   |
| Model novo `CredencialPlataforma { id, contaId @unique → ContaVinculada (onDelete: Cascade), refreshCifrado String, expiraEm DateTime, atualizadoEm DateTime @updatedAt }` | aditivo | **Tabela à parte** (não coluna em `ContaVinculada`) para que nenhum `select`/`include` descuidado de `ContaVinculada` vaze o segredo. Excluir a conta do checkpoint, desvincular ou apagar a conta PSN leva a credencial por `Cascade`. `refreshCifrado` = `v1:<iv>:<tag>:<texto>`, nunca o token. |

Sem `CHECK` novo além do formato (`refreshCifrado LIKE 'v1:%'`). O **NPSSO não tem coluna**. Os caches e o _access token_ são **só memória**.
`JogoPlataforma` **não muda**: troféus totais e desbloqueados usam `conquistasTotal`/`conquistasDesbloqueadas` (0 = sem troféus, `null` = nunca lido); o **detalhe por tipo** e o `npCommunicationId`
(mapa `titleId → npCommunicationId`) **não são gravados** (vêm da Sony, com cache de 24 h).

## Fases (um commit por fase; gate completo — typecheck, lint, `npm test`, build — uma vez por fase)

| Fase | Entrega                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Commit (sugestão)                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| F1   | **Backend genérico + enum + PsnClient/provider + cifra + env.** `psn-api@2.18.1`; migration `integracao_playstation` (confirmar o banco antes, R6); `PsnClient`, `PsnSessao`, `PsnProvider` (leituras) e `CifraDeCredencial`; `IdExternoInvalidoError` neutro; `GameProvider` ampliado; cadastro com `PLAYSTATION` (`disponivel: false`); `PSN_TOKEN_ENCRYPTION_KEY` validada em `env.validation.ts` e `.env.example`; `ARCHITECTURE.md` (API não oficial, módulo, env, modelo) e `INDEX.md`. A rota do NPSSO **já existe** (testável por HTTP), mas a UI não a mostra. | `feat(api): base da integracao com a playstation (psn-api, credencial cifrada, provider)` |
| F2   | **Vincular a conta, biblioteca e Buscar na PlayStation (web).** Diálogo do NPSSO com explicação e estados (inválido, expirado/reautenticar, erro, Chek); linha "Vincular/Reconectar" no perfil; `disponivel: true`; diálogo da biblioteca e formulário genéricos por `provedor` (fim do `PROVEDOR_STEAM`); `plataformaSugerida`; confirmação de plataforma por cadastro; ligar/mover.                                                                                                                                                                                   | `feat(web): vincular a playstation e buscar na playstation`                               |
| F3   | **Página do jogo (horas e troféus) e selo no tile.** `obterDetalhe` do `PsnProvider`, `porTipo`, `tipo`/`raridadeNivel`; `BlocoPlataforma` genérico; vocabulário do cadastro; selo e textos do tile e do destaque.                                                                                                                                                                                                                                                                                                                                                      | `feat: horas e trofeus da playstation na pagina do jogo e no tile`                        |
| F4   | **Linha e popup na aba Plataformas.** `nivel` e `trofeus` no `resumo`; `ResumoPlataforma` genérico por capacidade; estados de erro e `reautenticar` no popup; rodapé provisório; documentação de fechamento.                                                                                                                                                                                                                                                                                                                                                            | `feat: popup da conta playstation no perfil`                                              |

Regras de execução: um commit por fase; entre commits só o teste do que mexeu; conferência visual **só das telas que a fase mudou**, a 360 e 1280 px, com a **API mockada** (Playwright, portas próprias,
sem tocar no banco de produção, nas portas 3333/5173 nem no Supabase); depois de mexer no `shared`: `npm run build -w @checkpoint/shared` e apagar `apps/web/node_modules/.vite` antes de reiniciar o web;
`ARCHITECTURE.md` e `INDEX.md` atualizados **no mesmo commit da fase**; nenhuma dependência além de `psn-api`.

## Critérios de aceite (testáveis, em BDD)

Legenda: `[ ]` verificável por teste ou passo de UI; **`[~]` depende da resposta real da Sony** (fixture **sintética**, D6): passa nos testes com o formato do pacote, mas só o
humano confirma com conta real. Todo teste usa **NPSSO, tokens e chave sintéticos óbvios** (`NPSSO_SINTETICO_…`), nunca reais.

### F1 — backend, enum, PsnClient, cifra, env

- [ ] **CA-01** — **Dado** o repositório, **quando** rodo `git grep -n "from 'psn-api'" apps` e `git grep -n "require('psn-api')"`, **então** só `apps/api/src/modules/integrations/psn/psn.client.ts` aparece (e o teste de arquitetura falha se outro arquivo importar); **e** `apps/api/package.json` tem `"psn-api": "2.18.1"` **sem** `^` nem `~`, e nenhuma outra dependência nova entrou.
- [ ] **CA-02** — **Dado** o `schema.prisma` e a migration `integracao_playstation`, **quando** leio os dois, **então** a migration só contém `ALTER TYPE "Provedor" ADD VALUE 'PLAYSTATION'`, `ALTER TABLE "ContaVinculada" ADD COLUMN "reautenticarDesde"` **nula** e `CREATE TABLE "CredencialPlataforma"` com FK `ON DELETE CASCADE`; nenhum `DROP`/`ALTER … TYPE`/`SET NOT NULL`; e `prisma migrate dev` não acusa _drift_.
- [ ] **CA-03** — **Dado** `DATABASE_URL` apontando para um banco remoto, **quando** a F1 vai migrar, **então** o host/projeto foi **conferido (senha mascarada)** e `prisma migrate status` mostrou só a migration nova como pendente (senão a execução **parou e perguntou**).
- [ ] **CA-04** — **Dado** a chave de cifra ausente, com menos/mais de 32 bytes ou fora do formato hexadecimal (64 caracteres), **quando** a API sobe, **então** o boot falha com a lista de erros **sem imprimir o valor**; com uma chave válida sintética, sobe. O `.env.example` documenta a variável **sem valor real**.
- [ ] **CA-05** — **Dado** um _refresh token_ sintético, **quando** cifro e decifro, **então** o resultado é idêntico; **e** dois cifrados do mesmo texto **diferem** (IV novo); **e** trocar **um byte** do texto, da _tag_, do IV ou usar **outro `contaId` (AAD)** faz a decifragem falhar; **e** com outra chave falha; **e** o texto cifrado **não contém** o token.
- [ ] **CA-06** — **Dado** `IdExternoInvalidoError`, **então** o campo é `'idConta' | 'idItem'` (o `'steamId'`/`'appId'` deixa de existir) e os testes da Steam continuam verdes com o novo rótulo; a resposta HTTP segue 400 `VALIDACAO`.
- [ ] **CA-07** — **Dado** o `PsnClient` com o pacote **mockado**, **quando** o pacote não responde em 8 s, **então** `PlataformaIndisponivelError` (nunca pendura); **e** `403`/resposta sem `access_token` no _refresh_ → `PlataformaReautenticarError`; **e** 429 → `PlataformaLimiteError`; **e** 5xx/JSON ilegível → `PlataformaIndisponivelError`; o **log tem só o nome da chamada e o status** e a mensagem de erro do pacote **nunca** é repassada. `[~]` (o formato exato das respostas de erro da Sony é suposição).
- [ ] **CA-08** — **Dado** o `PsnClient`, **quando** leio `playDuration` `PT228H56M33S`, `PT0S`, `PT45M`, `P1DT2H`, **então** os minutos são `13736`, `0`, `45` e `1560` (piso dos segundos); um valor ilegível → `0` e o item entra sem quebrar a lista.
- [ ] **CA-09** — **Dado** `PsnSessao`, **quando** duas leituras simultâneas precisam de token, **então** há **um só** _refresh_; **dado** token válido em memória, **então** zero _refresh_; **dado** o _refresh token_ devolvido diferente, **então** o novo é cifrado e regravado (mock do repositório). `[~]` (não se sabe se a Sony rotaciona).
- [ ] **CA-10** — **Dado** `POST /api/integracoes/playstation/vinculo/credencial` com um NPSSO sintético e o provider mockado, **quando** a conta ainda não existe, **então** 200 `ContaVinculada` **sem** NPSSO, tokens nem `userId`; a `ContaVinculada` e a `CredencialPlataforma` foram gravadas **numa transação**, e o registro guardado **não contém** o NPSSO nem o _refresh token_ em claro.
- [ ] **CA-11** — **Dado** o mesmo `accountId` já vinculado em `reautenticar`, **quando** envio um NPSSO novo, **então** 200, a credencial é regravada e `reautenticarDesde` volta a `null`; **dado** outro `accountId`, **então** 409 `PLATAFORMA_JA_VINCULADA` e nada muda.
- [ ] **CA-12** — **Dado** um corpo sem `credencial`, com `credencial` numérica, array, objeto, vazia ou com 200 caracteres, **quando** `POST .../vinculo/credencial`, **então** 400 `VALIDACAO` com `fields.credencial`, e a mensagem **não ecoa** o valor enviado; **dado** um campo desconhecido, **então** 400.
- [ ] **CA-13** — **Dado** a Sony recusando o NPSSO, **quando** `POST .../vinculo/credencial`, **então** 400 `PLATAFORMA_CREDENCIAL_INVALIDA` (`fields.credencial`), **nada** é gravado. `[~]`
- [ ] **CA-14** — **Dado** o provedor `steam`, **quando** `POST /api/integracoes/steam/vinculo/credencial`, **então** 400 `VALIDACAO`; **dado** `playstation`, **quando** `POST .../vinculo` ou `GET .../retorno`, **então** 400 `VALIDACAO`; sem token, 401 em todas.
- [ ] **CA-15** — **Dado** uma conta em `reautenticar`, **quando** `GET .../biblioteca`, `.../resumo`, `.../perfil` ou `POST .../atualizacao`, **então** 409 `PLATAFORMA_REAUTENTICAR` **sem chamar a Sony** (o mock não é chamado); **e** `GET .../jogos/:id` devolve 200 com o gravado e `aviso: 'REAUTENTICAR'`.
- [ ] **CA-16** — **Dado** um refresh **expirado** (`expiraEm` no passado) ou **recusado**, **quando** leio a biblioteca, **então** a conta passa a `reautenticarDesde = agora` e a resposta é 409 `PLATAFORMA_REAUTENTICAR`; **dado** timeout/5xx/429, **então** 502 e a conta **não** vai para `reautenticar`.
- [ ] **CA-17** — **Dado** o `PsnProvider.listarBiblioteca` com fixture sintética de `getUserPlayedGames` (PS4, PS5, PS5 no PC, `unknown`), **então** um item por `titleId`, horas em minutos, `ultimaVezJogadoEm` ISO, `plataformaSugerida` `PS4`/`PS5`/`PC`/`null`, `capaUrl` só se `https` em host permitido e ≤ 300 caracteres; **dado** o mesmo jogo em PS4 e PS5, **então** **dois itens** com `titleId` diferentes (D3). `[~]`
- [ ] **CA-18** — **Dado** a biblioteca com mais de uma página, **então** o client pagina até `totalItemCount` (ou o teto de 10 páginas) e **não** entra em laço. `[~]` (o teto de `limit` é suposição).
- [ ] **CA-19** — **Dado** um `titleId` fora de `^[A-Z]{4}\d{5}_\d{2}$` ou um `accountId` não numérico, **então** `IdExternoInvalidoError` **antes** de qualquer chamada à Sony (o mock não é chamado).
- [ ] **CA-20** — **Dado** o `PsnProvider` **e** o `SteamProvider` registrados, **quando** o `PsnClient` falha (502) numa rota da PlayStation, **então** uma rota da Steam, o `GET /api/games` e `GET /api/health` respondem **200** no mesmo teste HTTP (isolamento, R1); **e** falhar ao carregar `psn-api` **não** impede o boot.
- [ ] **CA-21** — **Dado** uma execução completa dos testes da F1 (sucesso e todas as falhas), **então** **nenhum log** contém o NPSSO sintético, o _access code_, os tokens, a chave de cifra nem o `accountId`; **e** nenhuma resposta HTTP os contém; uma mutação que loga o NPSSO derruba o teste.
- [ ] **CA-22** — **Dado** o vínculo já existente e `DELETE /api/integracoes/playstation`, **então** 204 e a `ContaVinculada`, a `CredencialPlataforma` e os `JogoPlataforma` do usuário somem, os jogos ficam; **dado** `POST /api/users/me/exclusao`, **então** a credencial some por `Cascade` (Prisma falso ganha a tabela).
- [ ] **CA-23** — **Dado** os testes existentes da Steam (`steam.*`, `integrations.*`), **quando** rodo `npm test -w @checkpoint/api`, **então** continuam verdes **sem** mudança de comportamento (regressão).
- [ ] **CA-24** — **Dado** o cadastro, **quando** leio `PLATAFORMAS.PLAYSTATION`, **então** tem `slug: 'playstation'`, `disponivel: false`, `vinculo.tipo: 'credencial'`, `logo: null`, o marcador neutro e o vocabulário "troféu/troféus"; **e** `PROVEDOR_SLUG.PLAYSTATION === 'playstation'`; **e** a PlayStation **não** aparece nas telas enquanto `disponivel: false`.
- [ ] **CA-25** — **Dado** `ARCHITECTURE.md`, **então** registra a `psn-api` como **API não oficial**, o módulo `psn/`, a variável nova e o modelo novo; **e** o `INDEX.md` tem a linha da spec.

### F2 — vincular a conta, biblioteca e Buscar na PlayStation

- [ ] **CA-26** — **Dado** `/perfil` sem conta PlayStation, **quando** toco em "Vincular", **então** abre um diálogo com o texto do NPSSO (o que é, onde pegar, "equivale a uma senha", "usado uma única vez e não guardado"), o link `ca.account.sony.com/api/v1/ssocookie` com `rel="noopener noreferrer"` e o campo, **e o navegador não navega** (nenhuma URL com o NPSSO). (Regressão: a Steam continua indo para o `steamcommunity.com`.)
- [ ] **CA-27** — **Dado** o diálogo, **quando** digito um NPSSO sintético, **então** o campo é `type="password"`, `autocomplete="off"`; ao enviar o valor sai **só** no corpo de `POST /api/integracoes/playstation/vinculo/credencial` (o mock do `apiClient` confere), **nunca** em URL, `localStorage`, `sessionStorage` nem no cache do TanStack Query; após enviar ou fechar, o campo está vazio e a mutação foi resetada.
- [ ] **CA-28** — **Dado** o vínculo com sucesso, **então** o diálogo fecha, o foco volta à linha, a linha mostra o nome da conta e o aviso "Conta PlayStation vinculada." (`role="status"`).
- [ ] **CA-29** — **Dado** `PLATAFORMA_CREDENCIAL_INVALIDA`, `PLATAFORMA_JA_VINCULADA` e `PLATAFORMA_INDISPONIVEL`, **então** cada um mostra o texto pelo `code` **dentro** do diálogo com o **Chek no estado de erro**, o campo é limpo e o botão continua usável. `[~]` (o texto de "NPSSO expirado" depende de como a Sony responde).
- [ ] **CA-30** — **Dado** uma conta com `estado: 'reautenticar'`, **então** a linha do perfil mostra "Reconectar" e o diálogo abre com "Sua conexão com a PlayStation expirou", o **Chek confuso** e o formulário; enviar um NPSSO novo volta o estado a `ativa` e a linha ao normal.
- [ ] **CA-31** — **Dado** `git grep` no web, **então** `PROVEDOR_STEAM` e `useTemContaSteam` **não existem mais**, e o `sem-provedor-solto.test.ts` passa **sem** a exceção `provedores.ts` (nenhum `'STEAM'`, `'PLAYSTATION'` nem `provedor === '…'` fora do `shared` e dos testes).
- [ ] **CA-32** — **Dado** as duas contas vinculadas, **quando** abro "Novo jogo", **então** há **dois** botões, "Buscar na Steam" e "Buscar na PlayStation" (nomes do cadastro), na ordem do cadastro; **dado** só a Steam vinculada, **então** só ela aparece; **dado** nenhuma, **então** o convite "Vincule sua conta no perfil".
- [ ] **CA-33** — **Dado** o diálogo da biblioteca da PlayStation (mock), **então** lista por horas com o marcador da PlayStation, busca sem caixa nem acento, "já no seu catálogo"/**Vincular a este** para nome normalizado igual, **Vincular a outro jogo que já tenho** e **Criar jogo**; **nunca** vincula sozinho.
- [ ] **CA-34** — **Dado** dois itens do mesmo jogo (PS4 e PS5), **então** aparecem **como dois itens**, cada um com sua plataforma sugerida, e o usuário escolhe; nenhum é escolhido por nome.
- [ ] **CA-35** — **Dado** "Criar jogo" com item PS5, **então** o formulário vem com título, plataforma `PS5` (editável), status sugerido (0 min → Quero jogar; > 0 → Jogando; **nunca** Zerado) e a capa oficial só como **prévia** (arquivo escolhido a substitui, nada vai ao bucket); ao salvar cria o jogo e **depois** liga; falha da ligação deixa o jogo salvo, com o erro.
- [ ] **CA-36** — **Dado** um jogo cadastrado como "Xbox One", **quando** ligo a um item da PlayStation, **então** pede confirmação (texto do cadastro: "As horas e os troféus mostrados serão os da PlayStation. Vincular mesmo assim?"); **dado** "PS5" ou vazio, **então** liga sem confirmação; cancelar não envia nada.
- [ ] **CA-37** — **Dado** um item já ligado a outro jogo, **quando** ligo sem `mover`, **então** 409 `PLATAFORMA_ITEM_JA_VINCULADO` **sem chamar a Sony** e o web oferece "Mover o vínculo"; com `mover: true` o antigo perde só a camada; **dado** um jogo que já tem vínculo, **então** 409 `PLATAFORMA_JOGO_JA_VINCULADO` (regressão das regras da Steam, agora por `provedor`).
- [ ] **CA-38** — **Dado** `PUT .../playstation/jogos/:id` com um `titleId` fora da biblioteca, **então** 404 `PLATAFORMA_ITEM_NAO_ENCONTRADO`; malformado, **então** 400 `VALIDACAO`; a Sony fora do ar, **então** 502 e **nada muda**.
- [ ] **CA-39** — **Dado** 360 e 1280 px, **então** o diálogo do NPSSO e o da biblioteca não têm rolagem horizontal, os alvos medem ≥ 44 px e nada anima com `prefers-reduced-motion`. `[~]` (conferência visual e de aparelho).
- [ ] **CA-40** — **Dado** o vínculo real de ponta a ponta com uma conta PSN real (**manual, humano**), **então** o vínculo, a biblioteca e "Buscar na PlayStation" funcionam **em produção (Render)**. `[~]`

### F3 — página do jogo (horas e troféus) e selo no tile

- [ ] **CA-41** — **Dado** o `PsnProvider.obterJogo`, **quando** ligo um item (fixture sintética de `getUserTrophiesForSpecificTitle`), **então** `conquistasTotal`/`conquistasDesbloqueadas` são a soma dos tipos de `definedTrophies`/`earnedTrophies`; lista vazia ou 404 → `0` de `0` e aviso `SEM_CONQUISTAS`. `[~]`
- [ ] **CA-42** — **Dado** o detalhe (fixtures sintéticas de `getTitleTrophies` e `getUserTrophiesEarnedForTitle`), **então** a lista traz `nome`, `descricao`, `iconeUrl` (só host permitido), `desbloqueada`, `desbloqueadaEm`, `tipo`, `raridadePercentual` (texto `"4.8"` → `4.8`, 1 casa) e `raridadeNivel`; `porTipo` traz total e desbloqueados de platina, ouro, prata e bronze e **bate** com a lista. `[~]`
- [ ] **CA-43** — **Dado** um troféu **oculto e bloqueado**, **então** a API devolve `oculta: true` **sem `nome` nem `descricao`** (mesmo que a fixture os traga) e a UI mostra "Troféu oculto"; **desbloqueado**, mostra o nome e a descrição. `[~]`
- [ ] **CA-44** — **Dado** um conjunto com DLC (`trophyGroupId` `default` e `001`), **então** a lista traz **todos** (`"all"`) e o total confere com `definedTrophies`. `[~]`
- [ ] **CA-45** — **Dado** o detalhe **a frio**, **então** a Sony recebe **exatamente** `getUserTrophiesForSpecificTitle`, `getTitleTrophies` e `getUserTrophiesEarnedForTitle` (contagem no mock; +_refresh_ se o token está frio); **dado** o detalhe de novo em < 5 min, **então** **0** chamadas; **dado** outro usuário abrindo o mesmo jogo, **então** as definições e o mapa vêm do cache (24 h) e só os ganhos são lidos.
- [ ] **CA-46** — **Dado** as horas gravadas com mais de 1 h, **quando** abro o detalhe, **então** as horas são relidas **da biblioteca em cache** (sem chamada extra se ≤ 10 min); o `POST .../atualizacao` duas vezes em 30 s refaz na 1ª e devolve o gravado na 2ª sem chamar a Sony.
- [ ] **CA-47** — **Dado** a Sony fora do ar, **quando** `GET .../jogos/:id`, **então** 200 com o gravado e `aviso: 'INDISPONIVEL'` (nunca 502); `POST .../atualizacao`, **então** 502.
- [ ] **CA-48** — **Dado** `/jogos/:id` de um jogo ligado à PlayStation, **então** há a seção da PlayStation (a `SecaoRecolhivel` de sempre), com o marcador e o nome, horas, último jogo, barra de troféus (`role="progressbar"`, nome acessível "12 de 40 troféus"), a contagem por tipo em texto, **Atualizar** e **Desvincular** (com confirmação); **sem** "Abrir na PlayStation".
- [ ] **CA-49** — **Dado** a seção aberta, **então** "Desbloqueadas (N)" e "Faltam (N)" vêm **fechadas** com "Toque para ver"; cada troféu mostra ícone, nome, descrição, data, o **tipo em texto** ("Ouro") e a **raridade em texto** ("Raro · 4,8% dos jogadores"); nada depende só de cor.
- [ ] **CA-50** — **Dado** um jogo ligado a Steam **e** a PlayStation, **então** aparecem **duas seções** na ordem do cadastro (Steam, PlayStation), cada uma com o vocabulário dela ("conquistas"/"troféus").
- [ ] **CA-51** — **Dado** `estado: 'reautenticar'`, **então** a seção mostra o gravado, o aviso "Sua conexão com a PlayStation expirou" com o Chek e o formulário do NPSSO; **dado** troféus não lidos, **então** o aviso "Os troféus só aparecem depois que o console sincroniza com a PSN".
- [ ] **CA-52** — **Dado** um jogo ligado à PlayStation, **então** o tile mostra o **selo neutro** com `aria-label="Ligado à PlayStation"` no mesmo canto e sem sobrepor o anel, o chip nem as ações; **dado** Steam + PlayStation, **então** dois selos; **dado** 3 ligações (dado sintético), **então** 2 selos e "+1" com os nomes no `aria-label`; sem ligação, o tile é igual ao de hoje.
- [ ] **CA-53** — **Dado** o resumo "42 h · 12/40" do tile e do destaque, **então** o `aria-label` e os chips usam o **nome e o vocabulário do cadastro** ("Tempo jogado na PlayStation: 42 h, 12 de 40 troféus"), sem "Steam" fixo (regressão: a Steam continua "conquistas").
- [ ] **CA-54** — **Dado** `styles/tokens.test.ts`, **então** continua passando (sem hex fora do `@theme`).
- [ ] **CA-55** — **Dado** um jogo real ligado (**manual, humano**), **então** as horas, os troféus e a raridade conferem com o que o console mostra. `[~]`

### F4 — linha e popup na aba Plataformas

- [ ] **CA-56** — **Dado** `/perfil` com a PlayStation vinculada, **então** a linha mostra o marcador neutro (sem logo), o nome em texto, a foto (`avatarUrl`), o nome da conta e "atualizado há X" (ou "Reconectar"); a linha inteira é um botão de ≥ 44 px que abre o popup; a linha e o popup fazem **uma** consulta ao `resumo` (chamado 1 vez).
- [ ] **CA-57** — **Dado** `GET /api/integracoes/playstation/resumo` (mock), **então** 200 com `ResumoContaPlataforma`: `nivel` `{ valor, progressoPercentual, faixa }`, `trofeus` por tipo, `totalJogos`, `minutosTotais`, `jogosJogados`, `maisJogados` (≤ 5, decrescente), `noCheckpoint`, `conquistas` (dos vinculados), **`membroDesde`, `status`, `jogandoAgora`, `perfilUrl` = `null`**; a Steam continua com `nivel: null` e `trofeus: null`. `[~]`
- [ ] **CA-58** — **Dado** o `resumo` **a frio**, **então** a Sony recebe `getUserPlayedGames`, `getUserTrophyProfileSummary` e `getProfileFromAccountId` (+ 1 por página extra e o _refresh_ se frio); **a quente** (≤ 10 min), **0** chamadas (o mesmo cache `provedor:idExterno` da biblioteca). `[~]`
- [ ] **CA-59** — **Dado** `POST .../resumo/atualizacao` duas vezes em 30 s, **então** a 1ª refaz e a 2ª devolve o que tem sem chamar a Sony.
- [ ] **CA-60** — **Dado** o `resumo` sem token, **então** 401; provedor `xbox`, 400 `VALIDACAO`; sem vínculo, 409 `PLATAFORMA_NAO_VINCULADA`; em `reautenticar`, 409 `PLATAFORMA_REAUTENTICAR`; Sony fora do ar, 502 **sem** `accountId`, tokens nem chave no corpo ou no log.
- [ ] **CA-61** — **Dado** o popup da PlayStation, **então** mostra na ordem: cabeçalho (foto, nome, marcador), **nível de troféu** (número, % até o próximo, faixa), **contagem por tipo**, números, mais jogados, "X dos seus Y jogos já estão no checkpoint", troféus "em N jogos vinculados" e as ações; **não** mostra "membro desde", status, "abrir perfil", "nunca abertos" nem o botão **Ver e importar** de backlog (busca desses textos no DOM do teste).
- [ ] **CA-62** — **Dado** o popup da Steam, **então** continua **idêntico** ao de hoje (nível/troféus ausentes, "Na Steam desde", backlog, atribuição da Valve): regressão **sem** `if (provedor …)` (blocos por capacidade e dado presente, `sem-provedor-solto` passa).
- [ ] **CA-63** — **Dado** o popup, **então** o rodapé mostra "Não afiliado à Sony Interactive Entertainment" (provisório) **sem** atribuição legal inventada; o cabeçalho usa o marcador e o **nome em texto** (sem logo); **quando** o pacote oficial for entregue, basta o arquivo em `public/plataformas/` e `logo` no cadastro. `[~]` (pendência de marca do humano).
- [ ] **CA-64** — **Dado** o popup em `reautenticar`, **então** mostra o **Chek confuso**, "Sua conexão com a PlayStation expirou" e o formulário do NPSSO, **mantendo** o cabeçalho e o **Desvincular**; **dado** 502, `Falha` + **Tentar de novo**.
- [ ] **CA-65** — **Dado** Desvincular, **então** pede confirmação com o texto do que acontece (ligações, horas e a **credencial guardada** somem; jogos, notas e capas ficam) e o foco em Cancelar; depois, a linha volta a "Vincular".
- [ ] **CA-66** — **Dado** o popup aberto, **então** Esc fecha e o foco volta à linha; em 360 px é folha inferior sem rolagem horizontal; nada anima com `prefers-reduced-motion`. `[~]`
- [ ] **CA-67** — **Dado** `git grep -n "PSN_TOKEN_ENCRYPTION_KEY\|psn-api" apps/web` e o bundle do web, **então** zero ocorrências (a chave e o pacote **nunca** vão para o web).
- [ ] **CA-68** — **Dado** o fim da F4, **então** `npm run typecheck`, `npm test`, `npm run lint` e `npm run build` passam, e a conferência visual a 360 e 1280 px (API mockada, banco de produção intocado) foi feita nas telas mudadas de **cada** fase.

## Plano de testes

- **API (Jest; Prisma e `PsnClient` mockados, nunca a rede, nunca o pacote real):** `psn/psn.client.spec.ts` (fixtures **sintéticas**, timeout, mapeamento de erro, log sem
  segredo, `playDuration`, paginação), `psn/psn-sessao.spec.ts` (junção de _refresh_, expiração, regravação), `psn/cifra-de-credencial.spec.ts` (ida e volta, IV, _tag_, AAD, chave errada),
  `psn/psn.provider.spec.ts` (biblioteca, PS4 × PS5, `obterJogo`, `obterDetalhe`, troféu oculto, DLC), `psn/fixtures.spec.ts` (nenhum valor com formato de token real nos fixtures),
  `psn/sem-import-direto.spec.ts` (só o `PsnClient` importa `psn-api`), `integrations.service.spec.ts` (acréscimos: credencial, `reautenticar`, mesmo/outro `accountId`),
  `dto/vincular-credencial.dto.spec.ts` (pelo pipe do `main.ts`), `integrations.http.spec.ts` (porta local, guard global real, isolamento Steam × PSN, 401/400/409/429/502, **logs e respostas sem segredo**),
  `env.validation.spec.ts` (acréscimo: a chave), `users.http.spec.ts`/`fake-auth-prisma` (cascade da credencial), e os specs da Steam **sem mudança de comportamento**.
- **Web (Vitest, `apiClient` mockado):** `PlataformasDoPerfil.test.tsx`, `VincularCredencialDialog.test.tsx` (campo, envio, limpeza, Chek nos erros, `reautenticar`, nada em storage/cache), `BibliotecaPlataformaDialog.test.tsx`,
  `GameForm.plataformas.test.tsx` (dois botões, confirmação por cadastro), `BlocoPlataforma.test.tsx` (troféus, tipo, raridade, oculto, avisos), `SeloDePlataformas` (2 provedores), `PlataformaDialog.test.tsx`
  (blocos por capacidade, Steam intacta), `lib/*.test.ts`, `sem-provedor-solto.test.ts` (sem exceção), `sem-chave-da-psn.test.ts`, `styles/tokens.test.ts`.
- **Fixtures (D6):** **sintéticas**, derivadas dos tipos do `psn-api` 2.18.1, em `psn/__fixtures__/`, com **nomes de jogo e de conta óbvios** (`Jogo Exemplo`, `conta_exemplo`, `accountId` fictício) e o
  NPSSO/tokens `*_SINTETICO_*`. Cada arquivo carrega o aviso "SINTÉTICO: derivado dos tipos do psn-api, não é resposta real da Sony". Nenhum vira `[x]` de "resposta real".
- **Manual (humano, com conta real):** login (NPSSO) em produção, biblioteca, ligar um jogo, abrir o detalhe, popup, reautenticar (invalidar a sessão e voltar) e o desvincular. O humano passa os erros.

Loop por fase: `npm run typecheck` → `npm test` → `npm run lint` → `npm run build` → **um commit por fase**.

## Fora de escopo

**Feature do produto:**

- **Xbox e Epic** (specs próprias). **Logo oficial da PlayStation** (pendência do humano). **Backlog/jogos comprados** (`getPurchasedGames`), **jogos recentes por GraphQL**
  (`getRecentlyPlayedGames`), **status online/jogando** (`getBasicPresence`), **link do perfil**, **amigos**, **PS Plus**, **jogos de PS3/PS Vita/PS1/PS2/PSP** como itens da biblioteca.
- **Agrupar versões automaticamente** (PS4 + PS5 do mesmo jogo, remasters, edições): sempre o usuário escolhe.
- **Sincronização em segundo plano**, aviso de expiração por e-mail/notificação, **rotação automática da chave de cifra**, mais de uma conta PSN por usuário, ler dados de **outra** conta PSN.
- **Contornar bloqueio de IP** (proxy, rotação, disfarce): decisão própria, com spec, se o R2 acontecer.
- **Verificação de conformidade jurídica** com os termos da Sony (registrada como risco R1, não resolvida aqui).
- Trocar automaticamente `status`, notas ou `plataforma` a partir de dado da PSN.

**Passo de processo (não é critério de aceite):** aplicar a migration no banco (após conferir qual é, R6), gerar a chave de cifra e cadastrá-la no Render e em `apps/api/.env`, atualizar `ARCHITECTURE.md`
e `INDEX.md` no mesmo commit de cada fase, rodar o `/qa-verify` e o teste com conta real.

## Notas de ambiente

- **Variável nova (única), validada em `env.validation.ts` e documentada no `.env.example` sem valor real: `PSN_TOKEN_ENCRYPTION_KEY`** — **64 caracteres hexadecimais (32 bytes)**, a chave do AES-256-GCM
  que cifra o _refresh token_ da PSN. **Só o backend**; nunca no web, em log, teste, commit, spec ou chat. **Obrigatória no boot** (como `STEAM_API_KEY`); a ordem é: **1) migration → 2) variável no Render → 3) deploy**.
  Gerar com `openssl rand -hex 32` (ou `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). **Perder ou trocar a chave invalida as credenciais guardadas**: todo usuário cai em
  `reautenticar` e cola um NPSSO novo (sem perda de dado de jogo).
- **Dependência nova:** `psn-api@2.18.1` (exata) em `apps/api`. Nenhuma outra.
- **Testes:** o Jest usa uma chave **sintética** de formato válido (`0123…` repetido, óbvia) e NPSSO/tokens `*_SINTETICO_*`.
- Depois de mexer no `shared`: `npm run build -w @checkpoint/shared` e `rm -rf apps/web/node_modules/.vite` antes de reiniciar o web.
- **Sem mudança** em `API_PUBLIC_URL`, `WEB_PUBLIC_URL`, CORS nem no rewrite da Vercel (a PSN não usa redirecionamento).

## Suposições

Assumidas ao escrever a spec (o que não está aqui foi decidido pelo humano, D1 a D6). Sinalizadas para aprovação:

- **S1** — O `idExterno` do **item** é o `titleId` (`CUSA…_00`/`PPSA…_00`) e o da **conta** é o `accountId` (numérico); ambos cabem em `VarChar(40)`.
- **S2** — A credencial vai numa **tabela própria** (`CredencialPlataforma`) e o estado `reautenticar` numa coluna nula (`reautenticarDesde`) de `ContaVinculada`; ambos aditivos.
- **S3** — A rota do NPSSO é **`POST /:provedor/vinculo/credencial`** (uma rota genérica por "modo de vínculo"), e o web decide o fluxo pelo `vinculo.tipo` do **cadastro**.
- **S4** — Troféus **não** são gravados por tipo nem por conjunto: só `conquistasTotal`/`conquistasDesbloqueadas` (mesma semântica da Steam); o resto vem da Sony com cache.
- **S5** — A leitura da **própria** conta não depende da privacidade do perfil (hipótese `[~]`); por isso não existe "perfil privado" na PSN e os avisos são de sincronização.
- **S6** — Timeout por **`Promise.race`** (o pacote não aceita cancelamento); a `fetch` pendente termina em segundo plano.
- **S7** — `psn-api` carregada por **`import()` dinâmico** no `PsnClient`, para um erro de carga não derrubar o boot.
- **S8** — A chave de cifra é **obrigatória** no boot e **sem rotação** (trocar a chave = reautenticar). Alternativa (opcional, com o provider desligado sem chave) fica fora.
- **S9** — A plataforma sugerida do jogo novo vem da `category` (`PS5`, `PS4`, `PC`, vazio) e é **editável**; a confirmação ao ligar usa `plataformasCompativeis` do cadastro.
- **S10** — Sem logo oficial: marcador neutro `videogame_asset` e o nome em texto; rodapé provisório só com "Não afiliado à Sony Interactive Entertainment".
- **S11** — O tamanho do NPSSO (64 caracteres) e a validade do _refresh_ (~60 dias) vêm do pedido e do pacote; a validação do DTO é **permissiva** (`[A-Za-z0-9_-]{32,128}`).

## Questões em aberto

Nenhuma **de domínio**. Dependem do humano, sem bloquear a implementação:

- [ ] **Logo e diretrizes de marca da Sony/PlayStation** (pacote, regras, atribuição legal, texto "não afiliado"): ver "Marca e logos".
- [ ] **Teste manual com uma conta PSN real** (login, biblioteca, troféus, reautenticar) para tirar os `[~]` e passar os erros.
- [ ] **Cadastrar `PSN_TOKEN_ENCRYPTION_KEY` no Render antes do deploy** (e gerar a chave).
