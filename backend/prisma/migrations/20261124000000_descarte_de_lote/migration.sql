-- Descarte de lote: a PERDA pode apontar para a compra de onde saiu.
ALTER TABLE "movimentacoes_estoque" ADD COLUMN "loteId" TEXT;

CREATE INDEX "movimentacoes_estoque_loteId_idx" ON "movimentacoes_estoque"("loteId");

ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "movimentacoes_estoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;
