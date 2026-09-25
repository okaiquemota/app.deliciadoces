import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { vendaService, despesaService, CATEGORIA_DIVERSOS } from '../src/services/caixaService.js';
import { dashboardService } from '../src/services/dashboardService.js';
import { estoqueService } from '../src/services/estoqueService.js';
import { limparTudo, criarProduto, saldoProduto, razaoDe, criarCategoria } from './apoio.js';

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
    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 10 }], formaPagamento: 'PIX' },
      null
    );
    expect(await saldoProduto(p.id)).toBe(90);
  });

  it('calcula o total no servidor a partir do preço cadastrado', async () => {
    const p = await produtoComEstoque(100, 3.5);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 4 }], formaPagamento: 'DINHEIRO' },
      null
    );
    expect(Number(venda.total)).toBe(14);
  });

  it('ignora preço enviado pelo cliente e usa o do cadastro', async () => {
    // Impede venda adulterada: quem chama a API não decide o preço.
    const p = await produtoComEstoque(100, 3.5);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 2, precoUnitario: 0.01 }], formaPagamento: 'PIX' },
      null
    );
    expect(Number(venda.total)).toBe(7);
  });

  it('congela o preço no item: mudar o cadastro não altera venda antiga', async () => {
    const p = await produtoComEstoque(100, 10);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 2 }], formaPagamento: 'PIX' },
      null
    );
    await prisma.produto.update({ where: { id: p.id }, data: { precoVenda: 99 } });

    const guardada = await vendaService.porId(venda.id);
    expect(Number(guardada.itens[0].precoUnitario)).toBe(10);
    expect(Number(guardada.total)).toBe(20);
  });

  /**
   * O desconto agora entra pela tela: ela toca no total e digita o que
   * cobrou, e a diferença vira desconto. Este teste trava o que a tela
   * depende — que o desconto saia do subtotal do CADASTRO, e não do que
   * o navegador mandou como total.
   */
  it('desconta do subtotal calculado no servidor, não do que o cliente mandou', async () => {
    const p = await produtoComEstoque(100, 10);
    const venda = await vendaService.criar(
      {
        itens: [{ produtoId: p.id, quantidade: 3 }],
        desconto: 5,
        // Se isto fosse respeitado, a venda iria a R$ 1: o servidor
        // recalcula tudo e ignora o total vindo de fora.
        total: 1,
        subtotal: 6,
        formaPagamento: 'PIX',
      },
      null
    );
    expect(Number(venda.subtotal)).toBe(30);
    expect(Number(venda.desconto)).toBe(5);
    expect(Number(venda.total)).toBe(25);
  });

  it('recusa desconto maior que o subtotal', async () => {
    const p = await produtoComEstoque(100, 10);
    await expect(
      vendaService.criar(
        { itens: [{ produtoId: p.id, quantidade: 1 }], desconto: 50, formaPagamento: 'PIX' },
        null
      )
    ).rejects.toThrow(/desconto/i);
  });

  it('recusa venda sem itens', async () => {
    await expect(vendaService.criar({ itens: [], formaPagamento: 'PIX' }, null)).rejects.toThrow(
      /item/i
    );
  });
});

describe('editar venda', () => {
  it('estorna o estoque antigo antes de aplicar o novo', async () => {
    // O erro clássico seria aplicar a nova quantidade sem devolver a
    // anterior: 100 - 10 - 25 = 65 em vez do correto 75.
    const p = await produtoComEstoque(100);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 10 }], formaPagamento: 'PIX' },
      null
    );
    expect(await saldoProduto(p.id)).toBe(90);

    await vendaService.atualizar(
      venda.id,
      { itens: [{ produtoId: p.id, quantidade: 25 }], formaPagamento: 'PIX' },
      null
    );
    expect(await saldoProduto(p.id)).toBe(75);
    expect(await razaoDe({ produtoId: p.id })).toBe(75);
  });

  it('editar para menos devolve ao estoque', async () => {
    const p = await produtoComEstoque(100);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 40 }], formaPagamento: 'PIX' },
      null
    );
    await vendaService.atualizar(
      venda.id,
      { itens: [{ produtoId: p.id, quantidade: 5 }], formaPagamento: 'PIX' },
      null
    );
    expect(await saldoProduto(p.id)).toBe(95);
  });

  it('trocar o produto devolve o antigo e baixa o novo', async () => {
    const a = await produtoComEstoque(50);
    const b = await produtoComEstoque(50);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: a.id, quantidade: 10 }], formaPagamento: 'PIX' },
      null
    );
    await vendaService.atualizar(
      venda.id,
      { itens: [{ produtoId: b.id, quantidade: 10 }], formaPagamento: 'PIX' },
      null
    );

    expect(await saldoProduto(a.id)).toBe(50);
    expect(await saldoProduto(b.id)).toBe(40);
  });

  it('não deixa editar venda cancelada', async () => {
    const p = await produtoComEstoque(100);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 5 }], formaPagamento: 'PIX' },
      null
    );
    await vendaService.cancelar(venda.id);
    await expect(
      vendaService.atualizar(
        venda.id,
        { itens: [{ produtoId: p.id, quantidade: 1 }], formaPagamento: 'PIX' },
        null
      )
    ).rejects.toThrow(/cancelada/i);
  });
});

describe('cancelar venda', () => {
  it('devolve o estoque e preserva o registro', async () => {
    const p = await produtoComEstoque(100);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 30 }], formaPagamento: 'PIX' },
      null
    );
    await vendaService.cancelar(venda.id);

    expect(await saldoProduto(p.id)).toBe(100);
    const guardada = await prisma.venda.findUnique({ where: { id: venda.id } });
    expect(guardada).not.toBeNull(); // nada some
    expect(guardada.cancelada).toBe(true);
  });

  it('não deixa cancelar duas vezes', async () => {
    // Cancelar de novo devolveria estoque que já voltou.
    const p = await produtoComEstoque(100);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 10 }], formaPagamento: 'PIX' },
      null
    );
    await vendaService.cancelar(venda.id);
    await expect(vendaService.cancelar(venda.id)).rejects.toThrow(/já está cancelada/i);
    expect(await saldoProduto(p.id)).toBe(100);
  });

  it('reabrir volta a baixar o estoque', async () => {
    const p = await produtoComEstoque(100);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 20 }], formaPagamento: 'PIX' },
      null
    );
    await vendaService.cancelar(venda.id);
    await vendaService.reabrir(venda.id);
    expect(await saldoProduto(p.id)).toBe(80);
    expect(await razaoDe({ produtoId: p.id })).toBe(80);
  });

  it('venda cancelada não entra no total listado', async () => {
    const p = await produtoComEstoque(100, 10);
    const v1 = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 2 }], formaPagamento: 'PIX' },
      null
    );
    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 3 }], formaPagamento: 'PIX' },
      null
    );
    await vendaService.cancelar(v1.id);

    const ativas = await vendaService.listar({});
    expect(ativas).toHaveLength(1);
    expect(Number(ativas[0].total)).toBe(30);
  });
});

describe('sequência longa: cache e razão continuam iguais', () => {
  it('sobrevive a criar, editar, cancelar e reabrir em sequência', async () => {
    const p = await produtoComEstoque(500);
    const v = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 10 }], formaPagamento: 'PIX' },
      null
    );
    await vendaService.atualizar(
      v.id,
      { itens: [{ produtoId: p.id, quantidade: 30 }], formaPagamento: 'PIX' },
      null
    );
    await vendaService.atualizar(
      v.id,
      { itens: [{ produtoId: p.id, quantidade: 7 }], formaPagamento: 'DINHEIRO' },
      null
    );
    await vendaService.cancelar(v.id);
    await vendaService.reabrir(v.id);
    await vendaService.atualizar(
      v.id,
      { itens: [{ produtoId: p.id, quantidade: 12 }], formaPagamento: 'PIX' },
      null
    );

    expect(await saldoProduto(p.id)).toBe(488);
    expect(await razaoDe({ produtoId: p.id })).toBe(488);
  });
});

/**
 * Entrada de dinheiro sem produto.
 *
 * A cliente destacou que não tem tempo de mexer no sistema: quer digitar
 * o valor e pronto. O risco é o estoque mentir em silêncio — por isso
 * estes testes fixam que a entrada avulsa conta no caixa e NÃO encosta
 * no saldo dos doces.
 */
describe('entrada de dinheiro avulsa', () => {
  it('registra pelo valor digitado, sem produto', async () => {
    const venda = await vendaService.criar({ valor: 50, formaPagamento: 'DINHEIRO' }, null);
    expect(Number(venda.total)).toBe(50);
    expect(venda.itens).toHaveLength(0);
  });

  it('NÃO mexe no estoque de nenhum doce', async () => {
    // Sem saber o que saiu, chutar produto corromperia o saldo calado.
    const p = await produtoComEstoque(100);
    await vendaService.criar({ valor: 80, formaPagamento: 'PIX' }, null);

    expect(await saldoProduto(p.id)).toBe(100);
    expect(await razaoDe({ produtoId: p.id })).toBe(100);
  });

  it('conta no total de vendas do período, como qualquer venda', async () => {
    await vendaService.criar({ valor: 30, formaPagamento: 'DINHEIRO' }, null);
    const lista = await vendaService.listar({});
    expect(lista.reduce((soma, v) => soma + Number(v.total), 0)).toBe(30);
  });

  it('recusa produtos e valor ao mesmo tempo', async () => {
    // Com os dois não há resposta óbvia sobre quem manda no total, e
    // deixar o cliente escolher reabriria a brecha de preço.
    const p = await produtoComEstoque(100, 10);
    await expect(
      vendaService.criar(
        { itens: [{ produtoId: p.id, quantidade: 1 }], valor: 999, formaPagamento: 'PIX' },
        null
      )
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('recusa valor zero ou negativo', async () => {
    await expect(
      vendaService.criar({ valor: 0, formaPagamento: 'DINHEIRO' }, null)
    ).rejects.toMatchObject({ statusCode: 422 });
    await expect(
      vendaService.criar({ valor: -10, formaPagamento: 'DINHEIRO' }, null)
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('recusa venda sem itens e sem valor', async () => {
    await expect(vendaService.criar({ formaPagamento: 'DINHEIRO' }, null)).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('entra no fechamento quando é em dinheiro', async () => {
    // O caminho rápido precisa aparecer na gaveta, senão o fechamento
    // acusaria sobra toda vez que ela usasse o botão.
    const { fechamentoService } = await import('../src/services/fechamentoService.js');
    await vendaService.criar({ valor: 70, formaPagamento: 'DINHEIRO' }, null);
    expect((await fechamentoService.previa(new Date())).totalEntradas).toBe(70);
  });

  it('NÃO entra na gaveta quando é no Pix', async () => {
    const { fechamentoService } = await import('../src/services/fechamentoService.js');
    await vendaService.criar({ valor: 70, formaPagamento: 'PIX' }, null);
    expect((await fechamentoService.previa(new Date())).totalEntradas).toBe(0);
  });
});

describe('o painel separa a entrada avulsa', () => {
  it('conta a avulsa à parte, sem tirá-la do total', async () => {
    // A fatia avulsa é o dinheiro que entrou sem o sistema saber qual doce
    // saiu. Se ela cresce, o estoque está derivando — e o número só serve
    // se continuar somando no total, que é o faturamento de verdade.
    const { dashboardService } = await import('../src/services/dashboardService.js');
    const p = await produtoComEstoque(100, 10);
    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 3 }], formaPagamento: 'DINHEIRO' },
      null
    );
    await vendaService.criar({ valor: 45, formaPagamento: 'DINHEIRO' }, null);

    const r = await dashboardService.resumo({});
    expect(r.vendas).toBe(75);
    expect(r.vendasAvulsas).toBe(45);
    expect(r.quantidadeAvulsas).toBe(1);
    expect(r.quantidadeVendas).toBe(2);
  });

  it('devolve zero quando não houve avulsa', async () => {
    const { dashboardService } = await import('../src/services/dashboardService.js');
    const p = await produtoComEstoque(100, 10);
    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 2 }], formaPagamento: 'PIX' },
      null
    );

    const r = await dashboardService.resumo({});
    expect(r.vendasAvulsas).toBe(0);
    expect(r.quantidadeAvulsas).toBe(0);
  });
});

/**
 * A saída rápida da tela inicial não pergunta categoria.
 *
 * O risco que estes testes travam: sem categoria, cair na PRIMEIRA da
 * lista. Em ordem alfabética é "Ajudante" — o gás de cozinha viraria
 * pagamento de ajudante, e ninguém perceberia até olhar o relatório.
 */
describe('despesa sem categoria', () => {
  it('vai para Diversos, criada na hora se o banco ainda não tem', async () => {
    // Simula um banco anterior à categoria: ela não pode ser pré-requisito.
    await prisma.categoriaDespesa.deleteMany({ where: { nome: CATEGORIA_DIVERSOS } });
    await criarCategoria('CUSTO_OPERACIONAL', 'Ajudante-teste-' + Date.now());

    const d = await despesaService.criar({ descricao: 'Gás de cozinha', valor: 140 }, null);

    expect(d.categoria.nome).toBe(CATEGORIA_DIVERSOS);
    expect(d.categoria.tipo).toBe('CUSTO_OPERACIONAL');
  });

  it('reaproveita a mesma Diversos em vez de criar outra a cada saída', async () => {
    const a = await despesaService.criar({ descricao: 'Gás', valor: 10 }, null);
    const b = await despesaService.criar({ descricao: 'Luz', valor: 20 }, null);

    expect(a.categoriaId).toBe(b.categoriaId);
    expect(await prisma.categoriaDespesa.count({ where: { nome: CATEGORIA_DIVERSOS } })).toBe(1);
  });

  it('respeita a categoria quando ela é informada', async () => {
    const aluguel = await criarCategoria('CUSTO_OPERACIONAL');
    const d = await despesaService.criar(
      { descricao: 'Aluguel de setembro', valor: 800, categoriaId: aluguel.id },
      null
    );
    expect(d.categoriaId).toBe(aluguel.id);
  });

  it('entra no lucro como custo do negócio, não como retirada', async () => {
    await despesaService.criar({ descricao: 'Farinha', valor: 50 }, null);
    const r = await dashboardService.resumo({
      inicio: new Date(Date.now() - 86400000),
      fim: new Date(Date.now() + 86400000),
    });
    expect(r.custos).toBe(50);
    expect(r.retiradas).toBe(0);
  });
});
