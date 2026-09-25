import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { dashboardService } from '../src/services/dashboardService.js';
import { vendaService, despesaService } from '../src/services/caixaService.js';
import { estoqueService } from '../src/services/estoqueService.js';
import { filtrosPeriodo } from '../src/utils/periodo.js';
import { limparTudo, criarProduto } from './apoio.js';

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

  it('mostra o "com o quê" da entrada avulsa no lugar da forma de pagamento', async () => {
    await vendaService.criar(
      { valor: 80, formaPagamento: 'PIX', observacao: 'Encomenda da Maria' },
      null
    );
    const u = await dashboardService.ultimos();
    expect(u.entrada.descricao).toBe('Encomenda da Maria');
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
    await despesaService.criar({ descricao: 'Botijão', valor: 140 }, null);
    // Mais recente, e NÃO deve aparecer: sai do caixa, mas é dinheiro que
    // ela levou para casa, não gasto da confeitaria. Tem botão próprio.
    await despesaService.criar({ descricao: 'Feira', valor: 200, retirada: true }, null);

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

/**
 * O gráfico do Resumo, uma barra por dia — o dia de Brasília.
 *
 * Agrupada pelo UTC, a venda das 21h30 ia para a barra de amanhã. E o
 * período termina às 23:59 de Brasília, que em UTC já é o dia seguinte:
 * uma semana virava oito barras.
 */
describe('dashboardService.porDia', () => {
  it('uma barra por dia pedido, nem uma a mais', async () => {
    const serie = await dashboardService.porDia(
      filtrosPeriodo({ inicio: '2026-03-09', fim: '2026-03-15' })
    );
    expect(serie.map((d) => d.dia)).toEqual([
      '2026-03-09',
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
      '2026-03-13',
      '2026-03-14',
      '2026-03-15',
    ]);
  });

  it('a venda das 21h30 fica na barra do dia em que aconteceu', async () => {
    const p = await produtoComEstoque(10, 25);
    await vendaService.criar(
      {
        itens: [{ produtoId: p.id, quantidade: 1 }],
        formaPagamento: 'PIX',
        data: new Date('2026-03-10T21:30:00-03:00'),
      },
      null
    );

    const serie = await dashboardService.porDia(
      filtrosPeriodo({ inicio: '2026-03-10', fim: '2026-03-11' })
    );
    expect(serie).toEqual([
      { dia: '2026-03-10', vendas: 25, despesas: 0 },
      { dia: '2026-03-11', vendas: 0, despesas: 0 },
    ]);
  });
});
