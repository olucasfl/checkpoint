-- AlterEnum
ALTER TYPE "Provedor" ADD VALUE 'PLAYSTATION';

-- AlterTable
ALTER TABLE "ContaVinculada" ADD COLUMN     "reautenticarDesde" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CredencialPlataforma" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "refreshCifrado" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredencialPlataforma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CredencialPlataforma_contaId_key" ON "CredencialPlataforma"("contaId");

-- AddForeignKey
ALTER TABLE "CredencialPlataforma" ADD CONSTRAINT "CredencialPlataforma_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaVinculada"("id") ON DELETE CASCADE ON UPDATE CASCADE;
