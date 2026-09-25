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
  async criar(
    { itens, valor, desconto = 0, formaPagamento, clienteNome, observacao, data },
    usuarioId
  ) {
    const temItens = Boolean(itens?.length);
    const temValor = valor !== undefined && valor !== null && valor !== '';

    if (temItens && temValor) {
      throw new AppError(
        'Informe os produtos OU um valor avulso, não os dois: com produtos o total sai do cadastro.',
        422
      );
    }

    /**
     * Entrada de dinheiro sem produto.
     *
     * A cliente pediu um caminho de um toque para a correria do balcão:
     * digita o valor e pronto. Sem saber o que saiu, o estoque NÃO pode
     * ser baixado — chutar produto seria pior que não mexer, porque
     * corromperia o saldo em silêncio.
     *
     * Fica gravada como venda sem itens. A ausência de item é o próprio
     * sinal, estrutural: não depende de texto na observação, que a
     * cliente pode apagar sem querer. Continua contando no caixa, no
     * lucro e no fechamento, que é o comportamento correto — só não
     * movimenta estoque.
     */
    if (temValor) {
      const total = Number(valor);
      if (!Number.isFinite(total) || total <= 0) {
        throw new AppError('Informe um valor maior que zero.', 422);
      }

      return prisma.venda.create({
        data: {
          subtotal: total.toFixed(2),
          desconto: '0',
          total: total.toFixed(2),
          formaPagamento,
          clienteNome: clienteNome || null,
          observacao: observacao || null,
          usuarioId,
          ...(data ? { data } : {}),
        },
        include: { itens: true },
      });
    }

    if (!temItens) {
      throw new AppError('Informe ao menos um item na venda, ou um valor avulso.', 422);
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

  /**
   * Sem categoria, a despesa vai para "Diversos".
   *
   * A saída rápida da tela inicial deixou de perguntar categoria — a
   * cliente pediu o caminho mais curto, e quem diz o que foi é o "Com o
   * quê". O que NÃO podia acontecer era a despesa cair na primeira
   * categoria da lista: em ordem alfabética é "Ajudante", e o gás de
   * cozinha ficaria registrado como pagamento de ajudante.
   *
   * "Diversos" é honesto sobre não saber, e é custo do negócio — então o
   * lucro continua certo, porque o cálculo depende do TIPO da categoria,
   * não do nome. Se precisar classificar depois, a despesa se edita no
   * Caixa, onde o seletor continua existindo.
   *
   * `upsert` e não só busca: a categoria nasce no seed, mas um banco que
   * já existia antes dela não a tem, e a saída não pode falhar por isso.
   */
  async criar(dados, usuarioId) {
    const categoriaId = dados.categoriaId ?? (await categoriaDiversos()).id;
    return prisma.despesa.create({
      data: { ...dados, categoriaId, usuarioId },
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

export const CATEGORIA_DIVERSOS = 'Diversos';

function categoriaDiversos() {
  return prisma.categoriaDespesa.upsert({
    where: { nome: CATEGORIA_DIVERSOS },
    update: {},
    create: { nome: CATEGORIA_DIVERSOS, tipo: 'CUSTO_OPERACIONAL' },
  });
}
