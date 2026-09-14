import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { estoqueService } from './estoqueService.js';

/**
 * Caixa: vendas e despesas.
 *
 * Toda venda é À VISTA. A cliente não vende fiado — recebe tudo na entrega
 * — então aqui não existe conta a receber, parcela nem sinal.
 */

/** Soma os itens no servidor. Nunca aceitamos total vindo do cliente. */
function calcularTotais(itens, desconto = 0) {
  const subtotal = itens.reduce(
    (soma, item) => soma + Number(item.quantidade) * Number(item.precoUnitario),
    0
  );
  const total = subtotal - Number(desconto || 0);

  if (total < 0) {
    throw new AppError('O desconto não pode ser maior que o subtotal.', 422);
  }

  return { subtotal, total };
}

export const vendaService = {
  async listar({ inicio, fim, formaPagamento, incluirCanceladas = false, limite = 200 }) {
    return prisma.venda.findMany({
      where: {
        ...(incluirCanceladas ? {} : { cancelada: false }),
        ...(formaPagamento ? { formaPagamento } : {}),
        ...(inicio || fim
          ? { data: { ...(inicio ? { gte: inicio } : {}), ...(fim ? { lte: fim } : {}) } }
          : {}),
      },
      include: { itens: { include: { produto: { select: { nome: true } } } } },
      orderBy: { data: 'desc' },
      take: limite,
    });
  },

  async porId(id) {
    const venda = await prisma.venda.findUnique({
      where: { id },
      include: { itens: { include: { produto: { select: { nome: true } } } } },
    });
    if (!venda) throw AppError.naoEncontrado('Venda não encontrada.');
    return venda;
  },

  /**
   * Cria a venda, os itens e a baixa de estoque — tudo ou nada.
   *
   * O preço do item é CONGELADO aqui: se o preço do produto mudar amanhã,
   * a venda de hoje continua valendo o que valeu.
   */
  async criar({ itens, desconto = 0, formaPagamento, clienteNome, observacao, data }, usuarioId) {
    if (!itens?.length) {
      throw new AppError('Informe ao menos um item na venda.', 422);
    }

    return prisma.$transaction(async (tx) => {
      const produtos = await tx.produto.findMany({
        where: { id: { in: itens.map((i) => i.produtoId) } },
      });

      const itensCalculados = itens.map((item) => {
        const produto = produtos.find((p) => p.id === item.produtoId);
        if (!produto) {
          throw AppError.naoEncontrado(`Produto ${item.produtoId} não encontrado.`);
        }

        // Preço vem do cadastro, não do cliente — evita venda adulterada.
        const precoUnitario = Number(produto.precoVenda);
        const quantidade = Number(item.quantidade);

        return {
          produtoId: produto.id,
          quantidade,
          precoUnitario,
          subtotal: Number((quantidade * precoUnitario).toFixed(2)),
        };
      });

      const { subtotal, total } = calcularTotais(itensCalculados, desconto);

      const venda = await tx.venda.create({
        data: {
          subtotal: subtotal.toFixed(2),
          desconto: Number(desconto || 0).toFixed(2),
          total: total.toFixed(2),
          formaPagamento,
          clienteNome: clienteNome || null,
          observacao: observacao || null,
          usuarioId,
          ...(data ? { data } : {}),
          itens: { create: itensCalculados },
        },
        include: { itens: true },
      });

      // Baixa automática do doce pronto — pedido explícito da cliente
      for (const item of itensCalculados) {
        await estoqueService.movimentar(tx, {
          tipo: 'SAIDA_VENDA',
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          vendaId: venda.id,
          usuarioId,
          ...(data ? { data } : {}),
        });
      }

      return venda;
    });
  },

  /**
   * Editar é fluxo principal, não exceção: a cliente erra e corrige.
   * Estorna o estoque antigo e aplica o novo na mesma transação — senão
   * o saldo desanda.
   */
  async atualizar(id, dados, usuarioId) {
    const existente = await vendaService.porId(id);

    if (existente.cancelada) {
      throw new AppError('Não é possível editar uma venda cancelada.', 409);
    }

    return prisma.$transaction(async (tx) => {
      await estoqueService.estornarPorOrigem(tx, { vendaId: id });
      await tx.itemVenda.deleteMany({ where: { vendaId: id } });

      const produtos = await tx.produto.findMany({
        where: { id: { in: dados.itens.map((i) => i.produtoId) } },
      });

      const itensCalculados = dados.itens.map((item) => {
        const produto = produtos.find((p) => p.id === item.produtoId);
        if (!produto) {
          throw AppError.naoEncontrado(`Produto ${item.produtoId} não encontrado.`);
        }
        const precoUnitario = Number(produto.precoVenda);
        const quantidade = Number(item.quantidade);
        return {
          produtoId: produto.id,
          quantidade,
          precoUnitario,
          subtotal: Number((quantidade * precoUnitario).toFixed(2)),
        };
      });

      const { subtotal, total } = calcularTotais(itensCalculados, dados.desconto);

      const venda = await tx.venda.update({
        where: { id },
        data: {
          subtotal: subtotal.toFixed(2),
          desconto: Number(dados.desconto || 0).toFixed(2),
          total: total.toFixed(2),
          formaPagamento: dados.formaPagamento,
          clienteNome: dados.clienteNome || null,
          observacao: dados.observacao || null,
          ...(dados.data ? { data: dados.data } : {}),
          itens: { create: itensCalculados },
        },
        include: { itens: true },
      });

      for (const item of itensCalculados) {
        await estoqueService.movimentar(tx, {
          tipo: 'SAIDA_VENDA',
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          vendaId: id,
          usuarioId,
        });
      }

      return venda;
    });
  },

  /**
   * O botão "Excluir" da tela chama isto.
   *
   * Nada é apagado: marcamos `cancelada` e devolvemos o estoque. A cliente
   * erra com frequência e precisa poder voltar atrás — e um sistema
   * financeiro que apaga histórico não presta contas de nada.
   */
  async cancelar(id) {
    const venda = await vendaService.porId(id);

    if (venda.cancelada) {
      throw new AppError('Esta venda já está cancelada.', 409);
    }

    return prisma.$transaction(async (tx) => {
      await estoqueService.estornarPorOrigem(tx, { vendaId: id });
      return tx.venda.update({ where: { id }, data: { cancelada: true } });
    });
  },

  async reabrir(id) {
    const venda = await vendaService.porId(id);
    if (!venda.cancelada) {
      throw new AppError('Esta venda não está cancelada.', 409);
    }

    return prisma.$transaction(async (tx) => {
      for (const item of venda.itens) {
        await estoqueService.movimentar(tx, {
          tipo: 'SAIDA_VENDA',
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          vendaId: id,
        });
      }
      return tx.venda.update({ where: { id }, data: { cancelada: false } });
    });
  },
};

export const despesaService = {
  async listarCategorias() {
    return prisma.categoriaDespesa.findMany({
      where: { ativo: true },
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
    });
  },

  async listar({ inicio, fim, categoriaId, limite = 200 }) {
    return prisma.despesa.findMany({
      where: {
        ...(categoriaId ? { categoriaId } : {}),
        ...(inicio || fim
          ? { data: { ...(inicio ? { gte: inicio } : {}), ...(fim ? { lte: fim } : {}) } }
          : {}),
      },
      include: { categoria: true },
      orderBy: { data: 'desc' },
      take: limite,
    });
  },

  async criar(dados, usuarioId) {
    return prisma.despesa.create({
      data: { ...dados, usuarioId },
      include: { categoria: true },
    });
  },

  async atualizar(id, dados) {
    const existe = await prisma.despesa.findUnique({ where: { id } });
    if (!existe) throw AppError.naoEncontrado('Despesa não encontrada.');

    return prisma.despesa.update({
      where: { id },
      data: dados,
      include: { categoria: true },
    });
  },

  /**
   * Despesa pode ser apagada de verdade: ela não move estoque por si só.
   * Se tiver entrada de estoque vinculada, o cascade leva as movimentações
   * junto — por isso estornamos o saldo antes, na mesma transação.
   */
  async excluir(id) {
    const existe = await prisma.despesa.findUnique({ where: { id } });
    if (!existe) throw AppError.naoEncontrado('Despesa não encontrada.');

    return prisma.$transaction(async (tx) => {
      await estoqueService.estornarPorOrigem(tx, { despesaId: id });
      return tx.despesa.delete({ where: { id } });
    });
  },
};
