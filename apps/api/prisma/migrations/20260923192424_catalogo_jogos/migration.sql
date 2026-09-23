-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('ZERADO', 'JOGANDO', 'QUERO_JOGAR');

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "plataforma" VARCHAR(60) NOT NULL DEFAULT '',
    "status" "GameStatus" NOT NULL,
    "nota" INTEGER,
    "tituloNormalizado" VARCHAR(120) NOT NULL,
    "plataformaNormalizada" VARCHAR(60) NOT NULL DEFAULT '',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Game_status_idx" ON "Game"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Game_tituloNormalizado_plataformaNormalizada_key" ON "Game"("tituloNormalizado", "plataformaNormalizada");

-- Escrito a mao: o Prisma nao modela CHECK. Defesa em profundidade contra gravacao fora do
-- GamesService (a regra da nota tambem e validada no service, sobre o estado final).
ALTER TABLE "Game" ADD CONSTRAINT "Game_nota_range_check"
  CHECK ("nota" IS NULL OR ("nota" BETWEEN 0 AND 10));
ALTER TABLE "Game" ADD CONSTRAINT "Game_nota_status_check"
  CHECK ("nota" IS NULL OR "status" <> 'QUERO_JOGAR');
