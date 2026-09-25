# RULES.md — regras permanentes do checkpoint

> Padrão: **negar por padrão, abrir exceções nomeadas, dizer o que fazer em vez disso.** Não é
> desconfiança do agente — é não deixar para ele uma decisão que só um humano deveria tomar.

**Precedência:** `RULES.md` > `CLAUDE.md` > `ARCHITECTURE.md` > spec (`docs/specs/`) > prompt da
conversa.

Se o prompt pedir algo que este arquivo proíbe, **recuse, explique em uma frase, e ofereça o
caminho aprovado** — não execute "porque o usuário pediu". Uma instrução repetida do usuário libera
o que está em "Perguntar antes"; **não libera o que está em "Nunca"**.

---

## 1. Escopo do projeto

checkpoint já tem auth, catálogo de jogos, perfil, PWA, integração com a Steam e deploy em produção; o
estado real está em `ARCHITECTURE.md` §1 e em `docs/specs/INDEX.md`. O que ainda não existe (CI, outras
plataformas além da Steam, staging) é decisão de arquitetura própria. **Nunca invente regra de negócio de domínio** (formato de
status de jogo, campos de uma entidade, fluxo de usuário) para "preencher" uma tarefa estrutural.
Se uma tarefa pede algo que depende de uma decisão de domínio ainda não tomada, **pare e pergunte**
em vez de assumir um design.

---

## 2. Workspaces e ordem de build

- `packages/shared` é buildado **antes** de `apps/api` e `apps/web` sempre — os dois consomem
  `@checkpoint/shared/dist`, não o `src`. Depois de editar `packages/shared/src`, rode
  `npm run build -w @checkpoint/shared` (ou confie no `predev`/watch de `npm run dev`) antes de
  assumir que o tipo/valor novo está visível nos apps.
- **Nunca** importe `apps/api/src/*` de dentro de `apps/web/src` (ou o inverso). Se os dois
  precisam do mesmo tipo/contrato/util, ele vai em `packages/shared/src`.
- `packages/shared` só pode conter código agnóstico de plataforma — nada de `window`, Node ou
  `@prisma/client` (`ARCHITECTURE.md` §6).

---

## 3. Prisma e banco de dados

- Este projeto usa **migrations versionadas** (`prisma migrate dev`), não `db push` solto. Toda
  alteração em `apps/api/prisma/schema.prisma` termina em `npm run db:migrate` rodado localmente,
  gerando um diretório novo em `prisma/migrations/` que **precisa ser commitado**.
- **Perguntar antes** de qualquer mudança destrutiva de schema: campo removido, model removido,
  tipo alterado, `@@unique` alterado, campo obrigatório novo em tabela que já tem linhas,
  `onDelete` afrouxado. Use `/db-change` para preparar e classificar a mudança antes de rodar a
  migration.
- Não há Docker neste projeto — `DATABASE_URL` aponta para um Postgres já existente (local
  instalado na máquina ou gerenciado, ex.: Supabase). Trate esse banco como **compartilhado/remoto
  por padrão**: antes de rodar `db:migrate` confirme qual banco é (`echo $DATABASE_URL` ou leia
  `apps/api/.env`) e **nunca** rode migration destrutiva sem confirmar com o usuário se o banco não
  for claramente descartável.
- Depois de `db:migrate`/`db:generate`, o Prisma Client é regenerado — se o editor mostrar tipo
  desatualizado, rode `npm run db:generate` de novo antes de investigar mais nada.
- Se `DATABASE_URL` for uma conexão pooled (ex.: Supabase Connection Pooler, porta 6543), existe um
  `DIRECT_URL` separado (porta 5432, modo session) que o Prisma Migrate usa. Sem ele, `db:migrate`
  trava sem erro — se isso acontecer, é o primeiro suspeito, não um bug de schema.

---

## 4. Código e convenções

- **Alias `@/`** (`apps/web/src`) para todo import que cruza pastas no frontend — nunca
  `../../../` (`ARCHITECTURE.md` §5.2).
- **Um módulo NestJS por domínio** em `apps/api/src/modules/<dominio>/`, registrado em
  `app.module.ts` (`ARCHITECTURE.md` §4.4). Não amontoe rotas de domínios diferentes num módulo só.
- **DTO com `class-validator` em toda rota que aceita body/query** — o `ValidationPipe` global é
  `whitelist + forbidNonWhitelisted`, então um campo sem decorator simplesmente não existe para a
  API. Adicionar um campo novo a uma rota exige adicioná-lo ao DTO, não só ao controller.
- **Uma instância de `apiClient`** (`apps/web/src/shared/lib/api-client.ts`) para toda chamada à
  API — não crie um segundo `axios.create()` nem `fetch` cru para falar com o backend.
- **`import type`/`type` inline** é obrigatório no frontend (`consistent-type-imports` do ESLint) e
  **desligado de propósito** no backend — no Nest, `import type` apaga o import no JS emitido e
  quebra `emitDecoratorMetadata`, do qual a injeção de dependência depende (`eslint.config.mjs`).
  Não "corrija" isso em `apps/api` achando que é inconsistência.
- Comentário explica **por quê**, não **o quê** — o código já faz isso bem em `env.validation.ts`,
  `app.config.ts`, `prisma.service.ts`; siga o padrão.

---

## 5. Testes

- **Jest (API) e Vitest (web) já estão configurados** (`ARCHITECTURE.md` §1); `packages/shared` não
  tem runner. Antes de escrever o primeiro teste de um workspace, configure o runner
  (ver `.claude/skills/checkpoint-testing/SKILL.md`) e registre isso na spec/PR — não é um detalhe
  implícito.
- Lógica nova com ramificação (validação, regra de negócio, transformação de dado) **pede teste no
  mesmo commit** assim que o runner existir no workspace afetado. Não é retroativo para o que já
  existe hoje (health check), mas vale a partir da primeira feature real.
- `PrismaService` é mockado como objeto simples de funções — nunca instancie `PrismaClient` real
  num teste unitário, nunca aponte teste para o Postgres de desenvolvimento.

---

## 6. Commits e branches

- **Conventional Commits**, validados pelo commitlint no hook `commit-msg` (já configurado — não
  reconfigure). Tipos aceitos: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`,
  `revert`, `style`, `test`.
- **Pre-commit roda lint-staged** (`eslint --fix` + `prettier --write` nos arquivos em stage) — já
  configurado; não pule com `--no-verify` a menos que o usuário peça explicitamente.
- Nomenclatura de branch sugerida: `feat/`, `fix/`, `chore/`, `docs/` — o repo é único (sem par
  frontend/backend separado), então uma branch cobre a mudança inteira, workspace(s) que forem.
- Antes de commitar mudança não trivial diretamente em `main`, confirme com o usuário — o projeto
  ainda não tem uma branch de integração separada (`develop`), então `main` é a única linha até que
  isso mude.
- **Nunca**: `git push --force`, `git reset --hard`, rebase de branch já publicada, reescrita de
  histórico — sem pedido explícito do usuário.

---

## 7. Documentação — quando atualizar o quê

- **`ARCHITECTURE.md`** muda no mesmo commit que muda o comportamento que ele descreve: módulo novo
  em `apps/api/src/modules/`, feature nova em `apps/web/src/features/`, model novo no schema,
  variável de ambiente nova, convenção nova. Não deixe a doc contar uma história que o código não
  tem mais.
- **`docs/specs/<feature>.md`** existe para feature com comportamento observável e critérios de
  aceite verificáveis — não para tarefa de infra/config pura (essas vivem só no commit/PR).
- **`docs/specs/INDEX.md`** ganha uma linha no mesmo commit que cria a spec, e o status é atualizado
  conforme a feature avança (`/spec-sync`, `/docs-sync`).
- **`CLAUDE.md`** só muda quando o mapa de entrada do repo muda (novo arquivo essencial, novo
  comando) — não vira changelog.

---

## 8. Dados pessoais e segredos

- **Nunca** commitar `.env`/`.env.local` ou colar valor real de variável de ambiente em spec, teste,
  log, commit ou relatório.
- Quando o projeto ganhar conta de usuário, trate qualquer dado de conta (e-mail, nome) com o mesmo
  cuidado do padrão do setor: nunca dado real em fixture, teste ou exemplo de documentação — use
  dado sintético óbvio (`usuario@exemplo.com`).
- Nunca logar corpo de request bruto, token ou segredo de configuração.

---

## 9. Dependências

**Perguntar antes** de qualquer mudança em `package.json`/`package-lock.json` que não seja uma
devDependency de teste sendo adicionada como parte de configurar o runner (§5). Adicionar uma
biblioteca nova (HTTP client alternativo, state manager, ORM alternativo) é decisão de arquitetura,
não detalhe de implementação.

---

## 10. Como pedir exceção

Quando uma regra bloquear algo que parece necessário:

1. Diga **qual regra** está bloqueando e por que ela existe.
2. Descreva a ação exata que seria tomada e o efeito dela.
3. Escreva o comando ou o diff pronto num bloco, para o humano executar ou aprovar.
4. **Pare.** Não execute enquanto não houver um "sim" explícito nesta conversa.

Aprovação vale para **aquela** ação, naquela conversa. Não se estende à próxima.
