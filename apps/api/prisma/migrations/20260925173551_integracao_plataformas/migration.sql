-- CreateEnum
CREATE TYPE "Provedor" AS ENUM ('STEAM');

-- CreateTable
CREATE TABLE "ContaVinculada" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provedor" "Provedor" NOT NULL,
    "idExterno" VARCHAR(40) NOT NULL,
    "nomeExibicao" VARCHAR(80) NOT NULL,
    "vinculadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaVinculada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JogoPlataforma" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "provedor" "Provedor" NOT NULL,
    "idExterno" VARCHAR(40) NOT NULL,
    "minutosJogados" INTEGER NOT NULL,
    "ultimaVezJogadoEm" TIMESTAMP(3),
    "conquistasTotal" INTEGER,
    "conquistasDesbloqueadas" INTEGER,
    "capaUrl" VARCHAR(300),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JogoPlataforma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContaVinculada_userId_provedor_key" ON "ContaVinculada"("userId", "provedor");

-- CreateIndex
CREATE UNIQUE INDEX "ContaVinculada_userId_provedor_idExterno_key" ON "ContaVinculada"("userId", "provedor", "idExterno");

-- CreateIndex
CREATE UNIQUE INDEX "JogoPlataforma_userId_provedor_idExterno_key" ON "JogoPlataforma"("userId", "provedor", "idExterno");

-- CreateIndex
CREATE UNIQUE INDEX "JogoPlataforma_gameId_provedor_key" ON "JogoPlataforma"("gameId", "provedor");

-- AddForeignKey
ALTER TABLE "ContaVinculada" ADD CONSTRAINT "ContaVinculada_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JogoPlataforma" ADD CONSTRAINT "JogoPlataforma_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JogoPlataforma" ADD CONSTRAINT "JogoPlataforma_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECKs escritos à mão (o Prisma não os modela e não os vê como drift), só nas tabelas novas.
-- Horas nunca negativas.
ALTER TABLE "JogoPlataforma" ADD CONSTRAINT "JogoPlataforma_minutos_nao_negativo" CHECK ("minutosJogados" >= 0);

-- Conquistas: nunca negativas, e as desbloqueadas nunca passam do total quando os dois existem.
ALTER TABLE "JogoPlataforma" ADD CONSTRAINT "JogoPlataforma_conquistas_validas" CHECK (
  ("conquistasTotal" IS NULL OR "conquistasTotal" >= 0)
  AND ("conquistasDesbloqueadas" IS NULL OR "conquistasDesbloqueadas" >= 0)
  AND ("conquistasTotal" IS NULL OR "conquistasDesbloqueadas" IS NULL OR "conquistasDesbloqueadas" <= "conquistasTotal")
);
