# Spec: verificação de e-mail e recuperação de senha

> Status: em andamento (aprovada em 2026-09-27; etapas 1 e 2 implementadas, falta o `/qa-verify` com o Brevo real)

Esta spec é exatamente o que `docs/specs/autenticacao.md` já previu como aditivo e deixou para depois
(seção "Fora de escopo" dela): "**verificação de e-mail** — campo opcional `User.emailVerificadoEm` e
o fluxo de confirmação" e "**recuperação de senha esquecida** — tokens de uso único numa tabela
própria". Ela **muda comportamento hoje descrito em `autenticacao.md`** (registro deixa de logar
direto; login passa a poder recusar conta não verificada) — ver "Dependências entre specs" no fim.

## Objetivo

Provar que o dono de uma conta é o dono do e-mail cadastrado (bloqueando o login até confirmar) e
deixar quem esqueceu a senha recuperar o acesso sozinho, por e-mail — hoje isso só é possível via SQL
manual, feito pelo dono do banco.

Toca `apps/api` (módulo `auth`, módulo novo `mail`), `apps/web` (registro, login, quatro telas novas,
`/perfil`), `packages/shared` (contrato de auth) e `apps/api/prisma/schema.prisma` (campo novo em
`User`, model novo `TokenDeUsoUnico`, enum novo). Referência de comportamento: o Oratio
(`../oratio/oratio-api`), **sem** a parte de login com Google — só senha.

## Restrições decididas pelo humano (não são questões em aberto)

- **Login bloqueia até verificar** (igual ao Oratio): `POST /auth/registro` deixa de abrir sessão; a
  conta só consegue entrar depois de confirmar o e-mail.
- **Contas de antes desta spec são marcadas como já verificadas** numa migração de dado (não ficam
  bloqueadas por uma regra que não existia quando foram criadas).
- **Troca de e-mail fica fora de escopo.** O checkpoint não tem essa feature hoje; confirmar o e-mail
  abre caminho para ela, mas o fluxo em si é de uma spec futura.
- Remetente: Brevo, conta já configurada pelo humano (remetente `Checkpoint <e-mail>` verificado no
  Brevo; chave de API gerada). Nenhum valor real entra nesta spec, em código, teste ou log
  (`RULES.md` §8).

## Stack

Padrão da casa, com uma adição:

- **Sem biblioteca de e-mail nova.** `MailService` chama a API REST do Brevo
  (`POST https://api.brevo.com/v3/smtp/email`) com o `fetch` nativo do Node — o mesmo mecanismo que
  `SteamClient` já usa para falar com a Steam. **Nenhuma dependência nova em `package.json`**
  (`RULES.md` §9 não se aplica: nada é instalado).
- **Erros tipados, não booleano** (diferente do Oratio, que devolve `true`/`false` de
  `sendEmail`): `MailService` lança uma exceção própria (`MailIndisponivelError`) em qualquer falha
  (rede, timeout, resposta não-2xx do Brevo) — o mesmo idioma de `PsnClient`/`plataforma-errors.ts`.
  Quem chama decide o que fazer com a falha (ver "Comportamento esperado").
- **Tokens em claro nunca gravados** (diferente do Oratio, que grava o token em colunas do `User`):
  segue o padrão já usado em `RefreshSession.tokenHash` — só o **hash SHA-256** do token fica no
  banco. O token puro só existe no e-mail e na URL.
- **Links usam `WEB_PUBLIC_URL`** (env que já existe, da spec `integracao-plataformas`), não uma URL
  fixa no código como o Oratio faz com o domínio da Vercel dele.

## Comportamento esperado

### Registro e verificação

- **Registro deixa de abrir sessão.** `POST /auth/registro` cria a conta com `emailVerificadoEm: null`,
  gera um token de verificação (24 h de validade), manda o e-mail e responde **sem** `Set-Cookie` e
  sem `accessToken`. Se o e-mail falhar ao enviar, a conta **continua criada** (desfazer seria pior: a
  pessoa já comprometeu aquele e-mail/senha) e a resposta avisa que o envio falhou, para a tela
  oferecer "reenviar".
- **O link do e-mail aponta para o frontend** (`{WEB_PUBLIC_URL}/verificar-email?token=...`), que
  confirma via `fetch` depois de montar a página — nunca por navegação direta a uma rota da API. Isso
  evita que o pré-carregamento automático de link (Mail/Safari no iOS, scanners de e-mail) consuma o
  token antes do clique real.
- **Confirmação é idempotente**: clicar duas vezes no mesmo link (ou o pré-carregamento automático)
  não dá erro — a segunda vez só informa que já estava verificado.
- **Reenviar verificação** (`POST /auth/reenviar-verificacao`, só e-mail) nunca revela se a conta
  existe: e-mail inexistente e e-mail existente-e-reenviado dão a **mesma resposta**. Só quando a
  conta já está verificada a resposta diz isso explicitamente (aceito: nesse ponto não há mais segredo
  de existência a proteger — a pessoa já sabe que a conta existe, porque está tentando confirmá-la).
  Gera um token **novo** a cada chamada; o(s) token(s) anterior(es) continuam válidos até usar um ou
  vencer.

### Login

- **E-mail não verificado bloqueia o login**, mas só depois de confirmar a senha certa (a mesma ordem
  de hoje: hash comparado sempre, e-mail inexistente e senha errada continuam indistinguíveis). Só
  quem digitou a senha certa aprende que falta verificar — não é uma sonda de existência de conta.
- Conta verificada loga normalmente, sem mudança nenhuma no fluxo de hoje.

### Esqueci minha senha

- `POST /auth/esqueci-senha` (só e-mail) **sempre responde a mesma coisa**, não importa se o e-mail
  existe, se a conta está verificada, ou se o envio pelo Brevo falhou — o mesmo princípio já usado no
  login (CA-06 de `autenticacao.md`). Gera um token de 30 min só se a conta existir; nunca lança erro.
- `POST /auth/redefinir-senha` (token + nova senha): sucesso troca a senha, consome o token (não
  reutilizável) e **apaga todas as `RefreshSession` do usuário** (a mesma lógica de segurança da troca
  de senha logada — um token vazado não continua valendo depois do reset). Token errado, já usado ou
  vencido dão o mesmo erro genérico (não revela qual dos três foi, como o Oratio).

### Telas afetadas que hoje descrevem outra coisa

- `/registro` perde o aviso "Seu e-mail serve só para entrar... nenhum e-mail é enviado... não existe
  recuperação de senha" (deixa de ser verdade) e passa a levar para `/confirme-seu-email` em vez de
  `/`.
- `/perfil` perde a legenda "(não verificado — usado só para entrar)": depois desta spec, **toda**
  sessão ativa implica conta verificada (ninguém entra sem verificar, e quem já tinha conta foi
  marcado como verificado pela migração) — não existe mais o estado "logado e não verificado" para
  mostrar.

## Requisitos de saída

### API (prefixo `/api/auth`, `@Public()` em todas)

| Rota                                     | Corpo                           | Sucesso                                                   | Erros                                                                                                             |
| ---------------------------------------- | ------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `POST /auth/registro` (muda)             | `RegistroRequest` (sem mudança) | **201** `RegistroResponse` (sem cookie)                   | 400 `VALIDACAO` · 409 `AUTH_EMAIL_EM_USO` · 403 `AUTH_REGISTRO_FECHADO` · 429                                     |
| `POST /auth/login` (muda)                | `LoginRequest` (sem mudança)    | **200** `AuthResponse` + cookie (só se verificado)        | 401 `AUTH_CREDENCIAIS_INVALIDAS` · 401 `AUTH_EMAIL_NAO_VERIFICADO` (**novo**) · 400 · 429                         |
| `POST /auth/verificar-email` (novo)      | `VerificarEmailRequest`         | **200** `VerificarEmailResponse`                          | 400 `VALIDACAO` (`fields.token`, formato) · 401 `AUTH_TOKEN_INVALIDO` (inexistente/vencido) · 429                 |
| `POST /auth/reenviar-verificacao` (novo) | `ReenviarVerificacaoRequest`    | **200** `ReenviarVerificacaoResponse`                     | 400 `VALIDACAO` · 502 `MAIL_INDISPONIVEL` (só quando a conta existe, não está verificada, e o Brevo falhou) · 429 |
| `POST /auth/esqueci-senha` (novo)        | `EsqueciSenhaRequest`           | **200** `{ mensagem: string }` — **sempre o mesmo corpo** | 400 `VALIDACAO` · 429 (nunca 502: falha do Brevo aqui é engolida, ver "Comportamento esperado")                   |
| `POST /auth/redefinir-senha` (novo)      | `RedefinirSenhaRequest`         | **204**                                                   | 400 `VALIDACAO` (`fields.token` ou `fields.novaSenha`) · 401 `AUTH_TOKEN_INVALIDO` · 429                          |

Limites (`@nestjs/throttler`, por IP, padrão já usado no módulo): `verificar-email` 20/min,
`reenviar-verificacao` 5/min, `esqueci-senha` 5/min, `redefinir-senha` 10/min. `registro` e `login`
continuam com os limites de `autenticacao.md`.

### Novos códigos de erro (`packages/shared`, ver "Contrato compartilhado")

| `code`                      | HTTP | Quando                                                                                                        | Texto no web                                                               |
| --------------------------- | ---- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `AUTH_EMAIL_NAO_VERIFICADO` | 401  | login com senha certa, `emailVerificadoEm` nulo                                                               | "Confirme seu e-mail para entrar." + ação "Reenviar e-mail de confirmação" |
| `AUTH_TOKEN_INVALIDO`       | 401  | token de verificação ou de redefinição inexistente, vencido ou (só reset) já usado                            | "Esse link não é mais válido."                                             |
| `MAIL_INDISPONIVEL`         | 502  | `reenviar-verificacao` não conseguiu enviar (o Brevo falhou) — só quando a conta existe e não está verificada | "Não conseguimos enviar o e-mail agora. Tente de novo em instantes."       |

### Web — telas novas

- **`/confirme-seu-email`** — depois do registro. Mostra o e-mail digitado e "Enviamos um link de
  confirmação para `<email>`. Clique nele para continuar." Botão **Reenviar e-mail** (chama
  `reenviar-verificacao`; desabilitado por 30 s depois de clicado, para não ajudar a estourar o limite
  do servidor). Link "Já confirmei, entrar" → `/login`.
- **`/verificar-email?token=...`** — chama `verificar-email` ao montar. Sucesso (`jaEstavaVerificado`
  `true` ou `false`, mesma tela): "E-mail confirmado!" + botão **Entrar** → `/login`. Erro
  (`AUTH_TOKEN_INVALIDO`): "Esse link não é mais válido." + campo de e-mail + botão **Reenviar**, que
  chama `reenviar-verificacao` (o token não revela o e-mail para o frontend; por isso o campo).
- **`/esqueci-senha`** — campo E-mail, botão **Enviar link**. Sempre mostra a mesma mensagem de
  sucesso, sem erro de "e-mail não encontrado".
- **`/redefinir-senha?token=...`** — Nova senha + Confirmar nova senha (mesmas regras de
  `novaSenha` da spec `autenticacao`). Senhas diferentes → "As senhas não coincidem" sem request.
  Sucesso → `/login` com "Senha redefinida. Entre com a nova senha." `AUTH_TOKEN_INVALIDO` → mensagem +
  link "Pedir um link novo" → `/esqueci-senha`.

### Web — telas existentes que mudam

- **`/registro`**: remove o parágrafo sobre e-mail não verificado/sem recuperação; sucesso navega
  para `/confirme-seu-email?email=<email>` em vez de `/`.
- **`/login`**: ganha o link "Esqueci minha senha" → `/esqueci-senha`. Erro
  `AUTH_EMAIL_NAO_VERIFICADO` mostra a mensagem do código + botão "Reenviar e-mail de confirmação" que
  navega para `/confirme-seu-email` com o e-mail digitado.
- **`/perfil`**: remove a legenda "(não verificado — usado só para entrar)" ao lado do e-mail (texto
  livre, sem substituto — deixa de existir o que descrever).

## Modelo de dados

Tudo **aditivo** (coluna nova opcional, model novo, enum novo — nenhum tipo muda, nenhum `@@unique`
muda, nenhum campo obrigatório novo em tabela com linhas).

```prisma
model User {
  id           String   @id @default(uuid())
  nome         String   @db.VarChar(60)
  email        String   @unique @db.VarChar(254)
  senhaHash    String   @db.VarChar(255)
  // null = não verificado. Contas de ANTES desta migração são marcadas na própria migração (ver abaixo) —
  // nenhuma fica bloqueada por uma regra que não existia quando a conta foi criada.
  emailVerificadoEm DateTime?
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  sessoes          RefreshSession[]
  games            Game[]
  contasVinculadas ContaVinculada[]
  jogosPlataforma  JogoPlataforma[]
  tokensDeUsoUnico TokenDeUsoUnico[]
}

enum TipoDeToken {
  VERIFICACAO_EMAIL
  RESET_SENHA
}

// Um token de uso único prova posse do e-mail (verificação) ou autoriza trocar a senha (reset).
// O token em claro NUNCA é gravado — só o hash, como em RefreshSession.tokenHash.
model TokenDeUsoUnico {
  id        String      @id @default(uuid())
  userId    String
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  tipo      TipoDeToken
  tokenHash String      @db.Char(64)
  criadoEm  DateTime    @default(now())
  expiraEm  DateTime
  // null = ainda não usado. Só RESET_SENHA grava isto ao consumir: VERIFICACAO_EMAIL é idempotente de
  // propósito (o link pode ser pré-carregado pelo cliente de e-mail antes do clique real da pessoa).
  usadoEm   DateTime?

  @@index([userId, tipo])
  @@index([tokenHash])
}
```

**Migração de dado, na MESMA migração** (mesma técnica já usada na A4 de `autenticacao.md`: SQL
escrito à mão, além do que o `prisma migrate dev` gera): depois do `ALTER TABLE "User" ADD COLUMN
"emailVerificadoEm" TIMESTAMP(3);` gerado, acrescentar

```sql
-- Contas de antes desta spec são consideradas já verificadas (não existia a regra quando entraram).
UPDATE "User" SET "emailVerificadoEm" = "criadoEm" WHERE "emailVerificadoEm" IS NULL;
```

Isso faz a mudança de comportamento (login passa a exigir verificação) não bloquear ninguém que já
tinha conta — inclusive a conta do humano em produção. Sem esse `UPDATE`, ele ficaria trancado para
fora até verificar de novo.

## Contrato compartilhado

`packages/shared/src/auth.ts` ganha:

```ts
/** Resposta do registro: NÃO abre sessão (diferente de antes) — só confirma para onde o link foi. */
export interface RegistroResponse {
  email: string;
  /** false = a conta foi criada, mas o e-mail de verificação pode não ter chegado (Brevo falhou). */
  emailEnviado: boolean;
}

export interface VerificarEmailRequest {
  token: string;
}
export interface VerificarEmailResponse {
  jaEstavaVerificado: boolean;
}

export interface ReenviarVerificacaoRequest {
  email: string;
}
export interface ReenviarVerificacaoResponse {
  estado: 'enviado' | 'ja-verificado';
}

export interface EsqueciSenhaRequest {
  email: string;
}

export interface RedefinirSenhaRequest {
  token: string;
  novaSenha: string;
}
```

`API_ERROR_CODES` ganha `'AUTH_EMAIL_NAO_VERIFICADO'`, `'AUTH_TOKEN_INVALIDO'`, `'MAIL_INDISPONIVEL'`.

Em `games.ts`: `ApiErrorField` ganha `'token'`.

**Não muda:** `AuthResponse` (login e refresh continuam iguais), `Usuario` (não ganha campo de
verificação — depois desta spec toda sessão ativa já implica conta verificada, então não há estado
"logado e não verificado" para expor).

## Critérios de aceite (testáveis, em BDD)

`curl` contra `http://localhost:3333/api`; e-mails sempre `@exemplo.com` (`RULES.md` §8); nos testes
automatizados, `MailService` é mockado (nunca chama o Brevo de verdade).

### Etapa 1 — API

- [ ] **CA-01** — **Dado** registro aberto, **quando** `POST /auth/registro` com
      `{"nome":"Ana Teste","email":"ana@exemplo.com","senha":"segredo-forte"}`, **então** 201 com
      `{ email: "ana@exemplo.com", emailEnviado: true }`, **sem** `Set-Cookie`; no banco, o usuário tem
      `emailVerificadoEm: null` e existe uma `TokenDeUsoUnico` (`tipo: VERIFICACAO_EMAIL`) dele, com
      `expiraEm` ≈ 24 h à frente e `tokenHash` de 64 caracteres hex.
- [ ] **CA-02** — **Dado** a conta do CA-01 (ainda não verificada), **quando**
      `POST /auth/login` com a senha certa, **então** 401 `AUTH_EMAIL_NAO_VERIFICADO`, sem `fields`,
      sem `Set-Cookie`, e nenhuma `RefreshSession` é criada.
- [ ] **CA-03** — **Dado** a mesma conta, **quando** faço login com a senha ERRADA, **então** 401
      `AUTH_CREDENCIAIS_INVALIDAS` (não `AUTH_EMAIL_NAO_VERIFICADO`) — prova que a senha é conferida
      antes da verificação.
- [ ] **CA-04** — **Dado** o token do CA-01, **quando** `POST /auth/verificar-email` com
      `{"token":"<token>"}`, **então** 200 `{ jaEstavaVerificado: false }`; a conta passa a ter
      `emailVerificadoEm` preenchido; **e** o login com a senha certa agora dá 200 com `AuthResponse` e
      o cookie.
- [ ] **CA-05** — **Dado** o CA-04 já feito, **quando** repito o MESMO `POST /auth/verificar-email`,
      **então** 200 `{ jaEstavaVerificado: true }` (idempotente — não dá erro).
- [ ] **CA-06** — **Dado** `POST /auth/verificar-email` com `token` vazio, de 10 caracteres, ou com um
      caractere maiúsculo/não-hex, **então** 400 `VALIDACAO` com `fields.token`.
- [ ] **CA-07** — **Dado** um `token` de 64 caracteres hex que não existe no banco, **então** 401
      `AUTH_TOKEN_INVALIDO`.
- [ ] **CA-08** — **Dado** um token de verificação com `expiraEm` no passado (relógio falso no teste
      unitário), **quando** confirmo com ele, **então** 401 `AUTH_TOKEN_INVALIDO`.
- [ ] **CA-09** — **Dado** a conta do CA-01 (não verificada), **quando**
      `POST /auth/reenviar-verificacao` com `{"email":"ana@exemplo.com"}`, **então** 200
      `{ estado: "enviado" }`; existe uma SEGUNDA `TokenDeUsoUnico` de verificação dela (a do CA-01
      continua no banco, ainda válida).
- [ ] **CA-10** — **Dado** a conta já verificada (pós CA-04), **quando** peço reenvio para o e-mail
      dela, **então** 200 `{ estado: "ja-verificado" }`, e o `MailService` **não** é chamado (mock sem
      invocação).
- [ ] **CA-11** — **Dado** `naoexiste@exemplo.com`, **quando** peço reenvio, **então** 200
      `{ estado: "enviado" }` — **o mesmo corpo do CA-09** — e nenhuma linha é criada no banco.
- [ ] **CA-12** — **Dado** o mesmo IP, **quando** faço 6 chamadas de `reenviar-verificacao` em menos de
      1 min, **então** a 6ª é 429 `LIMITE_TENTATIVAS`.
- [ ] **CA-13** — **Dado** a conta do CA-01, **quando** `POST /auth/esqueci-senha` com o e-mail dela,
      **então** 200 com um corpo fixo (ex.: `{"mensagem":"Se esse e-mail existir, você vai receber um link."}`);
      existe uma `TokenDeUsoUnico` (`tipo: RESET_SENHA`) dela, `expiraEm` ≈ 30 min à frente.
- [ ] **CA-14** — **Dado** `naoexiste@exemplo.com`, **quando** peço `esqueci-senha`, **então** 200 com
      **exatamente o mesmo corpo** do CA-13, e nenhuma `TokenDeUsoUnico` é criada, e o `MailService`
      não é chamado.
- [ ] **CA-15** — **Dado** o token do CA-13 e uma sessão ativa da Ana (login prévio em outro
      navegador), **quando** `POST /auth/redefinir-senha` com `{"token":"<token>","novaSenha":"outra-senha-boa"}`,
      **então** 204; login com a senha antiga → 401; com a nova → 200; **e** a `RefreshSession` da
      sessão ativa anterior deixa de existir (`refresh`/`me` dela → 401).
- [ ] **CA-16** — **Dado** o MESMO token do CA-15, **quando** tento usá-lo de novo, **então** 401
      `AUTH_TOKEN_INVALIDO` (uso único).
- [ ] **CA-17** — **Dado** um token de reset com `expiraEm` no passado, **então** 401
      `AUTH_TOKEN_INVALIDO`.
- [ ] **CA-18** — **Dado** um token de reset válido e `novaSenha` de 7 caracteres (ou 73 bytes),
      **então** 400 `VALIDACAO` com `fields.novaSenha`, e o token **continua válido** (não foi
      consumido).
- [ ] **CA-19** — **Dado** dois usuários criados por `INSERT` direto (simulando contas de antes desta
      spec, sem `emailVerificadoEm`) numa transação com `ROLLBACK` (como o CA-48 de `autenticacao.md`),
      **quando** executo o `migration.sql` desta spec, **então** os dois passam a ter
      `emailVerificadoEm = criadoEm`; um terceiro usuário criado DEPOIS da migração continua com
      `emailVerificadoEm NULL`.
- [ ] **CA-20** — **Dado** `apps/api/.env` sem `BREVO_API_KEY`, sem `MAIL_FROM_EMAIL`, ou com
      `MAIL_FROM_EMAIL` num formato inválido, **quando** a API sobe, **então** ela falha listando o
      problema; **e** `apps/api/.env.example` lista as três variáveis novas **sem valor real**.
- [ ] **CA-21** — **Dado** `apps/api/.env` sem `MAIL_FROM_NAME`, **quando** a API sobe, **então** ela
      sobe normal e usa `"Checkpoint"` como nome do remetente.
- [ ] **CA-22** — **Dado** o `MailService` mockado para lançar `MailIndisponivelError` (Brevo fora do
      ar), **então**: (a) `POST /auth/registro` continua 201, com `emailEnviado: false`; (b)
      `POST /auth/reenviar-verificacao` de uma conta existente-e-não-verificada dá 502
      `MAIL_INDISPONIVEL`; (c) `POST /auth/esqueci-senha` continua respondendo 200 com o corpo fixo
      (a falha nunca aparece na resposta).
- [ ] **CA-23** — **Dado** as respostas dos CA-01 a CA-22, **quando** procuro `tokenHash`, o token em
      claro de OUTRA conta, `senhaHash` e a `BREVO_API_KEY` nos corpos e no log da API, **então** não há
      ocorrência.

### Etapa 2 — web

- [ ] **CA-24** — **Dado** `/registro` preenchido certo, **quando** envio, **então** vou para
      `/confirme-seu-email` (não para `/`), vejo o e-mail digitado e "Enviamos um link..."; **e** o
      parágrafo antigo sobre "não verificado / sem recuperação" não existe mais na tela.
- [ ] **CA-25** — **Dado** `/confirme-seu-email`, **quando** clico **Reenviar e-mail**, **então** vejo
      a confirmação e o botão fica desabilitado por alguns segundos (não dá para clicar em sequência).
- [ ] **CA-26** — **Dado** um link de verificação válido, **quando** abro `/verificar-email?token=...`,
      **então** vejo "E-mail confirmado!" e um botão **Entrar** para `/login`; **dado** um token
      inválido, **então** vejo a mensagem de erro, um campo de e-mail e o botão **Reenviar**.
- [ ] **CA-27** — **Dado** uma conta não verificada, **quando** erro o login nela com a senha certa,
      **então** vejo a mensagem de `AUTH_EMAIL_NAO_VERIFICADO` e um botão "Reenviar e-mail de
      confirmação" que me leva a `/confirme-seu-email` com o e-mail já preenchido.
- [ ] **CA-28** — **Dado** `/login`, **quando** olho a tela, **então** vejo o link "Esqueci minha
      senha" apontando para `/esqueci-senha`.
- [ ] **CA-29** — **Dado** `/esqueci-senha`, **quando** envio um e-mail que existe e um que não existe
      (duas tentativas), **então** as duas vezes vejo a MESMA mensagem de sucesso.
- [ ] **CA-30** — **Dado** `/redefinir-senha?token=...` válido, **quando** as senhas não coincidem,
      **então** "As senhas não coincidem" sem request; **quando** coincidem e são válidas, **então**
      vou para `/login` com "Senha redefinida. Entre com a nova senha."
- [ ] **CA-31** — **Dado** `/redefinir-senha?token=...` com um token inválido/vencido, **quando** a
      página carrega (ou eu envio), **então** vejo "Esse link não é mais válido." e um link "Pedir um
      link novo" para `/esqueci-senha`.
- [ ] **CA-32** — **Dado** `/perfil`, **quando** abro, **então** a legenda "(não verificado — usado só
      para entrar)" não existe mais ao lado do e-mail.
- [ ] **CA-33** — **Dado** `lib/auth-errors.ts`, **quando** procuro os três `code` novos, **então** os
      três têm texto no `Record<ApiErrorCode, string>`; **e** remover um do mapa quebra o `typecheck`
      (mesmo padrão do CA-38 de `autenticacao.md`).

## Plano de testes

- **Unitário — API (Jest; `PrismaService` mockado; `MailService` mockado nos specs de `auth`):**
  - `mail.service.spec.ts` (novo): monta o link certo com `WEB_PUBLIC_URL`; chama o `fetch` com
    `api-key`, remetente e corpo certos; timeout (`Promise.race`, como `PsnClient`) e resposta não-2xx
    do Brevo viram `MailIndisponivelError`; nunca loga a chave nem o corpo do e-mail.
  - `auth.service.spec.ts` (acréscimos): registro não abre sessão e cria o token (CA-01); login
    bloqueia só depois de confirmar a senha (CA-02, CA-03); `confirmarEmail` idempotente (CA-04, CA-05);
    token inexistente/vencido (CA-07, CA-08); `reenviarVerificacao` nos três estados (CA-09 a CA-11);
    `esqueciSenha` sempre silencioso, inclusive com o `MailService` lançando (CA-13, CA-14, CA-22c);
    `redefinirSenha` apaga as sessões e consome o token uma vez (CA-15, CA-16, CA-18).
  - `dto/verificar-email.dto.spec.ts`, `dto/redefinir-senha.dto.spec.ts`, `dto/*-email.dto.spec.ts`:
    formato do token (CA-06), reuso de `novaSenhaProblem`/`emailProblem` já existentes.
  - `env.validation.spec.ts` (acréscimo): CA-20, CA-21.
  - `auth.http.spec.ts` (acréscimo): round-trip completo — registro → sem cookie → login bloqueado →
    verificar → login ok; `esqueci-senha`/`redefinir-senha` ponta a ponta; corpo sem campo sensível
    (CA-23).
- **Unitário — web (Vitest):** `auth-errors.test.ts` (CA-33); `ConfirmeSeuEmailPage`,
  `VerificarEmailPage`, `EsqueciSenhaForm`, `RedefinirSenhaForm` (validação local, mensagens por
  `code`, navegação); `RegistroForm` (destino novo, CA-24); `LoginForm` (ramo `AUTH_EMAIL_NAO_VERIFICADO`,
  CA-27; link "Esqueci minha senha", CA-28).
- **Manual (`/qa-verify`):** CA-19 e CA-23 (log/banco), como o restante da spec `autenticacao` já é
  verificado; os demais critérios de API por `curl` e os de web no navegador.

Loop de verificação por tarefa:
`npm run typecheck -w <workspace>` → `npm test -w <workspace>` → `npm run lint` → `npm run build` →
commit.

## Ordem de implementação

Branch sugerida: `feat/verificacao-email-senha`. Duas etapas, cada uma parando para validação.

| Etapa | Entrega                                                                                                                             | Critérios     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1     | migração (schema + `UPDATE` de dado) · módulo `mail` · `auth` (registro/login mudados, 4 rotas novas) · contrato no `shared` · envs | CA-01 a CA-23 |
| 2     | web: 4 telas novas, `/registro`, `/login`, `/perfil`                                                                                | CA-24 a CA-33 |

`ARCHITECTURE.md` muda junto: §4.4 (módulo `mail`), §4.2/§8 (envs novas), §4.3 (`User.emailVerificadoEm`,
model `TokenDeUsoUnico`), §5.13/§5 (telas novas), §6 (`auth.ts`).

### Dependências entre specs

- **Esta spec MUDA comportamento descrito em `autenticacao.md`**: CA-01 dela (registro abre sessão) e
  CA-24 dela (web entra direto em `/` após o registro) deixam de valer como estão; CA-06 ganha um
  terceiro caso (conta existe, senha certa, mas não verificada); CA-36 perde a legenda "(não
  verificado)". Rodar `/spec-sync docs/specs/autenticacao.md` depois de implementar esta spec, para
  atualizar o texto dela em vez de deixá-la desatualizada.
- Não depende de nenhuma spec além de `autenticacao.md` (já implementada) e `integracao-plataformas.md`
  (só pelo `WEB_PUBLIC_URL`, que já existe).

## Fora de escopo

**Feature do produto:**

- **Troca de e-mail** (decisão do humano nesta rodada). Fica para uma spec futura, agora que
  `emailVerificadoEm` existe para sustentá-la.
- Login social/OAuth (já fora de escopo do projeto, ver `autenticacao.md`).
- 2FA, CAPTCHA, checagem de senha vazada (HIBP), limite por e-mail (só por IP), notificação de "sua
  senha foi trocada" por e-mail separado, histórico/auditoria de tentativas de reset.
- Invalidar tokens de reset antigos quando um novo é pedido (`esqueci-senha` duas vezes deixa dois
  tokens válidos ao mesmo tempo; o primeiro usado consome só ele mesmo). Baixo risco (token de alta
  entropia, 30 min), e simplifica a implementação.
- Autenticação do domínio do remetente no Brevo (SPF/DKIM próprio) — o remetente é um Gmail verificado,
  como o Oratio usa em produção; documentado como aceito pelo humano fora desta spec.

**Passo de processo (não é critério de aceite):** rodar a migração e commitá-la; gerar/colar
`BREVO_API_KEY` em `apps/api/.env` e no Render; atualizar `ARCHITECTURE.md` e `INDEX.md`.

## Notas de ambiente

**Variáveis novas em `apps/api/.env`:**

| Variável          | Validação                                                                                             | No `.env.example`          |
| ----------------- | ----------------------------------------------------------------------------------------------------- | -------------------------- |
| `BREVO_API_KEY`   | obrigatória, string não vazia (sem checar o formato exato — evita quebrar se o Brevo mudar o prefixo) | vazio                      |
| `MAIL_FROM_EMAIL` | obrigatória, formato de e-mail                                                                        | vazio                      |
| `MAIL_FROM_NAME`  | **opcional**; ausente → `"Checkpoint"`                                                                | linha comentada, sem valor |

- **Reaproveita `WEB_PUBLIC_URL`** (já existe, de `integracao-plataformas.md`) para montar os links do
  e-mail — nenhuma URL nova.
- `apps/web/.env`: nenhuma variável nova.
- **Ordem de deploy** (mesmo princípio já registrado para a PlayStation em `ARCHITECTURE.md` §8.1):
  migração primeiro, depois as três variáveis no Render, depois o código. Sem `BREVO_API_KEY`/
  `MAIL_FROM_EMAIL`, a API **não sobe** (diferente do desenho opcional da PSN: aqui a feature é núcleo
  do registro/login, não um extra que pode ficar desligado).
- Nunca colar o valor real da chave em spec, commit, log ou PR (`RULES.md` §8).

## Questões em aberto

Decididas pelo humano em 2026-09-27 (ver "Restrições decididas pelo humano" no topo):

- [x] **Bloqueio de login** — decidido: bloquear até verificar (como o Oratio).
- [x] **Contas existentes** — decidido: marcadas como já verificadas na própria migração
      (`emailVerificadoEm = criadoEm`).
- [x] **Troca de e-mail** — decidido: fora de escopo desta spec.

## Suposições

Assumidas por mim, sinalizadas para revisão (nenhuma delas é decisão de negócio já coberta acima):

- **Um `TokenDeUsoUnico` para os dois tipos** (verificação e reset), em vez de colunas separadas em
  `User` (como o Oratio faz). Menos duplicação de lógica; se preferir manter os dois fluxos
  totalmente isolados, dá para separar em duas tabelas sem mudar o resto da spec.
- **TTLs**: verificação 24 h, reset 30 min — os mesmos números do Oratio.
- **Limites**: `verificar-email` 20/min, `reenviar-verificacao` e `esqueci-senha` 5/min,
  `redefinir-senha` 10/min, todos por IP.
- **`reenviar-verificacao` revela "já verificado"** mas nunca revela "não existe" — mesmo
  comportamento do Oratio, aceito porque quem chama essa rota já está numa tela que pressupõe que a
  conta existe (pós-registro, ou digitou o e-mail de propósito).
- **Campo "Confirmar senha" continua** no registro mesmo agora que existe recuperação — custo baixo,
  evita erro de digitação sem depender do fluxo de reset.
- **Token puro**: 32 bytes aleatórios em hex (64 caracteres), como o Oratio.
- **Sem invalidar tokens antigos** ao gerar um novo (verificação ou reset) — ver "Fora de escopo".
