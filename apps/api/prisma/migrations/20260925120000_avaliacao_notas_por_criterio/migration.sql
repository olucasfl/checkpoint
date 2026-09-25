-- DESTRUTIVA (spec avaliacao-de-jogos): a coluna "nota" sai e as notas gravadas nela SE PERDEM. Decisao do
-- dono do produto em 2026-09-25: as notas antigas sao descartadas; jogos, titulos, plataformas, capas e donos
-- ficam. Nao ha como reverter sem backup.

-- Os CHECKs antigos citam "nota": saem antes da coluna, de forma explicita (o DROP COLUMN os derrubaria, mas
-- assim o SQL diz o que acontece).
ALTER TABLE "Game" DROP CONSTRAINT IF EXISTS "Game_nota_range_check";
ALTER TABLE "Game" DROP CONSTRAINT IF EXISTS "Game_nota_status_check";

-- AlterTable
ALTER TABLE "Game" DROP COLUMN "nota",
ADD COLUMN     "descricao" VARCHAR(1000),
ADD COLUMN     "notaGameplay" INTEGER,
ADD COLUMN     "notaGraficos" INTEGER,
ADD COLUMN     "notaHistoria" INTEGER,
ADD COLUMN     "notaPerformance" INTEGER,
ADD COLUMN     "notaTrilhaSonora" INTEGER;

-- Escrito a mao: o Prisma nao modela CHECK. Defesa em profundidade contra gravacao fora da API.
-- As notas sao DECIMOS (0 a 100; 73 = 7,3): a faixa vale por coluna...
ALTER TABLE "Game" ADD CONSTRAINT "Game_notaGameplay_range_check"
  CHECK ("notaGameplay" IS NULL OR ("notaGameplay" BETWEEN 0 AND 100));
ALTER TABLE "Game" ADD CONSTRAINT "Game_notaHistoria_range_check"
  CHECK ("notaHistoria" IS NULL OR ("notaHistoria" BETWEEN 0 AND 100));
ALTER TABLE "Game" ADD CONSTRAINT "Game_notaGraficos_range_check"
  CHECK ("notaGraficos" IS NULL OR ("notaGraficos" BETWEEN 0 AND 100));
ALTER TABLE "Game" ADD CONSTRAINT "Game_notaTrilhaSonora_range_check"
  CHECK ("notaTrilhaSonora" IS NULL OR ("notaTrilhaSonora" BETWEEN 0 AND 100));
ALTER TABLE "Game" ADD CONSTRAINT "Game_notaPerformance_range_check"
  CHECK ("notaPerformance" IS NULL OR ("notaPerformance" BETWEEN 0 AND 100));

-- ...e Quero jogar nao tem nota nenhuma.
ALTER TABLE "Game" ADD CONSTRAINT "Game_notas_status_check"
  CHECK (
    "status" <> 'QUERO_JOGAR'
    OR (
      "notaGameplay" IS NULL
      AND "notaHistoria" IS NULL
      AND "notaGraficos" IS NULL
      AND "notaTrilhaSonora" IS NULL
      AND "notaPerformance" IS NULL
    )
  );
