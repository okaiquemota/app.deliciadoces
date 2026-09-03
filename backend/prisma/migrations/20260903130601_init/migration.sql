-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('ADMIN', 'OPERADOR');

-- CreateEnum
CREATE TYPE "TipoMovimentacao" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "TipoConta" AS ENUM ('PAGAR', 'RECEBER');

-- CreateEnum
CREATE TYPE "StatusConta" AS ENUM ('PENDENTE', 'QUITADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "PapelUsuario" NOT NULL DEFAULT 'OPERADOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "unidadeMedida" TEXT NOT NULL DEFAULT 'un',
    "categoria" TEXT,
    "custoUnitario" DECIMAL(10,2),
    "precoVenda" DECIMAL(10,2),
    "quantidadeEstoque" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "estoqueMinimo" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacoes_estoque" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentacao" NOT NULL,
    "quantidade" DECIMAL(10,3) NOT NULL,
    "observacao" TEXT,
    "dataMovimentacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "produtoId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacoes_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacoes_caixa" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentacao" NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT,
    "formaPagamento" TEXT,
    "dataMovimentacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contaId" TEXT,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacoes_caixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_pagar_receber" (
    "id" TEXT NOT NULL,
    "tipo" "TipoConta" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "status" "StatusConta" NOT NULL DEFAULT 'PENDENTE',
    "contraparte" TEXT,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "dataQuitacao" TIMESTAMP(3),
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contas_pagar_receber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "produtos_nome_idx" ON "produtos"("nome");

-- CreateIndex
CREATE INDEX "produtos_ativo_idx" ON "produtos"("ativo");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_produtoId_idx" ON "movimentacoes_estoque"("produtoId");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_dataMovimentacao_idx" ON "movimentacoes_estoque"("dataMovimentacao");

-- CreateIndex
CREATE INDEX "movimentacoes_caixa_dataMovimentacao_idx" ON "movimentacoes_caixa"("dataMovimentacao");

-- CreateIndex
CREATE INDEX "movimentacoes_caixa_tipo_idx" ON "movimentacoes_caixa"("tipo");

-- CreateIndex
CREATE INDEX "contas_pagar_receber_dataVencimento_idx" ON "contas_pagar_receber"("dataVencimento");

-- CreateIndex
CREATE INDEX "contas_pagar_receber_status_idx" ON "contas_pagar_receber"("status");

-- CreateIndex
CREATE INDEX "contas_pagar_receber_tipo_idx" ON "contas_pagar_receber"("tipo");

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_caixa" ADD CONSTRAINT "movimentacoes_caixa_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "contas_pagar_receber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_caixa" ADD CONSTRAINT "movimentacoes_caixa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_pagar_receber" ADD CONSTRAINT "contas_pagar_receber_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
