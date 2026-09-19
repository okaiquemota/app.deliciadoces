import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';

/**
 * ÚNICO lugar autorizado a alterar `quantidadeAtual` de insumo ou produto.
 *
 * Por que essa regra existe: `quantidadeAtual` é um CACHE do que a tabela
 * `movimentacoes_estoque` (o razão) diz. Se alguém gravar movimentação sem
 * atualizar o saldo — ou o contrário — os dois passam a discordar em
 * silêncio, e ninguém percebe até o estoque estar errado há semanas.
 *
 * Por isso todas as funções daqui recebem um `tx` (client de transação) e
 * devem ser chamadas DENTRO de `prisma.$transaction`. Movimentação e saldo
 * mudam juntos ou não muda nada.
 *
 * A quantidade gravada é SEMPRE positiva; quem diz a direção é o `tipo`.
 */

/** Tipos que somam no estoque. Os demais subtraem. */
const TIPOS_QUE_SOMAM = new Set(['ENTRADA_COMPRA', 'ENTRADA_PRODUCAO']);

/**
 * AJUSTE é o único tipo que não tem direção fixa: serve para corrigir o
 * saldo após contagem manual, e pode tanto somar quanto subtrair. Por isso
 * ele carrega o sinal na própria quantidade informada pela aplicação.
 */
function calcularDelta(tipo, quantidade) {
  const valor = Number(quantidade);

  if (tipo === 'AJUSTE') return valor;
  return TIPOS_QUE_SOMAM.has(tipo) ? Math.abs(valor) : -Math.abs(valor);
}

function validarAlvo({ insumoId, produtoId }) {
  if (Boolean(insumoId) === Boolean(produtoId)) {
    throw new AppError('Informe exatamente um entre insumo e produto na movimentação.', 422);
  }
}

export const estoqueService = {
  /**
   * Registra uma movimentação e ajusta o saldo, na mesma transação.
   *
   * @param {object} tx client de transação do Prisma (obrigatório)
   */
  async movimentar(tx, dados) {
    const {
      tipo,
      insumoId = null,
      produtoId = null,
      quantidade,
      custoUnitario = null,
      validade = null,
      motivo = null,
      vendaId = null,
      producaoId = null,
      despesaId = null,
      usuarioId = null,
      data = undefined,
    } = dados;

    validarAlvo({ insumoId, produtoId });

    // Regra de negócio: perda e ajuste precisam de justificativa. O banco
    // deixa o campo nulo de propósito; a trava é aqui, onde dá para dar
    // uma mensagem decente ao usuário.
    if ((tipo === 'PERDA' || tipo === 'AJUSTE') && !motivo?.trim()) {
      throw new AppError(
        tipo === 'PERDA'
          ? 'Informe o motivo da perda (estragou, venceu, queimou...).'
          : 'Informe o motivo do ajuste de contagem.',
        422
      );
    }

    const delta = calcularDelta(tipo, quantidade);

    if (delta === 0) {
      throw new AppError('A quantidade da movimentação não pode ser zero.', 422);
    }

    const movimentacao = await tx.movimentacaoEstoque.create({
      data: {
        tipo,
        insumoId,
        produtoId,
        quantidade: Math.abs(Number(quantidade)),
        custoUnitario,
        validade,
        motivo,
        vendaId,
        producaoId,
        despesaId,
        usuarioId,
        ...(data ? { data } : {}),
      },
    });

    if (insumoId) {
      await tx.insumo.update({
        where: { id: insumoId },
        data: { quantidadeAtual: { increment: delta } },
      });
    } else {
      await tx.produto.update({
        where: { id: produtoId },
        data: { quantidadeAtual: { increment: delta } },
      });
    }

    return movimentacao;
  },

  /**
   * Desfaz movimentações de uma origem (venda, produção ou despesa),
   * devolvendo ao saldo exatamente o que elas tiraram.
   *
   * Apaga os registros em vez de lançar contra-movimentações: a origem
   * está sendo editada ou cancelada, então o histórico correto é o que
   * sobrar depois. O razão continua batendo com o saldo.
   */
  async estornarPorOrigem(tx, { vendaId = null, producaoId = null, despesaId = null }) {
    const filtro = vendaId ? { vendaId } : producaoId ? { producaoId } : { despesaId };

    const movimentacoes = await tx.movimentacaoEstoque.findMany({ where: filtro });

    for (const mov of movimentacoes) {
      const delta = calcularDelta(mov.tipo, mov.quantidade);

      // Devolver é aplicar o delta ao contrário
      if (mov.insumoId) {
        await tx.insumo.update({
          where: { id: mov.insumoId },
          data: { quantidadeAtual: { decrement: delta } },
        });
      } else if (mov.produtoId) {
        await tx.produto.update({
          where: { id: mov.produtoId },
          data: { quantidadeAtual: { decrement: delta } },
        });
      }
    }

    await tx.movimentacaoEstoque.deleteMany({ where: filtro });

    return movimentacoes.length;
  },

  /**
   * Recalcula o saldo a partir do razão.
   *
   * Serve para corrigir divergência e para checar em teste que o cache
   * continua fiel ao histórico. Se algum dia alguém escrever saldo por
   * fora desta camada, é isto que conserta.
   */
  async recalcularSaldo({ insumoId = null, produtoId = null }) {
    validarAlvo({ insumoId, produtoId });

    const filtro = insumoId ? { insumoId } : { produtoId };
    const movimentacoes = await prisma.movimentacaoEstoque.findMany({ where: filtro });

    const saldo = movimentacoes.reduce(
      (total, mov) => total + calcularDelta(mov.tipo, mov.quantidade),
      0
    );

    if (insumoId) {
      return prisma.insumo.update({
        where: { id: insumoId },
        data: { quantidadeAtual: saldo },
      });
    }

    return prisma.produto.update({
      where: { id: produtoId },
      data: { quantidadeAtual: saldo },
    });
  },

  /** Histórico, com filtros de período e de item. */
  async listarMovimentacoes({ insumoId, produtoId, tipo, inicio, fim, limite = 100 }) {
    return prisma.movimentacaoEstoque.findMany({
      where: {
        ...(insumoId ? { insumoId } : {}),
        ...(produtoId ? { produtoId } : {}),
        ...(tipo ? { tipo } : {}),
        ...(inicio || fim
          ? { data: { ...(inicio ? { gte: inicio } : {}), ...(fim ? { lte: fim } : {}) } }
          : {}),
      },
      include: {
        insumo: { select: { nome: true, unidade: true } },
        produto: { select: { nome: true, unidade: true } },
      },
      orderBy: { data: 'desc' },
      take: limite,
    });
  },

  /** Itens abaixo do mínimo — a cliente já ficou sem ingrediente várias vezes. */
  async alertas() {
    const [insumos, produtos, validades] = await Promise.all([
      prisma.$queryRaw`
        SELECT id, nome, unidade, "quantidadeAtual", "estoqueMinimo"
        FROM insumos
        WHERE ativo = true AND "estoqueMinimo" > 0 AND "quantidadeAtual" <= "estoqueMinimo"
        ORDER BY nome`,
      prisma.$queryRaw`
        SELECT id, nome, unidade, "quantidadeAtual", "estoqueMinimo"
        FROM produtos
        WHERE ativo = true AND "estoqueMinimo" > 0 AND "quantidadeAtual" <= "estoqueMinimo"
        ORDER BY nome`,
      // Validade fica na ENTRADA, não no insumo: cada compra tem a sua.
      prisma.movimentacaoEstoque.findMany({
        where: {
          tipo: 'ENTRADA_COMPRA',
          validade: {
            not: null,
            lte: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
          },
        },
        include: { insumo: { select: { nome: true, unidade: true } } },
        orderBy: { validade: 'asc' },
        take: 20,
      }),
    ]);

    return { insumosBaixos: insumos, produtosBaixos: produtos, validadeProxima: validades };
  },
};

export { calcularDelta };
