# Spec: autenticação

> Status: rascunho (Q1 a Q4 decididas em 2026-09-23; continua rascunho enquanto Q5 estiver aberta)
>
> ⚠️ Contém **mudança destrutiva de schema** (`Game.userId` obrigatório e `@@unique` alterado),
> com **aprovação humana pendente** (`RULES.md` §3). Ver "Modelo de dados" e a Questão Q5.

## Objetivo

Permitir criar conta (nome, e-mail, senha) e entrar com e-mail e senha, manter a sessão por
dispositivo com renovação segura, trocar a senha estando logado, e fazer de cada jogo do catálogo
**propriedade de um usuário** (cada um vê e mexe só nos seus).

Toca `apps/api` (módulo `auth`, guard global, `games` passa a filtrar por dono), `apps/web` (login,
registro, rota protegida, interceptor de renovação, `/perfil` mínimo, troca de senha),
`packages/shared` (contrato de auth e códigos de erro) e `apps/api/prisma/schema.prisma` (models
`User` e `RefreshSession`; `Game.userId`). É a **segunda** spec da rodada: depende de `pwa-e-mobile`
etapas 1 e 2 e é base de `perfil` (ver "Dependências entre specs").

Implementada em **cinco etapas**, cada uma parando para validação.

### Restrições decididas pelo humano (não são questões em aberto)

- **Só senha.** Nenhum login social: sem Google, sem OAuth/OAuth2, sem provedor externo de
  identidade.
- **Nenhum e-mail é enviado**, em nenhum fluxo (criar conta, trocar senha, "esqueci minha senha",
  verificação). Não existe provedor nem variável de ambiente de e-mail nesta spec.
- **O e-mail é só um identificador de login, NÃO verificado.** É normalizado (`trim` + minúsculas) e
  único, mas ninguém confirma que a pessoa é dona dele. Consequência aceita: alguém pode criar conta
  com um e-mail que não é seu (ver Q4, registro aberto/fechado). A tela de registro diz isso.
- **Troca de senha só logado**, exigindo a senha atual. **Recuperação de senha esquecida não existe
  nesta rodada** (ver Q3).
- O envio de e-mail (Brevo) é feature **futura**, com spec própria. O design abaixo é **aditivo** para
  recebê-la (ver "Fora de escopo").

> **Aviso de segurança durante a implementação:** até a etapa 3, o catálogo continua **sem dono e
> sem proteção** (o aviso da spec `catalogo-jogos` segue valendo). As rotas de `games` ficam
> explicitamente `@Public()` nas etapas 1 e 2, e deixam de ser na etapa 3.

## Stack

Padrão da casa, com as divergências abaixo. **Toda dependência nova exige aprovação (`RULES.md` §9).**
Em 2026-09-23 o humano **escolheu** as bibliotecas (Q1, Q2), mas **nenhuma instalação está aprovada
ainda**: a aprovação de cada pacote é pedida no início da etapa 1, antes de mexer em `package.json`.
Versões conferidas no registry em 2026-09-23.

| Pacote (workspace)                                                         | Tipo          | Para quê                                                                                                                                       | Pendente de                             |
| -------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `@nestjs/jwt@^11.0.2` (`apps/api`)                                         | runtime       | assinar/verificar access e refresh (HS256). `^11` casa com o Nest 11 (a 12.0.2 também aceita, mas segue o precedente do `@nestjs/testing@^11`) | aprovação de instalação                 |
| `@nestjs/throttler@^6.7.0` (`apps/api`)                                    | runtime       | limite de tentativas em login, registro, refresh e troca de senha (`engines: ^20.19.0 …`, ok)                                                  | escolhido (Q2); aprovação de instalação |
| `argon2@^0.45.1` (`apps/api`)                                              | runtime       | hash de senha **argon2id** (Q2). Se a instalação falhar (binário nativo), cai para `node:crypto.scrypt`, sem dependência                       | escolhido (Q2); aprovação de instalação |
| `cookie-parser@^1.4.7` + `@types/cookie-parser@^1.4.10` (dev) (`apps/api`) | runtime + dev | ler o cookie do refresh (Q1 = cookie)                                                                                                          | aprovação de instalação                 |

- **Sem Passport** (`@nestjs/passport`, `passport-jwt`): o guard é um `CanActivate` próprio que usa
  o `JwtService`. Uma estratégia de um provedor só não justifica três pacotes.
- **Nenhuma dependência nova no web.** O interceptor usa o `apiClient` que já existe.
- **Plano B do hash (decidido em Q2):** se `npm install argon2` falhar (sem _prebuild_ para a
  plataforma e sem toolchain para compilar), a implementação **para, registra o erro na spec** e usa
  `node:crypto.scrypt` (N = 2^17, r = 8, p = 1, sal de 16 bytes, saída de 64 bytes, gravado num formato
  autodescritivo `scrypt$N$r$p$sal$hash` em base64). Nenhuma outra biblioteca de hash entra sem nova
  aprovação. O `PasswordHasher` isola o algoritmo, então a troca não afeta o resto do módulo.

## Comportamento esperado

### Conta e sessão

- **Registro:** nome, e-mail e senha → conta criada **e já logada** (sem confirmação por e-mail).
  E-mail já usado (ignorando caixa e espaços) → erro "Este e-mail já tem uma conta".
- **Login:** e-mail + senha → sessão nova neste dispositivo. E-mail inexistente e senha errada dão
  **exatamente a mesma resposta** (mesmo status, corpo e, na medida do possível, tempo).
- **Sessão = um dispositivo** (uma linha em `RefreshSession`). Cada sessão tem um **refresh token**
  de longa duração (30 dias, renovado a cada uso) e emite **access tokens** curtos (15 min).
- **Renovação com rotação:** cada renovação troca o refresh token por um novo **na mesma linha**
  (não cria sessão nova). O banco guarda só o **hash SHA-256** do token.
- **Detecção de reuso:** apresentar um refresh token já trocado **encerra a sessão** (sinal de
  token vazado), exceto numa janela de 30 s que cobre a corrida legítima de duas abas renovando juntas.
- **Logout:** encerra a sessão deste dispositivo; as outras continuam.
- **Encerramento imediato:** o guard confere se a sessão do access token ainda existe. Sessão
  encerrada (logout, troca de senha, reuso, e depois "encerrar sessão" do `perfil`) derruba o access
  token dela **na hora**, não só quando ele expira.
- **Troca de senha:** senha atual + nova. A nova não pode ser igual à atual. Encerra **todas as outras
  sessões** e mantém a atual.
- **Limite de tentativas** mais apertado em login, registro, renovação e troca de senha → 429.
- Mensagens de erro em português, vindas de **códigos estáveis** da API (`code`), nunca de comparação
  com o texto da mensagem.

### Dono dos jogos

- Todo jogo pertence a um usuário. A lista, a criação, a edição, a remoção e a capa só enxergam os
  jogos **do usuário logado**. Jogo de outro usuário responde **404** (igual a inexistente, para não
  revelar que existe).
- A regra de duplicidade (mesmo título e plataforma) passa a ser **por usuário**: dois usuários podem
  ter "Celeste / PC"; o mesmo usuário não.
- Os jogos que já existem no banco (sem dono) são tratados pela migração em duas fases (ver "Modelo de
  dados" e Q5).

### Web

- Visitante (sem sessão) que abre qualquer tela logada vai para `/login`, **sem** mensagem de "sessão
  expirada". Quem tinha sessão e a perdeu vê "Sua sessão terminou. Entre de novo."
- Recarregar a página mantém o login (a sessão é recuperada pelo refresh).
- Sem rede, o app **não desloga**: mostra o shell com o aviso de conexão (`pwa-e-mobile` etapa 2) e
  tenta de novo quando a conexão volta.
- Depois de entrar, volta para a tela que a pessoa tentou abrir (`?voltar=`), **só se for um caminho
  interno** do app.

## Requisitos de saída

### Regras de campo (compartilhadas por API e web)

| Campo                | Normalização                              | Regra                                                                                        | Mensagem (`fields.<campo>`)                                                                                                                            |
| -------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nome`               | `trim`                                    | 1 a 60 caracteres                                                                            | "Informe seu nome" · "O nome pode ter no máximo 60 caracteres"                                                                                         |
| `email`              | `trim` + minúsculas, **antes** de validar | formato de e-mail (`IsEmail`), até 254 caracteres                                            | "Informe um e-mail válido"                                                                                                                             |
| `senha`, `novaSenha` | **nenhuma** (espaços contam)              | ≥ 8 caracteres (contados por _code point_); ≤ **72 bytes** em UTF-8; não pode ser só espaços | "A senha deve ter pelo menos 8 caracteres" · "A senha pode ter no máximo 72 bytes (cerca de 72 letras sem acento)" · "A senha não pode ser só espaços" |
| `senhaAtual`         | nenhuma                                   | string não vazia, ≤ 72 bytes                                                                 | "Informe a senha atual"                                                                                                                                |

- **Por que 72 bytes:** é o limite do bcrypt (que trunca o resto em silêncio). Mesmo com argon2 o teto
  fica: mantém a troca de algoritmo possível sem invalidar senhas, e limita o custo de hash de uma
  entrada enorme. A conta é em **bytes**, não caracteres: "á" vale 2 bytes, um emoji vale 4.
- **Sem regra de composição** (letra + número, símbolo): comprimento é o que importa (NIST SP 800-63B).
- O web valida as mesmas regras antes de enviar (comodidade); a API é a autoridade.

### Códigos de erro

`ApiErrorResponse` (de `@checkpoint/shared`) ganha `code?: ApiErrorCode`. Toda resposta de erro das
rotas desta spec traz `code`. O web mostra a mensagem pelo `code` (mapa `Record<ApiErrorCode, string>`,
exaustivo por tipo), nunca comparando `message`.

| `code`                       | HTTP | Quando                                                                          | Texto no web                                           |
| ---------------------------- | ---- | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `VALIDACAO`                  | 400  | payload inválido (com `fields`)                                                 | a mensagem de cada campo                               |
| `AUTH_EMAIL_EM_USO`          | 409  | registro com e-mail já cadastrado (`fields.email`)                              | "Este e-mail já tem uma conta. Entre com a sua senha." |
| `AUTH_REGISTRO_FECHADO`      | 403  | registro com `AUTH_REGISTRATION_OPEN=false`                                     | "O cadastro de novas contas está fechado."             |
| `AUTH_CREDENCIAIS_INVALIDAS` | 401  | login com e-mail inexistente **ou** senha errada (sem `fields`)                 | "E-mail ou senha incorretos."                          |
| `AUTH_NAO_AUTENTICADO`       | 401  | rota protegida sem `Authorization`, ou com token malformado/assinatura inválida | "Entre para continuar."                                |
| `AUTH_TOKEN_EXPIRADO`        | 401  | access token válido mas vencido                                                 | — (o web renova sozinho)                               |
| `AUTH_SESSAO_ENCERRADA`      | 401  | sessão inexistente/encerrada/vencida; refresh ausente, inválido ou reusado      | "Sua sessão terminou. Entre de novo."                  |
| `AUTH_REFRESH_CONCORRENTE`   | 409  | refresh com o token **anterior** dentro da janela de 30 s                       | — (o web tenta de novo uma vez)                        |
| `AUTH_SENHA_ATUAL_INCORRETA` | 400  | troca de senha com a atual errada (`fields.senhaAtual`)                         | "Senha atual incorreta."                               |
| `AUTH_SENHA_IGUAL_ATUAL`     | 400  | nova senha igual à atual (`fields.novaSenha`)                                   | "A nova senha precisa ser diferente da atual."         |
| `AUTH_ORIGEM_INVALIDA`       | 403  | `refresh`/`logout` sem o cabeçalho `X-Checkpoint-Csrf: 1`                       | "Não foi possível completar a requisição."             |
| `LIMITE_TENTATIVAS`          | 429  | limite do throttler estourado (com `Retry-After`)                               | "Muitas tentativas. Aguarde um pouco e tente de novo." |

- **401 nunca é usado para erro de negócio de um usuário logado** (senha atual errada é 400): o
  interceptor do web trata 401 como "sessão", e o Oratio mostrou o estrago de misturar os dois.
- As mensagens de `games` (409 de duplicata etc.) continuam como estão; ganhar `code` nelas fica fora
  de escopo.

### Tokens e cookie

| Item                | Valor                                                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access token        | JWT HS256, segredo `JWT_ACCESS_SECRET`, validade **15 min**, payload `{ sub: userId, sid: sessionId, typ: 'access' }`, `iss: 'checkpoint-api'`                                                |
| Refresh token       | JWT HS256, segredo **separado** `JWT_REFRESH_SECRET`, validade **30 dias** (renovada a cada rotação), payload `{ sub, sid, typ: 'refresh', jti: <aleatório> }`                                |
| No banco            | só `sha256(refreshToken)` em hex (64 caracteres). SHA-256 e não bcrypt: o token já tem alta entropia e o bcrypt truncaria em 72 bytes, colidindo tokens do mesmo usuário (bug real do Oratio) |
| Janela de graça     | 30 s para o token anterior (corrida de abas)                                                                                                                                                  |
| Sessões por usuário | no máximo **10**; a 11ª apaga a de `ultimoUsoEm` mais antigo                                                                                                                                  |

**Onde fica cada token (Q1, decidido em 2026-09-23):**

- **Access token:** só **em memória** no web (variável de módulo). Nunca em `localStorage`,
  `sessionStorage`, IndexedDB ou cookie legível.
- **Refresh token:** cookie `checkpoint_refresh`, `HttpOnly`, `SameSite=Lax`, `Path=/api/auth`,
  `Max-Age=2592000` (30 dias), `Secure` quando `NODE_ENV=production` (em dev, `http://localhost` não
  tem HTTPS). O `Path` faz o cookie só ir para as rotas de auth.
- **Anti-CSRF:** `refresh` e `logout` (as únicas rotas que leem o cookie) exigem o cabeçalho
  `X-Checkpoint-Csrf: 1`, sem o qual respondem 403 `AUTH_ORIGEM_INVALIDA`. Um cabeçalho próprio força
  _preflight_ de CORS, que só a origem permitida passa. Isso importa mesmo com `SameSite=Lax`: em dev
  outros apps em `localhost` (outras portas) são **mesmo site** e mandariam o cookie.
- **CORS:** `CORS_ORIGIN=*` passa a ser **recusado no boot** (hoje `*` vira "reflete qualquer origem",
  o que com `credentials: true` e cookie de sessão deixaria qualquer site renovar a sessão). O padrão
  `'*'` de `env.validation.ts` é removido; a variável fica obrigatória.
- Em dev, `localhost:5173 → localhost:3333` é **mesmo site** (porta não conta para _site_), então o
  cookie `Lax` funciona. O web envia `withCredentials: true` **só** nas chamadas de auth
  (`registro`, `login`, `refresh`, `logout`), que são as que recebem ou mandam o cookie.
- **⚠️ RESTRIÇÃO DE DEPLOY:** web e API **precisam ficar no mesmo site**: subdomínios do mesmo domínio
  registrável (ex.: `app.dominio.com` + `api.dominio.com`) **ou** o host do front servindo `/api` por
  proxy (mesma origem). Com web e API em domínios diferentes (ex.: `*.vercel.app` + `*.onrender.com`,
  que estão na Public Suffix List, então cada subdomínio é um site à parte), o navegador **não envia** o
  cookie `SameSite=Lax` na chamada de `refresh`, e **a sessão se perde a cada recarga** da página (o
  access token só vive em memória). Trocar para `SameSite=None` não é saída: o cookie vira de terceiro
  e é bloqueado pelo Safari e por configurações de privacidade. Quem escolher a hospedagem (spec
  futura de deploy) tem de respeitar isto.

### API (prefixo `/api`, módulo `apps/api/src/modules/auth/`, tag Swagger `auth`)

Todas com DTO `class-validator` (`whitelist` + `forbidNonWhitelisted`: campo extra → 400). Nenhuma
resposta devolve `senhaHash`, `tokenHash`, `hashAnterior` ou o refresh token no corpo: o `select` do
Prisma é uma **lista branca** (`USUARIO_PUBLICO_SELECT = { id, nome, email, criadoEm }`), nunca o
registro inteiro.

**`POST /api/auth/registro`** — `@Public()`, limite **por hora por IP configurável**: padrão **3**
(constante no código), sobrescrito pela env **opcional** `AUTH_REGISTRATION_LIMIT_PER_HOUR` (ver
"Notas de ambiente"). A env existe para a verificação manual, que cria várias contas sintéticas.
Corpo `RegistroRequest`: `{ nome, email, senha }`.

- **201** + `AuthResponse` + `Set-Cookie: checkpoint_refresh=…`.
- **400** `VALIDACAO` · **409** `AUTH_EMAIL_EM_USO` (também quando a corrida bate no `@unique`: o
  `P2002` vira 409, nunca 500) · **403** `AUTH_REGISTRO_FECHADO` (checado antes de validar a unicidade)
  · **429**.

**`POST /api/auth/login`** — `@Public()`, limite **5 por minuto por IP**.
Corpo `LoginRequest`: `{ email, senha }` (senha só exige string não vazia e ≤ 72 bytes; a regra de
tamanho mínimo **não** se aplica ao login).

- **200** + `AuthResponse` + `Set-Cookie`.
- **401** `AUTH_CREDENCIAIS_INVALIDAS`, corpo idêntico para e-mail inexistente e senha errada. Com
  e-mail inexistente o service **ainda verifica a senha contra um hash fixo** (para o tempo de resposta
  não denunciar se o e-mail existe).
- **400** `VALIDACAO` · **429**.
- Efeitos: cria a `RefreshSession` (rótulo do dispositivo a partir do `User-Agent`, ver "Modelo de
  dados"); apaga as sessões **vencidas** desse usuário; se passar de 10, apaga a mais antiga.

**`POST /api/auth/refresh`** — `@Public()`, exige `X-Checkpoint-Csrf: 1`, limite **30 por minuto por
IP**. Sem corpo (ou `{}`); lê o cookie.

| Situação                                                             | Resposta                                                                                                                                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| token = `tokenHash` atual, sessão válida                             | **200** + `AuthResponse` + cookie **novo**; mesma linha: `hashAnterior ← tokenHash`, `tokenHash ← novo`, `rotacionadoEm`, `ultimoUsoEm` e `expiraEm` (+30 dias) atualizados |
| token = `hashAnterior` e `rotacionadoEm` há ≤ 30 s                   | **409** `AUTH_REFRESH_CONCORRENTE`; nada muda (o cookie novo, já no navegador, segue válido)                                                                                |
| token = `hashAnterior` há > 30 s, ou não bate com nenhum dos dois    | **401** `AUTH_SESSAO_ENCERRADA`; **a sessão é apagada** (reuso); cookie limpo; `warn` no log com o `sessionId` (nunca o token)                                              |
| sem cookie, assinatura inválida, vencido, sessão inexistente/vencida | **401** `AUTH_SESSAO_ENCERRADA`; cookie limpo                                                                                                                               |
| sem o cabeçalho anti-CSRF                                            | **403** `AUTH_ORIGEM_INVALIDA`                                                                                                                                              |

- A rotação é um `updateMany({ where: { id: sid, tokenHash: hashApresentado } })`: se outra request
  rotacionou no meio, o `count` é 0 e a resposta é o 409 da corrida, não uma segunda rotação.

**`POST /api/auth/logout`** — `@Public()` (funciona com access vencido), exige `X-Checkpoint-Csrf: 1`.

- **204** sempre (idempotente): se o cookie identifica uma sessão, ela é apagada; o cookie é limpo
  (`Max-Age=0`) em qualquer caso.

**`GET /api/auth/me`** — protegida.

- **200** + `Usuario`. **401** conforme o guard.

**`PUT /api/auth/senha`** — protegida, limite **5 a cada 15 min por IP** (etapa 5).
Corpo `TrocarSenhaRequest`: `{ senhaAtual, novaSenha }`.

- **204**. Grava o hash novo e apaga **todas as `RefreshSession` do usuário exceto a do `sid` atual**.
- **400** `VALIDACAO` (`fields.novaSenha`/`fields.senhaAtual`) · **400** `AUTH_SENHA_ATUAL_INCORRETA`
  · **400** `AUTH_SENHA_IGUAL_ATUAL` (checado depois de confirmar a atual) · **401** · **429**.

**Guard global** (`APP_GUARD` em `app.module.ts`: `modules/auth/access-token.guard.ts`)

- Rota com `@Public()` (`common/decorators/public.decorator.ts`) passa direto.
- Senão: lê `Authorization: Bearer <token>`; ausente/malformado/assinatura inválida/`typ` ≠ `access` →
  401 `AUTH_NAO_AUTENTICADO`; vencido → 401 `AUTH_TOKEN_EXPIRADO`; sessão `sid` inexistente, vencida
  ou de outro `sub` → 401 `AUTH_SESSAO_ENCERRADA`. Uma leitura por chave primária por request (custo
  aceito em troca do encerramento imediato).
- Anexa `{ id: sub, sessionId: sid }` à request; `@CurrentUser()`
  (`common/decorators/current-user.decorator.ts`) o entrega ao controller.
- Públicas: `GET /api/health`, `registro`, `login`, `refresh`, `logout` e, **só nas etapas 1 e 2**, o
  `GamesController` inteiro. O Swagger (`/api/docs`) não é controller e segue aberto; ganha
  `addBearerAuth()`.

**Limite de tentativas** (`@nestjs/throttler`, escolhido em Q2): aplicado **só** no `AuthController`
(`@UseGuards(ThrottlerGuard)` + `@Throttle` por rota), rastreado por IP, armazenamento em memória
(uma instância). 429 no formato `ApiErrorResponse` com `code: 'LIMITE_TENTATIVAS'` e `Retry-After`.
Só o limite do registro é configurável por env; os demais são constantes. Sem `trust proxy` configurado: atrás de um proxy todos os clientes teriam o mesmo IP, o que é assunto
da spec de deploy.

**Log:** nenhuma rota de auth loga corpo de request, senha, token, cookie ou cabeçalho `Authorization`
(`RULES.md` §8).

### `games` depois da etapa 3

- `GamesController` perde o `@Public()`; todo método recebe o `userId` de `@CurrentUser()`.
- `GamesService`: `list` filtra `where: { userId }`; `create` grava `userId`; `update`, `remove`,
  `putCover`, `removeCover` buscam `where: { id, userId }` → 404 `"Jogo não encontrado"` se não
  achar (inclusive jogo de outro usuário); a checagem de duplicata e o `P2002` usam o novo `@@unique`
  com `userId`.
- `userId` **não** aparece no `Game` da resposta e **não** é aceito no corpo (`POST`/`PATCH` com
  `userId` → 400, campo desconhecido).
- **Capas novas** vão para `<userId>/<gameId>/<uuid>.<ext>` no bucket (36+1+36+1+36+5 = 115, cabe no
  `capaPath VarChar(120)`). As capas antigas (`<gameId>/<uuid>.<ext>`) continuam onde estão: o banco
  guarda o caminho inteiro, então elas seguem funcionando sem migração de objeto. O prefixo por usuário
  facilita a limpeza na exclusão de conta (`perfil`).

### Web (`apps/web`)

**Estrutura**

- `features/auth/`: `api/auth-api.ts` (as 6 chamadas), `lib/auth-errors.ts` (`Record<ApiErrorCode,
string>`), `lib/safe-redirect.ts`, `session/AuthProvider.tsx` + `useAuth()`, `components/`
  (`LoginForm`, `RegistroForm`, `TrocarSenhaForm`, `CampoSenha`).
- `shared/lib/auth-token.ts`: o access token em memória (`getAccessToken`/`setAccessToken`), lido
  pelo interceptor.
- `pages/LoginPage`, `pages/RegistroPage`, `pages/PerfilPage` (mínima), `pages/TrocarSenhaPage`.

**Estado de sessão** (`useAuth()`): `status: 'carregando' | 'autenticado' | 'visitante' |
'desconectado'`, `usuario?: Usuario`.

- **Boot:** `POST /api/auth/refresh` uma vez (promessa única, mesmo com `StrictMode`):
  - 200 → `autenticado`;
  - 409 `AUTH_REFRESH_CONCORRENTE` → espera 500 ms e tenta **uma** vez mais;
  - 401 → `visitante`;
  - sem resposta (rede/servidor) → `desconectado`; quando a conectividade (`pwa-e-mobile` etapa 2) volta
    a `online`, refaz o refresh sozinho.
- Chave local `checkpoint:sessao:ativa` (booleano, escopo `usuario`): `true` ao entrar; permite
  distinguir "visitante" (nunca entrou neste navegador, ou saiu) de "sessão terminou" (tinha sessão e o
  refresh deu 401) para mostrar ou não a mensagem.

**Interceptor do `apiClient`** (`shared/lib/api-client.ts`, a mesma instância; nenhum `axios.create`
novo)

- Request: se há access token em memória e a rota não é `registro`/`login`/`refresh`/`logout`, põe
  `Authorization: Bearer …`.
- Response 401 numa rota que não é de auth:
  - `AUTH_TOKEN_EXPIRADO` (e a request não é uma repetição) → **renovação única**: se já existe um
    refresh em andamento, espera por ele (fila); senão, dispara um. Sucesso → repete a request original
    **uma** vez com o token novo. Refresh 401 → **logout local**. Refresh sem resposta (rede) → rejeita
    a request original como erro de rede, **sem deslogar**.
  - `AUTH_SESSAO_ENCERRADA` → logout local direto (não adianta renovar).
  - 401 com o estado `visitante` → só rejeita (visitante não "desloga").
- **Logout local:** access token = `null`; `queryClient.clear()`; `storage.clearScope('usuario')`;
  navega para `/login?motivo=sessao&voltar=<caminho atual>` (o `motivo` só quando havia sessão).

**Rotas**

| Rota            | Layout                   | Acesso                                                |
| --------------- | ------------------------ | ----------------------------------------------------- |
| `/login`        | `AuthLayout` (sem barra) | visitante; logado → `voltar` ou `/`                   |
| `/registro`     | `AuthLayout`             | visitante; logado → `/`                               |
| `/`             | `AppLayout`              | `RequireAuth`                                         |
| `/perfil`       | `AppLayout`              | `RequireAuth` (item "Perfil" entra na barra inferior) |
| `/perfil/senha` | `AppLayout`              | `RequireAuth` (etapa 5)                               |
| `/status`       | `AppLayout`              | público (diagnóstico)                                 |

- `RequireAuth` (rota de layout): `carregando` → tela de carregamento (logo com brilho, sem conteúdo);
  `autenticado` → `<Outlet/>`; `visitante` → `<Navigate to="/login?voltar=…" replace/>`;
  `desconectado` → o layout com "Sem conexão. Seu catálogo aparece quando a conexão voltar." (sem
  redirecionar).
- **`?voltar=` seguro** (`safeRedirect(valor): string`): aceito só se, depois de decodificado, começa
  com `/`, o segundo caractere não é `/` nem `\`, não tem caractere de controle, tem até 512
  caracteres, resolve para a **mesma origem** (`new URL(valor, location.origin).origin`) e não aponta
  para `/login` ou `/registro`. Qualquer outro valor → `/`.

**`/login`**

- Campos: E-mail (`type="email"`, `autocomplete="email"`, `inputmode="email"`,
  `autocapitalize="off"`, `spellcheck="false"`), Senha (`type="password"`,
  `autocomplete="current-password"`) com botão "mostrar senha" (44 × 44, `aria-pressed`,
  `aria-label="Mostrar senha"`). Botão **Entrar**. Link "Criar conta" → `/registro`.
- `?motivo=sessao` → aviso no topo do cartão: "Sua sessão terminou. Entre de novo."
- Erro → mensagem geral do `code` acima do botão (401 não tem `fields`); o e-mail continua, a senha é
  limpa, o foco volta para a senha.
- Sucesso → `queryClient.clear()`, token em memória, `sessao:ativa = true`, navega para
  `safeRedirect(voltar)`.

**`/registro`**

- Campos: Nome (`autocomplete="name"`), E-mail, Senha (`autocomplete="new-password"`, com "mostrar
  senha" e a dica "Mínimo de 8 caracteres"), **Confirmar senha** (só no web; diferente → "As senhas não
  coincidem", sem request). Botão **Criar conta**. Link "Já tenho conta" → `/login`.
- Texto fixo acima do botão, `texto-suave`: "Seu e-mail serve só para entrar: ele não é verificado e
  nenhum e-mail é enviado. Ainda não existe recuperação de senha — guarde a sua."
- Confirmar senha existe **porque não há recuperação**: um erro de digitação no cadastro deixaria a conta
  inacessível.
- Erros por campo pelo `fields`; `AUTH_REGISTRO_FECHADO` e `LIMITE_TENTATIVAS` como mensagem geral.

**`/perfil` (mínima, etapa 2; a spec `perfil` a expande)**

- Nome; e-mail com a legenda "(não verificado — usado só para entrar)"; link "Trocar senha" (ativo a
  partir da etapa 5); botão **Sair**.
- **Sair:** `POST /api/auth/logout` → logout local → `/login` (sem `motivo`). **Sem conexão**, o
  logout **não** acontece: mensagem "Sem conexão. Para sair, conecte-se." (o cookie `HttpOnly` só o
  servidor apaga; sair "localmente" deixaria a sessão voltar no próximo carregamento).
- Várias abas: `BroadcastChannel('checkpoint-auth')` avisa as outras abas de um logout, e elas fazem o
  logout local. Sem `BroadcastChannel`, a outra aba descobre na próxima request (401).

**`/perfil/senha` (etapa 5)**

- Campos: Senha atual (`current-password`), Nova senha (`new-password`), Confirmar nova senha. Botão
  **Trocar senha**.
- Sucesso → volta para `/perfil` com o aviso "Senha alterada. As outras sessões foram encerradas."
- Erros pelo `code`/`fields`.

**Visual:** mesmos tokens Neon arcade. Cartão central em `painel` com borda `borda`, até 420 px de
largura, logo "CHECKPOINT" acima; botão principal em `magenta` com texto `fundo`; campos como os do
formulário de jogo (contorno `borda-controle`, erro em `erro` com o tremor desligado por
`prefers-reduced-motion`); tudo ≥ 44 px de altura e fonte ≥ 16 px nos campos (`pwa-e-mobile`).

## Modelo de dados

### Models novos (etapa 1) — **aditivo**

```prisma
model User {
  id           String   @id @default(uuid())
  nome         String   @db.VarChar(60)
  // Sempre gravado normalizado (trim + minúsculas). É só identificador de login: NÃO é verificado.
  email        String   @unique @db.VarChar(254)
  // Hash no formato autodescritivo do algoritmo (ex.: PHC do argon2), nunca a senha.
  senhaHash    String   @db.VarChar(255)
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  sessoes RefreshSession[]
  games   Game[]          // relação declarada na etapa 3
}

model RefreshSession {
  id            String    @id @default(uuid())          // é o `sid` dos tokens
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash     String    @db.Char(64)                  // sha256 hex do refresh atual
  hashAnterior  String?   @db.Char(64)                  // do refresh anterior (janela de graça / reuso)
  rotacionadoEm DateTime?
  // Rótulo legível derivado do User-Agent ("Chrome · Android"); sem IP e sem localização.
  dispositivo   String    @db.VarChar(80)
  criadoEm      DateTime  @default(now())
  ultimoUsoEm   DateTime  @default(now())
  expiraEm      DateTime

  @@index([userId])
}
```

- **Sem IP, sem geolocalização** (o Oratio consultava `ip-api.com` por HTTP: vazamento de dado para
  terceiro sem TLS). O rótulo do dispositivo vem de uma função pura (`session-device.ts`) que reconhece
  navegador (Chrome, Edge, Firefox, Safari, Samsung Internet, outro) e sistema (Android, iOS, Windows,
  macOS, Linux, outro), com teste.
- **Aditivo para o futuro e-mail (Brevo):** a verificação de e-mail entra depois como
  `emailVerificadoEm DateTime?` (**opcional**, sem valor padrão: contas antigas ficam "não
  verificadas"), e a recuperação de senha como uma tabela própria de tokens de uso único. Nenhuma das
  duas exige mudança destrutiva. **Não** se cria nenhum desses campos agora.

### `Game.userId` — **DESTRUTIVO, aprovação pendente** (`RULES.md` §3)

**Por que é destrutivo:** (a) `@@unique([tituloNormalizado, plataformaNormalizada])` é trocado por
`@@unique([userId, tituloNormalizado, plataformaNormalizada])` ("`@@unique` alterado"); (b) `userId`
passa a ser **obrigatório numa tabela que já tem linhas** (os jogos cadastrados hoje no Supabase, sem
dono). Uma migração só não resolve: no momento da migração não existe usuário para ser o dono, e criar
um usuário dentro da migração poria e-mail e hash de senha reais no repositório (`RULES.md` §8).

**Estratégia: duas fases, com um passo humano no meio.**

| Passo                          | O quê                                                                                                       | Classificação                                                                                                                 | Reversível?                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Migração A1** (etapa 1)      | cria `User` e `RefreshSession`                                                                              | aditiva                                                                                                                       | sim (drop das tabelas novas) |
| **Migração A3** (etapa 3)      | `Game.userId String?` + FK para `User` com `onDelete: Cascade`; troca o `@@unique` pelo que inclui `userId` | **destrutiva** (`@@unique` alterado), sem perda de dado: o índice novo é **menos** restritivo, não falha com as linhas atuais | sim                          |
| **Passo humano** (entre 3 e 4) | decidir o destino dos jogos sem dono (Q5) e executar o SQL correspondente no banco                          | dado, não schema                                                                                                              | depende da opção             |
| **Migração A4** (etapa 4)      | `Game.userId` passa a `NOT NULL`                                                                            | **destrutiva** (obrigatório em tabela com linhas)                                                                             | sim (volta a nulável)        |

- **Entre A3 e A4**, jogos com `userId NULL` ficam **invisíveis** pela API (toda query filtra por
  `userId`), mas continuam no banco, intactos, com as capas. Nada é apagado por migração.
- **A4 começa com uma trava escrita à mão** (como os `CHECK` do catálogo), para falhar com mensagem
  clara em vez do erro genérico do `SET NOT NULL`:

  ```sql
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "Game" WHERE "userId" IS NULL) THEN
      RAISE EXCEPTION 'Existem jogos sem dono (userId NULL). Execute o passo humano da spec autenticacao (Q5) antes desta migration.';
    END IF;
  END $$;
  ```

- **SQL do passo humano** (executado pelo humano no editor SQL do Supabase ou com
  `npx prisma db execute`, **nunca commitado**, porque leva um e-mail real):
  - Opção recomendada (atribuir ao dono), depois de criar a própria conta pelo `/registro`:
    `UPDATE "Game" SET "userId" = (SELECT "id" FROM "User" WHERE "email" = '<seu e-mail normalizado>') WHERE "userId" IS NULL;`
    Confirmar antes com `SELECT count(*) FROM "Game" WHERE "userId" IS NULL;` e depois esperar `0`.
  - Opção alternativa (descartar): `DELETE FROM "Game" WHERE "userId" IS NULL;` **mais** a remoção das
    capas desses jogos no bucket (listar os `capaPath` antes do `DELETE`), senão os objetos ficam
    órfãos.
- `onDelete: Cascade` em `Game.user`: excluir um usuário apaga os jogos dele no banco (as capas no
  bucket são responsabilidade de quem exclui; ver spec `perfil`).
- O `@@unique` com `userId` na frente também serve de índice para `where: { userId }`, então **não** se
  cria `@@index([userId])` separado em `Game`. `@@index([status])` e os dois `CHECK` continuam.
- **Antes de cada `db:migrate`:** confirmar qual banco é (`DATABASE_URL`/`DIRECT_URL`; é o Supabase
  compartilhado), rodar `/db-change` para classificar, e ter um _backup_ (Supabase → Database →
  Backups, ou `pg_dump`) antes de A3 e de A4.
- **Sem drift:** depois de cada migração, um segundo `npm run db:migrate` não gera migração nova.

## Contrato compartilhado

`packages/shared/src/auth.ts` (reexportado pelo `index.ts`), código puro:

```ts
export const USER_NAME_MAX_LENGTH = 60;
export const USER_EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8; // caracteres (code points)
export const PASSWORD_MAX_BYTES = 72; // bytes em UTF-8

/** trim + minúsculas. Usado pela API (antes de validar e gravar) e pelo web. */
export function normalizeEmail(email: string): string;
/** Tamanho em bytes UTF-8, calculado pelos code points (sem TextEncoder/Buffer: o shared é agnóstico). */
export function utf8ByteLength(texto: string): number;
/** Regra da senha nova: null se ok. */
export function passwordProblem(senha: string): 'vazia' | 'so-espacos' | 'curta' | 'longa' | null;

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  criadoEm: string;
}
export interface RegistroRequest {
  nome: string;
  email: string;
  senha: string;
}
export interface LoginRequest {
  email: string;
  senha: string;
}
export interface AuthResponse {
  accessToken: string;
  usuario: Usuario;
}
export interface TrocarSenhaRequest {
  senhaAtual: string;
  novaSenha: string;
}

export const API_ERROR_CODES = [
  'VALIDACAO',
  'AUTH_EMAIL_EM_USO',
  'AUTH_REGISTRO_FECHADO',
  'AUTH_CREDENCIAIS_INVALIDAS',
  'AUTH_NAO_AUTENTICADO',
  'AUTH_TOKEN_EXPIRADO',
  'AUTH_SESSAO_ENCERRADA',
  'AUTH_REFRESH_CONCORRENTE',
  'AUTH_SENHA_ATUAL_INCORRETA',
  'AUTH_SENHA_IGUAL_ATUAL',
  'AUTH_ORIGEM_INVALIDA',
  'LIMITE_TENTATIVAS',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const CSRF_HEADER = 'X-Checkpoint-Csrf';
```

- Em `games.ts`: `ApiErrorResponse` ganha `code?: ApiErrorCode`; `ApiErrorField` ganha `'nome' |
'email' | 'senha' | 'senhaAtual' | 'novaSenha'` (ou os erros de auth usam um tipo de campo próprio;
  decisão da implementação, desde que o web tenha um tipo só para `fields`).
- **Não** entram: `userId` em `Game`, nomes de cookie, TTLs, segredos (são detalhe da API).

## Critérios de aceite (testáveis, em BDD)

`curl` contra `http://localhost:3333/api`, com _cookie jar_ para simular um navegador:
`J="-c jar.txt -b jar.txt"` e `CSRF="-H X-Checkpoint-Csrf:1"`. Passos de UI contra
`http://localhost:5173`. E-mails sempre sintéticos (`ana@exemplo.com`, `bia@exemplo.com`,
`RULES.md` §8).

### Etapa 1 — API de auth

- [ ] **CA-01** — **Dado** registro aberto e nenhum usuário, **quando** `POST /auth/registro` com `{"nome":" Ana Teste ","email":"  Ana@Exemplo.COM ","senha":"segredo-forte"}`, **então** 201 com `accessToken` e `usuario` = `{ id (UUID), nome: "Ana Teste", email: "ana@exemplo.com", criadoEm }`, e o cabeçalho `Set-Cookie` tem `checkpoint_refresh=…; Max-Age=2592000; Path=/api/auth; HttpOnly; SameSite=Lax` (sem `Secure` em dev).
- [ ] **CA-02** — **Dado** a conta do CA-01, **quando** registro de novo com `"email":"ANA@exemplo.com "`, **então** 409, `code: "AUTH_EMAIL_EM_USO"` e `fields.email` presente, e continua existindo um só usuário.
- [ ] **CA-03** — **Dado** `POST /auth/registro` com (a) `nome` vazio ou de 61 caracteres, (b) `email` `"ana"`, (c) `senha` de 7 caracteres, (d) `senha` de 37 "á" (74 bytes), (e) `senha` de 8 espaços, (f) um campo extra `"admin":true`, **quando** enviado, **então** 400 com `code: "VALIDACAO"` e o `fields` do campo certo em (a) a (e), e 400 em (f); **e** `senha` de 36 "á" (72 bytes) é aceita (201).
- [ ] **CA-04** — **Dado** `AUTH_REGISTRATION_OPEN=false`, **quando** `POST /auth/registro` válido, **então** 403 `AUTH_REGISTRO_FECHADO` e nenhum usuário é criado; **e** o login de uma conta existente continua funcionando.
- [ ] **CA-05** — **Dado** a conta do CA-01, **quando** `POST /auth/login` com `{"email":" ANA@exemplo.com","senha":"segredo-forte"}`, **então** 200 com `accessToken`, `usuario` e o cookie; **e** no Prisma Studio há uma `RefreshSession` nova desse usuário com `tokenHash` de 64 caracteres hexadecimais, **diferente** do valor do cookie, e `dispositivo` preenchido (ex.: `"curl"` → `"Outro · Outro"`).
- [ ] **CA-06** — **Dado** a conta do CA-01, **quando** faço login com a senha errada e com `nao-existe@exemplo.com`, **então** as duas respostas são 401 com o **mesmo corpo** `{"statusCode":401,"code":"AUTH_CREDENCIAIS_INVALIDAS","message":"E-mail ou senha incorretos."}`, sem `fields`.
- [ ] **CA-07** — **Dado** um `accessToken` válido, **quando** `GET /auth/me` com `Authorization: Bearer <token>`, **então** 200 com o `Usuario`; **sem** o cabeçalho, ou com o token alterado num caractere, **então** 401 `AUTH_NAO_AUTENTICADO`; **e** usando o **refresh** token (valor do cookie) como Bearer, **então** 401 `AUTH_NAO_AUTENTICADO` (segredos separados).
- [ ] **CA-08** — **Dado** um access token vencido (teste unitário com relógio falso; manual: esperar 16 min), **quando** `GET /auth/me`, **então** 401 `AUTH_TOKEN_EXPIRADO`.
- [ ] **CA-09** — **Dado** o jar do login, **quando** `curl $J $CSRF -X POST /auth/refresh`, **então** 200 com `accessToken` novo e um `Set-Cookie` com valor **diferente** do anterior; **e** o número de `RefreshSession` do usuário não muda (mesma linha, `ultimoUsoEm` e `expiraEm` avançaram).
- [ ] **CA-10** — **Dado** que guardei o cookie **antes** do CA-09, **quando** faço refresh com ele em até 30 s depois da rotação, **então** 409 `AUTH_REFRESH_CONCORRENTE`, a sessão continua e o cookie **novo** ainda renova (200).
- [ ] **CA-11** — **Dado** o cookie anterior e mais de 30 s desde a rotação, **quando** faço refresh com ele, **então** 401 `AUTH_SESSAO_ENCERRADA`, `Set-Cookie` limpando `checkpoint_refresh`, a linha da sessão some do banco, e o cookie **novo** também passa a dar 401 (reuso encerra a sessão); **e** o log da API tem um aviso com o id da sessão e sem nenhum token.
- [ ] **CA-12** — **Dado** `POST /auth/refresh` **sem** cookie, **então** 401 `AUTH_SESSAO_ENCERRADA`; **dado** o cookie válido mas **sem** o cabeçalho `X-Checkpoint-Csrf`, **então** 403 `AUTH_ORIGEM_INVALIDA` e a sessão não é rotacionada.
- [ ] **CA-13** — **Dado** uma sessão logada, **quando** `POST /auth/logout` com o jar e o cabeçalho, **então** 204, `Set-Cookie` com `Max-Age=0`, a sessão some do banco, e o access token dela passa a dar 401 `AUTH_SESSAO_ENCERRADA` **na hora** em `GET /auth/me`; **quando** repito o logout, **então** 204.
- [ ] **CA-14** — **Dado** dois logins da mesma conta em jars diferentes (A e B), **quando** faço logout em A, **então** B continua: `me` 200 e `refresh` 200.
- [ ] **CA-15** — **Dado** 10 sessões ativas da mesma conta, **quando** faço o 11º login, **então** continuam 10 sessões e a de `ultimoUsoEm` mais antigo deixou de renovar (401).
- [ ] **CA-16** — **Dado** o mesmo IP, **quando** faço 6 logins em menos de 1 minuto, **então** o 6º responde 429 com `code: "LIMITE_TENTATIVAS"` e cabeçalho `Retry-After`; **e**, com `AUTH_REGISTRATION_LIMIT_PER_HOUR=2`, 3 registros seguidos → o 3º é 429. (O padrão de 3 por hora sem a env é verificado por teste unitário, não à mão.)
- [ ] **CA-17** — **Dado** a etapa 1 implantada, **quando** `GET /api/health` e `GET /api/games` sem token, **então** ambos 200 (games ainda público até a etapa 3); **e** `GET /api/auth/me` sem token é 401.
- [ ] **CA-18** — **Dado** `apps/api/.env` sem `JWT_ACCESS_SECRET`, sem `JWT_REFRESH_SECRET` ou sem `AUTH_REGISTRATION_OPEN`; ou com um segredo de menos de 32 caracteres; ou com os dois segredos iguais; ou com `CORS_ORIGIN=*`, **quando** a API sobe, **então** ela falha listando o problema; **e** `apps/api/.env.example` lista as três variáveis novas **sem valor real**.
- [ ] **CA-19** — **Dado** uma request com `Origin: http://localhost:5173` para `/auth/refresh`, **então** a resposta traz `Access-Control-Allow-Origin: http://localhost:5173` e `Access-Control-Allow-Credentials: true`; **dado** `Origin: http://malicioso.exemplo`, **então** a resposta não traz `Access-Control-Allow-Origin`.
- [ ] **CA-20** — **Dado** as respostas dos CA-01 a CA-15, **quando** procuro `senhaHash`, `tokenHash`, `hashAnterior` e o valor do refresh token nos **corpos**, **então** não há ocorrência; **e** o console da API durante esses passos não contém nenhuma senha, token ou cookie.
- [ ] **CA-21** — **Dado** a migração A1, **quando** aplicada, **então** ela só cria `User` e `RefreshSession` (nenhuma tabela existente muda) e um segundo `npm run db:migrate` não gera migração nova.
- [ ] **CA-22** — **Dado** `/api/docs`, **quando** abro, **então** vejo a tag `auth` com as rotas e o botão "Authorize" (Bearer).

### Etapa 2 — web

- [ ] **CA-23** — **Dado** um navegador sem cookie, **quando** abro `/`, **então** vou para `/login?voltar=%2F` **sem** a mensagem "Sua sessão terminou".
- [ ] **CA-24** — **Dado** `/registro`, **quando** olho a tela, **então** vejo Nome, E-mail, Senha, Confirmar senha, o texto sobre e-mail não verificado e falta de recuperação, e o link "Já tenho conta"; **quando** as senhas não coincidem, **então** aparece "As senhas não coincidem" e nenhuma request sai; **quando** preencho certo, **então** entro direto em `/`.
- [ ] **CA-25** — **Dado** `/login`, **quando** erro a senha, **então** aparece "E-mail ou senha incorretos.", o e-mail continua preenchido, a senha é limpa e o foco vai para ela.
- [ ] **CA-26** — **Dado** que estou logado, **quando** recarrego `/`, **então** continuo logado (Network: `POST /api/auth/refresh` 200 antes de `GET /api/games`).
- [ ] **CA-27** — **Dado** que estou logado, **quando** olho DevTools → Application, **então** Local Storage, Session Storage e IndexedDB não têm nenhum token; o cookie `checkpoint_refresh` aparece com HttpOnly marcado; e `document.cookie` no console não o mostra.
- [ ] **CA-28** — **Dado** três requests paralelas recebendo 401 `AUTH_TOKEN_EXPIRADO` (teste unitário do interceptor), **quando** o interceptor reage, **então** sai **exatamente um** `POST /auth/refresh` e as três são repetidas uma vez com o token novo.
- [ ] **CA-29** — **Dado** que estou logado, **quando** apago a minha `RefreshSession` no Prisma Studio e clico num filtro, **então** vou para `/login?motivo=sessao&voltar=…` com "Sua sessão terminou. Entre de novo."
- [ ] **CA-30** — **Dado** que estou logado, **quando** paro a API e recarrego a página, **então** vejo o app com "Sem conexão. Seu catálogo aparece quando a conexão voltar." (não a tela de login); **quando** subo a API, **então** o catálogo carrega sozinho, ainda logado.
- [ ] **CA-31** — **Dado** `/login?voltar=/perfil`, **quando** entro, **então** vou para `/perfil`; **dado** `voltar` = `//malicioso.exemplo`, `https://malicioso.exemplo`, `/\malicioso.exemplo` ou `/login`, **então** vou para `/`.
- [ ] **CA-32** — **Dado** que estou logado, **quando** abro `/login` ou `/registro`, **então** vou para `/`.
- [ ] **CA-33** — **Dado** que estou logado em `/perfil`, **quando** clico **Sair**, **então** vou para `/login` sem mensagem, o cookie some, `checkpoint:sessao:ativa` some, as chaves `checkpoint:instalacao:*` continuam; **e** "voltar" do navegador para `/` me manda de novo ao login.
- [ ] **CA-34** — **Dado** que estou logado e o DevTools em "Offline", **quando** clico **Sair**, **então** vejo "Sem conexão. Para sair, conecte-se." e continuo logado.
- [ ] **CA-35** — **Dado** duas abas logadas, **quando** saio numa, **então** a outra vai para `/login` (imediatamente, via `BroadcastChannel`).
- [ ] **CA-36** — **Dado** `/perfil`, **quando** abro, **então** vejo o nome, o e-mail com "(não verificado — usado só para entrar)" e **Sair**; **e** a barra inferior (360 px) tem o item "Perfil".
- [ ] **CA-37** — **Dado** `/login` e `/registro` em 360×640, **quando** inspeciono, **então** os campos têm os `type`/`autocomplete` da spec, fonte ≥ 16 px, o botão "mostrar senha" tem 44 × 44 e `aria-pressed`, e Enter no último campo envia.
- [ ] **CA-38** — **Dado** o código de `apps/web/src/features/auth`, **quando** procuro comparação com o texto de `message` da API, **então** não há: as mensagens saem do `Record<ApiErrorCode, string>`; **e** remover um código do mapa quebra o `typecheck`.
- [ ] **CA-39** — **Dado** 6 tentativas de login seguidas, **quando** a 6ª responde 429, **então** a tela mostra "Muitas tentativas. Aguarde um pouco e tente de novo."

### Etapa 3 — dono dos jogos, fase 1

- [ ] **CA-40** — **Dado** o banco com N jogos sem dono, **quando** a migração A3 é aplicada, **então** `SELECT count(*) FROM "Game"` continua N, todos com `"userId" IS NULL`, existe a FK para `User` com `ON DELETE CASCADE`, o índice único é `(userId, tituloNormalizado, plataformaNormalizada)`, os dois `CHECK` continuam, e um segundo `db:migrate` não gera migração nova.
- [ ] **CA-41** — **Dado** a etapa 3, **quando** `GET /api/games` sem token, **então** 401 `AUTH_NAO_AUTENTICADO`.
- [ ] **CA-42** — **Dado** Ana com 2 jogos e Bia com 1, **quando** cada uma faz `GET /api/games`, **então** cada uma vê só os seus; **e** `PATCH`, `DELETE`, `PUT /capa` e `DELETE /capa` da Bia no id de um jogo da Ana → 404 `"Jogo não encontrado"`, e o jogo da Ana não muda.
- [ ] **CA-43** — **Dado** Ana com "Celeste / PC", **quando** Bia cria "celeste / pc", **então** 201; **quando** Ana cria "CELESTE / PC", **então** 409 `"Já existe esse jogo nesta plataforma"`.
- [ ] **CA-44** — **Dado** jogos sem dono no banco (da fase anterior), **quando** Ana e Bia listam, **então** nenhum deles aparece.
- [ ] **CA-45** — **Dado** Ana logada, **quando** envia uma capa nova, **então** a `capaUrl` contém `/capas/<idDaAna>/<gameId>/`; **e** uma capa enviada antes da etapa 3 (`/capas/<gameId>/…`) continua aparecendo depois da atribuição do jogo.
- [ ] **CA-46** — **Dado** `POST /api/games` com `"userId":"<outro id>"`, **então** 400; **e** nenhum response de `games` contém `userId`.
- [ ] **CA-47** — **Dado** o web logado como Ana com a lista carregada, **quando** saio e entro como Bia na mesma aba, **então** a lista da Ana **nunca** aparece, nem por um instante (o cache foi limpo; a primeira pintura é o estado de carregamento).

### Etapa 4 — dono dos jogos, fase 2

- [ ] **CA-48** — **Dado** um banco descartável com um jogo `userId NULL`, **quando** aplico a migração A4, **então** ela falha com a mensagem "Existem jogos sem dono (userId NULL)…" e nada muda. _Manual, banco descartável (nunca o Supabase compartilhado)._
- [ ] **CA-49** — **Dado** o passo humano executado (`SELECT count(*) FROM "Game" WHERE "userId" IS NULL` = 0), **quando** aplico A4, **então** `userId` é `NOT NULL`, o total de jogos é o mesmo de antes da etapa 3, e o dono vê todos os jogos (com as capas) no web.
- [ ] **CA-50** — **Dado** A4 aplicada, **quando** um `INSERT` direto em `"Game"` omite `"userId"`, **então** o banco rejeita; **e** um segundo `db:migrate` não gera migração nova.

### Etapa 5 — troca de senha

- [ ] **CA-51** — **Dado** Ana logada em dois jars (A e B), **quando** `PUT /api/auth/senha` pelo A com `{"senhaAtual":"segredo-forte","novaSenha":"outra-senha-boa"}`, **então** 204; login com a senha antiga → 401; com a nova → 200; em A, `me` e `refresh` continuam 200; em B, `me` → 401 `AUTH_SESSAO_ENCERRADA` e `refresh` → 401.
- [ ] **CA-52** — **Dado** `senhaAtual` errada, **então** 400 `AUTH_SENHA_ATUAL_INCORRETA` com `fields.senhaAtual`, a senha não muda e as outras sessões continuam.
- [ ] **CA-53** — **Dado** `novaSenha` igual à atual, **então** 400 `AUTH_SENHA_IGUAL_ATUAL` com `fields.novaSenha`.
- [ ] **CA-54** — **Dado** `novaSenha` de 7 caracteres ou de 73 bytes, **então** 400 `VALIDACAO` com `fields.novaSenha`; **dado** a request sem token, **então** 401.
- [ ] **CA-55** — **Dado** o mesmo IP, **quando** faço 6 trocas de senha (certas ou erradas) em 15 min, **então** a 6ª é 429.
- [ ] **CA-56** — **Dado** `/perfil/senha` no web, **quando** a confirmação não coincide, **então** "As senhas não coincidem" sem request; **quando** troco com sucesso, **então** volto para `/perfil` com "Senha alterada. As outras sessões foram encerradas."; **e** outro navegador logado na mesma conta vai para `/login?motivo=sessao` na próxima ação.

## Plano de testes

- **Unitário — API (Jest; `PrismaService` mockado como objeto de `jest.fn()`; nenhum teste toca o
  Postgres; o hasher de senha é mockado no service e testado de verdade num spec próprio):**
  - `auth.service.spec.ts`: normalização de nome/e-mail; 409 na checagem e no `P2002`; registro fechado
    (CA-04); login com e-mail inexistente **chama** a verificação contra o hash fixo (CA-06); criação de
    sessão, limpeza das vencidas e teto de 10 (CA-15); refresh: rotação na mesma linha, janela de 30 s
    e reuso com relógio falso (CA-09 a CA-11), `updateMany` com `count 0` → 409; logout idempotente;
    troca de senha apaga as outras sessões e mantém a atual (CA-51 a CA-53).
  - `password-hasher.spec.ts`: hash e verificação reais do algoritmo escolhido; senha de 72 bytes.
  - `access-token.guard.spec.ts`: `@Public`; sem cabeçalho; assinatura errada; `typ: 'refresh'`;
    vencido → `AUTH_TOKEN_EXPIRADO`; sessão ausente/de outro usuário → `AUTH_SESSAO_ENCERRADA`.
  - `dto/*.spec.ts` (pelo `ValidationPipe` do `main.ts`): CA-03, CA-54; e-mail normalizado antes do
    `IsEmail`.
  - `session-device.spec.ts`: rótulos para UAs de Chrome/Android, Safari/iOS, Edge/Windows,
    Firefox/Linux e desconhecido.
  - `env.validation.spec.ts` (acréscimo): CA-18; `AUTH_REGISTRATION_LIMIT_PER_HOUR` ausente → padrão
    3; valor não inteiro, `0` ou negativo → falha no boot.
  - `auth.http.spec.ts` (porta local, como `games.http.spec.ts`): atributos do `Set-Cookie`;
    anti-CSRF 403; 429 com `Retry-After` (limites reduzidos no módulo de teste); CORS (CA-19); corpo sem
    campos sensíveis (CA-20).
  - `games.service.spec.ts` e `games.http.spec.ts` (atualização da etapa 3): tudo filtrado por
    `userId`; 404 para jogo de outro usuário; duplicata por usuário; caminho novo da capa; 401 sem token.
- **Unitário — web (Vitest):** `auth-errors.test.ts` (todo `ApiErrorCode` tem texto); `safe-redirect.test.ts`
  (CA-31, com os quatro vetores); `api-client.test.ts` (fila de refresh única, CA-28; `SESSAO_ENCERRADA`
  → logout local; erro de rede no refresh não desloga; visitante não desloga); `AuthProvider.test.tsx`
  (os quatro estados do boot; 409 → uma nova tentativa); `RequireAuth.test.tsx`; `LoginForm`,
  `RegistroForm`, `TrocarSenhaForm` (validação local, mensagens por `code`, foco); logout limpa o
  escopo `usuario` e o `queryClient`.
- **`packages/shared`** (sem runner): `normalizeEmail`, `utf8ByteLength` e `passwordProblem` cobertos
  pelos specs de DTO da API e pelos testes dos formulários do web.
- **Manual (`/qa-verify`):** rodar com `AUTH_REGISTRATION_LIMIT_PER_HOUR` alto (ex.: `100`) em
  `apps/api/.env`, porque os critérios criam várias contas sintéticas (Ana, Bia e as de CA-15 e do
  `perfil`); só o CA-16 usa um valor baixo (`2`). Reiniciar a API zera os contadores (armazenamento em
  memória). CA-01 a CA-22 por `curl`; CA-05, CA-21, CA-40, CA-48 a CA-50 no banco
  (Prisma Studio/SQL; CA-48 só em banco descartável); CA-23 a CA-39, CA-47, CA-56 no navegador.

Loop de verificação por tarefa:
`npm run typecheck -w <workspace>` → `npm test -w <workspace>` → `npm run lint` → `npm run build` →
commit.

## Ordem de implementação

Cinco etapas. **Cada uma termina com `typecheck`, `lint`, `build` e testes verdes e PARA** até um "ok"
explícito. Branch sugerida: `feat/autenticacao`. As etapas 3 e 4 passam por `/db-change` e **só
começam com a aprovação da mudança destrutiva registrada nesta spec**.

| Etapa | Entrega                                                                                                                                                                                                                | Depende de                                         | Critérios     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------- |
| 1     | deps aprovadas · envs · migração A1 · `modules/auth` (registro, login, refresh, logout, me) · guard global + `@Public`/`@CurrentUser` · throttler · CORS sem `*` · contrato no shared · `games` `@Public()` temporário | Q1, Q2, Q4 respondidas                             | CA-01 a CA-22 |
| 2     | web: `AuthProvider`, interceptor, `/login`, `/registro`, `RequireAuth`, `/perfil` mínimo, "Perfil" na barra, logout, `BroadcastChannel`                                                                                | etapa 1 · `pwa-e-mobile` etapas 1 e 2              | CA-23 a CA-39 |
| 3     | migração A3 · `games` protegido e filtrado por `userId` · caminho novo das capas                                                                                                                                       | etapa 2 · **aprovação da mudança destrutiva** · Q5 | CA-40 a CA-47 |
| —     | **passo humano:** criar a própria conta e executar o SQL de Q5                                                                                                                                                         | etapa 3                                            | —             |
| 4     | migração A4 (`NOT NULL` com trava)                                                                                                                                                                                     | passo humano concluído                             | CA-48 a CA-50 |
| 5     | `PUT /api/auth/senha` + `/perfil/senha`                                                                                                                                                                                | etapa 2                                            | CA-51 a CA-56 |

A etapa 5 depende só da 2 e pode vir antes da 3 se o humano preferir.

`ARCHITECTURE.md` muda junto: §1 (linha "Auth"), §3 (módulo `auth`, `features/auth`, decorators), §4.1
(guard global, CORS), §4.2 e §8 (envs), §4.3 (models `User`/`RefreshSession`, `Game.userId`), §4.4
(`games` por dono, caminho das capas), §5 (rotas, interceptor, `AuthProvider`), §6 (`auth.ts`). A spec
`catalogo-jogos` ganha uma nota apontando que o aviso de segurança dela deixou de valer na etapa 3.

### Dependências entre specs

- Esta etapa 2 **depende de** `pwa-e-mobile` etapa 1 (`AppLayout`, `nav-items`) e etapa 2 (storage com
  `clearScope`, conectividade para o estado `desconectado`).
- `perfil` etapa 1 **depende desta** etapa 2 (página `/perfil`, `useAuth`) e usa a etapa 5 (link
  "Trocar senha").
- `perfil` etapa 2 (sessões ativas) **depende desta** etapa 1 (`RefreshSession`, guard com `sid`).
- `perfil` etapa 4 (excluir conta) **depende desta** etapa 4 (`Game.userId` obrigatório com cascade).

## Fora de escopo

**Feature do produto:**

- **Login social / OAuth / provedor externo de identidade** (decisão do humano: não entra).
- **Qualquer envio de e-mail.** Uma spec futura de **envio de e-mail (Brevo)** vai acrescentar, sem
  mudança destrutiva: (1) **verificação de e-mail** — campo opcional `User.emailVerificadoEm` e o fluxo
  de confirmação; (2) **recuperação de senha esquecida** — tokens de uso único numa tabela própria e o
  fluxo "esqueci minha senha"; e, com isso, a **troca de e-mail** (hoje impossível de confirmar). O
  desenho dos fluxos, o provedor e as variáveis de ambiente ficam para essa spec.
- Recuperação de senha por qualquer outro meio (ver Q3), 2FA, passkeys/WebAuthn, "lembrar de mim"
  opcional, papéis/admin, bloqueio de conta por tentativas (o limite é por IP), limite por e-mail,
  CAPTCHA, checagem de senha vazada (HIBP), trilha de auditoria, IP/localização nas sessões, rehash
  automático ao mudar parâmetros do hash.
- `code` nos erros de `games`.
- **Deploy (spec futura):** escolher uma hospedagem em que web e API fiquem **no mesmo site**
  (restrição em "Tokens e cookie"), configurar `trust proxy` para o limite por IP, `Secure` no cookie
  e `CORS_ORIGIN` de produção.

**Passo de processo (não é critério de aceite):** rodar as migrações e commitá-las; o passo humano de
Q5; backup antes de A3 e A4; gerar os segredos; atualizar `ARCHITECTURE.md`, `INDEX.md` e a nota na
spec do catálogo.

## Notas de ambiente

**Variáveis novas em `apps/api/.env`** (cada uma com campo em `env.validation.ts` e linha **sem valor
real** em `.env.example`):

| Variável                           | Validação                                                          | No `.env.example`          |
| ---------------------------------- | ------------------------------------------------------------------ | -------------------------- |
| `JWT_ACCESS_SECRET`                | obrigatória, ≥ 32 caracteres                                       | vazio                      |
| `JWT_REFRESH_SECRET`               | obrigatória, ≥ 32 caracteres, **diferente** de `JWT_ACCESS_SECRET` | vazio                      |
| `AUTH_REGISTRATION_OPEN`           | obrigatória, `true` ou `false` (Q4)                                | `true`                     |
| `AUTH_REGISTRATION_LIMIT_PER_HOUR` | **opcional**, inteiro ≥ 1; ausente → 3 (padrão no código)          | linha comentada, sem valor |

- **Mudança em `CORS_ORIGIN`:** perde o padrão `'*'` e recusa `*` (mensagem:
  `"CORS_ORIGIN não pode ser * com cookies de sessão; liste as origens, ex.: http://localhost:5173"`).
- Gerar cada segredo localmente, um diferente para cada:
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Nunca commitar,
  nunca colar em spec, log ou PR (`RULES.md` §8).
- `apps/web/.env`: nenhuma variável nova.
- **⚠️ Restrição de deploy (consequência de Q1 = cookie):** web e API no **mesmo site** (subdomínios
  do mesmo domínio, ex.: `app.dominio.com` + `api.dominio.com`, ou proxy de `/api` no host do front).
  Em domínios diferentes o cookie `SameSite=Lax` não é enviado e a sessão se perde a cada recarga.
  Detalhe em "Tokens e cookie"; a escolha da hospedagem fica para a spec de deploy.
- `AUTH_REGISTRATION_LIMIT_PER_HOUR` é para dev/teste: em ambiente exposto, deixar ausente (3/h).
- **Banco:** confirmar o banco antes de cada `db:migrate` (`RULES.md` §3); A3 e A4 só com aprovação e
  backup.

## Questões em aberto

Q1 a Q4 decididas pelo humano em 2026-09-23. **Q5 continua aberta**, e com ela a aprovação da mudança
destrutiva de `Game` (migrações A3 e A4): enquanto isso, esta spec fica em **rascunho** e as etapas 3 e
4 não começam.

- [x] **Q1 — Onde fica o refresh token?** **Decidido (2026-09-23): cookie `HttpOnly`**
      (`SameSite=Lax`, `Path=/api/auth`), com o access token **só em memória**. Consequências já na
      spec: `cookie-parser`, cabeçalho anti-CSRF, `CORS_ORIGIN` sem `*` e a **restrição de deploy** de
      web e API no mesmo site.
- [x] **Q2 — Hash de senha e rate limit.** **Decidido (2026-09-23): argon2id** (`argon2@^0.45.1`,
      m = 19 MiB, t = 2, p = 1) **e `@nestjs/throttler@^6.7.0`**. **Plano B:** se o `argon2` falhar ao
      instalar, cair para `node:crypto.scrypt`, sem dependência (parâmetros em "Stack"), registrando o
      motivo na spec. A **aprovação de instalação** (`RULES.md` §9) destes pacotes, de `@nestjs/jwt` e
      de `cookie-parser` ainda é pedida no início da etapa 1.
- [x] **Q3 — Senha esquecida sem e-mail.** **Decidido (2026-09-23): aceito por enquanto.** Esquecer a
      senha deixa a conta inacessível até existir a spec de e-mail (o dono pode resetar via SQL). Sem
      código de recuperação.
- [x] **Q4 — Registro aberto ou fechado?** **Decidido (2026-09-23): flag `AUTH_REGISTRATION_OPEN`,
      começando `true`.** O humano muda para `false` depois de criar a própria conta. O limite por IP
      (padrão 3/h, configurável só para dev/teste) vale nos dois casos.
- [ ] **Q5 — Destino dos jogos já cadastrados** (e **aprovação da mudança destrutiva** A3 + A4).
      **EM ABERTO.** (a) **atribuir todos à conta do dono** (SQL do passo humano), (b) apagar (e as
      capas), (c) outro. **Recomendação: (a)**, em duas fases como descrito em "Modelo de dados".
      Preciso de um "ok" explícito para: trocar o `@@unique` (A3) e tornar `userId` obrigatório (A4).

## Suposições

Marcadas para aprovação junto da spec:

- TTLs: access 15 min; refresh 30 dias, renovado a cada rotação (a sessão morre depois de 30 dias
  **sem uso**); janela de graça 30 s; teto de 10 sessões por usuário.
- Limites: login 5/min, registro 3/h (configurável por env opcional, para dev/teste), refresh 30/min,
  troca de senha 5/15 min, todos por IP.
- Guard com uma consulta à sessão por request (encerramento imediato), em vez de JWT puramente
  _stateless_.
- Senha atual errada na troca é **400** (não 401), para não disparar a lógica de sessão do web.
- Registro já entra logado (sem passo de confirmação).
- Campo "Confirmar senha" no registro e na troca de senha, por não haver recuperação.
- Logout sem rede não acontece (o cookie `HttpOnly` só o servidor apaga).
- Nomes: models `User` e `RefreshSession` (em inglês, como `Game`) com campos em português; rotas em
  português (`/registro`, `/senha`) sob `/api/auth`.
- Rótulo do dispositivo por função própria de UA, sem biblioteca de _parsing_.
- Capas novas em `<userId>/<gameId>/…`; as antigas ficam onde estão.
