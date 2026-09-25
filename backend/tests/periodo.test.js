import { describe, it, expect } from 'vitest';
import {
  colunaDoDia,
  diaDaColuna,
  diaDoCliente,
  filtrosPeriodo,
  limiteDaListagem,
} from '../src/utils/periodo.js';

/**
 * O servidor roda em UTC (o da Vercel e o local), e a cliente vive em
 * Brasília. Um filtro "dia 25" lido em UTC ia das 21h do dia 24 às 20h59
 * do dia 25 — e a venda das 21h30, a hora em que ela fecha o caixa, caía
 * no dia seguinte.
 */
describe('filtrosPeriodo', () => {
  it('lê uma data sem hora como o dia inteiro no horário de Brasília', () => {
    const { inicio, fim } = filtrosPeriodo({ inicio: '2026-09-25', fim: '2026-09-25' });
    expect(inicio.toISOString()).toBe('2026-09-25T03:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-09-26T02:59:59.999Z');
  });

  it('põe a venda das 21h30 no dia em que ela aconteceu', () => {
    const { inicio, fim } = filtrosPeriodo({ inicio: '2026-09-25', fim: '2026-09-25' });
    const venda = new Date('2026-09-25T21:30:00-03:00');
    const vendaDaVespera = new Date('2026-09-24T21:30:00-03:00');
    expect(venda >= inicio && venda <= fim).toBe(true);
    expect(vendaDaVespera >= inicio && vendaDaVespera <= fim).toBe(false);
  });

  it('respeita um instante completo, que já diz o próprio fuso', () => {
    const { inicio } = filtrosPeriodo({ inicio: '2026-09-25T10:00:00.000Z' });
    expect(inicio.toISOString()).toBe('2026-09-25T10:00:00.000Z');
  });

  it('sem datas, não filtra', () => {
    expect(filtrosPeriodo({})).toEqual({ inicio: undefined, fim: undefined });
  });
});

/**
 * O teto da listagem. O padrão de 200 cortava "Este mês" sem aviso numa
 * confeitaria com dez vendas por dia, e o total do mês saía errado. A tela
 * pede mais — mas o pedido tem teto, ou uma URL com limite=1e9 trazia o
 * banco inteiro de uma vez.
 */
describe('limiteDaListagem', () => {
  it('sem pedido, usa o padrão', () => {
    expect(limiteDaListagem({})).toBe(200);
  });

  it('atende um pedido dentro do teto', () => {
    expect(limiteDaListagem({ limite: '1000' })).toBe(1000);
  });

  it('corta o pedido acima do teto', () => {
    expect(limiteDaListagem({ limite: '1000000000' })).toBe(1000);
  });

  it('ignora zero, negativo, fração e texto', () => {
    for (const limite of ['0', '-5', '2.5', 'tudo', '']) {
      expect(limiteDaListagem({ limite })).toBe(200);
    }
  });
});

describe('diaDoCliente', () => {
  it('às 21h30 de Brasília ainda é o mesmo dia, mesmo com o UTC no seguinte', () => {
    expect(diaDoCliente(new Date('2026-09-25T21:30:00-03:00'))).toBe('2026-09-25');
  });

  it('à meia-noite de Brasília já é o dia seguinte', () => {
    expect(diaDoCliente(new Date('2026-09-26T00:00:00-03:00'))).toBe('2026-09-26');
    expect(diaDoCliente(new Date('2026-09-25T23:59:59.999-03:00'))).toBe('2026-09-25');
  });

  it('uma data sem hora já é um dia e passa como veio', () => {
    expect(diaDoCliente('2026-09-25')).toBe('2026-09-25');
  });

  it('o que não é data vira null, para a rota responder 400', () => {
    expect(diaDoCliente('ontem')).toBeNull();
  });
});

describe('coluna de dia', () => {
  it('ida e volta sem perder nem ganhar um dia', () => {
    expect(colunaDoDia('2026-09-25').toISOString()).toBe('2026-09-25T00:00:00.000Z');
    expect(diaDaColuna(colunaDoDia('2026-09-25'))).toBe('2026-09-25');
  });
});
