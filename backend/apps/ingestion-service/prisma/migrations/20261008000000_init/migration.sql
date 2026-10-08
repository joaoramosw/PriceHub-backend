-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "coletas_brutas" (
    "id" UUID NOT NULL,
    "farmacia_id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "ofertas" INTEGER NOT NULL DEFAULT 0,
    "recebido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coletas_brutas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coletas_brutas_farmacia_id_recebido_em_idx" ON "coletas_brutas"("farmacia_id", "recebido_em");

-- CreateIndex
CREATE INDEX "coletas_brutas_correlation_id_idx" ON "coletas_brutas"("correlation_id");
