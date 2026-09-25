import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { fechamentoService } from '../src/services/fechamentoService.js';
import { vendaService, despesaService } from '../src/services/caixaService.js';
import { estoqueService } from '../src/services/estoqueService.js';
import { colunaDoDia, diaDoCliente, filtrosPeriodo } from '../src/utils/periodo.js';
import { limparTudo, criarProduto } from './apoio.js';

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
    await despesaService.criar({ descricao: 'Gás', valor: 40, formaPagamento: 'DINHEIRO' }, null);

    const previa = await fechamentoService.previa(new Date());
    expect(previa.totalSaidas).toBe(40);
    expect(previa.saldoCalculado).toBe(60);
  });

  it('NÃO desconta despesa paga no PIX', async () => {
    await despesaService.criar({ descricao: 'Internet', valor: 100, formaPagamento: 'PIX' }, null);

    expect((await fechamentoService.previa(new Date())).totalSaidas).toBe(0);
  });

  it('desconta retirada pessoal, que sai da gaveta como qualquer saída', async () => {
    // No lucro ela não entra; na contagem física, sai igual.
    const p = await produtoComEstoque(100, 10);
    await vendaService.criar(
      { itens: [{ produtoId: p.id, quantidade: 10 }], formaPagamento: 'DINHEIRO' },
      null
    );
    await despesaService.criar(
      { descricao: 'Mercado', valor: 50, retirada: true, formaPagamento: 'DINHEIRO' },
      null
    );

    const previa = await fechamentoService.previa(new Date());
    expect(previa.saldoCalculado).toBe(50);
    expect(previa.detalhe.retiradas).toBe(50);
  });

  it('trata despesa sem forma informada como dinheiro, e avisa quantas foram', async () => {
    await despesaService.criar({ descricao: 'Sacolas', valor: 25 }, null);

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
    // O "ontem" é o da cliente: montado pelo relógio do servidor (UTC),
    // este teste falhava quando rodado depois das 21h de Brasília.
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await prisma.fechamentoDiario.create({
      data: {
        data: colunaDoDia(diaDoCliente(ontem)),
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

/**
 * O dia do fechamento é o dia da CLIENTE, em Brasília.
 *
 * O servidor roda em UTC. Antes, às 21h30 — a hora em que ela fecha o
 * caixa —, o UTC já estava no dia seguinte: a prévia abria a gaveta de
 * amanhã, e a venda das 21h30 era contada no fechamento do outro dia.
 */
describe('o dia do fechamento é o de Brasília', () => {
  afterEach(() => vi.useRealTimers());

  async function vendaEmDinheiro(quando, valor = 10) {
    const p = await produtoComEstoque(100, valor);
    return vendaService.criar(
      {
        itens: [{ produtoId: p.id, quantidade: 1 }],
        formaPagamento: 'DINHEIRO',
        data: new Date(quando),
      },
      null
    );
  }

  it('conta a venda das 21h30 no dia em que ela aconteceu', async () => {
    await vendaEmDinheiro('2026-03-10T21:30:00-03:00', 30);

    expect((await fechamentoService.previa('2026-03-10')).totalEntradas).toBe(30);
    expect((await fechamentoService.previa('2026-03-11')).totalEntradas).toBe(0);
  });

  it('conta a venda da meia-noite e meia no dia seguinte, não no anterior', async () => {
    await vendaEmDinheiro('2026-03-11T00:30:00-03:00', 20);

    expect((await fechamentoService.previa('2026-03-10')).totalEntradas).toBe(0);
    expect((await fechamentoService.previa('2026-03-11')).totalEntradas).toBe(20);
  });

  it('abre o dia de HOJE às 21h30, não o de amanhã', async () => {
    // Só o relógio é falso: os timers de verdade seguem, e o banco responde.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-10T21:30:00-03:00'));

    expect((await fechamentoService.previa()).data).toBe('2026-03-10');
    expect((await fechamentoService.fechar({ saldoConferido: 0 }, null)).data).toBe('2026-03-10');
  });

  it('devolve o dia como texto, para o navegador não mostrar a véspera', async () => {
    const f = await fechamentoService.fechar({ data: '2026-03-10', saldoConferido: 0 }, null);
    expect(f.data).toBe('2026-03-10');
    expect((await fechamentoService.porData('2026-03-10')).data).toBe('2026-03-10');
    expect((await fechamentoService.listar())[0].data).toBe('2026-03-10');
  });

  it('no histórico, o filtro de um dia traz só aquele dia', async () => {
    // O fim do dia 10 em Brasília já é dia 11 em UTC: comparado direto com
    // a coluna, o filtro arrastava o fechamento do dia 11 junto.
    await fechamentoService.fechar({ data: '2026-03-10', saldoConferido: 0 }, null);
    await fechamentoService.fechar({ data: '2026-03-11', saldoConferido: 0 }, null);

    const lista = await fechamentoService.listar(
      filtrosPeriodo({ inicio: '2026-03-10', fim: '2026-03-10' })
    );
    expect(lista.map((f) => f.data)).toEqual(['2026-03-10']);
  });

  it('abre o dia com o que ela contou no dia anterior de Brasília', async () => {
    await vendaEmDinheiro('2026-03-10T21:30:00-03:00', 50);
    await fechamentoService.fechar({ data: '2026-03-10', saldoConferido: 45 }, null);

    expect((await fechamentoService.previa('2026-03-11')).saldoInicial).toBe(45);
  });
});
