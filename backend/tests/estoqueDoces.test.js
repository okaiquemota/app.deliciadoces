import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { movimentacaoService } from '../src/services/cadastroService.js';
import { producaoService } from '../src/services/producaoService.js';
import { vendaService } from '../src/services/caixaService.js';
import { limparTudo, criarProduto, saldoProduto, razaoDe } from './apoio.js';

/**
 * Doce não fica com saldo negativo: não se vende o que não foi produzido.
 *
 * A regra mora no estoqueService (o único que escreve saldo), então vale
 * para todo caminho que tira doce do estoque — venda, edição de venda,
 * venda reaberta, perda, ajuste e lote desfeito. Cada teste confere que o
 * que foi recusado não deixou rastro: nem saldo mexido, nem venda gravada.
 */
beforeEach(limparTudo);
afterAll(() => prisma.$disconnect());

/** Um doce com `quantos` prontos no estoque, vindos de um lote de produção. */
async function doceCom(quantos, dados = {}) {
  const produto = await criarProduto(dados);
  let lote = null;
  if (quantos > 0) {
    lote = await producaoService.registrar({ produtoId: produto.id, quantidade: quantos }, null);
  }
  return { produto, lote };
}

const vender = (itens) => vendaService.criar({ itens, formaPagamento: 'DINHEIRO' }, null);

async function confereRazao(produtoId) {
  expect(await saldoProduto(produtoId)).toBe(await razaoDe({ produtoId }));
}

describe('venda', () => {
  it('vende até o que há pronto, e o saldo chega a zero', async () => {
    const { produto } = await doceCom(10);
    await vender([{ produtoId: produto.id, quantidade: 10 }]);
    expect(await saldoProduto(produto.id)).toBe(0);
    await confereRazao(produto.id);
  });

  it('recusa vender mais do que há, sem gravar nada', async () => {
    const { produto } = await doceCom(3, { nome: 'Brownie' });
    await expect(vender([{ produtoId: produto.id, quantidade: 5 }])).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringMatching(/vender 5 Brownie: só há 3 pronto/),
    });
    expect(await saldoProduto(produto.id)).toBe(3);
    expect(await prisma.venda.count()).toBe(0);
    await confereRazao(produto.id);
  });

  it('recusa vender doce que nunca foi produzido, e explica o caminho', async () => {
    const produto = await criarProduto({ nome: 'Trufa' });
    await expect(vender([{ produtoId: produto.id, quantidade: 1 }])).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringMatching(/não há nenhum pronto.*Registre a produção.*entrada avulsa/),
    });
    expect(await saldoProduto(produto.id)).toBe(0);
  });

  it('um item sem estoque derruba a venda inteira — o outro não fica baixado', async () => {
    const { produto: tem } = await doceCom(20);
    const { produto: falta } = await doceCom(2);
    await expect(
      vender([
        { produtoId: tem.id, quantidade: 10 },
        { produtoId: falta.id, quantidade: 5 },
      ])
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(await saldoProduto(tem.id)).toBe(20);
    expect(await saldoProduto(falta.id)).toBe(2);
    expect(await prisma.venda.count()).toBe(0);
  });

  it('o mesmo doce em duas linhas soma: 3 + 3 com 5 prontos é recusado', async () => {
    const { produto } = await doceCom(5);
    await expect(
      vender([
        { produtoId: produto.id, quantidade: 3 },
        { produtoId: produto.id, quantidade: 3 },
      ])
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(await saldoProduto(produto.id)).toBe(5);
  });

  it('duas vendas ao mesmo tempo não passam, juntas, do que há', async () => {
    const { produto } = await doceCom(10);
    const resultados = await Promise.allSettled([
      vender([{ produtoId: produto.id, quantidade: 7 }]),
      vender([{ produtoId: produto.id, quantidade: 7 }]),
    ]);
    expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await saldoProduto(produto.id)).toBe(3);
    expect(await prisma.venda.count()).toBe(1);
    await confereRazao(produto.id);
  });

  it('entrada avulsa (valor sem doce) continua livre: não mexe no estoque', async () => {
    const venda = await vendaService.criar({ valor: 80, formaPagamento: 'PIX' }, null);
    expect(Number(venda.total)).toBe(80);
  });
});

describe('editar, cancelar e reabrir venda', () => {
  it('editar para mais do que há é recusado e a venda fica como estava', async () => {
    const { produto } = await doceCom(10);
    const venda = await vender([{ produtoId: produto.id, quantidade: 4 }]);
    await expect(
      vendaService.atualizar(venda.id, {
        itens: [{ produtoId: produto.id, quantidade: 12 }],
        formaPagamento: 'DINHEIRO',
      })
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(await saldoProduto(produto.id)).toBe(6);
    await confereRazao(produto.id);
  });

  it('editar usando o que a própria venda já tinha é aceito (devolve antes de tirar)', async () => {
    const { produto } = await doceCom(10);
    const venda = await vender([{ produtoId: produto.id, quantidade: 4 }]);
    // Há 6 no estoque, mas a venda já levava 4: pode passar para 10.
    await vendaService.atualizar(venda.id, {
      itens: [{ produtoId: produto.id, quantidade: 10 }],
      formaPagamento: 'PIX',
    });
    expect(await saldoProduto(produto.id)).toBe(0);
    await confereRazao(produto.id);
  });

  it('cancelar devolve; reabrir sem doce bastante é recusado', async () => {
    const { produto } = await doceCom(5);
    const primeira = await vender([{ produtoId: produto.id, quantidade: 5 }]);
    await vendaService.cancelar(primeira.id);
    expect(await saldoProduto(produto.id)).toBe(5);
    await vender([{ produtoId: produto.id, quantidade: 4 }]);
    await expect(vendaService.reabrir(primeira.id)).rejects.toMatchObject({ statusCode: 422 });
    expect(await saldoProduto(produto.id)).toBe(1);
    await confereRazao(produto.id);
  });
});

describe('perda, ajuste e lote desfeito', () => {
  it('perda maior que o estoque é recusada', async () => {
    const { produto } = await doceCom(4);
    await expect(
      movimentacaoService.registrar(
        { tipo: 'PERDA', produtoId: produto.id, quantidade: 6, motivo: 'Caiu no chão' },
        null
      )
    ).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/perda de 6/) });
    expect(await saldoProduto(produto.id)).toBe(4);
  });

  it('ajuste que deixaria abaixo de zero é recusado; dentro do saldo passa', async () => {
    const { produto } = await doceCom(4);
    await expect(
      movimentacaoService.registrar(
        { tipo: 'AJUSTE', produtoId: produto.id, quantidade: -5, motivo: 'Contagem' },
        null
      )
    ).rejects.toMatchObject({ statusCode: 422 });
    await movimentacaoService.registrar(
      { tipo: 'AJUSTE', produtoId: produto.id, quantidade: -4, motivo: 'Contagem' },
      null
    );
    expect(await saldoProduto(produto.id)).toBe(0);
    await confereRazao(produto.id);
  });

  it('desfazer um lote já vendido é recusado; um lote intacto desfaz', async () => {
    const { produto, lote } = await doceCom(10, { nome: 'Beijinho' });
    await vender([{ produtoId: produto.id, quantidade: 6 }]);
    await expect(producaoService.excluir(lote.id)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringMatching(/desfazer este lote de Beijinho/),
    });
    expect(await saldoProduto(produto.id)).toBe(4);

    const outro = await producaoService.registrar({ produtoId: produto.id, quantidade: 5 }, null);
    await producaoService.excluir(outro.id);
    expect(await saldoProduto(produto.id)).toBe(4);
    await confereRazao(produto.id);
  });
});
