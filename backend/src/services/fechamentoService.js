import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';

/**
 * Fechamento diário de caixa.
 *
 * No fim do dia a cliente conta o dinheiro da gaveta e compara com o que o
 * sistema diz que deveria estar lá. A diferença é o que interessa: ela
 * mostra venda não lançada, troco errado ou retirada esquecida.
 *
 * DECISÃO CENTRAL: só dinheiro vivo entra na conta.
 *
 * Venda no PIX ou no cartão não coloca nada na gaveta. Se o saldo calculado
 * somasse todas as vendas, a diferença daria errada todo santo dia, sempre
 * no mesmo sentido, e o número perderia qualquer utilidade — que é
 * justamente o contrário do que o fechamento existe para fazer.
 *
 * Por isso:
 *   saldoCalculado = saldoInicial
 *                  + vendas do dia em DINHEIRO (descontando as canceladas)
 *                  - despesas do dia pagas em DINHEIRO (retiradas incluídas)
 *
 * Retirada pessoal entra como saída aqui, mesmo não sendo custo do negócio:
 * no dashboard ela não polui o lucro, mas na gaveta o dinheiro saiu de
 * verdade e a contagem tem que refletir isso.
 */

/** Meia-noite local da data informada — o schema guarda `data` como DATE. */
function inicioDoDia(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fimDoDia(data) {
  const d = new Date(data);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Decimal do Prisma -> número. */
const numero = (valor) => Number(valor ?? 0);

/** Arredonda para centavos, evitando lixo de ponto flutuante na soma. */
const centavos = (valor) => Math.round(valor * 100) / 100;

export const fechamentoService = {
  /**
   * Calcula o movimento de dinheiro do dia SEM gravar nada.
   *
   * É o que a tela mostra antes de a cliente digitar quanto contou: ela
   * precisa ver o esperado para então conferir a gaveta.
   */
  async previa(data = new Date()) {
    const de = inicioDoDia(data);
    const ate = fimDoDia(data);
    const periodo = { gte: de, lte: ate };

    const [vendasPorForma, despesas, anterior] = await Promise.all([
      prisma.venda.groupBy({
        by: ['formaPagamento'],
        where: { data: periodo, cancelada: false },
        _sum: { total: true },
        _count: true,
      }),

      /**
       * `formaPagamento` da despesa é opcional no schema, e na prática a
       * cliente nem sempre preenche. Despesa sem forma registrada entra
       * como dinheiro: é o caso comum num balcão, e deixar de fora faria o
       * saldo esperado ficar alto, acusando falta de dinheiro que não
       * existe. O retorno informa quantas foram assumidas assim, para a
       * tela avisar em vez de esconder a suposição.
       */
      prisma.despesa.findMany({
        where: { data: periodo },
        select: {
          valor: true,
          formaPagamento: true,
          categoria: { select: { tipo: true } },
        },
      }),

      this.saldoDeAbertura(de),
    ]);

    const entradasDinheiro = centavos(
      numero(vendasPorForma.find((v) => v.formaPagamento === 'DINHEIRO')?._sum.total)
    );
    const entradasOutras = centavos(
      vendasPorForma
        .filter((v) => v.formaPagamento !== 'DINHEIRO')
        .reduce((soma, v) => soma + numero(v._sum.total), 0)
    );

    const emDinheiro = despesas.filter((d) => d.formaPagamento === 'DINHEIRO' || !d.formaPagamento);
    const saidasDinheiro = centavos(emDinheiro.reduce((soma, d) => soma + numero(d.valor), 0));
    const retiradasDinheiro = centavos(
      emDinheiro
        .filter((d) => d.categoria.tipo === 'RETIRADA_PESSOAL')
        .reduce((soma, d) => soma + numero(d.valor), 0)
    );

    const saldoInicial = centavos(anterior);
    const saldoCalculado = centavos(saldoInicial + entradasDinheiro - saidasDinheiro);

    return {
      data: de,
      saldoInicial,
      totalEntradas: entradasDinheiro,
      totalSaidas: saidasDinheiro,
      saldoCalculado,

      // Contexto para a tela explicar de onde veio o número
      detalhe: {
        vendasDinheiro: entradasDinheiro,
        vendasOutrasFormas: entradasOutras,
        retiradas: retiradasDinheiro,
        despesasSemFormaInformada: despesas.filter((d) => !d.formaPagamento).length,
        qtdVendas: vendasPorForma.reduce((soma, v) => soma + v._count, 0),
      },
    };
  },

  /**
   * Quanto deveria haver na gaveta ao abrir o dia.
   *
   * Encadeia com o dia anterior: vale o que ela CONTOU ontem, não o que o
   * sistema calculou. Se faltaram R$ 10 ontem, hoje começa com o valor real
   * — senão a mesma diferença reapareceria todo dia, e ela perseguiria um
   * erro que já tinha encontrado.
   */
  async saldoDeAbertura(data) {
    const anterior = await prisma.fechamentoDiario.findFirst({
      where: { data: { lt: inicioDoDia(data) } },
      orderBy: { data: 'desc' },
      select: { saldoConferido: true, saldoCalculado: true },
    });

    if (!anterior) return 0;
    return numero(anterior.saldoConferido ?? anterior.saldoCalculado);
  },

  /**
   * Grava o fechamento do dia.
   *
   * `saldoConferido` é o que ela contou na mão. Vem opcional porque ela
   * pode fechar o dia só para registrar o movimento e conferir depois.
   */
  async fechar({ data, saldoConferido, observacao }, usuarioId) {
    const dia = inicioDoDia(data ?? new Date());

    const jaFechado = await prisma.fechamentoDiario.findUnique({ where: { data: dia } });
    if (jaFechado) {
      throw AppError.conflito(
        'Este dia já foi fechado. Use a edição do fechamento para corrigir o valor conferido.'
      );
    }

    const calculo = await this.previa(dia);
    const conferido = saldoConferido == null ? null : centavos(Number(saldoConferido));

    return prisma.fechamentoDiario.create({
      data: {
        data: dia,
        saldoInicial: calculo.saldoInicial,
        totalEntradas: calculo.totalEntradas,
        totalSaidas: calculo.totalSaidas,
        saldoCalculado: calculo.saldoCalculado,
        saldoConferido: conferido,
        diferenca: conferido == null ? null : centavos(conferido - calculo.saldoCalculado),
        observacao: observacao || null,
        usuarioId,
      },
    });
  },

  /**
   * Corrige o valor conferido de um fechamento já gravado.
   *
   * Recalcula o movimento do dia: se ela lançou uma venda esquecida depois
   * de fechar, o esperado muda e a diferença precisa acompanhar. Sem isso o
   * fechamento congelaria um número que já não bate com o histórico.
   */
  async conferir(id, { saldoConferido, observacao }) {
    const fechamento = await prisma.fechamentoDiario.findUnique({ where: { id } });
    if (!fechamento) throw AppError.naoEncontrado('Fechamento não encontrado.');

    const calculo = await this.previa(fechamento.data);
    const conferido = saldoConferido == null ? null : centavos(Number(saldoConferido));

    return prisma.fechamentoDiario.update({
      where: { id },
      data: {
        saldoInicial: calculo.saldoInicial,
        totalEntradas: calculo.totalEntradas,
        totalSaidas: calculo.totalSaidas,
        saldoCalculado: calculo.saldoCalculado,
        saldoConferido: conferido,
        diferenca: conferido == null ? null : centavos(conferido - calculo.saldoCalculado),
        observacao: observacao === undefined ? fechamento.observacao : observacao || null,
      },
    });
  },

  async listar({ inicio, fim } = {}) {
    const where = {};
    if (inicio || fim) {
      where.data = {};
      if (inicio) where.data.gte = inicioDoDia(inicio);
      if (fim) where.data.lte = inicioDoDia(fim);
    }

    return prisma.fechamentoDiario.findMany({
      where,
      orderBy: { data: 'desc' },
      take: 90,
      include: { usuario: { select: { nome: true } } },
    });
  },

  async porData(data) {
    return prisma.fechamentoDiario.findUnique({ where: { data: inicioDoDia(data) } });
  },

  async excluir(id) {
    const fechamento = await prisma.fechamentoDiario.findUnique({ where: { id } });
    if (!fechamento) throw AppError.naoEncontrado('Fechamento não encontrado.');
    await prisma.fechamentoDiario.delete({ where: { id } });
  },
};
