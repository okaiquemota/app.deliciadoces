import { prisma } from '../src/lib/prisma.js';

/**
 * Apoio dos testes.
 *
 * Os testes rodam contra um PostgreSQL de verdade, não contra simulação.
 * O que estamos verificando é justamente o comportamento transacional —
 * saldo e razão mudando juntos — e isso um banco falso não reproduz: ele
 * confirmaria a nossa própria suposição em vez do comportamento real.
 */

export async function limparTudo() {
  await prisma.fechamentoDiario.deleteMany({});
  await prisma.movimentacaoEstoque.deleteMany({});
  await prisma.itemVenda.deleteMany({});
  await prisma.venda.deleteMany({});
  await prisma.producao.deleteMany({});
  await prisma.despesa.deleteMany({});
  await prisma.fichaTecnicaItem.deleteMany({});
  await prisma.produto.deleteMany({});
  await prisma.insumo.deleteMany({});
}

export const criarInsumo = (dados = {}) =>
  prisma.insumo.create({
    data: {
      nome: `Insumo ${Math.random().toString(36).slice(2, 9)}`,
      unidade: 'KG',
      estoqueMinimo: 0,
      ...dados,
    },
  });

export const criarProduto = (dados = {}) =>
  prisma.produto.create({
    data: {
      nome: `Produto ${Math.random().toString(36).slice(2, 9)}`,
      precoVenda: 10,
      unidade: 'UNIDADE',
      ...dados,
    },
  });

export const saldoInsumo = async (id) =>
  Number((await prisma.insumo.findUnique({ where: { id } })).quantidadeAtual);

export const saldoProduto = async (id) =>
  Number((await prisma.produto.findUnique({ where: { id } })).quantidadeAtual);

/**
 * Soma o razão do zero, do jeito que a aplicação NÃO faz no dia a dia.
 *
 * Existe para conferir o cache contra a fonte da verdade: se as duas
 * contas divergirem, alguém escreveu saldo por fora do estoqueService.
 */
export async function razaoDe({ insumoId = null, produtoId = null }) {
  const movs = await prisma.movimentacaoEstoque.findMany({
    where: insumoId ? { insumoId } : { produtoId },
  });
  const somam = new Set(['ENTRADA_COMPRA', 'ENTRADA_PRODUCAO']);
  return movs.reduce((total, m) => {
    const q = Number(m.quantidade);
    if (m.tipo === 'AJUSTE') return total + q;
    return total + (somam.has(m.tipo) ? Math.abs(q) : -Math.abs(q));
  }, 0);
}

/**
 * Categoria de despesa com o tipo pedido.
 *
 * O tipo importa no fechamento: retirada pessoal sai da gaveta igual a
 * qualquer despesa, mesmo não sendo custo do negócio.
 */
export const criarCategoria = (tipo = 'CUSTO_OPERACIONAL', nome) =>
  prisma.categoriaDespesa.create({
    data: { nome: nome ?? `Categoria ${Math.random().toString(36).slice(2, 9)}`, tipo },
  });
