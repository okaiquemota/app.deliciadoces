import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { vendaService } from '../src/services/caixaService.js';
import { estoqueService } from '../src/services/estoqueService.js';
import { limparTudo, criarProduto, saldoProduto, razaoDe } from './apoio.js';

/**
 * Editar e excluir venda é FLUXO PRINCIPAL para a cliente, não exceção —
 * ela erra e corrige o tempo todo. É também onde o estoque tem mais
 * chance de desandar, porque cada edição precisa estornar o que a versão
 * anterior tirou antes de aplicar a nova.
 */
beforeEach(limparTudo);
afterAll(() => prisma.$disconnect());

async function produtoComEstoque(qtd, preco = 10) {
  const p = await criarProduto({ precoVenda: preco });
  await prisma.$transaction((tx) =>
    estoqueService.movimentar(tx, { tipo: 'ENTRADA_PRODUCAO', produtoId: p.id, quantidade: qtd })
  );
  return p;
}

describe('venda', () => {
  it('baixa o estoque do doce vendido', async () => {
    const p = await produtoComEstoque(100);
    await vendaService.criar({ itens: [{ produtoId: p.id, quantidade: 10 }], formaPagamento: 'PIX' }, null);
    expect(await saldoProduto(p.id)).toBe(90);
  });

  it('calcula o total no servidor a partir do preço cadastrado', async () => {
    const p = await produtoComEstoque(100, 3.5);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 4 }], formaPagamento: 'DINHEIRO' }, null
    );
    expect(Number(venda.total)).toBe(14);
  });

  it('ignora preço enviado pelo cliente e usa o do cadastro', async () => {
    // Impede venda adulterada: quem chama a API não decide o preço.
    const p = await produtoComEstoque(100, 3.5);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 2, precoUnitario: 0.01 }], formaPagamento: 'PIX' }, null
    );
    expect(Number(venda.total)).toBe(7);
  });

  it('congela o preço no item: mudar o cadastro não altera venda antiga', async () => {
    const p = await produtoComEstoque(100, 10);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 2 }], formaPagamento: 'PIX' }, null
    );
    await prisma.produto.update({ where: { id: p.id }, data: { precoVenda: 99 } });

    const guardada = await vendaService.porId(venda.id);
    expect(Number(guardada.itens[0].precoUnitario)).toBe(10);
    expect(Number(guardada.total)).toBe(20);
  });

  it('recusa desconto maior que o subtotal', async () => {
    const p = await produtoComEstoque(100, 10);
    await expect(
      vendaService.criar({ itens: [{ produtoId: p.id, quantidade: 1 }], desconto: 50, formaPagamento: 'PIX' }, null)
    ).rejects.toThrow(/desconto/i);
  });

  it('recusa venda sem itens', async () => {
    await expect(vendaService.criar({ itens: [], formaPagamento: 'PIX' }, null)).rejects.toThrow(/item/i);
  });
});

describe('editar venda', () => {
  it('estorna o estoque antigo antes de aplicar o novo', async () => {
    // O erro clássico seria aplicar a nova quantidade sem devolver a
    // anterior: 100 - 10 - 25 = 65 em vez do correto 75.
    const p = await produtoComEstoque(100);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 10 }], formaPagamento: 'PIX' }, null
    );
    expect(await saldoProduto(p.id)).toBe(90);

    await vendaService.atualizar(venda.id, { itens: [{ produtoId: p.id, quantidade: 25 }], formaPagamento: 'PIX' }, null);
    expect(await saldoProduto(p.id)).toBe(75);
    expect(await razaoDe({ produtoId: p.id })).toBe(75);
  });

  it('editar para menos devolve ao estoque', async () => {
    const p = await produtoComEstoque(100);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 40 }], formaPagamento: 'PIX' }, null
    );
    await vendaService.atualizar(venda.id, { itens: [{ produtoId: p.id, quantidade: 5 }], formaPagamento: 'PIX' }, null);
    expect(await saldoProduto(p.id)).toBe(95);
  });

  it('trocar o produto devolve o antigo e baixa o novo', async () => {
    const a = await produtoComEstoque(50);
    const b = await produtoComEstoque(50);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: a.id, quantidade: 10 }], formaPagamento: 'PIX' }, null
    );
    await vendaService.atualizar(venda.id, { itens: [{ produtoId: b.id, quantidade: 10 }], formaPagamento: 'PIX' }, null);

    expect(await saldoProduto(a.id)).toBe(50);
    expect(await saldoProduto(b.id)).toBe(40);
  });

  it('não deixa editar venda cancelada', async () => {
    const p = await produtoComEstoque(100);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 5 }], formaPagamento: 'PIX' }, null
    );
    await vendaService.cancelar(venda.id);
    await expect(
      vendaService.atualizar(venda.id, { itens: [{ produtoId: p.id, quantidade: 1 }], formaPagamento: 'PIX' }, null)
    ).rejects.toThrow(/cancelada/i);
  });
});

describe('cancelar venda', () => {
  it('devolve o estoque e preserva o registro', async () => {
    const p = await produtoComEstoque(100);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 30 }], formaPagamento: 'PIX' }, null
    );
    await vendaService.cancelar(venda.id);

    expect(await saldoProduto(p.id)).toBe(100);
    const guardada = await prisma.venda.findUnique({ where: { id: venda.id } });
    expect(guardada).not.toBeNull();          // nada some
    expect(guardada.cancelada).toBe(true);
  });

  it('não deixa cancelar duas vezes', async () => {
    // Cancelar de novo devolveria estoque que já voltou.
    const p = await produtoComEstoque(100);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 10 }], formaPagamento: 'PIX' }, null
    );
    await vendaService.cancelar(venda.id);
    await expect(vendaService.cancelar(venda.id)).rejects.toThrow(/já está cancelada/i);
    expect(await saldoProduto(p.id)).toBe(100);
  });

  it('reabrir volta a baixar o estoque', async () => {
    const p = await produtoComEstoque(100);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 20 }], formaPagamento: 'PIX' }, null
    );
    await vendaService.cancelar(venda.id);
    await vendaService.reabrir(venda.id);
    expect(await saldoProduto(p.id)).toBe(80);
    expect(await razaoDe({ produtoId: p.id })).toBe(80);
  });

  it('venda cancelada não entra no total listado', async () => {
    const p = await produtoComEstoque(100, 10);
    const v1 = await vendaService.criar({ itens: [{ produtoId: p.id, quantidade: 2 }], formaPagamento: 'PIX' }, null);
    await vendaService.criar({ itens: [{ produtoId: p.id, quantidade: 3 }], formaPagamento: 'PIX' }, null);
    await vendaService.cancelar(v1.id);

    const ativas = await vendaService.listar({});
    expect(ativas).toHaveLength(1);
    expect(Number(ativas[0].total)).toBe(30);
  });
});

describe('sequência longa: cache e razão continuam iguais', () => {
  it('sobrevive a criar, editar, cancelar e reabrir em sequência', async () => {
    const p = await produtoComEstoque(500);
    const v = await vendaService.criar({ itens: [{ produtoId: p.id, quantidade: 10 }], formaPagamento: 'PIX' }, null);
    await vendaService.atualizar(v.id, { itens: [{ produtoId: p.id, quantidade: 30 }], formaPagamento: 'PIX' }, null);
    await vendaService.atualizar(v.id, { itens: [{ produtoId: p.id, quantidade: 7 }], formaPagamento: 'DINHEIRO' }, null);
    await vendaService.cancelar(v.id);
    await vendaService.reabrir(v.id);
    await vendaService.atualizar(v.id, { itens: [{ produtoId: p.id, quantidade: 12 }], formaPagamento: 'PIX' }, null);

    expect(await saldoProduto(p.id)).toBe(488);
    expect(await razaoDe({ produtoId: p.id })).toBe(488);
  });
});
