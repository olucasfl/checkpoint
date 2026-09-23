---
description: Prepara uma mudança de schema Prisma — classifica o risco, edita o schema e gera a migration localmente
argument-hint: <descrição da mudança>
---

Prepare a mudança de schema: **$ARGUMENTS**

## Por que este comando existe

checkpoint usa `prisma migrate dev` — schema versionado, com histórico em
`apps/api/prisma/migrations/` (diferente de um `db push` sem histórico). Isso já dá rollback via
histórico de migrations, mas **`migrate dev` pode pedir para resetar o banco de dev quando detecta
drift** (schema do banco divergente do histórico de migrations) — e um reset apaga dado local sem
aviso adicional depois do prompt. Por isso o agente **prepara e classifica**; a execução que pode
resetar dado é sempre visível e nunca automática dentro de um fluxo maior.

## Procedimento

### 1. Classificar

Diga, na primeira linha, se a mudança é:

- **Aditiva** — model novo, campo opcional novo, índice novo. Baixo risco.
- **Destrutiva** — campo removido, model removido, tipo alterado, `@@unique` alterado, campo
  obrigatório novo em tabela que já tem linhas, `onDelete` afrouxado. **Exige aprovação explícita**
  antes do passo 3.

### 2. Editar o schema

Altere `apps/api/prisma/schema.prisma`. Comentário curto no model explicando qualquer restrição
não óbvia (por que a chave composta, por que um campo é opcional por enquanto).

### 3. Escrever o efeito, em português

Antes de gerar a migration, escreva em texto: **o que será criado, o que será alterado, e o que
pode ser perdido** — tabela por tabela. Se a resposta para "pode perder dado?" for "não sei", trate
como destrutiva e pare para aprovação.

### 4. Gerar a migration localmente

```
npm run db:migrate -w @checkpoint/api
```

Não há Docker neste projeto — `DATABASE_URL` (`apps/api/.env`) aponta para um Postgres já
existente, local ou gerenciado (ex.: Supabase), tratado como **compartilhado por padrão**. Confira
`apps/api/.env` antes de rodar e confirme com o humano qual banco é se não tiver certeza; pede um
nome descritivo para a migration.

Se `DATABASE_URL` for uma pooled connection (ex.: porta 6543 da Supabase), precisa existir um
`DIRECT_URL` (porta 5432, modo session) em `apps/api/.env` — sem ele, o comando trava sem erro
(fica parado após "Datasource ... loaded", sem nunca terminar).

Se o comando avisar sobre **drift** ou oferecer **resetar o banco**, **pare e reporte** em vez de
confirmar — um reset apaga dado nesse banco (que pode não ser só "local"); deixe o humano decidir.

### 5. Revisar o SQL gerado

Leia o arquivo novo em `apps/api/prisma/migrations/<timestamp>_<nome>/migration.sql`. Confirme que
ele bate com o que foi descrito no passo 3 — nenhuma surpresa (`DROP` não mencionado, tipo mudando
sem conversão).

### 6. Regenerar o client e verificar

```
npm run db:generate -w @checkpoint/api
npm run typecheck -w @checkpoint/api
```

### 7. Registrar

- Atualize `ARCHITECTURE.md` §7 se um model novo passou a existir.
- Confirme que o diretório de migration está no stage do commit junto com o `schema.prisma`.
- Se a mudança era destrutiva, registre no commit **quem aprovou** e o resumo do passo 3.
