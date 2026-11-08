import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { zerarLimites } from '../src/middlewares/limites.js';

/**
 * Link de acesso pela API de verdade: a administração gera, a pessoa abre
 * sem estar logada, escolhe e-mail e senha, e o link morre.
 */

const ADMIN = 'teste-admin@link.local';
const FUNC = 'teste-func-link';
const DALILA = 'teste-dalila@link.local';
const NOVO = 'dalila.nova@link.local';
const PELO_LINK = 'nova.pelo.link@link.local';
const CONTAS = [ADMIN, FUNC, DALILA, NOVO, PELO_LINK];
// Contas criadas para o link e ainda sem login escolhido.
const LIMPAR = { OR: [{ email: { in: CONTAS } }, { email: { startsWith: '_convite-' } }] };

let servidor;
let base;
let tokenAdmin;
let tokenFunc;
let admin;
let dalila;

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
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null };
}

const entrar = (email, senha) => chamar(null, 'POST', '/auth/login', { email, senha });

async function gerarLink(id = dalila.id, token = tokenAdmin) {
  const { status, corpo } = await chamar(token, 'POST', `/usuarios/${id}/link-acesso`);
  expect(status).toBe(201);
  return corpo.token;
}

const usar = (link, email = NOVO, senha = 'senha-da-dalila') =>
  chamar(null, 'POST', '/auth/link-acesso', { token: link, email, senha });

const conferir = (link) => chamar(null, 'POST', '/auth/link-acesso/conferir', { token: link });

beforeAll(async () => {
  servidor = app.listen(0);
  await new Promise((pronto) => servidor.once('listening', pronto));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

beforeEach(async () => {
  zerarLimites();
  await prisma.usuario.deleteMany({ where: LIMPAR });
  const senhaHash = await bcrypt.hash('senha-teste', 10);
  admin = await prisma.usuario.create({
    data: { nome: 'Admin Teste', email: ADMIN, senhaHash, papel: 'ADMIN' },
  });
  await prisma.usuario.create({
    data: { nome: 'Func Teste', email: FUNC, senhaHash, papel: 'OPERADOR' },
  });
  dalila = await prisma.usuario.create({
    data: { nome: 'Dalila', email: DALILA, senhaHash, papel: 'ADMIN' },
  });
  tokenAdmin = (await entrar(ADMIN, 'senha-teste')).corpo.token;
  tokenFunc = (await entrar(FUNC, 'senha-teste')).corpo.token;
});

afterAll(async () => {
  await prisma.usuario.deleteMany({ where: LIMPAR });
  await new Promise((fim) => servidor.close(fim));
  await prisma.$disconnect();
});

describe('gerar o link', () => {
  it('a administração gera, com validade de 3 dias', async () => {
    const { status, corpo } = await chamar(
      tokenAdmin,
      'POST',
      `/usuarios/${dalila.id}/link-acesso`
    );
    expect(status).toBe(201);
    expect(corpo.token).toEqual(expect.any(String));
    const dias = (new Date(corpo.expiraEm) - Date.now()) / 86400000;
    expect(dias).toBeGreaterThan(2.9);
    expect(dias).toBeLessThanOrEqual(3);
  });

  it('a funcionária não gera', async () => {
    const { status } = await chamar(tokenFunc, 'POST', `/usuarios/${dalila.id}/link-acesso`);
    expect(status).toBe(403);
  });

  it('ninguém gera para a própria conta (pularia a senha atual)', async () => {
    const { status } = await chamar(tokenAdmin, 'POST', `/usuarios/${admin.id}/link-acesso`);
    expect(status).toBe(422);
  });

  it('não gera para quem está sem acesso', async () => {
    await prisma.usuario.update({ where: { id: dalila.id }, data: { ativo: false } });
    const { status } = await chamar(tokenAdmin, 'POST', `/usuarios/${dalila.id}/link-acesso`);
    expect(status).toBe(422);
  });
});

describe('usar o link', () => {
  it('mostra nome e login atual, sem nada da senha', async () => {
    const { status, corpo } = await conferir(await gerarLink());
    expect(status).toBe(200);
    expect(corpo).toEqual({ nome: 'Dalila', email: DALILA });
  });

  it('grava e-mail e senha novos, já entra, e o login antigo deixa de valer', async () => {
    const { status, corpo } = await usar(await gerarLink());
    expect(status).toBe(200);
    expect(corpo.usuario).toMatchObject({ id: dalila.id, email: NOVO, papel: 'ADMIN' });
    expect(corpo.usuario.senhaHash).toBeUndefined();

    const eu = await chamar(corpo.token, 'GET', '/auth/eu');
    expect(eu.status).toBe(200);
    expect(eu.corpo.email).toBe(NOVO);

    expect((await entrar(NOVO, 'senha-da-dalila')).status).toBe(200);
    expect((await entrar(DALILA, 'senha-teste')).status).toBe(401);
    expect((await entrar(NOVO, 'senha-teste')).status).toBe(401);
  });

  it('pode manter o mesmo e-mail e só escolher a senha', async () => {
    const { status } = await usar(await gerarLink(), DALILA);
    expect(status).toBe(200);
    expect((await entrar(DALILA, 'senha-da-dalila')).status).toBe(200);
  });

  it('serve uma vez só', async () => {
    const link = await gerarLink();
    expect((await usar(link)).status).toBe(200);
    expect((await usar(link, 'outro@link.local', 'outra-senha')).status).toBe(410);
    expect((await conferir(link)).status).toBe(410);
  });

  it('dois usos ao mesmo tempo: só um passa', async () => {
    const link = await gerarLink();
    const respostas = await Promise.all([usar(link), usar(link, NOVO, 'outra-senha-x')]);
    expect(respostas.map((r) => r.status).sort()).toEqual([200, 410]);
  });

  it('uma senha nova criada pela Equipe anula o link solto', async () => {
    const link = await gerarLink();
    await chamar(tokenAdmin, 'PATCH', `/usuarios/${dalila.id}/senha`, { senha: 'outra-senha' });
    expect((await usar(link)).status).toBe(410);
  });

  it('não vale para quem perdeu o acesso depois', async () => {
    const link = await gerarLink();
    await chamar(tokenAdmin, 'PATCH', `/usuarios/${dalila.id}`, { ativo: false });
    expect((await usar(link)).status).toBe(410);
  });

  it('e-mail de outra pessoa é recusado, e o link continua valendo', async () => {
    const link = await gerarLink();
    const { status } = await usar(link, ADMIN);
    expect(status).toBe(409);
    expect((await conferir(link)).status).toBe(200);
  });

  it('senha curta é recusada', async () => {
    expect((await usar(await gerarLink(), NOVO, 'curta')).status).toBe(422);
  });

  it('link vencido, adulterado ou assinado com outro segredo é recusado', async () => {
    const segredo = `${process.env.JWT_SECRET}:link-de-acesso`;
    const h = jwt.decode(await gerarLink()).h;
    const vencido = jwt.sign(
      { sub: dalila.id, h, exp: Math.floor(Date.now() / 1000) - 60 },
      segredo
    );
    expect((await conferir(vencido)).status).toBe(410);

    const link = await gerarLink();
    expect((await conferir(`${link.slice(0, -2)}xx`)).status).toBe(410);

    const forjado = jwt.sign({ sub: dalila.id, h }, 'segredo-qualquer');
    expect((await conferir(forjado)).status).toBe(410);
  });
});

describe('conta nova pelo link', () => {
  const criar = (corpo) => chamar(tokenAdmin, 'POST', '/usuarios', corpo);

  it('só com nome e acesso: ela escolhe e-mail e senha pelo link e entra', async () => {
    const { status, corpo: nova } = await criar({ nome: 'Dalila Nova', papel: 'ADMIN' });
    expect(status).toBe(201);
    expect(nova.email).toMatch(/^_convite-[0-9a-f]{8}$/);

    const link = await gerarLink(nova.id);
    // O login provisório não aparece para ela: o campo vem em branco.
    expect((await conferir(link)).corpo).toEqual({ nome: 'Dalila Nova', email: '' });

    const { status: usado, corpo } = await usar(link, PELO_LINK, 'senha-dela-123');
    expect(usado).toBe(200);
    expect(corpo.usuario).toMatchObject({ email: PELO_LINK, papel: 'ADMIN' });
    expect((await entrar(PELO_LINK, 'senha-dela-123')).status).toBe(200);
  });

  it('antes do link, ninguém entra na conta', async () => {
    const { corpo: nova } = await criar({ nome: 'Sem Senha' });
    expect((await entrar(nova.email, '')).status).toBe(422);
    expect((await entrar(nova.email, 'qualquer-senha')).status).toBe(401);
  });

  it('não dá para ficar com o login provisório', async () => {
    const { corpo: nova } = await criar({ nome: 'Sem Senha' });
    const link = await gerarLink(nova.id);
    expect((await usar(link, nova.email)).status).toBe(422);
    expect((await conferir(link)).status).toBe(200);
  });

  it('com senha, o login continua obrigatório', async () => {
    expect((await criar({ nome: 'Com Senha', senha: 'provisoria1' })).status).toBe(422);
  });

  it('pode já vir com o login, e ela só escolhe a senha', async () => {
    const { corpo: nova } = await criar({ nome: 'Com Login', email: PELO_LINK });
    expect(nova.email).toBe(PELO_LINK);
    expect((await conferir(await gerarLink(nova.id))).corpo.email).toBe(PELO_LINK);
  });
});

describe('link e sessão não se confundem', () => {
  it('o link não serve como sessão', async () => {
    const link = await gerarLink();
    expect((await chamar(link, 'GET', '/auth/eu')).status).toBe(401);
  });

  it('a sessão não serve como link', async () => {
    expect((await conferir(tokenAdmin)).status).toBe(410);
  });
});
