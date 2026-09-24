import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { dashboardService } from '../src/services/dashboardService.js';
import { vendaService, despesaService } from '../src/services/caixaService.js';
import { estoqueService } from '../src/services/estoqueService.js';
import { limparTudo, criarProduto, criarCategoria } from './apoio.js';

/**
 * O mini-histórico da tela inicial.
 *
 * Três consultas separadas e não uma lista ordenada por data: num dia de
 * dez vendas, as últimas cinco linhas seriam todas venda e a saída de
 * ontem sumiria. Estes testes existem para travar essa separação — é
 * justamente ela que um "simplifica para uma consulta só" quebraria sem
 * quebrar nenhuma tela de forma visível.
 */
beforeEach(limparTudo);
afterAll(() => prisma.$disconnect());

async function produtoComEstoque(qtd, preco = 10, nome) {
  const p = await criarProduto({ precoVenda: preco, ...(nome ? { nome } : {}) });
  await prisma.$transaction((tx) =>
    estoqueService.movimentar(tx, { tipo: 'ENTRADA_PRODUCAO', produtoId: p.id, quantidade: qtd })
  );
  return p;
}

describe('dashboardService.ultimos', () => {
  it('devolve nulo em cada tipo quando não há nada lançado', async () => {
    const u = await dashboardService.ultimos();
    expect(u).toEqual({ venda: null, entrada: null, saida: null });
  });

  it('separa venda com itens de entrada avulsa', async () => {
    const p = await produtoComEstoque(100, 5, 'Brigadeiro');
    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 3 }], formaPagamento: 'PIX' },
      null
    );
    await vendaService.criar({ valor: 25, formaPagamento: 'DINHEIRO' }, null);

    const u = await dashboardService.ultimos();

    // A avulsa é a mais recente das duas. Se as consultas não estivessem
    // separadas, ela apareceria também como "última venda" e o cartão de
    // venda mostraria um lançamento que não baixou estoque nenhum.
    expect(u.venda.valor).toBe(15);
    expect(u.venda.descricao).toBe('3x Brigadeiro');
    expect(u.entrada.valor).toBe(25);
    expect(u.entrada.descricao).toBe('Em dinheiro');
  });

  it('ignora venda cancelada', async () => {
    const p = await produtoComEstoque(100, 5);
    const primeira = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 1 }], formaPagamento: 'PIX' },
      null
    );
    const segunda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 4 }], formaPagamento: 'PIX' },
      null
    );
    await vendaService.cancelar(segunda.id);

    const u = await dashboardService.ultimos();
    expect(u.venda.valor).toBe(Number(primeira.total));
  });

  it('não confunde retirada pessoal com saída do negócio', async () => {
    const custo = await criarCategoria('CUSTO_OPERACIONAL');
    const pessoal = await criarCategoria('RETIRADA_PESSOAL');

    await despesaService.criar({ descricao: 'Botijão', valor: 140, categoriaId: custo.id }, null);
    // Mais recente, e NÃO deve aparecer: sai do caixa, mas é dinheiro que
    // ela levou para casa, não gasto da confeitaria. Tem botão próprio.
    await despesaService.criar({ descricao: 'Feira', valor: 200, categoriaId: pessoal.id }, null);

    const u = await dashboardService.ultimos();
    expect(u.saida.valor).toBe(140);
    expect(u.saida.descricao).toBe('Botijão');
  });

  it('resume venda de vários doces pelo primeiro mais a contagem', async () => {
    const a = await produtoComEstoque(100, 5, 'Bolo de pote');
    const b = await produtoComEstoque(100, 5, 'Beijinho');
    await vendaService.criar(
      {
        itens: [
          { produtoId: a.id, quantidade: 1 },
          { produtoId: b.id, quantidade: 2 },
        ],
        formaPagamento: 'PIX',
      },
      null
    );

    const u = await dashboardService.ultimos();
    expect(u.venda.descricao).toBe('Bolo de pote +1 item');
  });
});
