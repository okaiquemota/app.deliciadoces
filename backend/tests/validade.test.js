import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { estoqueService } from '../src/services/estoqueService.js';
import { limparTudo, criarInsumo } from './apoio.js';

/**
 * Validade.
 *
 * A cliente joga fora ingrediente vencido e perde dinheiro por não ter
 * visto a tempo. O que a tela precisa acertar é a fronteira: o que já
 * venceu (joga fora) e o que está para vencer (usa primeiro) exigem ações
 * opostas, e confundir os dois é pior que não avisar.
 */
beforeEach(limparTudo);
afterAll(() => prisma.$disconnect());

const DIA = 24 * 60 * 60 * 1000;
const emDias = (n) => new Date(Date.now() + n * DIA);

async function lote(insumoId, validade, quantidade = 5) {
  return prisma.$transaction((tx) =>
    estoqueService.movimentar(tx, {
      tipo: 'ENTRADA_COMPRA',
      insumoId,
      quantidade,
      validade,
      custoUnitario: 10,
    })
  );
}

describe('listagem de lotes', () => {
  it('lista por lote, não por ingrediente: a mesma compra tem datas diferentes', async () => {
    // Agrupar por ingrediente esconderia qual caixa usar primeiro.
    const i = await criarInsumo({ nome: 'Creme de leite', controlaValidade: true });
    await lote(i.id, emDias(3));
    await lote(i.id, emDias(40));

    const lista = await estoqueService.validades({});
    expect(lista).toHaveLength(2);
    expect(lista.every((l) => l.insumo.nome === 'Creme de leite')).toBe(true);
  });

  it('ordena do que vence primeiro para o que vence depois', async () => {
    const i = await criarInsumo({ controlaValidade: true });
    await lote(i.id, emDias(30));
    await lote(i.id, emDias(2));
    await lote(i.id, emDias(10));

    const dias = (await estoqueService.validades({})).map((l) => l.dias);
    expect(dias).toEqual([...dias].sort((a, b) => a - b));
  });

  it('ignora entrada sem validade preenchida', async () => {
    const i = await criarInsumo();
    await lote(i.id, null);
    expect(await estoqueService.validades({})).toHaveLength(0);
  });

  it('não lista saída, só entrada de compra', async () => {
    // Só a compra carrega validade; uma perda não é um lote.
    const i = await criarInsumo({ controlaValidade: true });
    await lote(i.id, emDias(5));
    await prisma.$transaction((tx) =>
      estoqueService.movimentar(tx, {
        tipo: 'PERDA',
        insumoId: i.id,
        quantidade: 1,
        motivo: 'caiu',
      })
    );
    expect(await estoqueService.validades({})).toHaveLength(1);
  });
});

describe('vencido x vencendo', () => {
  it('marca como vencido o que passou da data', async () => {
    const i = await criarInsumo({ controlaValidade: true });
    await lote(i.id, emDias(-5));

    const [l] = await estoqueService.validades({});
    expect(l.vencido).toBe(true);
    expect(l.dias).toBe(-5);
  });

  it('NÃO marca como vencido o que vence hoje', async () => {
    // Fronteira: o que vence hoje ainda dá para usar hoje.
    const i = await criarInsumo({ controlaValidade: true });
    await lote(i.id, new Date());

    const [l] = await estoqueService.validades({});
    expect(l.vencido).toBe(false);
    expect(l.dias).toBe(0);
  });

  it('conta os dias em data cheia, não em horas', async () => {
    // Senão um lote que vence hoje às 23h apareceria como "0 dias" de
    // manhã e "vencido" à tarde, mudando de cor sozinho no meio do dia.
    const i = await criarInsumo({ controlaValidade: true });
    const hojeTarde = new Date();
    hojeTarde.setHours(23, 30, 0, 0);
    await lote(i.id, hojeTarde);

    const [l] = await estoqueService.validades({});
    expect(l.dias).toBe(0);
    expect(l.vencido).toBe(false);
  });
});

describe('filtros', () => {
  it('"vencidos" traz só o que já passou', async () => {
    const i = await criarInsumo({ controlaValidade: true });
    await lote(i.id, emDias(-10));
    await lote(i.id, emDias(5));

    const lista = await estoqueService.validades({ situacao: 'vencidos' });
    expect(lista).toHaveLength(1);
    expect(lista[0].vencido).toBe(true);
  });

  it('"7 dias" traz o que vence na semana e não o que já venceu', async () => {
    const i = await criarInsumo({ controlaValidade: true });
    await lote(i.id, emDias(-2));
    await lote(i.id, emDias(3));
    await lote(i.id, emDias(20));

    const lista = await estoqueService.validades({ situacao: '7' });
    expect(lista).toHaveLength(1);
    expect(lista[0].dias).toBe(3);
  });

  it('"30 dias" alcança mais longe que "7 dias"', async () => {
    const i = await criarInsumo({ controlaValidade: true });
    await lote(i.id, emDias(20));

    expect(await estoqueService.validades({ situacao: '7' })).toHaveLength(0);
    expect(await estoqueService.validades({ situacao: '30' })).toHaveLength(1);
  });

  it('intervalo digitado manda sobre o atalho', async () => {
    const i = await criarInsumo({ controlaValidade: true });
    await lote(i.id, emDias(-10));

    const lista = await estoqueService.validades({
      situacao: '7',
      inicio: emDias(-20),
      fim: emDias(-1),
    });
    expect(lista).toHaveLength(1);
  });
});

describe('alerta do painel', () => {
  it('não deixa lote vencido há meses entupir a lista', async () => {
    // Era o defeito: sem limite inferior, lote de seis meses atrás casava
    // com "vence em breve" para sempre e, ordenado por validade, vinha
    // primeiro — empurrando para fora o que vencia amanhã.
    const i = await criarInsumo({ controlaValidade: true });
    await lote(i.id, emDias(-180));
    await lote(i.id, emDias(3));

    const { validadeProxima } = await estoqueService.alertas();
    expect(validadeProxima).toHaveLength(1);
    expect(new Date(validadeProxima[0].validade) > new Date()).toBe(true);
  });

  it('ainda avisa de vencido recente, que pode estar na prateleira', async () => {
    const i = await criarInsumo({ controlaValidade: true });
    await lote(i.id, emDias(-3));

    expect((await estoqueService.alertas()).validadeProxima).toHaveLength(1);
  });
});
