import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { estoqueService } from './estoqueService.js';

/**
 * Cadastros de insumo (ingrediente/embalagem) e produto (doce pronto).
 *
 * Os dois seguem o mesmo formato, então ficam no mesmo arquivo: o que muda
 * é só o conjunto de campos. Nenhum dos dois é apagado de verdade — usamos
 * a flag `ativo`, porque excluir um item que já tem movimentação destruiria
 * o histórico financeiro.
 */

function naoEncontrado(oQue) {
  return AppError.naoEncontrado(`${oQue} não encontrado.`);
}

export const insumoService = {
  async listar({ busca, apenasAtivos = true } = {}) {
    return prisma.insumo.findMany({
      where: {
        ...(apenasAtivos ? { ativo: true } : {}),
        ...(busca ? { nome: { contains: busca, mode: 'insensitive' } } : {}),
      },
      orderBy: { nome: 'asc' },
    });
  },

  async porId(id) {
    const insumo = await prisma.insumo.findUnique({ where: { id } });
    if (!insumo) throw naoEncontrado('Insumo');
    return insumo;
  },

  async criar(dados) {
    return prisma.insumo.create({ data: dados });
  },

  async atualizar(id, dados) {
    await insumoService.porId(id);
    // `quantidadeAtual` não entra aqui de propósito: saldo só muda por
    // movimentação, passando pelo estoqueService.
    const { quantidadeAtual: _ignorado, ...permitido } = dados;
    return prisma.insumo.update({ where: { id }, data: permitido });
  },

  async inativar(id) {
    await insumoService.porId(id);
    return prisma.insumo.update({ where: { id }, data: { ativo: false } });
  },
};

export const produtoService = {
  async listar({ busca, apenasAtivos = true } = {}) {
    return prisma.produto.findMany({
      where: {
        ...(apenasAtivos ? { ativo: true } : {}),
        ...(busca ? { nome: { contains: busca, mode: 'insensitive' } } : {}),
      },
      orderBy: { nome: 'asc' },
    });
  },

  async porId(id) {
    const produto = await prisma.produto.findUnique({
      where: { id },
      include: {
        fichaTecnica: { include: { insumo: { select: { nome: true, unidade: true } } } },
      },
    });
    if (!produto) throw naoEncontrado('Produto');
    return produto;
  },

  async criar(dados) {
    return prisma.produto.create({ data: dados });
  },

  async atualizar(id, dados) {
    await prisma.produto.findUnique({ where: { id } }).then((p) => {
      if (!p) throw naoEncontrado('Produto');
    });
    const { quantidadeAtual: _ignorado, ...permitido } = dados;
    return prisma.produto.update({ where: { id }, data: permitido });
  },

  async inativar(id) {
    return prisma.produto.update({ where: { id }, data: { ativo: false } });
  },

  /**
   * Substitui a ficha técnica inteira do produto.
   *
   * A ficha é OPCIONAL: a cliente disse que só cadastraria "se for simples".
   * Uma lista vazia é estado válido, não erro — o sistema tem que funcionar
   * sem nenhuma receita cadastrada.
   */
  async salvarFichaTecnica(produtoId, { rendimentoReceita, itens }) {
    await produtoService.porId(produtoId);

    return prisma.$transaction(async (tx) => {
      await tx.fichaTecnicaItem.deleteMany({ where: { produtoId } });

      if (itens?.length) {
        await tx.fichaTecnicaItem.createMany({
          data: itens.map((item) => ({
            produtoId,
            insumoId: item.insumoId,
            quantidade: item.quantidade,
          })),
        });
      }

      return tx.produto.update({
        where: { id: produtoId },
        data: { rendimentoReceita: rendimentoReceita ?? null },
      });
    });
  },
};

/**
 * Movimentações avulsas de estoque: compra, perda e ajuste de contagem.
 * Venda e produção têm serviços próprios, porque envolvem outras tabelas.
 */
export const movimentacaoService = {
  async registrar(dados, usuarioId) {
    return prisma.$transaction(async (tx) => {
      const movimentacao = await estoqueService.movimentar(tx, { ...dados, usuarioId });

      // Compra de insumo recalcula o custo médio: é o número que alimenta
      // o custo estimado da produção lá na frente.
      if (dados.tipo === 'ENTRADA_COMPRA' && dados.insumoId && dados.custoUnitario) {
        const insumo = await tx.insumo.findUnique({ where: { id: dados.insumoId } });
        const saldoAnterior = Number(insumo.quantidadeAtual) - Number(dados.quantidade);
        const custoAnterior = Number(insumo.custoUnitario);
        const qtdComprada = Number(dados.quantidade);
        const custoCompra = Number(dados.custoUnitario);

        // Média ponderada. Se o saldo anterior era zero ou negativo, o
        // custo da compra nova passa a valer sozinho.
        const custoMedio =
          saldoAnterior > 0
            ? (saldoAnterior * custoAnterior + qtdComprada * custoCompra) /
              (saldoAnterior + qtdComprada)
            : custoCompra;

        await tx.insumo.update({
          where: { id: dados.insumoId },
          data: { custoUnitario: custoMedio.toFixed(4) },
        });
      }

      return movimentacao;
    });
  },
};
