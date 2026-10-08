-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "farmacias" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farmacias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicamentos" (
    "id" UUID NOT NULL,
    "chave_canonica" TEXT NOT NULL,
    "registro_ms" TEXT,
    "ean" TEXT,
    "nome" TEXT NOT NULL,
    "principio_ativo" TEXT NOT NULL,
    "principio_normalizado" TEXT NOT NULL,
    "concentracao_valor" DOUBLE PRECISION NOT NULL,
    "concentracao_unidade" TEXT NOT NULL,
    "forma" TEXT NOT NULL,
    "quantidade_valor" DOUBLE PRECISION NOT NULL,
    "quantidade_unidade" TEXT NOT NULL,
    "fabricante" TEXT,
    "categoria" TEXT,
    "fonte_dos_dados" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "medicamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ofertas" (
    "id" UUID NOT NULL,
    "farmacia_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "medicamento_id" UUID NOT NULL,
    "nome_na_origem" TEXT NOT NULL,
    "preco_centavos" INTEGER NOT NULL,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ofertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_precos" (
    "id" UUID NOT NULL,
    "oferta_id" UUID NOT NULL,
    "preco_anterior_centavos" INTEGER,
    "preco_centavos" INTEGER NOT NULL,
    "origem" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "registrado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_precos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ofertas_nao_correspondidas" (
    "id" UUID NOT NULL,
    "farmacia_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 1,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ofertas_nao_correspondidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicado_em" TIMESTAMPTZ(3),
    "tentativas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_processados" (
    "event_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "processado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "eventos_processados_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "medicamentos_chave_canonica_key" ON "medicamentos"("chave_canonica");

-- CreateIndex
CREATE UNIQUE INDEX "medicamentos_registro_ms_key" ON "medicamentos"("registro_ms");

-- CreateIndex
CREATE UNIQUE INDEX "medicamentos_ean_key" ON "medicamentos"("ean");

-- CreateIndex
CREATE INDEX "ofertas_medicamento_id_idx" ON "ofertas"("medicamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "ofertas_farmacia_id_external_id_key" ON "ofertas"("farmacia_id", "external_id");

-- CreateIndex
CREATE INDEX "historico_precos_oferta_id_registrado_em_idx" ON "historico_precos"("oferta_id", "registrado_em");

-- CreateIndex
CREATE UNIQUE INDEX "ofertas_nao_correspondidas_farmacia_id_external_id_key" ON "ofertas_nao_correspondidas"("farmacia_id", "external_id");

-- CreateIndex
CREATE INDEX "outbox_publicado_em_criado_em_idx" ON "outbox"("publicado_em", "criado_em");

-- AddForeignKey
ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_farmacia_id_fkey" FOREIGN KEY ("farmacia_id") REFERENCES "farmacias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_medicamento_id_fkey" FOREIGN KEY ("medicamento_id") REFERENCES "medicamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_precos" ADD CONSTRAINT "historico_precos_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "ofertas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "outbox_pendentes_idx" ON "outbox"("criado_em") WHERE "publicado_em" IS NULL;
