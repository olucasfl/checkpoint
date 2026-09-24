# Spec: perfil

> Status: rascunho (Q7 e Q8 decididas em 2026-09-23; a Q5 da `autenticacao` foi decidida em
> 2026-09-24: descartar os jogos existentes). Continua rascunho só aguardando a aprovação do humano.

## Objetivo

Dar ao usuário logado uma aba de perfil onde ele vê e cuida da **conta** (nome de exibição, senha,
sessões ativas, exclusão da conta, guardados no servidor) e ajusta **preferências de interface deste
aparelho** (cor de destaque, filtro inicial, densidade, efeitos, plataformas favoritas, guardadas no
`localStorage`).

Toca `apps/api` (rota de nome e de exclusão em `modules/users/`, rotas de sessões em `modules/auth/`),
`apps/web` (`/perfil`, que já existe mínima desde `autenticacao` etapa 2), e `packages/shared`
(contratos). **Nenhuma mudança de schema.** É a **terceira** spec da rodada (ver "Dependências entre
specs").

Implementada em **quatro etapas**, cada uma parando para validação. A etapa 4 (excluir conta) entra
nesta rodada (Q8, decidida em 2026-09-23).

## Stack

Padrão da casa. **Nenhuma dependência nova.** As preferências usam o storage tipado de `pwa-e-mobile`
etapa 2; as rotas usam o guard, o `@CurrentUser()`, o throttler e os códigos de erro de `autenticacao`.

## Servidor × aparelho

O que fica onde, e por quê:

| Item                                  | Onde                                          | Por quê                                                                    |
| ------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| Nome de exibição                      | **servidor** (`User.nome`)                    | é dado da conta; aparece em qualquer aparelho                              |
| Senha                                 | **servidor** (tela de `autenticacao` etapa 5) | segredo da conta                                                           |
| Sessões ativas / encerrar sessão      | **servidor** (`RefreshSession`)               | só o servidor sabe e só ele revoga                                         |
| Excluir conta                         | **servidor**                                  | apaga dados do servidor e do bucket                                        |
| E-mail                                | servidor, **somente leitura**                 | trocar exige confirmação por e-mail, que não existe (ver "Fora de escopo") |
| Cor de destaque                       | **aparelho**                                  | preferência visual; pode ser diferente no celular e no computador          |
| Filtro inicial do catálogo            | **aparelho**                                  | idem                                                                       |
| Densidade da lista                    | **aparelho**                                  | depende do tamanho da tela                                                 |
| Efeitos visuais (completos/reduzidos) | **aparelho**                                  | depende do aparelho (bateria, GPU)                                         |
| Plataformas favoritas                 | **aparelho**                                  | atalho do formulário; sincronizar exigiria rota e schema (fora de escopo)  |

As preferências do aparelho **nunca vão para a API** (nenhuma request ao mudá-las).

## Comportamento esperado

- O item "Perfil" da barra inferior (criado em `autenticacao` etapa 2) abre `/perfil`.
- **Cabeçalho do perfil:** um "avatar" de iniciais (mesma lógica da capa gerada do catálogo: cor
  determinística da paleta `capa-1` a `capa-6` + iniciais), nome, e-mail marcado como não verificado,
  "Membro desde <mês de ano>" e um resumo do catálogo (total e por status), calculado da lista de jogos
  que o web já busca (sem endpoint novo).
- **Nome:** editável no próprio perfil; vale na hora, sem recarregar.
- **Senha:** link para `/perfil/senha` (`autenticacao` etapa 5).
- **Sessões ativas:** lista dos aparelhos logados, com o atual marcado como "Este aparelho", cada
  outro com **Encerrar**, e **Encerrar todas as outras**. Encerrar derruba a sessão na hora (o guard
  confere a sessão a cada request).
- **Preferências deste aparelho:** mudam a interface na hora; ficam salvas **por usuário** neste
  navegador (outra pessoa que entre no mesmo navegador tem as suas) e **sobrevivem ao logout**.
- **Instalar app:** se o app pode ser instalado e ainda não foi, o perfil tem um botão permanente para
  isso (o convite de `pwa-e-mobile` etapa 4 é esporádico; este fica sempre disponível).
- **Sair:** como em `autenticacao`.
- **Excluir conta** (etapa 4): exige a senha; apaga a conta, **todos os jogos** do usuário, **as capas
  deles no bucket** e todas as sessões; não dá para desfazer. Depois, o mesmo e-mail pode criar outra
  conta (se o registro estiver aberto).

## Requisitos de saída

### API

**`PATCH /api/users/me`** — protegida (módulo novo `apps/api/src/modules/users/`, tag Swagger `users`).
Corpo `AtualizarPerfilRequest`: `{ nome }` (mesma regra de `autenticacao`: `trim`, 1 a 60).

- **200** + `Usuario` atualizado (select de lista branca).
- **400** `VALIDACAO` (`fields.nome`; body vazio `{}`; campo desconhecido, **inclusive `email`**) ·
  **401**.

**`GET /api/auth/sessoes`** — protegida (no `AuthController`).

- **200** + `SessaoAtiva[]`: a atual primeiro, depois por `ultimoUsoEm` decrescente. Só sessões não
  vencidas. Campos **exatamente** `{ id, dispositivo, criadoEm, ultimoUsoEm, atual }` — nunca
  `tokenHash`, `hashAnterior`, `expiraEm` ou `userId`.

**`DELETE /api/auth/sessoes/:id`** — protegida.

- **204**: a sessão é apagada; o access token dela passa a dar 401 `AUTH_SESSAO_ENCERRADA` na hora, e o
  refresh dela também.
- **400** `VALIDACAO` (`id` não UUID) · **400** `SESSAO_ATUAL` (é a sessão da própria request: para ela,
  use Sair) · **404** `SESSAO_NAO_ENCONTRADA` (inexistente **ou de outro usuário**) · **401**.

**`DELETE /api/auth/sessoes`** — protegida. Encerra **todas as outras** sessões do usuário.

- **200** + `{ encerradas: number }` (0 se não havia outras). A atual continua.

**`POST /api/users/me/exclusao`** — protegida, limite **5 a cada 15 min por IP** (etapa 4).
Corpo `ExcluirContaRequest`: `{ senha }`. `POST` com corpo (e não `DELETE` com corpo, que alguns
proxies descartam).

- Ordem: (1) confere a senha; (2) lê os `capaPath` de todos os jogos do usuário; (3) apaga o `User`
  numa operação só, e o `onDelete: Cascade` apaga os jogos e as sessões; (4) **depois**, remove cada
  capa do bucket em _best effort_ (uma falha vira `warn` no log com o caminho, sem segredo, e o objeto
  fica órfão); (5) responde e limpa o cookie.
- O bucket é removido **depois** do banco: se o storage falhar, a conta já não existe (o pedido do
  usuário foi atendido) e sobra, no pior caso, um objeto órfão, em vez de uma conta pela metade.
- A remoção usa os caminhos lidos no passo 2, não um "apagar a pasta `<userId>/`": a REST do Storage
  apaga objetos por nome exato (não é recursiva), e as capas de antes de `autenticacao` etapa 3 estão
  em `<gameId>/…`, fora do prefixo do usuário.
- **204** + `Set-Cookie` limpando `checkpoint_refresh`.
- **400** `VALIDACAO` (`fields.senha`) · **400** `AUTH_SENHA_ATUAL_INCORRETA` (`fields.senha`; nada é
  apagado) · **401** · **429**.
- O `UsersService` não fala com o Storage direto: o `GamesModule` exporta o `GamesService`, que ganha
  `listarCapasDoUsuario(userId)` e `removerCapasSemFalhar(caminhos)` (o `StorageService` continua
  dentro de `games`).

**Códigos novos** (acrescentados ao `API_ERROR_CODES` de `autenticacao`):

| `code`                  | HTTP | Texto no web                           |
| ----------------------- | ---- | -------------------------------------- |
| `SESSAO_ATUAL`          | 400  | "Para encerrar esta sessão, use Sair." |
| `SESSAO_NAO_ENCONTRADA` | 404  | "Essa sessão já foi encerrada."        |

### Web — `/perfil` (`AppLayout`, `RequireAuth`)

Seções, nesta ordem, empilhadas em < 768 px e em duas colunas (conta | preferências) em ≥ 1024 px:

1. **Cabeçalho:** avatar de iniciais 64 × 64 (cor da paleta `capa-*` por hash do nome normalizado,
   iniciais em `fundo`, Orbitron: reaproveita `features/games/lib/game-cover`, movida para `shared/lib`
   por passar a ser usada por duas features); nome; e-mail + "(não verificado — usado só para entrar)";
   "Membro desde setembro de 2026" (`Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })`);
   resumo "12 jogos · 5 zerados · 3 jogando · 4 quero jogar" (da query `['games']` do catálogo; enquanto
   carrega, "—").
2. **Conta** (legenda "Salvo na sua conta"):
   - **Nome** com botão **Editar** (44 × 44, `aria-label="Editar nome"`) → vira campo + **Salvar** /
     **Cancelar**; Esc cancela; erro sob o campo pelo `fields.nome`. Sucesso atualiza o nome no perfil
     (o `usuario` do `useAuth`) sem recarregar.
   - **Senha** → link "Trocar senha" para `/perfil/senha`.
   - **Sessões ativas** (etapa 2): uma linha por sessão com ícone (`smartphone`/`computer` conforme o
     rótulo), `dispositivo`, "Último uso em 23/09/2026 14:32"; a atual com o selo "Este aparelho" (sem
     botão); as outras com **Encerrar** (sem confirmação: a pessoa entra de novo se quiser). Abaixo,
     **Encerrar todas as outras** (com confirmação no `<dialog>`: "Encerrar N sessões? Esses aparelhos
     vão precisar entrar de novo."), escondido se não houver outras.
   - **Sair.**
3. **Preferências deste aparelho** (legenda "Salvas só neste aparelho", etapa 3): ver tabela abaixo.
   Cada uma é um grupo de botões de opção (`role="radiogroup"`, `aria-checked`) ou, nas plataformas,
   uma lista de caixas de seleção; muda na hora, sem botão Salvar.
4. **App:** **Instalar app** (só quando `podeInstalar()` ou `ehSafariIos()`, e não `estaInstalado()`;
   no iOS abre o passo a passo de `pwa-e-mobile`). Escondido quando não se aplica.
5. **Zona de perigo** (etapa 4): **Excluir conta** (contorno e texto `erro`).

**Diálogo de exclusão** (`<dialog>`, folha inferior no celular): título "Excluir conta"; texto "Isso
apaga sua conta, seus N jogos e as capas deles. Não dá para desfazer."; campo **Senha**
(`autocomplete="current-password"`); **Cancelar** (foco inicial) e **Excluir conta** (preenchimento
`erro`, texto `fundo`), desabilitado com a senha vazia. Sucesso → logout local, remove as preferências
**desse usuário** do aparelho, avisa as outras abas (`BroadcastChannel` de `autenticacao`) e vai para
`/login?motivo=conta-excluida` ("Sua conta foi excluída."). Sem conexão → "Sem conexão. Nada foi
excluído." e o diálogo continua aberto.

### Preferências do aparelho (etapa 3)

Uma chave só, declarada no registro de `pwa-e-mobile`: `checkpoint:prefs`, escopo **`dispositivo`**
(sobrevive ao logout), valor `{ ultimoUsuario: string | null; porUsuario: Record<userId, Prefs> }`,
com validador (entrada inválida de um usuário → padrões para ele). Ao excluir a conta, a entrada desse
usuário é removida.

| Preferência           | Opções (padrão em negrito)                                      | Efeito                                                                                                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cor de destaque       | **Magenta**, Violeta, Azul, Laranja                             | muda o token novo `destaque` (logo, botão/item "Adicionar", borda e brilho dos diálogos, botão principal de login/registro). **Não** muda as cores de status nem o `ciano` do filtro ativo                                                                          |
| Filtro inicial        | **Todos**, Jogando, Quero jogar, Zerado                         | abrir `/` **sem** `?status=` (inclusive pelo item "Jogos") troca a URL por `/?status=<filtro>` (`replace`). Com filtro inicial ≠ Todos, clicar em "Todos" grava `?status=TODOS`, que o catálogo já trata como Todos (valor desconhecido → Todos, CA-47 do catálogo) |
| Densidade da lista    | **Confortável**, Compacta                                       | Compacta: capa 40 × 40, menos espaço entre linhas e a barra de nota na mesma linha do título em ≥ 768 px. Ações continuam ≥ 44 × 44                                                                                                                                 |
| Efeitos visuais       | **Completos**, Reduzidos                                        | Reduzidos: esconde orbes e _scanlines_ e desliga as animações, como `prefers-reduced-motion: reduce`, mesmo com o sistema sem essa preferência (economiza bateria no celular)                                                                                       |
| Plataformas favoritas | nenhuma **(padrão)**; até 8 da lista de plataformas do catálogo | no formulário de jogo, um primeiro grupo "Favoritas" com elas, que saem do grupo da família (sem opção repetida)                                                                                                                                                    |

- **Cor de destaque sem hex novo:** `@theme` ganha `--color-destaque: var(--color-magenta)`; as opções
  são `html[data-destaque="violeta"] { --color-destaque: var(--color-capa-6) }` (`#a78bfa`), `azul` →
  `capa-1` (`#8ab4f8`), `laranja` → `capa-3` (`#fb923c`). Os componentes que hoje usam `magenta` como
  acento primário passam a usar `destaque`. Contraste do texto `fundo` sobre cada preenchimento: magenta
  6,28:1 (já medido no catálogo); violeta, azul e laranja **a medir na implementação** com o mesmo
  verificador (estimativa: acima de 7:1), exigido ≥ 4,5:1.
- **Sem piscar ao carregar:** antes do primeiro render (`main.tsx`, logo depois das migrações do
  storage), aplica `data-destaque` e `data-efeitos` das preferências de `ultimoUsuario`; quando a sessão
  resolve, aplica as do usuário real (em geral as mesmas). Sem preferências → padrões.
- `html[data-efeitos="reduzidos"]` reaproveita as regras do bloco `prefers-reduced-motion` (um seletor a
  mais, não uma cópia) e esconde `.orb` e `.scanlines`.

## Modelo de dados

n/a. Usa `User` e `RefreshSession` de `autenticacao` e o `onDelete: Cascade` de `Game.userId`
(`autenticacao` etapa 4). Nenhuma migração.

## Contrato compartilhado

Em `packages/shared/src/auth.ts` (ou `users.ts`, reexportado):

```ts
export interface AtualizarPerfilRequest {
  nome: string;
}
export interface SessaoAtiva {
  id: string;
  dispositivo: string;
  criadoEm: string; // ISO 8601
  ultimoUsoEm: string; // ISO 8601
  atual: boolean;
}
export interface EncerrarOutrasSessoesResponse {
  encerradas: number;
}
export interface ExcluirContaRequest {
  senha: string;
}
// API_ERROR_CODES += 'SESSAO_ATUAL', 'SESSAO_NAO_ENCONTRADA'
```

As preferências **não** entram no `shared` (são só do web).

## Critérios de aceite (testáveis, em BDD)

`curl` contra `http://localhost:3333/api` com os jars de `autenticacao` (`A` e `B` = dois logins da
Ana; `C` = Bia). UI contra `http://localhost:5173`. Dados sintéticos.

### Etapa 1 — página e nome

- [ ] **CA-01** — **Dado** Ana ("Ana Teste", criada em setembro de 2026) com 1 jogo Zerado e 2 Jogando, **quando** abro `/perfil`, **então** vejo o avatar "AT", "Ana Teste", "ana@exemplo.com" com "(não verificado — usado só para entrar)", "Membro desde setembro de 2026" e "3 jogos · 1 zerado · 2 jogando · 0 quero jogar"; **e** recarregar mantém a cor do avatar.
- [ ] **CA-02** — **Dado** Ana logada, **quando** `PATCH /api/users/me` com `{"nome":"  Ana Souza "}`, **então** 200 com `nome: "Ana Souza"` e o mesmo `email`; **e** `GET /api/auth/me` devolve o nome novo.
- [ ] **CA-03** — **Dado** `PATCH /api/users/me` com `{"nome":""}`, com 61 caracteres, com `{}`, ou com `{"email":"outro@exemplo.com"}`, **então** 400 `VALIDACAO` (com `fields.nome` nos dois primeiros) e nada muda; **sem** token, **então** 401.
- [ ] **CA-04** — **Dado** `/perfil`, **quando** clico em Editar nome, troco e salvo, **então** o nome muda no cabeçalho sem recarregar; **quando** edito e aperto Esc, **então** volta o nome anterior sem request.
- [ ] **CA-05** — **Dado** `/perfil`, **quando** clico em "Trocar senha", **então** vou para `/perfil/senha`.
- [ ] **CA-06** — **Dado** Chrome com o app instalável e não instalado, **quando** abro `/perfil`, **então** vejo **Instalar app**, e clicar abre o prompt nativo; **dado** o app aberto instalado (standalone), **então** o botão não aparece.
- [ ] **CA-07** — **Dado** 360×640, **quando** abro `/perfil`, **então** não há rolagem horizontal e todo botão tem ≥ 44 × 44 px.

### Etapa 2 — sessões ativas

- [ ] **CA-08** — **Dado** Ana logada em A e B, **quando** `GET /api/auth/sessoes` pelo A, **então** 200 com 2 itens, o primeiro com `atual: true`, e cada item com exatamente as chaves `id`, `dispositivo`, `criadoEm`, `ultimoUsoEm`, `atual`.
- [ ] **CA-09** — **Dado** o id da sessão B, **quando** `DELETE /api/auth/sessoes/<idB>` pelo A, **então** 204; em B, `GET /auth/me` → 401 `AUTH_SESSAO_ENCERRADA` imediatamente e `refresh` → 401.
- [ ] **CA-10** — **Dado** Ana em A, **quando** `DELETE` no id da **própria** sessão A, **então** 400 `SESSAO_ATUAL`; **no id de uma sessão da Bia**, **então** 404 `SESSAO_NAO_ENCONTRADA` e a sessão da Bia continua; **em `abc`**, **então** 400.
- [ ] **CA-11** — **Dado** Ana com 3 sessões, **quando** `DELETE /api/auth/sessoes` pelo A, **então** 200 `{"encerradas":2}` e só A continua; repetindo → `{"encerradas":0}`.
- [ ] **CA-12** — **Dado** `/perfil` com duas sessões, **quando** olho a lista, **então** a atual tem "Este aparelho" e nenhum botão, a outra tem **Encerrar**; **quando** clico **Encerrar**, **então** ela some da lista, e o outro navegador vai para `/login?motivo=sessao` na próxima ação.
- [ ] **CA-13** — **Dado** três sessões, **quando** clico **Encerrar todas as outras** e confirmo, **então** sobra só "Este aparelho" e o botão some; **quando** cancelo, **então** nada muda.

### Etapa 3 — preferências do aparelho

- [ ] **CA-14** — **Dado** `/perfil`, **quando** escolho Violeta, **então** o logo, o item "Adicionar" da barra (ou o botão "Adicionar jogo" em desktop) e a borda do diálogo ficam violeta na hora; os selos de status e o filtro ativo **não** mudam; **e** nenhuma request sai (Network).
- [ ] **CA-15** — **Dado** Violeta escolhida, **quando** recarrego `/` com a rede em "Slow 4G", **então** o primeiro quadro já mostra o logo violeta (DevTools → Performance, capturas de tela), sem piscar em magenta.
- [ ] **CA-16** — **Dado** filtro inicial "Jogando", **quando** toco em "Jogos" na barra ou abro `/`, **então** a URL vira `/?status=JOGANDO` e só aparecem jogos Jogando; **quando** clico em "Todos", **então** a URL vira `/?status=TODOS`, aparecem todos, e recarregar mantém Todos; **e** um link direto `/?status=ZERADO` é respeitado.
- [ ] **CA-17** — **Dado** densidade Compacta e 10 jogos, **quando** abro `/`, **então** as capas medem 40 × 40, a lista fica mais baixa que na Confortável, e as ações da linha continuam com ≥ 44 × 44 px.
- [ ] **CA-18** — **Dado** efeitos Reduzidos e o sistema **sem** `prefers-reduced-motion`, **quando** abro `/`, **então** não há orbes nem _scanlines_, e nenhuma animação roda (o pulso do botão, o ponto do "Jogando", o tremor do campo com erro).
- [ ] **CA-19** — **Dado** favoritas PS5 e Nintendo Switch, **quando** abro o formulário de jogo, **então** a Plataforma começa pelo grupo "Favoritas" com as duas, que não aparecem de novo nos grupos PlayStation e Nintendo; **quando** tento marcar a 9ª favorita, **então** vejo "Até 8 favoritas" e ela não é marcada.
- [ ] **CA-20** — **Dado** Ana com Violeta, **quando** ela sai e Bia entra no mesmo navegador, **então** Bia vê Magenta (padrão); **quando** Bia sai e Ana entra, **então** Ana vê Violeta de novo.
- [ ] **CA-21** — **Dado** `checkpoint:prefs` corrompida à mão, **quando** recarrego, **então** o app abre com os padrões, sem erro na tela.
- [ ] **CA-22** — **Dado** o storage bloqueado no navegador, **quando** mudo a cor, **então** ela vale até recarregar, sem erro.
- [ ] **CA-23** — **Dado** as quatro cores de destaque, **quando** confiro com um verificador de contraste o texto `fundo` sobre o preenchimento `destaque` (botão principal), **então** todas dão ≥ 4,5:1; **e** o CA-87 do catálogo continua passando (nenhum hex fora do `@theme`).

### Etapa 4 — excluir conta

- [ ] **CA-24** — **Dado** Ana com 3 jogos, 2 deles com capa (uma de antes de `autenticacao` etapa 3, em `<gameId>/…`, e uma em `<userId>/<gameId>/…`), e duas sessões, **quando** `POST /api/users/me/exclusao` com a senha certa, **então** 204 com `Set-Cookie` limpando o cookie; o `User` some; `SELECT count(*) FROM "Game" WHERE "userId" = '<idDaAna>'` = 0; nenhuma `RefreshSession` dela; os dois objetos das capas não estão mais no bucket (listagem); login com `ana@exemplo.com` → 401 `AUTH_CREDENCIAIS_INVALIDAS`; e, com o registro aberto, `ana@exemplo.com` pode se registrar de novo.
- [ ] **CA-25** — **Dado** a senha errada, **então** 400 `AUTH_SENHA_ATUAL_INCORRETA` com `fields.senha` e nada é apagado.
- [ ] **CA-26** — **Dado** o storage falhando ao remover (mock no teste; manual: nome do bucket errado), **quando** excluo a conta, **então** ainda 204, a conta e os jogos somem do banco, e o log tem um aviso por objeto não removido, sem chave nem cabeçalho.
- [ ] **CA-27** — **Dado** Ana e Bia com jogos e capas, **quando** Ana exclui a conta, **então** os jogos, as capas e as sessões da Bia continuam intactos.
- [ ] **CA-28** — **Dado** `/perfil` na Zona de perigo, **quando** clico **Excluir conta**, **então** o diálogo mostra o número de jogos, o foco está em Cancelar e **Excluir conta** fica desabilitado até eu digitar a senha; **quando** confirmo, **então** vou para `/login` com "Sua conta foi excluída.", a entrada da Ana some de `checkpoint:prefs`, e outra aba logada da Ana vai para `/login`.
- [ ] **CA-29** — **Dado** 6 pedidos de exclusão com senha errada em 15 min, **então** o 6º é 429.
- [ ] **CA-30** — **Dado** o DevTools em "Offline", **quando** confirmo a exclusão, **então** vejo "Sem conexão. Nada foi excluído.", o diálogo continua aberto e a conta existe.

## Plano de testes

- **Unitário — API (Jest, Prisma e `StorageService` mockados):**
  - `users.service.spec.ts`: nome aparado; select de lista branca; exclusão: senha errada não apaga;
    ordem (lê capas → apaga usuário → remove capas); falha do storage não impede o 204 e loga aviso
    (CA-24 a CA-26).
  - `dto/*.spec.ts`: CA-03 (inclusive `email` como campo desconhecido).
  - `auth.service.spec.ts` (acréscimo): listar só sessões não vencidas, atual primeiro; encerrar outra
    / a atual (400) / de outro usuário (404); encerrar todas as outras com contagem (CA-08 a CA-11).
  - `users.http.spec.ts`: 401 sem token; 429 da exclusão com limite reduzido.
- **Unitário — web (Vitest):** `prefs.test.ts` (validador, por usuário, `ultimoUsuario`, remoção na
  exclusão, CA-20 a CA-22); `apply-prefs.test.ts` (`data-destaque`/`data-efeitos` no `<html>` antes do
  render); `initial-filter.test.ts` (sem parâmetro → filtro inicial; `TODOS`; parâmetro explícito
  respeitado, CA-16); `PlatformField.test.tsx` (grupo Favoritas sem repetição, CA-19);
  `PerfilPage.test.tsx` (resumo, edição de nome com Esc, sessões, instalar só quando aplicável);
  `ExcluirContaDialog.test.tsx` (botão desabilitado sem senha, foco em Cancelar, mensagens por `code`,
  sem conexão); `styles/tokens.test.ts` (acréscimo: `destaque` mapeia só para tokens existentes;
  `data-efeitos="reduzidos"` no mesmo bloco das regras de movimento).
- **Manual (`/qa-verify`):** CA-01, CA-04 a CA-07, CA-12 a CA-18, CA-23, CA-28, CA-30 no navegador;
  CA-24 e CA-27 no banco e no bucket reais (com contas sintéticas criadas para isso).

Loop de verificação por tarefa:
`npm run typecheck -w <workspace>` → `npm test -w <workspace>` → `npm run lint` → `npm run build` →
commit.

## Ordem de implementação

Quatro etapas, cada uma parando para validação. Branch sugerida: `feat/perfil`.

| Etapa | Entrega                                                                                                  | Depende de                                                                                                            | Critérios     |
| ----- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1     | `/perfil` completo (cabeçalho, resumo, nome editável, links, instalar) · `modules/users` com `PATCH /me` | `autenticacao` etapa 2 (e etapa 5 para o link de senha levar a algum lugar) · `pwa-e-mobile` etapa 4 (botão instalar) | CA-01 a CA-07 |
| 2     | rotas de sessões + seção "Sessões ativas"                                                                | `autenticacao` etapa 1                                                                                                | CA-08 a CA-13 |
| 3     | `checkpoint:prefs` · token `destaque` · aplicação antes do render · as cinco preferências                | `pwa-e-mobile` etapas 1 e 2 (Q7 decidida)                                                                             | CA-14 a CA-23 |
| 4     | `POST /users/me/exclusao` · Zona de perigo · diálogo                                                     | `autenticacao` etapa 4 (dono obrigatório, cascade; Q5 decidida em 2026-09-24: descartar os jogos)                     | CA-24 a CA-30 |

`ARCHITECTURE.md` muda junto: §3/§4.4 (módulo `users`, rotas de sessões no `auth`), §5 (página
`/perfil`, `checkpoint:prefs`, token `destaque`, `game-cover` em `shared/lib`), §6 (contratos novos).

### Dependências entre specs (resumo das três)

```
pwa-e-mobile 1 ──┬──▶ autenticacao 2 ──┬──▶ perfil 1
pwa-e-mobile 2 ──┤                    ├──▶ autenticacao 5 ──▶ (link de senha do perfil 1)
                 │                    └──▶ autenticacao 3 ──▶ [passo humano] ──▶ autenticacao 4 ──▶ perfil 4
                 └──────────────────────────────────────────────────────────────▶ perfil 3
autenticacao 1 ──▶ autenticacao 2 ;  autenticacao 1 ──▶ perfil 2
pwa-e-mobile 3 ──▶ pwa-e-mobile 4 ──▶ perfil 1 (botão Instalar app)
```

## Fora de escopo

**Feature do produto:**

- **Troca de e-mail.** Sem envio de e-mail não há como confirmar que o endereço novo é da pessoa; entra
  com a spec futura de e-mail (Brevo). O e-mail aparece só para leitura.
- **Avatar por upload** (fora por decisão do humano, Q7). Se entrar depois, reaproveita o pipeline das capas: `image-signature`
  e `StorageService` saem de `games/cover` para um módulo comum, `User.avatarPath String?` (aditivo),
  `PUT`/`DELETE /api/users/me/avatar`, objeto em `<userId>/avatar/<uuid>.<ext>`, mesmos limites (2 MB,
  JPEG/PNG/WebP). Nesta rodada o avatar é só de iniciais.
- **Ordenação escolhida pelo usuário** (fora, Q7): mexe no comportamento e na legenda do catálogo e cabe
  melhor como controle na própria lista, numa revisão da spec `catalogo-jogos`.
- Preferências sincronizadas entre aparelhos (no servidor); tema claro; tamanho de fonte.
- Exportar os dados (JSON/CSV) antes de excluir; exclusão com prazo de carência ou conta desativada
  (_soft delete_); rotina de limpeza de capas órfãs.
- Estatísticas além das contagens por status (horas, datas, gráficos).

**Passo de processo:** atualizar `ARCHITECTURE.md` e `INDEX.md`; medir o contraste das cores de destaque
novas.

## Notas de ambiente

- Nenhuma variável de ambiente nova. Nenhuma dependência nova. Nenhuma migração.
- A exclusão de conta mexe no bucket real: verificar (CA-24, CA-27) só com contas sintéticas criadas
  para o teste.

## Questões em aberto

Nenhuma nesta spec. As duas foram decididas pelo humano em 2026-09-23. A Q5 da `autenticacao` foi decidida em
2026-09-24 (descartar os jogos). A spec continua em rascunho só aguardando a aprovação do humano.

- [x] **Q7 — Quais preferências, e o avatar entra?** **Decidido: as cinco da tabela** (cor de destaque,
      filtro inicial, densidade, efeitos visuais, plataformas favoritas). **Ordenação padrão fica fora**
      (é assunto do catálogo) e **avatar por upload fica fora**; o avatar é só de iniciais.
- [x] **Q8 — Excluir conta entra nesta rodada?** **Decidido: entra, como etapa 4** (a última do
      perfil), depois de `autenticacao` etapa 4.

## Suposições

Para aprovação junto da spec:

- Preferências por **usuário** dentro do aparelho (chave `checkpoint:prefs` com mapa por `userId`), de
  escopo `dispositivo`, que **sobrevivem ao logout**. A alternativa (escopo `usuario`, apagadas no
  logout) faria a pessoa reconfigurar tudo a cada login. O conteúdo não é sensível; a entrada é
  removida na exclusão da conta.
- Paleta da cor de destaque restrita a tokens existentes (`magenta`, `capa-6`, `capa-1`, `capa-3`),
  evitando `ciano`, `ouro` e `vermelho-neon`, que já significam status.
- Encerrar **uma** sessão não pede confirmação; encerrar **todas as outras** pede.
- Exclusão de conta pede a senha (não digitar "EXCLUIR").
- Rotas de sessões no módulo `auth`; nome e exclusão num módulo novo `users`.
- `game-cover` sai de `features/games/lib` para `shared/lib`, porque passa a ser usado pelo perfil
  também (regra de `ARCHITECTURE.md` §5.4).
- Limite de 8 plataformas favoritas.
