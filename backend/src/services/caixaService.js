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

    /**
     * Entrada avulsa continua avulsa, e venda com doces continua com
     * doces. Converter pela edição criaria estados pela metade — uma venda
     * "com doces" sem ter baixado estoque, ou o contrário —, e para a
     * cliente o caminho é mais simples de explicar: excluir e lançar de
     * novo pelo botão certo.
     */
    const eraAvulsa = existente.itens.length === 0;
    const ficaAvulsa = dados.valor !== undefined;
    if (eraAvulsa !== ficaAvulsa) {
      throw new AppError(
        eraAvulsa
          ? 'Esta é uma entrada avulsa: edite o valor. Para registrar doces, exclua e lance pelo botão Venda.'
          : 'Esta venda tem doces: edite os itens. Para virar entrada avulsa, exclua e lance de novo.',
        422
      );
    }

    // Avulsa: só valor, forma e o "com o quê". Não tem estoque para
    // estornar nem para baixar.
    if (eraAvulsa) {
      const total = Number(dados.valor);
      return prisma.venda.update({
        where: { id },
        data: {
          subtotal: total.toFixed(2),
          desconto: '0',
          total: total.toFixed(2),
          formaPagamento: dados.formaPagamento,
          observacao: dados.observacao || null,
          clienteNome: dados.clienteNome || null,
        },
        include: { itens: true },
      });
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
  async listar({ inicio, fim, limite = 200 }) {
    const lista = await prisma.despesa.findMany({
      where:
        inicio || fim
          ? { data: { ...(inicio ? { gte: inicio } : {}), ...(fim ? { lte: fim } : {}) } }
          : {},
      include: COM_TIPO,
      orderBy: { data: 'desc' },
      take: limite,
    });
    return lista.map(paraResposta);
  },

  /**
   * Saída ou retirada pessoal — é tudo o que a cliente escolhe.
   *
   * Ela não usa categoria de despesa: quem diz o que foi é o "Com o quê".
   * A tabela de categorias continua no banco só porque o schema a exige
   * em toda despesa, e porque é o TIPO dela que separa retirada pessoal
   * (sai do caixa, mas não é custo) de saída do negócio no cálculo do
   * lucro. Então o servidor escolhe sozinho uma das duas categorias
   * internas, e nenhuma resposta fala em categoria.
   */
  async criar({ retirada, ...dados }, usuarioId) {
    const categoria = await categoriaInterna(retirada);
    const despesa = await prisma.despesa.create({
      data: { ...dados, categoriaId: categoria.id, usuarioId },
      include: COM_TIPO,
    });
    return paraResposta(despesa);
  },

  /** `retirada` na edição conserta a saída lançada no botão errado. */
  async atualizar(id, { retirada, ...dados }) {
    const existe = await prisma.despesa.findUnique({ where: { id } });
    if (!existe) throw AppError.naoEncontrado('Despesa não encontrada.');

    const categoriaId = retirada === undefined ? undefined : (await categoriaInterna(retirada)).id;
    const despesa = await prisma.despesa.update({
      where: { id },
      data: { ...dados, ...(categoriaId ? { categoriaId } : {}) },
      include: COM_TIPO,
    });
    return paraResposta(despesa);
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

/**
 * As duas únicas categorias que existem para o sistema.
 *
 * `upsert`: um banco que ainda não as tem ganha na primeira despesa, e a
 * saída nunca falha por isso. E o tipo é reafirmado a cada uso — se
 * alguém mexer nele direto no banco, a retirada não passa a contar como
 * custo em silêncio.
 */
export const CATEGORIAS_INTERNAS = {
  saida: { nome: 'Diversos', tipo: 'CUSTO_OPERACIONAL' },
  retirada: { nome: 'Retirada pessoal', tipo: 'RETIRADA_PESSOAL' },
};

function categoriaInterna(retirada) {
  const categoria = retirada ? CATEGORIAS_INTERNAS.retirada : CATEGORIAS_INTERNAS.saida;
  return prisma.categoriaDespesa.upsert({
    where: { nome: categoria.nome },
    update: { tipo: categoria.tipo, ativo: true },
    create: categoria,
  });
}

const COM_TIPO = { categoria: { select: { tipo: true } } };

/** A despesa como a tela a vê: `retirada` no lugar de categoria. */
function paraResposta({ categoria, categoriaId: _categoriaId, ...despesa }) {
  return { ...despesa, retirada: categoria.tipo === 'RETIRADA_PESSOAL' };
}
