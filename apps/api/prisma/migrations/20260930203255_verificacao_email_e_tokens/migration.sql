-- CreateEnum
CREATE TYPE "TipoDeToken" AS ENUM ('VERIFICACAO_EMAIL', 'RESET_SENHA');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerificadoEm" TIMESTAMP(3);

-- Contas de antes desta spec sao consideradas ja verificadas (a regra nao existia quando entraram).
UPDATE "User" SET "emailVerificadoEm" = "criadoEm" WHERE "emailVerificadoEm" IS NULL;

-- CreateTable
CREATE TABLE "TokenDeUsoUnico" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "TipoDeToken" NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),

    CONSTRAINT "TokenDeUsoUnico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TokenDeUsoUnico_userId_tipo_idx" ON "TokenDeUsoUnico"("userId", "tipo");

-- CreateIndex
CREATE INDEX "TokenDeUsoUnico_tokenHash_idx" ON "TokenDeUsoUnico"("tokenHash");

-- AddForeignKey
ALTER TABLE "TokenDeUsoUnico" ADD CONSTRAINT "TokenDeUsoUnico_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
