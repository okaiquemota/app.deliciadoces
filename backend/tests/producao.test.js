import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { producaoService } from '../src/services/producaoService.js';
import { estoqueService } from '../src/services/estoqueService.js';
import { dashboardService } from '../src/services/dashboardService.js';
import {
  limparTudo,
  criarInsumo,
  criarProduto,
  saldoInsumo,
  saldoProduto,
  razaoDe,
} from './apoio.js';

beforeEach(limparTudo);
afterAll(() => prisma.$disconnect());

async function insumoComEstoque(qtd, custo = 10) {
  const i = await criarInsumo({ custoUnitario: custo });
  await prisma.$transaction((tx) =>
    estoqueService.movimentar(tx, {
      tipo: 'ENTRADA_COMPRA',
      insumoId: i.id,
      quantidade: qtd,
      custoUnitario: custo,
    })
  );
  return i;
}

describe('produção com ficha técnica', () => {
  it('calcula o insumo pelo rendimento da receita', async () => {
    // Receita rende 40 e usa 2kg. Produzir 120 = 3 receitas = 6kg.
    const insumo = await insumoComEstoque(100);
    const produto = await criarProduto({ rendimentoReceita: 40 });
    await prisma.fichaTecnicaItem.create({
      data: { produtoId: produto.id, insumoId: insumo.id, quantidade: 2 },
    });

    const previsao = await producaoService.previsaoInsumos(produto.id, 120);
    expect(previsao[0].quantidade).toBeCloseTo(6, 3);

    await producaoService.registrar({ produtoId: produto.id, quantidade: 120 }, null);
    expect(await saldoInsumo(insumo.id)).toBe(94);
    expect(await saldoProduto(produto.id)).toBe(120);
  });

  it('estima o custo pelo custo médio dos insumos consumidos', async () => {
    const insumo = await insumoComEstoque(100, 8);
    const produto = await criarProduto({ rendimentoReceita: 10 });
    await prisma.fichaTecnicaItem.create({
      data: { produtoId: produto.id, insumoId: insumo.id, quantidade: 1 },
    });

    const lote = await producaoService.registrar({ produtoId: produto.id, quantidade: 50 }, null);
    expect(Number(lote.custoEstimado)).toBeCloseTo(40, 2); // 5 receitas x 1kg x R$8
  });
});

describe('produção sem ficha técnica', () => {
  it('funciona informando os insumos na mão', async () => {
    // Este é o caminho PROVÁVEL: a cliente só cadastraria receita
    // "se for simples". O sistema não pode depender da ficha.
    const insumo = await insumoComEstoque(50);
    const produto = await criarProduto({ rendimentoReceita: null });

    await producaoService.registrar(
      { produtoId: produto.id, quantidade: 30, insumos: [{ insumoId: insumo.id, quantidade: 4 }] },
      null
    );
    expect(await saldoInsumo(insumo.id)).toBe(46);
    expect(await saldoProduto(produto.id)).toBe(30);
  });

  it('funciona sem informar insumo nenhum', async () => {
    const produto = await criarProduto({ rendimentoReceita: null });
    await producaoService.registrar({ produtoId: produto.id, quantidade: 25 }, null);
    expect(await saldoProduto(produto.id)).toBe(25);
  });
});

describe('excluir produção', () => {
  it('devolve o insumo e retira o doce pronto', async () => {
    const insumo = await insumoComEstoque(100);
    const produto = await criarProduto({ rendimentoReceita: null });
    const lote = await producaoService.registrar(
      { produtoId: produto.id, quantidade: 60, insumos: [{ insumoId: insumo.id, quantidade: 10 }] },
      null
    );

    await producaoService.excluir(lote.id);
    expect(await saldoInsumo(insumo.id)).toBe(100);
    expect(await saldoProduto(produto.id)).toBe(0);
    expect(await razaoDe({ produtoId: produto.id })).toBe(0);
  });
});

describe('dashboard', () => {
  it('separa lucro de saldo de caixa: retirada pessoal não é custo', async () => {
    // A regra que a cliente levantou sozinha. Errar isso faz o resultado
    // dela parecer pior do que é.

    const p = await criarProduto({ precoVenda: 100 });
    await prisma.$transaction((tx) =>
      estoqueService.movimentar(tx, { tipo: 'ENTRADA_PRODUCAO', produtoId: p.id, quantidade: 10 })
    );
    const { vendaService } = await import('../src/services/caixaService.js');
    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 10 }], formaPagamento: 'PIX' },
      null
    );

    const { despesaService } = await import('../src/services/caixaService.js');
    await despesaService.criar({ descricao: 'compra', valor: 300 }, null);
    await despesaService.criar({ descricao: 'mercado', valor: 200, retirada: true }, null);

    const ontem = new Date(Date.now() - 86400000);
    const amanha = new Date(Date.now() + 86400000);
    const r = await dashboardService.resumo({ inicio: ontem, fim: amanha });

    expect(r.vendas).toBe(1000);
    expect(r.custos).toBe(300);
    expect(r.retiradas).toBe(200);
    expect(r.lucro).toBe(700); // vendas - custos, SEM a retirada
    expect(r.saldoCaixa).toBe(500); // o que de fato sobrou
  });

  it('não conta venda cancelada', async () => {
    const p = await criarProduto({ precoVenda: 50 });
    await prisma.$transaction((tx) =>
      estoqueService.movimentar(tx, { tipo: 'ENTRADA_PRODUCAO', produtoId: p.id, quantidade: 10 })
    );
    const { vendaService } = await import('../src/services/caixaService.js');
    const v = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 2 }], formaPagamento: 'PIX' },
      null
    );
    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 1 }], formaPagamento: 'PIX' },
      null
    );
    await vendaService.cancelar(v.id);

    const r = await dashboardService.resumo({
      inicio: new Date(Date.now() - 86400000),
      fim: new Date(Date.now() + 86400000),
    });
    expect(r.vendas).toBe(50);
    expect(r.quantidadeVendas).toBe(1);
  });
});
