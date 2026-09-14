import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { estoqueService } from './estoqueService.js';

/**
 * Produção em lote.
 *
 * A cliente "faz antes e deixa pronto": a produção é que consome insumo e
 * gera doce pronto. A venda depois só baixa o doce.
 *
 * A ficha técnica é OPCIONAL — ela só cadastraria "se for simples". Então
 * existem dois caminhos, e o segundo não é plano B, é o provável:
 *   1. com ficha: os insumos saem calculados do rendimento
 *   2. sem ficha: ela informa os insumos na mão
 */
export const producaoService = {
  async listar({ inicio, fim, produtoId, limite = 100 }) {
    return prisma.producao.findMany({
      where: {
        ...(produtoId ? { produtoId } : {}),
        ...(inicio || fim
          ? { data: { ...(inicio ? { gte: inicio } : {}), ...(fim ? { lte: fim } : {}) } }
          : {}),
      },
      include: {
        produto: { select: { nome: true, unidade: true } },
        movimentacoes: {
          include: { insumo: { select: { nome: true, unidade: true } } },
        },
      },
      orderBy: { data: 'desc' },
      take: limite,
    });
  },

  /**
   * Calcula os insumos de um lote a partir da ficha técnica.
   * Devolve lista vazia quando não há ficha — e isso é normal.
   */
  async previsaoInsumos(produtoId, quantidadeProduzida) {
    const produto = await prisma.produto.findUnique({
      where: { id: produtoId },
      include: { fichaTecnica: { include: { insumo: true } } },
    });

    if (!produto) throw AppError.naoEncontrado('Produto não encontrado.');
    if (!produto.fichaTecnica.length || !produto.rendimentoReceita) return [];

    // Quantas vezes a receita foi executada
    const lotes = Number(quantidadeProduzida) / Number(produto.rendimentoReceita);

    return produto.fichaTecnica.map((item) => ({
      insumoId: item.insumoId,
      nome: item.insumo.nome,
      unidade: item.insumo.unidade,
      quantidade: Number((Number(item.quantidade) * lotes).toFixed(3)),
      custoUnitario: Number(item.insumo.custoUnitario),
    }));
  },

  async registrar({ produtoId, quantidade, insumos, observacao, data }, usuarioId) {
    const produto = await prisma.produto.findUnique({
      where: { id: produtoId },
      include: { fichaTecnica: true },
    });
    if (!produto) throw AppError.naoEncontrado('Produto não encontrado.');

    // Se a aplicação não mandou insumos, tenta a ficha técnica.
    // Se também não houver ficha, produz sem baixar insumo — é um cenário
    // legítimo (ela pode ainda não ter cadastrado nada).
    const insumosUsados = insumos?.length
      ? insumos
      : await producaoService.previsaoInsumos(produtoId, quantidade);

    return prisma.$transaction(async (tx) => {
      const idsInsumos = insumosUsados.map((i) => i.insumoId);
      const cadastros = idsInsumos.length
        ? await tx.insumo.findMany({ where: { id: { in: idsInsumos } } })
        : [];

      const custoEstimado = insumosUsados.reduce((soma, item) => {
        const cadastro = cadastros.find((c) => c.id === item.insumoId);
        const custo = Number(cadastro?.custoUnitario ?? 0);
        return soma + Number(item.quantidade) * custo;
      }, 0);

      const producao = await tx.producao.create({
        data: {
          produtoId,
          quantidade: Number(quantidade),
          custoEstimado: insumosUsados.length ? custoEstimado.toFixed(2) : null,
          observacao: observacao || null,
          usuarioId,
          ...(data ? { data } : {}),
        },
      });

      // Consome os insumos
      for (const item of insumosUsados) {
        await estoqueService.movimentar(tx, {
          tipo: 'SAIDA_PRODUCAO',
          insumoId: item.insumoId,
          quantidade: item.quantidade,
          producaoId: producao.id,
          usuarioId,
          ...(data ? { data } : {}),
        });
      }

      // Gera o doce pronto
      await estoqueService.movimentar(tx, {
        tipo: 'ENTRADA_PRODUCAO',
        produtoId,
        quantidade: Number(quantidade),
        producaoId: producao.id,
        usuarioId,
        ...(data ? { data } : {}),
      });

      return producao;
    });
  },

  /** Desfaz o lote: devolve o insumo e tira o doce pronto. */
  async excluir(id) {
    const producao = await prisma.producao.findUnique({ where: { id } });
    if (!producao) throw AppError.naoEncontrado('Produção não encontrada.');

    return prisma.$transaction(async (tx) => {
      await estoqueService.estornarPorOrigem(tx, { producaoId: id });
      return tx.producao.delete({ where: { id } });
    });
  },
};
