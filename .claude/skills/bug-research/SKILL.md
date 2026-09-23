---
name: bug-research
description: Investiga a causa raiz de um bug antes de qualquer correção. Use quando um teste falha, quando uma rota ou tela devolve o que não deveria, quando um usuário reporta um problema, ou quando você está prestes a "tentar uma coisa pra ver se resolve".
---

# Pesquisa de bug — provar a causa antes de corrigir

O erro que esta skill existe para evitar: corrigir o **sintoma que aparece por cima**, achar que
resolveu porque parou de dar erro, e o bug voltar em outra forma depois.

**A regra que sustenta tudo: não altere código de produção antes do passo 4.**

## Os 6 passos

### 1. Reproduzir

Antes de qualquer leitura de código, defina o caso concreto: qual rota/tela, qual ação, qual dado
de entrada, qual estado esperado × qual estado real.

Se você **não consegue reproduzir**, esse é o resultado desta etapa. Diga o que tentou e o que
falta — e pare. Corrigir um bug não reproduzido é chutar.

Reproduza **local**: confirme que o Postgres de `DATABASE_URL` está acessível (não há Docker neste
projeto) + `npm run dev`, depois `curl` contra
`http://localhost:3333/api/...` ou passo a passo em `http://localhost:5173`. Nunca contra qualquer
ambiente que não seja este checkout local — o projeto não tem staging/produção configurados ainda.

No checkpoint, comece por estes pontos se o sintoma encaixar (são os lugares onde um esqueleto de
monorepo costuma esconder bug, mesmo sem domínio ainda):

- **`packages/shared` desatualizado**: o `dist/` não reflete o `src/` mais recente porque o build
  não rodou de novo (`ARCHITECTURE.md` §2). Sintoma: tipo/valor "errado" que já foi corrigido no
  `src/` do shared.
- **Prisma Client desatualizado**: schema mudou, `db:generate` não rodou. Sintoma: campo que
  "não existe" no tipo do `PrismaService`, mas existe no schema.
- **CORS/env**: `CORS_ORIGIN` ou `VITE_API_URL` desalinhados entre `apps/api/.env` e
  `apps/web/.env`. Sintoma: erro de rede no browser que não aparece testando a API com `curl`
  direto.
- **`ValidationPipe` whitelist**: campo enviado pelo frontend não chega no service porque o DTO não
  o declara — `whitelist: true` remove silenciosamente em vez de dar erro óbvio.

### 2. Localizar a causa raiz

Leia o caminho de execução inteiro. Backend: controller → `ValidationPipe`/DTO → service →
Prisma. Frontend: componente → hook/query → `apiClient` → resposta real da API. Não pare no
primeiro `if` suspeito.

Pergunte **por que** o valor errado chegou ali. E de novo, para a resposta. A causa raiz é aquela
em que a resposta vira "porque foi escrito assim".

### 3. Formular a hipótese

Uma frase testável: _"`GamesService.create()` aceita `status` fora do enum porque o DTO usa
`@IsString()` em vez de `@IsEnum(GameStatus)`."_

Se não couber numa frase, você ainda está no passo 2.

### 4. Confirmar

**Este é o portão.**

- Se o workspace afetado já tem runner de teste configurado (`checkpoint-testing`): escreva um
  teste que falha **pela razão da hipótese**, rode-o e mostre a saída real da falha. Se passar de
  primeira, a hipótese está errada — volte ao passo 2.
- Se o workspace **ainda não** tem runner: reproduza manualmente (`curl` com o payload exato, ou
  passo a passo na UI) e cole a saída/comportamento real que confirma a hipótese. Nesse caso, parte
  do trabalho do passo 6 é decidir se vale configurar o runner agora (`checkpoint-testing`) para
  este bug já nascer com regressão.

### 5. Corrigir

Só agora. A **menor** mudança que faz a confirmação do passo 4 deixar de falhar.

Se a correção exigir mudança de schema, remoção de validação, ou mudança de contrato entre
`apps/api` e `apps/web`, **pare e peça aprovação** com o diff pronto (`RULES.md` §3, §4).

### 6. Garantir a regressão

O teste do passo 4 (se houver) **fica no repositório**. Rode `npm run typecheck`, `npm run lint`,
`npm run build` no(s) workspace(s) afetado(s), e `npm test -w <workspace>` se existir runner.

Na mensagem do commit: o que era, por que acontecia, o que mudou, e como fica garantido que não
volta.

## Anti-padrões

| Sintoma                                                    | O que está acontecendo                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| "Vou tentar mudar isso e ver se resolve"                   | Pulou do passo 1 pro 5. Não sabe a causa.                        |
| Corrigiu, mas não escreveu teste (workspace já tem runner) | Sem passo 4/6: o bug volta e ninguém percebe.                    |
| O teste novo passa antes da correção                       | O teste não exercita o bug. Não confirma nada.                   |
| A correção mexeu no schema do Prisma                       | Não é correção de bug; é mudança de dados. Vai por `/db-change`. |
| "Também aproveitei e arrumei…"                             | Vira outra tarefa. Sempre.                                       |
