-- Migracao A4 da spec autenticacao (destrutiva: campo obrigatorio em tabela com linhas; aprovada
-- pelo humano em 2026-09-24). Escrito a mao: a trava falha com mensagem clara em vez do erro
-- generico do SET NOT NULL quando o passo humano da Q5 nao foi feito.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Game" WHERE "userId" IS NULL) THEN
    RAISE EXCEPTION 'Existem jogos sem dono (userId NULL). Execute o passo humano da spec autenticacao (Q5) antes desta migration.';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Game" ALTER COLUMN "userId" SET NOT NULL;
