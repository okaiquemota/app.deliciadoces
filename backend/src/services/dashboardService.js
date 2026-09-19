import { prisma } from '../lib/prisma.js';
import { estoqueService } from './estoqueService.js';

/**
 * Dashboard.
 *
 * A cliente confere o caixa todo dia, mas olha o RESULTADO por semana.
 * Por isso o período padrão é a semana corrente (segunda a domingo).
 *
 * As somas são feitas no banco (`aggregate`/`groupBy`), não trazendo linha
 * por linha para somar em JavaScript — com o tempo isso viraria lentidão.
 */

/** Segunda-feira da semana de uma data, às 00:00. */
export function inicioDaSemana(referencia = new Date()) {
  const d = new Date(referencia);
  const diaDaSemana = d.getDay(); // 0 = domingo
  const diasDesdeSegunda = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  d.setDate(d.getDate() - diasDesdeSegunda);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function fimDaSemana(referencia = new Date()) {
  const d = inicioDaSemana(referencia);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

export const dashboardService = {
  async resumo({ inicio, fim } = {}) {
    const de = inicio ?? inicioDaSemana();
    const ate = fim ?? fimDaSemana();
    const periodo = { gte: de, lte: ate };

    const [vendas, porForma, despesasPorTipo, alertas, ultimasVendas] = await Promise.all([
      prisma.venda.aggregate({
        where: { data: periodo, cancelada: false },
        _sum: { total: true },
        _count: true,
      }),

      prisma.venda.groupBy({
        by: ['formaPagamento'],
        where: { data: periodo, cancelada: false },
        _sum: { total: true },
      }),

      /**
       * Separar por TIPO de categoria é o coração do cálculo de lucro.
       * RETIRADA_PESSOAL sai do caixa mas NÃO é custo do negócio — a
       * cliente mistura dinheiro pessoal e da confeitaria, e sem essa
       * distinção o resultado dela apareceria pior do que é.
       */
      prisma.$queryRaw`
        SELECT c.tipo, COALESCE(SUM(d.valor), 0) AS total
        FROM despesas d
        JOIN categorias_despesa c ON c.id = d."categoriaId"
        WHERE d.data >= ${de} AND d.data <= ${ate}
        GROUP BY c.tipo`,

      estoqueService.alertas(),

      prisma.venda.findMany({
        where: { cancelada: false },
        include: { itens: { include: { produto: { select: { nome: true } } } } },
        orderBy: { data: 'desc' },
        take: 5,
      }),
    ]);

    const totalVendas = Number(vendas._sum.total ?? 0);

    const custos = Number(despesasPorTipo.find((l) => l.tipo === 'CUSTO_OPERACIONAL')?.total ?? 0);
    const retiradas = Number(
      despesasPorTipo.find((l) => l.tipo === 'RETIRADA_PESSOAL')?.total ?? 0
    );

    return {
      periodo: { inicio: de, fim: ate },

      vendas: totalVendas,
      quantidadeVendas: vendas._count,
      custos,
      retiradas,

      // Lucro do NEGÓCIO: retirada pessoal não entra na conta,
      // mas aparece na tela para ela enxergar quanto tirou.
      lucro: Number((totalVendas - custos).toFixed(2)),

      // Quanto de fato saiu do caixa no período
      saidaDeCaixa: Number((custos + retiradas).toFixed(2)),
      saldoCaixa: Number((totalVendas - custos - retiradas).toFixed(2)),

      vendasPorFormaPagamento: porForma.reduce((acc, linha) => {
        acc[linha.formaPagamento] = Number(linha._sum.total ?? 0);
        return acc;
      }, {}),

      alertas: {
        insumosBaixos: alertas.insumosBaixos.length,
        produtosBaixos: alertas.produtosBaixos.length,
        validadeProxima: alertas.validadeProxima.length,
        detalhe: alertas,
      },

      ultimasVendas,
    };
  },

  /** Série diária do período, para o gráfico. */
  async porDia({ inicio, fim } = {}) {
    const de = inicio ?? inicioDaSemana();
    const ate = fim ?? fimDaSemana();

    const linhas = await prisma.$queryRaw`
      SELECT dia::date AS dia,
             COALESCE(v.total, 0)  AS vendas,
             COALESCE(d.total, 0)  AS despesas
      FROM generate_series(${de}::date, ${ate}::date, '1 day') AS dia
      LEFT JOIN (
        SELECT data::date AS d, SUM(total) AS total
        FROM vendas WHERE cancelada = false GROUP BY data::date
      ) v ON v.d = dia::date
      LEFT JOIN (
        SELECT de.data::date AS d, SUM(de.valor) AS total
        FROM despesas de
        JOIN categorias_despesa c ON c.id = de."categoriaId"
        WHERE c.tipo = 'CUSTO_OPERACIONAL'
        GROUP BY de.data::date
      ) d ON d.d = dia::date
      ORDER BY dia`;

    return linhas.map((l) => ({
      dia: l.dia,
      vendas: Number(l.vendas),
      despesas: Number(l.despesas),
    }));
  },
};
