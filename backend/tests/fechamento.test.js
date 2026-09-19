import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { fechamentoService } from '../src/services/fechamentoService.js';
import { vendaService, despesaService } from '../src/services/caixaService.js';
import { estoqueService } from '../src/services/estoqueService.js';
import { limparTudo, criarProduto, criarCategoria } from './apoio.js';

/**
 * O fechamento existe para responder UMA pergunta: o dinheiro que está na
 * gaveta bate com o que deveria estar?
 *
 * A resposta só serve se o esperado contar apenas dinheiro vivo. Venda no
 * PIX não enche a gaveta — se entrasse na conta, a diferença acusaria falta
 * todo dia e a cliente aprenderia a ignorar o número, que é o pior
 * resultado possível para uma ferramenta de conferência.
 */
beforeEach(limparTudo);
afterAll(() => prisma.$disconnect());

async function produtoComEstoque(qtd = 100, preco = 10) {
  const p = await criarProduto({ precoVenda: preco });
  await prisma.$transaction((tx) =>
    estoqueService.movimentar(tx, { tipo: 'ENTRADA_PRODUCAO', produtoId: p.id, quantidade: qtd })
  );
  return p;
}

describe('o que conta como dinheiro na gaveta', () => {
  it('soma venda em dinheiro', async () => {
    const p = await produtoComEstoque(100, 10);
    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 3 }], formaPagamento: 'DINHEIRO' },
      null
    );

    const previa = await fechamentoService.previa(new Date());
    expect(previa.totalEntradas).toBe(30);
    expect(previa.saldoCalculado).toBe(30);
  });

  it('NÃO soma venda no PIX nem no cartão', async () => {
    // O centro da regra: esse dinheiro não passa pela gaveta.
    const p = await produtoComEstoque(100, 10);
    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 5 }], formaPagamento: 'PIX' },
      null
    );
    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 5 }], formaPagamento: 'CARTAO_DEBITO' },
      null
    );

    const previa = await fechamentoService.previa(new Date());
    expect(previa.totalEntradas).toBe(0);
    expect(previa.saldoCalculado).toBe(0);
    // mas a tela ainda precisa mostrar que houve venda
    expect(previa.detalhe.vendasOutrasFormas).toBe(100);
    expect(previa.detalhe.qtdVendas).toBe(2);
  });

  it('ignora venda cancelada', async () => {
    const p = await produtoComEstoque(100, 10);
    const venda = await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 4 }], formaPagamento: 'DINHEIRO' },
      null
    );
    await vendaService.cancelar(venda.id);

    expect((await fechamentoService.previa(new Date())).totalEntradas).toBe(0);
  });

  it('desconta despesa paga em dinheiro', async () => {
    const p = await produtoComEstoque(100, 10);
    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 10 }], formaPagamento: 'DINHEIRO' },
      null
    );
    const cat = await criarCategoria('CUSTO_OPERACIONAL');
    await despesaService.criar(
      { descricao: 'Gás', valor: 40, categoriaId: cat.id, formaPagamento: 'DINHEIRO' },
      null
    );

    const previa = await fechamentoService.previa(new Date());
    expect(previa.totalSaidas).toBe(40);
    expect(previa.saldoCalculado).toBe(60);
  });

  it('NÃO desconta despesa paga no PIX', async () => {
    const cat = await criarCategoria('CUSTO_OPERACIONAL');
    await despesaService.criar(
      { descricao: 'Internet', valor: 100, categoriaId: cat.id, formaPagamento: 'PIX' },
      null
    );

    expect((await fechamentoService.previa(new Date())).totalSaidas).toBe(0);
  });

  it('desconta retirada pessoal, que sai da gaveta como qualquer saída', async () => {
    // No lucro ela não entra; na contagem física, sai igual.
    const p = await produtoComEstoque(100, 10);
    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 10 }], formaPagamento: 'DINHEIRO' },
      null
    );
    const cat = await criarCategoria('RETIRADA_PESSOAL');
    await despesaService.criar(
      { descricao: 'Mercado', valor: 50, categoriaId: cat.id, formaPagamento: 'DINHEIRO' },
      null
    );

    const previa = await fechamentoService.previa(new Date());
    expect(previa.saldoCalculado).toBe(50);
    expect(previa.detalhe.retiradas).toBe(50);
  });

  it('trata despesa sem forma informada como dinheiro, e avisa quantas foram', async () => {
    const cat = await criarCategoria('CUSTO_OPERACIONAL');
    await despesaService.criar({ descricao: 'Sacolas', valor: 25, categoriaId: cat.id }, null);

    const previa = await fechamentoService.previa(new Date());
    expect(previa.totalSaidas).toBe(25);
    expect(previa.detalhe.despesasSemFormaInformada).toBe(1);
  });
});

describe('diferença entre o contado e o esperado', () => {
  it('acusa falta quando ela conta menos do que deveria ter', async () => {
    const p = await produtoComEstoque(100, 10);
    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 10 }], formaPagamento: 'DINHEIRO' },
      null
    );

    const f = await fechamentoService.fechar({ saldoConferido: 90 }, null);
    expect(Number(f.saldoCalculado)).toBe(100);
    expect(Number(f.diferenca)).toBe(-10);
  });

  it('acusa sobra quando ela conta mais', async () => {
    const p = await produtoComEstoque(100, 10);
    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 5 }], formaPagamento: 'DINHEIRO' },
      null
    );

    const f = await fechamentoService.fechar({ saldoConferido: 55 }, null);
    expect(Number(f.diferenca)).toBe(5);
  });

  it('aceita fechar sem contar ainda, deixando a diferença em aberto', async () => {
    const f = await fechamentoService.fechar({}, null);
    expect(f.saldoConferido).toBeNull();
    expect(f.diferenca).toBeNull();
  });

  it('aceita gaveta zerada — levar tudo ao banco é contagem válida', async () => {
    const f = await fechamentoService.fechar({ saldoConferido: 0 }, null);
    expect(Number(f.saldoConferido)).toBe(0);
  });

  it('recalcula o esperado quando ela lança venda esquecida depois de fechar', async () => {
    // Sem recalcular, o fechamento congelaria um número que já não bate
    // com o histórico, e a diferença viraria mentira.
    const p = await produtoComEstoque(100, 10);
    const f = await fechamentoService.fechar({ saldoConferido: 100 }, null);
    expect(Number(f.diferenca)).toBe(100);

    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 10 }], formaPagamento: 'DINHEIRO' },
      null
    );

    const revisado = await fechamentoService.conferir(f.id, { saldoConferido: 100 });
    expect(Number(revisado.saldoCalculado)).toBe(100);
    expect(Number(revisado.diferenca)).toBe(0);
  });
});

describe('encadeamento entre os dias', () => {
  it('abre o dia com o que ela CONTOU ontem, não com o que o sistema calculou', async () => {
    // Se faltaram R$ 10 ontem, hoje começa com o valor real. Senão a mesma
    // diferença reapareceria todo dia e ela perseguiria um erro já achado.
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);

    await prisma.fechamentoDiario.create({
      data: {
        data: new Date(ontem.setHours(0, 0, 0, 0)),
        saldoInicial: 0,
        totalEntradas: 100,
        totalSaidas: 0,
        saldoCalculado: 100,
        saldoConferido: 90,
        diferenca: -10,
      },
    });

    const hoje = await fechamentoService.previa(new Date());
    expect(hoje.saldoInicial).toBe(90);
  });

  it('começa do zero quando não há dia anterior', async () => {
    expect((await fechamentoService.previa(new Date())).saldoInicial).toBe(0);
  });
});

describe('proteções', () => {
  it('recusa fechar o mesmo dia duas vezes', async () => {
    await fechamentoService.fechar({ saldoConferido: 10 }, null);
    await expect(fechamentoService.fechar({ saldoConferido: 20 }, null)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('não conta o movimento de outro dia', async () => {
    const p = await produtoComEstoque(100, 10);
    const anteontem = new Date();
    anteontem.setDate(anteontem.getDate() - 2);
    await vendaService.criar(
      {
        itens: [{ produtoId: p.id, quantidade: 10 }],
        formaPagamento: 'DINHEIRO',
        data: anteontem,
      },
      null
    );

    expect((await fechamentoService.previa(new Date())).totalEntradas).toBe(0);
  });
});
