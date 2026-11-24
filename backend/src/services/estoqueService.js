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

/**
 * DOCE NÃO FICA COM SALDO NEGATIVO: não se vende o que não foi produzido.
 *
 * Antes era deliberado deixar passar (ver docs/REQUISITOS.md, 6.3): uma
 * venda sem produção lançada levava o saldo abaixo de zero, como aviso de
 * que faltava lançar. Na prática o número negativo confundia mais do que
 * avisava, e a decisão mudou: o estoque de doces só sai do que existe.
 * Para guardar o dinheiro de uma venda sem baixar estoque, existe a
 * entrada avulsa.
 *
 * Tira e confere NUMA instrução só (`UPDATE ... WHERE saldo >= quanto`):
 * duas vendas ao mesmo tempo não conseguem, juntas, passar do que há. O
 * Postgres reavalia o WHERE na linha travada, então a segunda espera a
 * primeira e vê o saldo já descontado. Sem linha atualizada, a transação
 * inteira desfaz — a venda não fica gravada pela metade.
 *
 * Ingrediente continua podendo ficar negativo: a produção baixa a receita
 * inteira mesmo quando a compra ainda não foi lançada, e travar ali
 * impediria registrar um lote que existe de verdade.
 */
async function tirarDoce(tx, produtoId, quanto, motivo) {
  const { count } = await tx.produto.updateMany({
    where: { id: produtoId, quantidadeAtual: { gte: quanto } },
    data: { quantidadeAtual: { decrement: quanto } },
  });
  if (count === 0) throw await faltaDeDoce(tx, produtoId, quanto, motivo);
}

/** A mensagem de quando não há doce bastante, dita pelo que se tentava fazer. */
async function faltaDeDoce(tx, produtoId, pedido, motivo) {
  const produto = await tx.produto.findUnique({
    where: { id: produtoId },
    select: { nome: true, quantidadeAtual: true },
  });
  const nome = produto?.nome ?? 'este doce';
  const tem = Math.max(0, Number(produto?.quantidadeAtual ?? 0));
  const numero = (n) => Number(n.toFixed(3)).toLocaleString('pt-BR');
  const haPronto = tem > 0 ? `só há ${numero(tem)} pronto(s)` : 'não há nenhum pronto';

  const mensagens = {
    SAIDA_VENDA:
      `Não dá para vender ${numero(pedido)} ${nome}: ${haPronto}. Registre a produção ` +
      'antes — ou, para só guardar o dinheiro, lance como entrada avulsa.',
    PERDA: `Não dá para dar perda de ${numero(pedido)} ${nome}: ${haPronto}.`,
    AJUSTE: `A contagem não pode deixar ${nome} abaixo de zero: ${haPronto}.`,
    ESTORNO_PRODUCAO:
      `Não dá para desfazer este lote de ${nome}: parte dele já foi vendida ` +
      `(${haPronto} no estoque). Cancele as vendas antes, se for o caso.`,
  };
  return new AppError(mensagens[motivo] ?? `${nome}: ${haPronto}.`, 422);
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
      loteId = null,
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
        loteId,
        usuarioId,
        ...(data ? { data } : {}),
      },
    });

    if (insumoId) {
      await tx.insumo.update({
        where: { id: insumoId },
        data: { quantidadeAtual: { increment: delta } },
      });
    } else if (delta < 0) {
      await tirarDoce(tx, produtoId, -delta, tipo);
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
      } else if (mov.produtoId && delta > 0) {
        // Desfazer uma entrada (o lote de produção) tira doce do estoque:
        // não pode tirar o que já foi vendido.
        await tirarDoce(tx, mov.produtoId, delta, 'ESTORNO_PRODUCAO');
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
   * As compras que ainda estão NA PRATELEIRA, por ingrediente.
   *
   * O sistema não sabe de qual compra saiu cada uso: a saída da produção
   * não aponta para a entrada. A regra é a da confeitaria — o mais antigo
   * sai primeiro. Então o que sobrou são as compras MAIS RECENTES, até
   * somar o saldo de hoje; as mais velhas já foram usadas.
   *
   * Com 3 latas compradas em setembro (vencem 10/10), 5 em outubro
   * (vencem 20/11) e 4 no estoque, as 4 são de outubro.
   *
   * A exceção é o DESCARTE: jogar fora um lote aponta para a compra dele
   * (`loteId`), e o que foi descartado sai daquela compra, não da mais
   * antiga. Antes, "perdi 3 latas" tirava as 3 da compra mais velha —
   * quando a vencida era a mais nova, o aviso de vencido não sumia nunca.
   *
   * Cada linha: a compra (`id`), quando entrou, a validade, quanto entrou
   * e quanto (estimado) `resta` dela.
   */
  async lotesNaPrateleira({ insumoId = null } = {}) {
    const linhas = await prisma.$queryRaw`
      WITH descartes AS (
        SELECT "loteId", SUM(quantidade) AS q
        FROM movimentacoes_estoque
        WHERE "loteId" IS NOT NULL AND tipo = 'PERDA'
        GROUP BY "loteId"
      ),
      compras AS (
        SELECT m.id, m."insumoId", m."usuarioId", m.data, m."criadoEm", m.validade,
               m.quantidade AS comprado,
               GREATEST(m.quantidade - COALESCE(d.q, 0), 0) AS livre,
               i."quantidadeAtual" AS saldo
        FROM movimentacoes_estoque m
        JOIN insumos i ON i.id = m."insumoId"
        LEFT JOIN descartes d ON d."loteId" = m.id
        WHERE m.tipo = 'ENTRADA_COMPRA' AND i.ativo AND i."quantidadeAtual" > 0
          ${insumoId ? Prisma.sql`AND m."insumoId" = ${insumoId}` : Prisma.empty}
      ),
      acumulado AS (
        SELECT *, SUM(livre) OVER (
                 PARTITION BY "insumoId"
                 ORDER BY data DESC, "criadoEm" DESC, id DESC
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
               ) AS ate_aqui
        FROM compras
      )
      SELECT id, "insumoId", "usuarioId", data, validade, comprado,
             LEAST(livre, saldo - (ate_aqui - livre)) AS resta
      FROM acumulado
      WHERE livre > 0 AND ate_aqui - livre < saldo
      ORDER BY "insumoId", validade NULLS LAST, data`;

    const hoje = colunaDoDia(diaDoCliente());
    return linhas.map((l) => {
      const dia = l.validade ? diaDaColuna(l.validade) : null;
      // Dias em data cheia, do dia de Brasília: o que vence hoje continua
      // "vence hoje" até a meia-noite, e não vira "vencido" à tarde.
      const dias = dia ? Math.round((colunaDoDia(dia) - hoje) / DIA) : null;
      return {
        id: l.id,
        insumoId: l.insumoId,
        usuarioId: l.usuarioId,
        data: l.data,
        validade: dia,
        dias,
        vencido: dias !== null && dias < 0,
        comprado: Number(l.comprado),
        resta: Number(Number(l.resta).toFixed(3)),
      };
    });
  },

  /**
   * A validade do que está na prateleira, por ingrediente: a data MAIS
   * PRÓXIMA entre as compras que sobraram (ver `lotesNaPrateleira`) e
   * quanto (estimado) vence nela. Compra sem validade ocupa lugar na
   * prateleira mas não tem data para mostrar.
   */
  async validadesNaPrateleira() {
    const lotes = await estoqueService.lotesNaPrateleira();
    const porInsumo = new Map();
    for (const l of lotes) {
      if (!l.validade) continue;
      const atual = porInsumo.get(l.insumoId);
      // A lista vem da validade mais próxima para a mais longe: a primeira
      // de cada ingrediente é a que vale; outra compra com o MESMO dia soma.
      if (atual && atual.validade !== l.validade) continue;
      if (atual) {
        atual.quantidade = Number((atual.quantidade + l.resta).toFixed(3));
        continue;
      }
      porInsumo.set(l.insumoId, {
        validade: l.validade,
        dias: l.dias,
        vencido: l.vencido,
        quantidade: l.resta,
      });
    }
    return porInsumo;
  },

  /** Uma compra de ingrediente, ou 404. */
  async compra(id) {
    const mov = await prisma.movimentacaoEstoque.findUnique({
      where: { id },
      include: { insumo: { select: { nome: true, unidade: true } } },
    });
    if (!mov || mov.tipo !== 'ENTRADA_COMPRA' || !mov.insumoId) {
      throw AppError.naoEncontrado('Compra não encontrada.');
    }
    return mov;
  },

  /**
   * Joga fora (o que resta de) uma compra: a PERDA aponta para ela, e é
   * dela que o estoque sai. Sem `quantidade`, descarta tudo o que resta.
   */
  async descartarLote(loteId, { quantidade = null, motivo = null } = {}, usuarioId = null) {
    const lote = await estoqueService.compra(loteId);
    const naPrateleira = (await estoqueService.lotesNaPrateleira({ insumoId: lote.insumoId })).find(
      (l) => l.id === loteId
    );
    if (!naPrateleira || naPrateleira.resta <= 0) {
      throw new AppError(
        'Desta compra não sobrou nada no estoque: já foi usada ou descartada.',
        422
      );
    }

    const quanto = quantidade == null ? naPrateleira.resta : Number(quantidade);
    if (!(quanto > 0)) throw new AppError('Informe quanto vai jogar fora.', 422);
    if (quanto > naPrateleira.resta + 0.0005) {
      const n = naPrateleira.resta.toLocaleString('pt-BR');
      throw new AppError(
        `Desta compra restam só ${n}. Se há mais do que isso para jogar fora, ` +
          'use o Ajustar para corrigir a contagem.',
        422
      );
    }

    const porque =
      motivo?.trim() ||
      (naPrateleira.vencido
        ? `Venceu em ${naPrateleira.validade.split('-').reverse().join('/')}`
        : 'Descartado');

    return prisma.$transaction((tx) =>
      estoqueService.movimentar(tx, {
        tipo: 'PERDA',
        insumoId: lote.insumoId,
        quantidade: quanto,
        motivo: porque,
        loteId,
        usuarioId,
      })
    );
  },

  /** Joga fora, de uma vez, tudo o que está vencido de um ingrediente. */
  async descartarVencidos(insumoId, usuarioId = null) {
    const vencidos = (await estoqueService.lotesNaPrateleira({ insumoId })).filter(
      (l) => l.vencido
    );
    if (!vencidos.length) throw new AppError('Nada vencido no estoque deste ingrediente.', 422);

    return prisma.$transaction(async (tx) => {
      const feitos = [];
      for (const l of vencidos) {
        feitos.push(
          await estoqueService.movimentar(tx, {
            tipo: 'PERDA',
            insumoId,
            quantidade: l.resta,
            motivo: `Venceu em ${l.validade.split('-').reverse().join('/')}`,
            loteId: l.id,
            usuarioId,
          })
        );
      }
      return { descartados: feitos.length, quantidade: vencidos.reduce((s, l) => s + l.resta, 0) };
    });
  },

  /** Corrige a validade digitada errada numa compra. `null` tira a data. */
  async corrigirValidade(loteId, validade) {
    await estoqueService.compra(loteId);
    return prisma.movimentacaoEstoque.update({ where: { id: loteId }, data: { validade } });
  },

  /**
   * Desfaz uma compra lançada por engano: tira do saldo o que ela pôs.
   *
   * Descartes feitos dessa compra ficam (o que foi pro lixo, foi), só
   * deixam de apontar para ela. O custo médio volta a ser o das compras
   * que continuam na prateleira — sem isso, uma compra com preço errado
   * deixava o custo dos doces errado para sempre.
   */
  async desfazerCompra(id) {
    const compra = await estoqueService.compra(id);
    await prisma.$transaction(async (tx) => {
      await tx.movimentacaoEstoque.delete({ where: { id } });
      await tx.insumo.update({
        where: { id: compra.insumoId },
        data: { quantidadeAtual: { decrement: Number(compra.quantidade) } },
      });
    });

    const restantes = await estoqueService.lotesNaPrateleira({ insumoId: compra.insumoId });
    const comCusto = await prisma.movimentacaoEstoque.findMany({
      where: { id: { in: restantes.map((l) => l.id) }, custoUnitario: { gt: 0 } },
      select: { id: true, custoUnitario: true },
    });
    const custos = new Map(comCusto.map((c) => [c.id, Number(c.custoUnitario)]));
    let qtd = 0;
    let valor = 0;
    for (const l of restantes) {
      if (!custos.has(l.id)) continue;
      qtd += l.resta;
      valor += l.resta * custos.get(l.id);
    }
    if (qtd > 0) {
      await prisma.insumo.update({
        where: { id: compra.insumoId },
        data: { custoUnitario: (valor / qtd).toFixed(4) },
      });
    }
    return compra;
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
