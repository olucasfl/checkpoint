-- Migracao A3 da spec autenticacao (destrutiva: @@unique alterado; aprovada pelo humano em 2026-09-24).
-- Sem perda de dado: userId entra nulavel e o indice novo e menos restritivo que o antigo. Os CHECK
-- de "Game" (migracao catalogo_jogos) nao sao tocados.

-- DropIndex
DROP INDEX "Game_tituloNormalizado_plataformaNormalizada_key";

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Game_userId_tituloNormalizado_plataformaNormalizada_key" ON "Game"("userId", "tituloNormalizado", "plataformaNormalizada");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
