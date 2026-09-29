import { Prisma } from '@prisma/client';
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
 * A quantidade gravada é positiva e quem diz a direção é o `tipo` — menos
 * no AJUSTE, que não tem direção fixa e guarda o próprio sinal.
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

/**
 * Saldo logo depois de cada movimentação de um item, pelo id dela.
 *
 * Parte do saldo de hoje e desfaz o que veio depois: saldo depois da
 * linha = saldo atual − soma do que entrou e saiu depois dela. A soma é
 * do banco (janela ordenada), e não daqui, para não trazer anos de
 * vendas de um doce só para fazer a conta.
 */
async function saldosDepois({ insumoId, produtoId }) {
  const delta = Prisma.sql`CASE
      WHEN tipo = 'AJUSTE' THEN quantidade
      WHEN tipo IN ('ENTRADA_COMPRA', 'ENTRADA_PRODUCAO') THEN ABS(quantidade)
      ELSE -ABS(quantidade)
    END`;
  const [item, linhas] = await Promise.all([
    insumoId
      ? prisma.insumo.findUnique({ where: { id: insumoId }, select: { quantidadeAtual: true } })
      : prisma.produto.findUnique({ where: { id: produtoId }, select: { quantidadeAtual: true } }),
    prisma.$queryRaw`
      SELECT id, COALESCE(SUM(${delta}) OVER (
               ORDER BY data DESC, "criadoEm" DESC, id DESC
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
             ), 0) AS depois
      FROM movimentacoes_estoque
      WHERE ${insumoId ? Prisma.sql`"insumoId" = ${insumoId}` : Prisma.sql`"produtoId" = ${produtoId}`}`,
  ]);
  if (!item) return new Map();
  const atual = Number(item.quantidadeAtual);
  // Três casas, como o banco guarda: sem arredondar, 0,1 + 0,2 aparecia
  // como "0,30000000000000004 kg".
  return new Map(linhas.map((l) => [l.id, Number((atual - Number(l.depois)).toFixed(3))]));
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
        // O AJUSTE grava COM o sinal. Gravado sem ele, "a contagem achou 2
        // a menos" virava +2 no histórico: o saldo ficava certo (é o delta
        // que o atualiza), mas o registro dizia o contrário — o Kardex
        // mostrava entrada onde houve saída, e recalcular o saldo pelo
        // histórico somava o que devia subtrair.
        quantidade: tipo === 'AJUSTE' ? Number(quantidade) : Math.abs(Number(quantidade)),
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

  /**
   * O Kardex: as movimentações do estoque, dos doces e do material.
   *
   * Vem junto o lote de onde a linha nasceu, para a tela juntar o doce
   * que entrou com os ingredientes que saíram — é um acontecimento só.
   *
   * Pedido para UM item, cada linha traz também `saldoDepois`: quanto
   * tinha logo depois dela, que é o que faz de uma lista de movimentos um
   * kardex. A conta parte do saldo de hoje e desfaz, de trás para frente,
   * tudo o que veio depois da linha — inclusive o que ficou fora do
   * período pedido, senão o saldo de uma semana passada sairia errado.
   */
  async listarMovimentacoes({ insumoId, produtoId, tipo, inicio, fim, limite = 200 }) {
    const lista = await prisma.movimentacaoEstoque.findMany({
      where: {
        ...(insumoId ? { insumoId } : {}),
        ...(produtoId ? { produtoId } : {}),
        ...(tipo ? { tipo } : {}),
        ...(inicio || fim
          ? { data: { ...(inicio ? { gte: inicio } : {}), ...(fim ? { lte: fim } : {}) } }
          : {}),
      },
      include: {
        insumo: { select: { id: true, nome: true, unidade: true } },
        produto: { select: { id: true, nome: true, unidade: true } },
        producao: {
          select: {
            id: true,
            quantidade: true,
            custoEstimado: true,
            observacao: true,
            // Quem lançou o lote: a funcionária só desfaz os dela, do dia.
            usuarioId: true,
            produto: { select: { nome: true, unidade: true } },
          },
        },
      },
      // Mesma ordem da conta do saldo: sem o desempate, duas linhas do
      // mesmo instante podiam trocar de lugar e cada uma mostrar o saldo
      // da outra.
      orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }, { id: 'desc' }],
      take: limite,
    });

    if (!insumoId && !produtoId) return lista;

    const saldos = await saldosDepois({ insumoId, produtoId });
    return lista.map((m) => ({ ...m, saldoDepois: saldos.get(m.id) ?? null }));
  },

  /**
   * A validade do que ESTÁ NA PRATELEIRA, por ingrediente.
   *
   * O sistema não sabe de qual compra saiu cada uso: a saída não aponta
   * para a entrada. A regra é a da confeitaria — o mais antigo sai
   * primeiro. Então o que sobrou são as compras MAIS RECENTES, até somar
   * o saldo de hoje; as mais velhas já foram usadas.
   *
   * Com 3 latas compradas em setembro (vencem 10/10), 5 em outubro
   * (vencem 20/11) e 4 no estoque, as 4 são de outubro: a data que
   * importa é 20/11, e não a de setembro, que já acabou.
   *
   * Devolve, por ingrediente, a data MAIS PRÓXIMA entre as compras na
   * prateleira e quanto (estimado) vence nela. Compra sem validade ocupa
   * lugar na prateleira mas não tem data para mostrar.
   */
  async validadesNaPrateleira() {
    const lotes = await prisma.$queryRaw`
      WITH compras AS (
        SELECT m."insumoId", m.quantidade, m.validade, i."quantidadeAtual" AS saldo,
               SUM(m.quantidade) OVER (
                 PARTITION BY m."insumoId"
                 ORDER BY m.data DESC, m."criadoEm" DESC, m.id DESC
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
               ) AS acumulado
        FROM movimentacoes_estoque m
        JOIN insumos i ON i.id = m."insumoId"
        WHERE m.tipo = 'ENTRADA_COMPRA' AND i.ativo AND i."quantidadeAtual" > 0
      )
      SELECT "insumoId", validade, LEAST(quantidade, saldo - (acumulado - quantidade)) AS resta
      FROM compras
      WHERE acumulado - quantidade < saldo AND validade IS NOT NULL
      ORDER BY "insumoId", validade`;

    const hoje = colunaDoDia(diaDoCliente());
    const porInsumo = new Map();
    for (const l of lotes) {
      const dia = diaDaColuna(l.validade);
      const atual = porInsumo.get(l.insumoId);
      // A lista vem da validade mais próxima para a mais longe: a primeira
      // de cada ingrediente é a que vale; outra compra com o MESMO dia soma.
      if (atual && atual.validade !== dia) continue;
      if (atual) {
        atual.quantidade = Number((atual.quantidade + Number(l.resta)).toFixed(3));
        continue;
      }
      // Dias em data cheia, do dia de Brasília: o que vence hoje continua
      // "vence hoje" até a meia-noite, e não vira "vencido" à tarde.
      const dias = Math.round((colunaDoDia(dia) - hoje) / DIA);
      porInsumo.set(l.insumoId, {
        validade: dia,
        dias,
        vencido: dias < 0,
        quantidade: Number(l.resta),
      });
    }
    return porInsumo;
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
      estoqueService.validadesNaPrateleira(),
    ]);

    /**
     * Validade: um aviso por INGREDIENTE, pela data mais próxima do que
     * está na prateleira — vencido ou vencendo em até 15 dias.
     *
     * Antes o aviso era por compra, e avisava de compra que já tinha sido
     * usada: um creme de leite de três meses atrás seguia "vencendo" para
     * sempre. Contando o que sobrou (o mais antigo sai primeiro), vencido
     * que ainda aparece aqui é vencido que o estoque diz ter — ou vai pro
     * lixo, ou a contagem está errada. Os dois pedem ação.
     */
    const nomes = new Map(
      (
        await prisma.insumo.findMany({
          where: { id: { in: [...validades.keys()] } },
          select: { id: true, nome: true, unidade: true },
        })
      ).map((i) => [i.id, i])
    );
    const validadeProxima = [...validades]
      .filter(([, v]) => v.dias <= 15)
      .map(([insumoId, v]) => ({ insumoId, ...nomes.get(insumoId), ...v }))
      .sort((a, b) => a.dias - b.dias);

    return { insumosBaixos: insumos, produtosBaixos: produtos, validadeProxima };
  },
};

export { calcularDelta };
