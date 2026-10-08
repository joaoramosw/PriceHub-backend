-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "comparacao_medicamentos" (
    "medicamento_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "principio_ativo" TEXT NOT NULL,
    "concentracao" TEXT NOT NULL,
    "forma" TEXT NOT NULL,
    "quantidade" TEXT NOT NULL,
    "apresentacao" TEXT NOT NULL,
    "categoria" TEXT,
    "termos_de_busca" TEXT NOT NULL,
    "menor_preco_centavos" INTEGER,
    "maior_preco_centavos" INTEGER,
    "qtd_farmacias" INTEGER NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comparacao_medicamentos_pkey" PRIMARY KEY ("medicamento_id")
);

-- CreateTable
CREATE TABLE "comparacao_ofertas" (
    "medicamento_id" UUID NOT NULL,
    "farmacia_id" TEXT NOT NULL,
    "farmacia_nome" TEXT NOT NULL,
    "oferta_id" UUID NOT NULL,
    "preco_centavos" INTEGER NOT NULL,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "comparacao_ofertas_pkey" PRIMARY KEY ("medicamento_id","farmacia_id")
);

-- CreateTable
CREATE TABLE "eventos_processados" (
    "event_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "processado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "eventos_processados_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE INDEX "comparacao_medicamentos_categoria_idx" ON "comparacao_medicamentos"("categoria");

-- CreateIndex
CREATE INDEX "comparacao_ofertas_farmacia_id_idx" ON "comparacao_ofertas"("farmacia_id");

-- AddForeignKey
ALTER TABLE "comparacao_ofertas" ADD CONSTRAINT "comparacao_ofertas_medicamento_id_fkey" FOREIGN KEY ("medicamento_id") REFERENCES "comparacao_medicamentos"("medicamento_id") ON DELETE RESTRICT ON UPDATE CASCADE;
