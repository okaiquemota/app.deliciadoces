import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { estoqueService } from '../src/services/estoqueService.js';
import { movimentacaoService } from '../src/services/cadastroService.js';
import { producaoService } from '../src/services/producaoService.js';
import { limparTudo, criarInsumo, criarProduto, saldoInsumo, razaoDe } from './apoio.js';

/**
 * O estoqueService é o único autorizado a escrever `quantidadeAtual`,
 * que é um CACHE do razão. Se os dois divergirem, o estoque passa a
 * mentir em silêncio — e ninguém percebe até estar errado há semanas.
 *
 * Por isso quase todo teste aqui termina comparando cache e razão.
 */
beforeEach(limparTudo);
afterAll(() => prisma.$disconnect());

describe('direção das movimentações', () => {
  it('compra soma ao saldo', async () => {
    const insumo = await criarInsumo();
    await prisma.$transaction((tx) =>
      estoqueService.movimentar(tx, { tipo: 'ENTRADA_COMPRA', insumoId: insumo.id, quantidade: 5 })
    );
    expect(await saldoInsumo(insumo.id)).toBe(5);
  });

  it('saída subtrai do saldo', async () => {
    const insumo = await criarInsumo();
    await prisma.$transaction(async (tx) => {
      await estoqueService.movimentar(tx, {
        tipo: 'ENTRADA_COMPRA',
        insumoId: insumo.id,
        quantidade: 10,
      });
      await estoqueService.movimentar(tx, {
        tipo: 'SAIDA_PRODUCAO',
        insumoId: insumo.id,
        quantidade: 3,
      });
    });
    expect(await saldoInsumo(insumo.id)).toBe(7);
  });

  it('grava quantidade sempre positiva, mesmo recebendo negativo numa saída', async () => {
    // A direção vem do tipo, não do sinal. Um -3 numa saída não pode virar
    // entrada por acidente.
    const insumo = await criarInsumo();
    await prisma.$transaction(async (tx) => {
      await estoqueService.movimentar(tx, {
        tipo: 'ENTRADA_COMPRA',
        insumoId: insumo.id,
        quantidade: 10,
      });
      await estoqueService.movimentar(tx, {
        tipo: 'PERDA',
        insumoId: insumo.id,
        quantidade: -3,
        motivo: 'teste',
      });
    });
    const movs = await prisma.movimentacaoEstoque.findMany({ where: { tipo: 'PERDA' } });
    expect(Number(movs[0].quantidade)).toBe(3);
    expect(await saldoInsumo(insumo.id)).toBe(7);
  });

  it('ajuste é o único tipo que aceita as duas direções', async () => {
    const insumo = await criarInsumo();
    await prisma.$transaction(async (tx) => {
      await estoqueService.movimentar(tx, {
        tipo: 'ENTRADA_COMPRA',
        insumoId: insumo.id,
        quantidade: 10,
      });
      await estoqueService.movimentar(tx, {
        tipo: 'AJUSTE',
        insumoId: insumo.id,
        quantidade: -2,
        motivo: 'contagem',
      });
    });
    expect(await saldoInsumo(insumo.id)).toBe(8);

    await prisma.$transaction((tx) =>
      estoqueService.movimentar(tx, {
        tipo: 'AJUSTE',
        insumoId: insumo.id,
        quantidade: 5,
        motivo: 'contagem',
      })
    );
    expect(await saldoInsumo(insumo.id)).toBe(13);
  });

  it('ajuste para baixo fica gravado COM o sinal: o histórico diz o que aconteceu', async () => {
    // Gravado sem sinal, "a contagem achou 2 a menos" virava +2 no
    // histórico — e recalcular o saldo pelo histórico dava 12 em vez de 8.
    const insumo = await criarInsumo();
    await prisma.$transaction(async (tx) => {
      await estoqueService.movimentar(tx, {
        tipo: 'ENTRADA_COMPRA',
        insumoId: insumo.id,
        quantidade: 10,
      });
      await estoqueService.movimentar(tx, {
        tipo: 'AJUSTE',
        insumoId: insumo.id,
        quantidade: -2,
        motivo: 'contagem',
      });
    });

    const [ajuste] = await prisma.movimentacaoEstoque.findMany({ where: { tipo: 'AJUSTE' } });
    expect(Number(ajuste.quantidade)).toBe(-2);
    expect(await razaoDe({ insumoId: insumo.id })).toBe(8);
    await estoqueService.recalcularSaldo({ insumoId: insumo.id });
    expect(await saldoInsumo(insumo.id)).toBe(8);
  });
});

describe('regras que protegem o dado', () => {
  it('recusa movimentação sem insumo nem produto', async () => {
    await expect(
      prisma.$transaction((tx) =>
        estoqueService.movimentar(tx, { tipo: 'ENTRADA_COMPRA', quantidade: 1 })
      )
    ).rejects.toThrow(/exatamente um/i);
  });

  it('recusa movimentação com insumo E produto ao mesmo tempo', async () => {
    const [i, p] = [await criarInsumo(), await criarProduto()];
    await expect(
      prisma.$transaction((tx) =>
        estoqueService.movimentar(tx, {
          tipo: 'ENTRADA_COMPRA',
          insumoId: i.id,
          produtoId: p.id,
          quantidade: 1,
        })
      )
    ).rejects.toThrow(/exatamente um/i);
  });

  it('exige motivo na perda', async () => {
    const insumo = await criarInsumo();
    await expect(
      prisma.$transaction((tx) =>
        estoqueService.movimentar(tx, { tipo: 'PERDA', insumoId: insumo.id, quantidade: 1 })
      )
    ).rejects.toThrow(/motivo/i);
  });

  it('exige motivo no ajuste', async () => {
    const insumo = await criarInsumo();
    await expect(
      prisma.$transaction((tx) =>
        estoqueService.movimentar(tx, { tipo: 'AJUSTE', insumoId: insumo.id, quantidade: 1 })
      )
    ).rejects.toThrow(/motivo/i);
  });

  it('recusa quantidade zero', async () => {
    const insumo = await criarInsumo();
    await expect(
      prisma.$transaction((tx) =>
        estoqueService.movimentar(tx, {
          tipo: 'ENTRADA_COMPRA',
          insumoId: insumo.id,
          quantidade: 0,
        })
      )
    ).rejects.toThrow(/zero/i);
  });
});

describe('transação: saldo e razão mudam juntos ou não mudam', () => {
  it('erro no meio da transação não deixa saldo alterado', async () => {
    // Este é o teste que justifica a arquitetura toda. Se a primeira
    // movimentação persistisse e a segunda falhasse, o estoque ficaria
    // com uma saída que não existe no razão.
    const insumo = await criarInsumo();
    await prisma.$transaction((tx) =>
      estoqueService.movimentar(tx, { tipo: 'ENTRADA_COMPRA', insumoId: insumo.id, quantidade: 10 })
    );

    await expect(
      prisma.$transaction(async (tx) => {
        await estoqueService.movimentar(tx, {
          tipo: 'SAIDA_PRODUCAO',
          insumoId: insumo.id,
          quantidade: 4,
        });
        // Falha depois de já ter mexido no saldo
        await estoqueService.movimentar(tx, { tipo: 'PERDA', insumoId: insumo.id, quantidade: 1 });
      })
    ).rejects.toThrow();

    expect(await saldoInsumo(insumo.id)).toBe(10);
    expect(await razaoDe({ insumoId: insumo.id })).toBe(10);
  });
});

describe('recalcularSaldo', () => {
  it('conserta um saldo corrompido por escrita fora do serviço', async () => {
    const insumo = await criarInsumo();
    await prisma.$transaction((tx) =>
      estoqueService.movimentar(tx, { tipo: 'ENTRADA_COMPRA', insumoId: insumo.id, quantidade: 7 })
    );

    // Simula alguém escrevendo saldo por fora — exatamente o que a regra proíbe
    await prisma.insumo.update({ where: { id: insumo.id }, data: { quantidadeAtual: 999 } });
    expect(await saldoInsumo(insumo.id)).toBe(999);

    await estoqueService.recalcularSaldo({ insumoId: insumo.id });
    expect(await saldoInsumo(insumo.id)).toBe(7);
  });
});

describe('custo médio do insumo', () => {
  it('pondera pelas quantidades, não tira média simples', async () => {
    // 10kg a R$ 10 + 10kg a R$ 20 -> R$ 15
    // 10kg a R$ 10 + 30kg a R$ 20 -> R$ 17,50 (e não R$ 15)
    const insumo = await criarInsumo({ custoUnitario: 0 });
    await movimentacaoService.registrar(
      { tipo: 'ENTRADA_COMPRA', insumoId: insumo.id, quantidade: 10, custoUnitario: 10 },
      null
    );
    await movimentacaoService.registrar(
      { tipo: 'ENTRADA_COMPRA', insumoId: insumo.id, quantidade: 30, custoUnitario: 20 },
      null
    );
    const atual = await prisma.insumo.findUnique({ where: { id: insumo.id } });
    expect(Number(atual.custoUnitario)).toBeCloseTo(17.5, 2);
    expect(await saldoInsumo(insumo.id)).toBe(40);
  });

  it('estoque de custo desconhecido não entra na média como se fosse de graça', async () => {
    // 15 caixas achadas na contagem (custo 0 = não sei) + 21 a R$ 1,20:
    // o custo é R$ 1,20, e não os R$ 0,70 de pesar as achadas como zero.
    const insumo = await criarInsumo({ custoUnitario: 0 });
    await prisma.$transaction((tx) =>
      estoqueService.movimentar(tx, {
        tipo: 'AJUSTE',
        insumoId: insumo.id,
        quantidade: 15,
        motivo: 'achei no estoque',
      })
    );
    await movimentacaoService.registrar(
      { tipo: 'ENTRADA_COMPRA', insumoId: insumo.id, quantidade: 21, custoUnitario: 1.2 },
      null
    );
    const atual = await prisma.insumo.findUnique({ where: { id: insumo.id } });
    expect(Number(atual.custoUnitario)).toBeCloseTo(1.2, 4);
  });
});

describe('alertas de estoque', () => {
  it('aponta item no mínimo e ignora quem está acima', async () => {
    const baixo = await criarInsumo({ estoqueMinimo: 5 });
    const ok = await criarInsumo({ estoqueMinimo: 5 });
    await prisma.$transaction(async (tx) => {
      await estoqueService.movimentar(tx, {
        tipo: 'ENTRADA_COMPRA',
        insumoId: baixo.id,
        quantidade: 5,
      });
      await estoqueService.movimentar(tx, {
        tipo: 'ENTRADA_COMPRA',
        insumoId: ok.id,
        quantidade: 50,
      });
    });

    const { insumosBaixos } = await estoqueService.alertas();
    const ids = insumosBaixos.map((i) => i.id);
    expect(ids).toContain(baixo.id); // no mínimo já conta como acabando
    expect(ids).not.toContain(ok.id);
  });

  it('não acusa item sem mínimo definido', async () => {
    const semMinimo = await criarInsumo({ estoqueMinimo: 0 });
    const { insumosBaixos } = await estoqueService.alertas();
    expect(insumosBaixos.map((i) => i.id)).not.toContain(semMinimo.id);
  });
});

/**
 * O histórico do Estoque (material) e o da Produção (doces) são listas
 * separadas. Filtradas só na tela, as vendas — uma saída de doce cada —
 * tomariam o limite da listagem e esconderiam as compras de ingrediente.
 */
/**
 * O Kardex: a lista de tudo o que entrou e saiu, e — pedido um item — o
 * saldo logo depois de cada linha.
 */
describe('Kardex', () => {
  const DIA = 24 * 60 * 60 * 1000;
  const mover = (dados) => prisma.$transaction((tx) => estoqueService.movimentar(tx, dados));

  it('pedido um item, cada linha diz quanto ficou depois dela', async () => {
    const insumo = await criarInsumo();
    await mover({ tipo: 'ENTRADA_COMPRA', insumoId: insumo.id, quantidade: 10 });
    await mover({ tipo: 'PERDA', insumoId: insumo.id, quantidade: 3, motivo: 'caiu' });
    await mover({ tipo: 'AJUSTE', insumoId: insumo.id, quantidade: 1, motivo: 'contagem' });
    await mover({ tipo: 'ENTRADA_COMPRA', insumoId: insumo.id, quantidade: 5 });

    const lista = await estoqueService.listarMovimentacoes({ insumoId: insumo.id });
    // Da mais nova para a mais velha: 13 hoje, 8 antes da última compra...
    expect(lista.map((m) => m.saldoDepois)).toEqual([13, 8, 7, 10]);
  });

  it('o saldo conta o que ficou fora do período pedido', async () => {
    // Senão a linha da semana passada mostraria o saldo de hoje.
    const insumo = await criarInsumo();
    const semanaPassada = new Date(Date.now() - 7 * DIA);
    await mover({
      tipo: 'ENTRADA_COMPRA',
      insumoId: insumo.id,
      quantidade: 10,
      data: semanaPassada,
    });
    await mover({ tipo: 'ENTRADA_COMPRA', insumoId: insumo.id, quantidade: 5 });

    const lista = await estoqueService.listarMovimentacoes({
      insumoId: insumo.id,
      fim: new Date(Date.now() - 2 * DIA),
    });
    expect(lista.map((m) => m.saldoDepois)).toEqual([10]);
  });

  it('segue a ordem da DATA do lançamento, não a de quando foi digitado', async () => {
    // Lote registrado hoje com a data de ontem entra antes da venda de hoje.
    const produto = await criarProduto();
    await mover({ tipo: 'ENTRADA_PRODUCAO', produtoId: produto.id, quantidade: 20 });
    await mover({ tipo: 'SAIDA_VENDA', produtoId: produto.id, quantidade: 2 });
    await mover({
      tipo: 'ENTRADA_PRODUCAO',
      produtoId: produto.id,
      quantidade: 30,
      data: new Date(Date.now() - DIA),
    });

    const lista = await estoqueService.listarMovimentacoes({ produtoId: produto.id });
    expect(lista.map((m) => [Number(m.quantidade), m.saldoDepois])).toEqual([
      [2, 48],
      [20, 50],
      [30, 30],
    ]);
  });

  it('sem item pedido, traz os dois lados e nenhum saldo', async () => {
    // Um saldo de "tudo" misturaria latas com brigadeiros.
    const insumo = await criarInsumo();
    const produto = await criarProduto();
    await mover({ tipo: 'ENTRADA_COMPRA', insumoId: insumo.id, quantidade: 5 });
    await mover({ tipo: 'ENTRADA_PRODUCAO', produtoId: produto.id, quantidade: 20 });

    const lista = await estoqueService.listarMovimentacoes({});
    expect(lista).toHaveLength(2);
    expect(lista.every((m) => m.saldoDepois === undefined)).toBe(true);
  });

  it('o lote vem junto, para a tela juntar o doce e os ingredientes', async () => {
    const insumo = await criarInsumo();
    const produto = await criarProduto();
    await mover({ tipo: 'ENTRADA_COMPRA', insumoId: insumo.id, quantidade: 10 });
    const lote = await producaoService.registrar(
      { produtoId: produto.id, quantidade: 30, insumos: [{ insumoId: insumo.id, quantidade: 2 }] },
      null
    );

    const doLote = (await estoqueService.listarMovimentacoes({})).filter((m) => m.producaoId);
    expect(doLote).toHaveLength(2);
    expect(doLote.every((m) => m.producao.id === lote.id)).toBe(true);
    expect(Number(doLote[0].producao.quantidade)).toBe(30);
  });

  it('respeita o limite pedido', async () => {
    const insumo = await criarInsumo();
    for (let n = 0; n < 3; n++) {
      await mover({ tipo: 'ENTRADA_COMPRA', insumoId: insumo.id, quantidade: 1 });
    }
    expect(await estoqueService.listarMovimentacoes({ limite: 2 })).toHaveLength(2);
  });
});
