import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { insumoService, produtoService } from '../src/services/cadastroService.js';
import {
  despesaUpdateSchema,
  insumoUpdateSchema,
  produtoUpdateSchema,
} from '../src/controllers/schemas.js';
import { limparTudo, criarInsumo, criarProduto } from './apoio.js';

/**
 * Editar muda o que veio, e SÓ o que veio.
 *
 * O defeito que isto protege: no Zod 4 os valores padrão do cadastro
 * entravam também na edição. Mudar o nome de um ingrediente zerava o
 * custo médio dele — e com ele o custo de todo lote e de toda receita
 * que o usa —, sem aviso nenhum.
 */
beforeEach(limparTudo);
afterAll(() => prisma.$disconnect());

/** O caminho da rota: valida o corpo e manda para o serviço. */
const editarInsumo = (id, corpo) => insumoService.atualizar(id, insumoUpdateSchema.parse(corpo));
const editarProduto = (id, corpo) => produtoService.atualizar(id, produtoUpdateSchema.parse(corpo));

describe('editar ingrediente', () => {
  it('não zera o custo médio', async () => {
    const i = await criarInsumo({ custoUnitario: 7.5, estoqueMinimo: 6, controlaValidade: true });
    await editarInsumo(i.id, { nome: 'Leite condensado Moça' });

    const depois = await prisma.insumo.findUnique({ where: { id: i.id } });
    expect(Number(depois.custoUnitario)).toBe(7.5);
    expect(Number(depois.estoqueMinimo)).toBe(6);
    expect(depois.controlaValidade).toBe(true);
    expect(depois.nome).toBe('Leite condensado Moça');
  });

  it('muda o que veio, mesmo quando é zero ou falso', async () => {
    const i = await criarInsumo({ estoqueMinimo: 6, controlaValidade: true });
    await editarInsumo(i.id, { estoqueMinimo: 0, controlaValidade: false });

    const depois = await prisma.insumo.findUnique({ where: { id: i.id } });
    expect(Number(depois.estoqueMinimo)).toBe(0);
    expect(depois.controlaValidade).toBe(false);
  });
});

describe('editar doce', () => {
  it('não troca a unidade de quem vende por quilo', async () => {
    const p = await criarProduto({ unidade: 'KG', estoqueMinimo: 2 });
    await editarProduto(p.id, { precoVenda: 60 });

    const depois = await prisma.produto.findUnique({ where: { id: p.id } });
    expect(depois.unidade).toBe('KG');
    expect(Number(depois.estoqueMinimo)).toBe(2);
    expect(Number(depois.precoVenda)).toBe(60);
  });
});

describe('editar despesa', () => {
  it('não desliga o "recorrente" que não veio', () => {
    expect(despesaUpdateSchema.parse({ valor: 30 })).toEqual({ valor: 30 });
  });

  it('continua validando o que veio', () => {
    expect(() => insumoUpdateSchema.parse({ nome: 'x' })).toThrow();
    expect(() => produtoUpdateSchema.parse({ precoVenda: 0 })).toThrow();
  });
});
