import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { semCustos } from '../src/middlewares/ocultarCustos.js';
import { zerarLimites } from '../src/middlewares/limites.js';
import { limparTudo, criarInsumo, criarProduto } from './apoio.js';

/**
 * Papéis testados pela API de verdade — rota, middleware e controller
 * juntos —, com login das duas contas. Testar só o serviço deixaria de
 * fora justamente o que decide o acesso: a trava na rota.
 */

const ADMIN = 'teste-admin@permissoes.local';
const FUNC = 'teste-func';
const NOVA = 'teste-nova';
const CONTAS = [ADMIN, FUNC, NOVA];

let servidor;
let base;
let tokenAdmin;
let tokenFunc;
let func;

async function chamar(token, metodo, caminho, corpo) {
  const resposta = await fetch(`${base}/api${caminho}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null, texto };
}

async function entrar(email, senha) {
  const { status, corpo } = await chamar(null, 'POST', '/auth/login', { email, senha });
  expect(status).toBe(200);
  return corpo.token;
}

const ONTEM = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

beforeAll(async () => {
  servidor = app.listen(0);
  await new Promise((pronto) => servidor.once('listening', pronto));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

beforeEach(async () => {
  // O teto de requisições conta por aparelho, e aqui tudo sai do mesmo.
  zerarLimites();
  await limparTudo();
  await prisma.usuario.deleteMany({ where: { email: { in: CONTAS } } });
  const senhaHash = await bcrypt.hash('senha-teste', 10);
  await prisma.usuario.create({
    data: { nome: 'Dalila Teste', email: ADMIN, senhaHash, papel: 'ADMIN' },
  });
  func = await prisma.usuario.create({
    data: { nome: 'Func Teste', email: FUNC, senhaHash, papel: 'OPERADOR' },
  });
  tokenAdmin = await entrar(ADMIN, 'senha-teste');
  tokenFunc = await entrar(FUNC, 'senha-teste');
});

afterAll(async () => {
  await limparTudo();
  await prisma.usuario.deleteMany({ where: { email: { in: CONTAS } } });
  await new Promise((fim) => servidor.close(fim));
  await prisma.$disconnect();
});

describe('o dinheiro do negócio é só da administração', () => {
  const FECHADAS = [
    ['GET', '/dashboard'],
    ['GET', '/dashboard/por-dia'],
    ['GET', '/dashboard/ultimos'],
    ['GET', '/fechamentos'],
    ['GET', '/fechamentos/previa'],
    ['POST', '/fechamentos', { saldoInicial: 0, saldoConferido: 0 }],
    ['GET', '/usuarios'],
    ['POST', '/estoque/recalcular'],
  ];

  it.each(FECHADAS)('funcionária recebe 403 em %s %s', async (metodo, caminho, corpo) => {
    const { status } = await chamar(tokenFunc, metodo, caminho, corpo);
    expect(status).toBe(403);
  });

  it('a administração continua passando nas mesmas rotas de leitura', async () => {
    for (const caminho of ['/dashboard', '/dashboard/ultimos', '/fechamentos', '/usuarios']) {
      expect((await chamar(tokenAdmin, 'GET', caminho)).status).toBe(200);
    }
  });

  it('cadastro do doce (preço e receita) é da administração', async () => {
    const doce = await criarProduto();
    const insumo = await criarInsumo();
    const tentativas = [
      ['POST', '/produtos', { nome: 'Bolo', precoVenda: 30 }],
      ['PUT', `/produtos/${doce.id}`, { precoVenda: 1 }],
      ['DELETE', `/produtos/${doce.id}`],
      ['PUT', `/produtos/${doce.id}/ficha-tecnica`, { rendimentoReceita: 10, itens: [] }],
      ['DELETE', `/insumos/${insumo.id}`],
    ];
    for (const [metodo, caminho, corpo] of tentativas) {
      expect((await chamar(tokenFunc, metodo, caminho, corpo)).status).toBe(403);
    }
    expect(Number((await prisma.produto.findUnique({ where: { id: doce.id } })).precoVenda)).toBe(
      10
    );
  });
});

describe('no balcão, a funcionária lança', () => {
  it('venda com doce, entrada avulsa e saída', async () => {
    const doce = await criarProduto({ quantidadeAtual: 10 });
    const venda = await chamar(tokenFunc, 'POST', '/vendas', {
      itens: [{ produtoId: doce.id, quantidade: 2 }],
      formaPagamento: 'PIX',
    });
    const entrada = await chamar(tokenFunc, 'POST', '/vendas', {
      valor: 15,
      formaPagamento: 'DINHEIRO',
    });
    const saida = await chamar(tokenFunc, 'POST', '/despesas', {
      descricao: 'Entregador',
      valor: 12,
      retirada: false,
    });

    expect([venda.status, entrada.status, saida.status]).toEqual([201, 201, 201]);
    expect(venda.corpo.usuarioId).toBe(func.id);
  });

  it('mas não retirada pessoal', async () => {
    const { status } = await chamar(tokenFunc, 'POST', '/despesas', {
      descricao: 'Pra mim',
      valor: 50,
      retirada: true,
    });
    expect(status).toBe(403);
    expect(await prisma.despesa.count()).toBe(0);
  });

  it('a data que ela manda é ignorada: o lançamento é de agora', async () => {
    const { corpo } = await chamar(tokenFunc, 'POST', '/vendas', {
      valor: 20,
      formaPagamento: 'DINHEIRO',
      data: ONTEM().toISOString(),
    });
    expect(Math.abs(new Date(corpo.data) - Date.now())).toBeLessThan(60_000);
  });
});

describe('o caixa que a funcionária vê', () => {
  it('só os lançamentos dela, e só os de hoje', async () => {
    const admin = await prisma.usuario.findUnique({ where: { email: ADMIN } });
    await prisma.venda.createMany({
      data: [
        { subtotal: 10, total: 10, formaPagamento: 'PIX', usuarioId: func.id },
        { subtotal: 20, total: 20, formaPagamento: 'PIX', usuarioId: func.id, data: ONTEM() },
        { subtotal: 30, total: 30, formaPagamento: 'PIX', usuarioId: admin.id },
      ],
    });
    await chamar(tokenFunc, 'POST', '/despesas', { descricao: 'Gás', valor: 5 });
    await chamar(tokenAdmin, 'POST', '/despesas', { descricao: 'Aluguel', valor: 900 });

    // Pedir o período inteiro não abre nada: o recorte é imposto.
    const vendas = await chamar(tokenFunc, 'GET', '/vendas?inicio=2000-01-01&fim=2100-01-01');
    const despesas = await chamar(tokenFunc, 'GET', '/despesas?inicio=2000-01-01');

    expect(vendas.corpo.map((v) => Number(v.total))).toEqual([10]);
    expect(despesas.corpo.map((d) => d.descricao)).toEqual(['Gás']);

    const tudo = await chamar(tokenAdmin, 'GET', '/vendas?inicio=2000-01-01');
    expect(tudo.corpo).toHaveLength(3);
  });
});

describe('ela corrige o que lançou hoje, e só isso', () => {
  it('edita e cancela a própria venda de hoje', async () => {
    const { corpo: venda } = await chamar(tokenFunc, 'POST', '/vendas', {
      valor: 10,
      formaPagamento: 'DINHEIRO',
    });
    const editada = await chamar(tokenFunc, 'PUT', `/vendas/${venda.id}`, {
      valor: 12,
      formaPagamento: 'PIX',
    });
    const cancelada = await chamar(tokenFunc, 'PATCH', `/vendas/${venda.id}/cancelar`);
    const reaberta = await chamar(tokenFunc, 'PATCH', `/vendas/${venda.id}/reabrir`);

    expect([editada.status, cancelada.status, reaberta.status]).toEqual([200, 200, 200]);
    expect(Number(editada.corpo.total)).toBe(12);
  });

  it('não mexe na venda da Dalila', async () => {
    const { corpo: venda } = await chamar(tokenAdmin, 'POST', '/vendas', {
      valor: 10,
      formaPagamento: 'DINHEIRO',
    });
    const tentativas = [
      ['GET', `/vendas/${venda.id}`],
      ['PUT', `/vendas/${venda.id}`, { valor: 1, formaPagamento: 'PIX' }],
      ['PATCH', `/vendas/${venda.id}/cancelar`],
    ];
    for (const [metodo, caminho, corpo] of tentativas) {
      expect((await chamar(tokenFunc, metodo, caminho, corpo)).status).toBe(403);
    }
    const depois = await prisma.venda.findUnique({ where: { id: venda.id } });
    expect([Number(depois.total), depois.cancelada]).toEqual([10, false]);
  });

  it('não mexe no que ela mesma lançou ontem', async () => {
    const venda = await prisma.venda.create({
      data: { subtotal: 10, total: 10, formaPagamento: 'PIX', usuarioId: func.id, data: ONTEM() },
    });
    const { status, corpo } = await chamar(tokenFunc, 'PATCH', `/vendas/${venda.id}/cancelar`);
    expect(status).toBe(403);
    expect(corpo.erro).toMatch(/outros dias/i);
  });

  it('saída: edita e apaga a própria de hoje, não a da Dalila', async () => {
    const { corpo: dela } = await chamar(tokenFunc, 'POST', '/despesas', {
      descricao: 'Gás',
      valor: 5,
    });
    const { corpo: daDalila } = await chamar(tokenAdmin, 'POST', '/despesas', {
      descricao: 'Aluguel',
      valor: 900,
    });

    expect((await chamar(tokenFunc, 'PUT', `/despesas/${dela.id}`, { valor: 6 })).status).toBe(200);
    // Virar retirada pela edição é o mesmo que lançar retirada.
    expect(
      (await chamar(tokenFunc, 'PUT', `/despesas/${dela.id}`, { retirada: true })).status
    ).toBe(403);
    expect((await chamar(tokenFunc, 'DELETE', `/despesas/${daDalila.id}`)).status).toBe(403);
    expect((await chamar(tokenFunc, 'DELETE', `/despesas/${dela.id}`)).status).toBe(204);
  });

  it('lote de produção: desfaz o próprio de hoje, não o da Dalila', async () => {
    const doce = await criarProduto();
    const { corpo: meu } = await chamar(tokenFunc, 'POST', '/producoes', {
      produtoId: doce.id,
      quantidade: 10,
    });
    const { corpo: daDalila } = await chamar(tokenAdmin, 'POST', '/producoes', {
      produtoId: doce.id,
      quantidade: 10,
    });

    expect((await chamar(tokenFunc, 'DELETE', `/producoes/${daDalila.id}`)).status).toBe(403);
    expect((await chamar(tokenFunc, 'DELETE', `/producoes/${meu.id}`)).status).toBe(204);
  });
});

describe('custo não chega para a funcionária', () => {
  it('nem no ingrediente, nem na receita, nem no lote, nem no Kardex', async () => {
    const insumo = await criarInsumo({ custoUnitario: 12.5, quantidadeAtual: 100 });
    const doce = await criarProduto({ rendimentoReceita: 10 });
    await prisma.fichaTecnicaItem.create({
      data: { produtoId: doce.id, insumoId: insumo.id, quantidade: 1 },
    });
    await chamar(tokenFunc, 'POST', '/producoes', { produtoId: doce.id, quantidade: 10 });
    await chamar(tokenFunc, 'POST', '/estoque/movimentacoes', {
      tipo: 'ENTRADA_COMPRA',
      insumoId: insumo.id,
      quantidade: 2,
      custoUnitario: 14,
    });

    for (const caminho of [
      '/insumos',
      `/insumos/${insumo.id}`,
      `/produtos/${doce.id}`,
      '/producoes',
      `/producoes/previsao?produtoId=${doce.id}&quantidade=10`,
      '/estoque/movimentacoes',
      '/estoque/alertas',
    ]) {
      const func = await chamar(tokenFunc, 'GET', caminho);
      expect(func.status, caminho).toBe(200);
      expect(func.texto, caminho).not.toMatch(/custoUnitario|custoEstimado/);
    }

    // A administração continua vendo — o corte é por papel, não por rota.
    const { corpo } = await chamar(tokenAdmin, 'GET', `/insumos/${insumo.id}`);
    expect(Number(corpo.custoUnitario)).toBeGreaterThan(0);
  });

  it('o valor pago em "Comprei" ainda entra no custo médio', async () => {
    const insumo = await criarInsumo();
    await chamar(tokenFunc, 'POST', '/estoque/movimentacoes', {
      tipo: 'ENTRADA_COMPRA',
      insumoId: insumo.id,
      quantidade: 2,
      custoUnitario: 14,
    });
    const depois = await prisma.insumo.findUnique({ where: { id: insumo.id } });
    expect(Number(depois.custoUnitario)).toBe(14);
  });

  it('e ela não escreve custo à mão no cadastro do ingrediente', async () => {
    const insumo = await criarInsumo({ custoUnitario: 8 });
    const { status } = await chamar(tokenFunc, 'PUT', `/insumos/${insumo.id}`, {
      nome: 'Leite condensado',
      custoUnitario: 0.01,
    });
    const depois = await prisma.insumo.findUnique({ where: { id: insumo.id } });
    expect(status).toBe(200);
    expect([depois.nome, Number(depois.custoUnitario)]).toEqual(['Leite condensado', 8]);
  });

  it('o filtro deixa data e decimal intactos', () => {
    const quando = new Date('2026-09-28T12:00:00Z');
    const valor = new Prisma.Decimal('3.50');
    const saida = semCustos([
      { data: quando, preco: valor, custoUnitario: 1, itens: [{ custoEstimado: 2 }] },
    ]);
    expect(saida).toEqual([{ data: quando, preco: valor, itens: [{}] }]);
  });
});

describe('equipe', () => {
  it('a Dalila cria uma conta com usuário simples, e ela entra', async () => {
    const { status, corpo } = await chamar(tokenAdmin, 'POST', '/usuarios', {
      nome: 'Nova Funcionária',
      email: 'Teste-Nova',
      senha: 'provisoria1',
    });
    expect(status).toBe(201);
    expect(corpo).toMatchObject({ email: NOVA, papel: 'OPERADOR', ativo: true });
    expect(corpo).not.toHaveProperty('senhaHash');
    await entrar(NOVA, 'provisoria1');
  });

  it('recusa login repetido e login com espaço', async () => {
    const repetido = await chamar(tokenAdmin, 'POST', '/usuarios', {
      nome: 'Outra',
      email: FUNC,
      senha: 'provisoria1',
    });
    const comEspaco = await chamar(tokenAdmin, 'POST', '/usuarios', {
      nome: 'Outra',
      email: 'maria silva',
      senha: 'provisoria1',
    });
    expect([repetido.status, comEspaco.status]).toEqual([409, 422]);
  });

  it('desativar vale na hora, mesmo com a sessão já aberta', async () => {
    expect((await chamar(tokenFunc, 'GET', '/insumos')).status).toBe(200);

    await chamar(tokenAdmin, 'PATCH', `/usuarios/${func.id}`, { ativo: false });
    const barrada = await chamar(tokenFunc, 'GET', '/insumos');
    expect(barrada.status).toBe(401);
    expect(barrada.corpo.erro).toMatch(/desativado/i);
    expect(
      (await chamar(null, 'POST', '/auth/login', { email: FUNC, senha: 'senha-teste' })).status
    ).toBe(401);

    await chamar(tokenAdmin, 'PATCH', `/usuarios/${func.id}`, { ativo: true });
    expect((await chamar(tokenFunc, 'GET', '/insumos')).status).toBe(200);
  });

  it('mudar o papel também vale na hora', async () => {
    expect((await chamar(tokenFunc, 'GET', '/dashboard')).status).toBe(403);
    await chamar(tokenAdmin, 'PATCH', `/usuarios/${func.id}`, { papel: 'ADMIN' });
    expect((await chamar(tokenFunc, 'GET', '/dashboard')).status).toBe(200);
  });

  it('a Dalila não tira o próprio acesso nem troca a própria senha por aqui', async () => {
    const eu = await prisma.usuario.findUnique({ where: { email: ADMIN } });
    const desativar = await chamar(tokenAdmin, 'PATCH', `/usuarios/${eu.id}`, { ativo: false });
    const rebaixar = await chamar(tokenAdmin, 'PATCH', `/usuarios/${eu.id}`, { papel: 'OPERADOR' });
    const senha = await chamar(tokenAdmin, 'PATCH', `/usuarios/${eu.id}/senha`, {
      senha: 'outra-senha',
    });
    expect([desativar.status, rebaixar.status, senha.status]).toEqual([422, 422, 422]);
    expect((await prisma.usuario.findUnique({ where: { id: eu.id } })).papel).toBe('ADMIN');
  });

  it('redefine a senha de quem esqueceu', async () => {
    const { status } = await chamar(tokenAdmin, 'PATCH', `/usuarios/${func.id}/senha`, {
      senha: 'nova-senha-1',
    });
    expect(status).toBe(200);
    await entrar(FUNC, 'nova-senha-1');
  });
});
