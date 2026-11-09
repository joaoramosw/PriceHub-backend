ALTER TABLE "comparacao_medicamentos"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "dosagem" TEXT,
  ADD COLUMN "laboratorio" TEXT,
  ADD COLUMN "registro_ms" TEXT,
  ADD COLUMN "tarja" TEXT,
  ADD COLUMN "tarja_tipo" TEXT,
  ADD COLUMN "imagem" TEXT,
  ADD COLUMN "descricao" TEXT,
  ADD COLUMN "indicacao" TEXT,
  ADD COLUMN "modo_de_uso" TEXT,
  ADD COLUMN "contraindicacao" TEXT,
  ADD COLUMN "avaliacao" DOUBLE PRECISION,
  ADD COLUMN "avaliacoes_total" INTEGER;
