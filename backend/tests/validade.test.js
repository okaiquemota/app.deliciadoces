import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { estoqueService } from '../src/services/estoqueService.js';
import { insumoService } from '../src/services/cadastroService.js';
import { limparTudo, criarInsumo } from './apoio.js';
import { colunaDoDia, diaDoCliente } from '../src/utils/periodo.js';

/**
 * Validade.
 *
 * A cliente joga fora ingrediente vencido e perde dinheiro por não ter
 * visto a tempo. A validade fica na COMPRA, e o sistema não sabe de qual
 * compra saiu cada uso — então a data que a tela mostra é estimada pela
 * regra da confeitaria: o mais antigo sai primeiro. O que sobrou são as
 * compras mais recentes, até somar o saldo.
 *
 * O que estes testes protegem é isso: mostrar a data do que ESTÁ na
 * prateleira, e não a de uma compra que já foi usada.
 */
beforeEach(limparTudo);
afterEach(() => vi.useRealTimers());
afterAll(() => prisma.$disconnect());

const DIA = 24 * 60 * 60 * 1000;

/** O dia de Brasília daqui a `n` dias, como texto: "2026-10-08". */
const diaMais = (n) => diaDoCliente(new Date(Date.now() + n * DIA));

/** Compras e usos em transações separadas, uma depois da outra. */
async function comprar(insumoId, quantidade, validade) {
  return prisma.$transaction((tx) =>
    estoqueService.movimentar(tx, {
      tipo: 'ENTRADA_COMPRA',
      insumoId,
      quantidade,
      validade: validade ? colunaDoDia(validade) : null,
      custoUnitario: 10,
    })
  );
}

async function usar(insumoId, quantidade) {
  return prisma.$transaction((tx) =>
    estoqueService.movimentar(tx, { tipo: 'SAIDA_PRODUCAO', insumoId, quantidade })
  );
}

const validadeDe = async (insumoId) =>
  (await estoqueService.validadesNaPrateleira()).get(insumoId) ?? null;

describe('o mais antigo sai primeiro', () => {
  it('mostra a data da compra que sobrou, não a da que já foi usada', async () => {
    // 3 de setembro + 5 de outubro, usou 4: as 3 antigas foram primeiro,
    // e as 4 que sobraram são de outubro.
    const i = await criarInsumo({ controlaValidade: true });
    await comprar(i.id, 3, diaMais(10));
    await comprar(i.id, 5, diaMais(50));
    await usar(i.id, 4);

    expect((await validadeDe(i.id)).validade).toBe(diaMais(50));
  });

  it('enquanto a compra antiga não acabou, vale a data dela — e diz quanto', async () => {
    const i = await criarInsumo({ controlaValidade: true });
    await comprar(i.id, 3, diaMais(10));
    await comprar(i.id, 5, diaMais(50));
    await usar(i.id, 2);

    const v = await validadeDe(i.id);
    expect(v.validade).toBe(diaMais(10));
    // Das 3 antigas, 2 foram usadas: 1 vence primeiro.
    expect(v.quantidade).toBe(1);
  });

  it('mostra a data mais próxima, mesmo quando a compra nova vence antes', async () => {
    const i = await criarInsumo({ controlaValidade: true });
    await comprar(i.id, 5, diaMais(50));
    await comprar(i.id, 3, diaMais(10));

    const v = await validadeDe(i.id);
    expect(v.validade).toBe(diaMais(10));
    expect(v.quantidade).toBe(3);
  });

  it('soma duas compras que vencem no mesmo dia', async () => {
    const i = await criarInsumo({ controlaValidade: true });
    await comprar(i.id, 2, diaMais(10));
    await comprar(i.id, 3, diaMais(10));

    expect((await validadeDe(i.id)).quantidade).toBe(5);
  });

  it('compra sem validade ocupa a prateleira e não tem data para mostrar', async () => {
    const i = await criarInsumo();
    await comprar(i.id, 5, diaMais(10));
    await comprar(i.id, 5, null);
    await usar(i.id, 5);

    expect(await validadeDe(i.id)).toBeNull();
  });

  it('sem nada no estoque, não tem validade', async () => {
    const i = await criarInsumo({ controlaValidade: true });
    await comprar(i.id, 5, diaMais(10));
    await usar(i.id, 5);

    expect(await validadeDe(i.id)).toBeNull();
  });

  it('cada ingrediente tem a sua conta', async () => {
    const a = await criarInsumo({ controlaValidade: true });
    const b = await criarInsumo({ controlaValidade: true });
    await comprar(a.id, 5, diaMais(10));
    await comprar(b.id, 5, diaMais(30));

    expect((await validadeDe(a.id)).validade).toBe(diaMais(10));
    expect((await validadeDe(b.id)).validade).toBe(diaMais(30));
  });
});

describe('vencido x vencendo', () => {
  it('marca como vencido o que passou da data', async () => {
    const i = await criarInsumo({ controlaValidade: true });
    await comprar(i.id, 5, diaMais(-5));

    const v = await validadeDe(i.id);
    expect(v.vencido).toBe(true);
    expect(v.dias).toBe(-5);
  });

  it('NÃO marca como vencido o que vence hoje', async () => {
    // Fronteira: o que vence hoje ainda dá para usar hoje.
    const i = await criarInsumo({ controlaValidade: true });
    await comprar(i.id, 5, diaMais(0));

    const v = await validadeDe(i.id);
    expect(v.vencido).toBe(false);
    expect(v.dias).toBe(0);
  });

  it('conta o dia de Brasília: às 22h o que vence hoje ainda vence hoje', async () => {
    // 22h de 9 de março em Brasília já é 10 de março em UTC. Contado em
    // UTC, o lote de 9/3 aparecia vencido na hora de fechar a loja.
    const i = await criarInsumo({ controlaValidade: true });
    await comprar(i.id, 5, '2026-03-09');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-09T22:00:00-03:00'));
    const v = await validadeDe(i.id);
    expect(v.dias).toBe(0);
    expect(v.vencido).toBe(false);
  });

  it('devolve o dia como texto, para a tela não mostrar a véspera', async () => {
    const i = await criarInsumo({ controlaValidade: true });
    await comprar(i.id, 5, '2030-03-10');

    expect((await validadeDe(i.id)).validade).toBe('2030-03-10');
  });
});

describe('na lista de ingredientes', () => {
  it('cada ingrediente vem com a validade da prateleira, ou nada', async () => {
    const com = await criarInsumo({ nome: 'A creme de leite', controlaValidade: true });
    const sem = await criarInsumo({ nome: 'B farinha' });
    await comprar(com.id, 2, diaMais(7));
    await comprar(sem.id, 2, null);

    const [a, b] = await insumoService.listar();
    expect(a.validade).toMatchObject({ validade: diaMais(7), dias: 7, quantidade: 2 });
    expect(b.validade).toBeNull();
  });
});

describe('aviso do menu', () => {
  it('avisa UMA vez por ingrediente, pela data mais próxima', async () => {
    // Por compra, três caixas de creme de leite eram três avisos — e o
    // número no menu dizia "3" para um ingrediente só.
    const i = await criarInsumo({ controlaValidade: true });
    await comprar(i.id, 1, diaMais(3));
    await comprar(i.id, 1, diaMais(5));
    await comprar(i.id, 1, diaMais(9));

    const { validadeProxima } = await estoqueService.alertas();
    expect(validadeProxima).toHaveLength(1);
    expect(validadeProxima[0]).toMatchObject({ id: i.id, nome: i.nome, dias: 3 });
  });

  it('não avisa de compra que já foi usada', async () => {
    // Era o defeito: a compra de meses atrás, já gasta, seguia avisando.
    const i = await criarInsumo({ controlaValidade: true });
    await comprar(i.id, 5, diaMais(-60));
    await comprar(i.id, 5, diaMais(90));
    await usar(i.id, 5);

    expect((await estoqueService.alertas()).validadeProxima).toHaveLength(0);
  });

  it('avisa de vencido que ainda está na prateleira, por mais antigo que seja', async () => {
    // Se o estoque diz que tem, ou vai pro lixo ou a contagem está errada:
    // as duas coisas pedem que ela olhe.
    const i = await criarInsumo({ controlaValidade: true });
    await comprar(i.id, 5, diaMais(-180));

    const { validadeProxima } = await estoqueService.alertas();
    expect(validadeProxima.map((v) => v.dias)).toEqual([-180]);
  });

  it('não avisa o que vence depois de 15 dias', async () => {
    const i = await criarInsumo({ controlaValidade: true });
    await comprar(i.id, 5, diaMais(16));

    expect((await estoqueService.alertas()).validadeProxima).toHaveLength(0);
  });

  it('ingrediente desativado não avisa', async () => {
    const i = await criarInsumo({ controlaValidade: true });
    await comprar(i.id, 5, diaMais(2));
    await prisma.insumo.update({ where: { id: i.id }, data: { ativo: false } });

    expect((await estoqueService.alertas()).validadeProxima).toHaveLength(0);
  });
});
