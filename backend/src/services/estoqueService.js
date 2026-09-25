import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { colunaDoDia, diaDaColuna, diaDoCliente } from '../utils/periodo.js';

const DIA = 24 * 60 * 60 * 1000;

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
      /**
       * Validade fica na ENTRADA, não no insumo: cada compra tem a sua.
       *
       * O limite INFERIOR não existia, e isso estragava o alerta: lote
       * vencido há seis meses continuava casando com `lte: hoje+15d` para
       * sempre. Como a ordem é por validade crescente, os mais velhos
       * vinham primeiro e, com o teto de 20 itens, empurravam para fora
       * justamente o que vencia amanhã — o alerta parava de avisar o que
       * ainda dava para salvar.
       *
       * Agora entra uma janela: vencido há até 30 dias (ainda pode estar
       * na prateleira esperando descarte) até vencendo em 15.
       */
      prisma.movimentacaoEstoque.findMany({
        where: {
          tipo: 'ENTRADA_COMPRA',
          validade: {
            gte: new Date(Date.now() - 30 * DIA),
            lte: new Date(Date.now() + 15 * DIA),
          },
        },
        include: { insumo: { select: { nome: true, unidade: true } } },
        orderBy: { validade: 'asc' },
        take: 20,
      }),
    ]);

    return { insumosBaixos: insumos, produtosBaixos: produtos, validadeProxima: validades };
  },

  /**
   * Lotes com validade, para a tela de conferência.
   *
   * A unidade é o LOTE, não o ingrediente: a validade está na entrada de
   * compra, então o mesmo creme de leite pode ter três lotes com três
   * datas. Agrupar por ingrediente esconderia justamente a informação que
   * importa — qual caixa usar primeiro.
   *
   * IMPORTANTE, e a tela avisa: o sistema não sabe quanto RESTA de cada
   * lote. As saídas não apontam para qual entrada baixaram, então o que
   * aparece é a quantidade que ENTROU. Amarrar saída a lote é mudança
   * maior, que mexe em como a venda dá baixa; enquanto não existe, é mais
   * honesto mostrar o número certo com o rótulo certo do que inventar um
   * saldo por lote que o dado não sustenta.
   */
  async validades({ inicio, fim, situacao } = {}) {
    const agora = new Date();
    const where = { tipo: 'ENTRADA_COMPRA', validade: { not: null } };

    if (situacao === 'vencidos') {
      where.validade = { lt: agora };
    } else if (situacao === '7' || situacao === '30') {
      // Vencendo: da data de hoje para frente, dentro da janela.
      where.validade = { gte: agora, lte: new Date(Date.now() + Number(situacao) * DIA) };
    }

    // Intervalo digitado manda sobre o atalho, se vier junto.
    //
    // A validade é um DIA, digitado num campo de data e guardado como
    // meia-noite UTC. O período chega em instantes de Brasília (00:00 é
    // 03:00 UTC), então compara-se dia com dia: senão o lote que vence no
    // primeiro dia pedido ficava de fora e o do dia seguinte ao último
    // entrava.
    if (inicio || fim) {
      where.validade = {
        ...(inicio ? { gte: colunaDoDia(diaDoCliente(inicio)) } : {}),
        ...(fim ? { lte: new Date(colunaDoDia(diaDoCliente(fim)).getTime() + DIA - 1) } : {}),
      };
    }

    const lotes = await prisma.movimentacaoEstoque.findMany({
      where,
      include: { insumo: { select: { id: true, nome: true, unidade: true } } },
      orderBy: { validade: 'asc' },
      take: 200,
    });

    return lotes.map((l) => {
      // Dias em data cheia, não em milissegundos: um lote que vence hoje
      // às 23h não pode aparecer como "vence em 0 dias" de manhã e
      // "vencido" à tarde.
      const venc = new Date(l.validade);
      venc.setHours(0, 0, 0, 0);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const dias = Math.round((venc - hoje) / DIA);

      return {
        id: l.id,
        insumo: l.insumo,
        quantidadeEntrada: l.quantidade,
        data: l.data,
        // Texto ("2026-09-25"), o dia que ela digitou. Como `Date` de
        // meia-noite UTC, o navegador em Brasília mostrava a véspera.
        validade: diaDaColuna(l.validade),
        dias,
        vencido: dias < 0,
      };
    });
  },
};

export { calcularDelta };
