import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { zerarLimites } from '../src/middlewares/limites.js';

/**
 * As travas da revisão de segurança, pela API de verdade: limite de
 * tentativas no login, teto de requisições, cabeçalhos, URL malformada
 * (400 em vez de 500), algoritmo do token e senha mínima.
 */

const CONTA = 'teste-seguranca@limites.local';
const OUTRA = 'teste-seguranca-2@limites.local';
const SENHA = 'senha-certa-123';

let servidor;
let base;

async function chamar(metodo, caminho, { corpo, token } = {}) {
  const resposta = await fetch(`${base}/api${caminho}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return {
    status: resposta.status,
    corpo: texto ? JSON.parse(texto) : null,
    cabecalhos: resposta.headers,
  };
}

const entrar = (email, senha) => chamar('POST', '/auth/login', { corpo: { email, senha } });

beforeAll(async () => {
  servidor = app.listen(0);
  await new Promise((pronto) => servidor.once('listening', pronto));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

beforeEach(async () => {
  zerarLimites();
  await prisma.usuario.deleteMany({ where: { email: { in: [CONTA, OUTRA] } } });
  const senhaHash = await bcrypt.hash(SENHA, 10);
  await prisma.usuario.createMany({
    data: [
      { nome: 'Conta Teste', email: CONTA, senhaHash, papel: 'ADMIN' },
      { nome: 'Outra Teste', email: OUTRA, senhaHash, papel: 'OPERADOR' },
    ],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.usuario.deleteMany({ where: { email: { in: [CONTA, OUTRA] } } });
  await new Promise((fim) => servidor.close(fim));
  await prisma.$disconnect();
});

describe('tentativas de login', () => {
  it('a sexta tentativa seguida é barrada, mesmo com a senha certa', async () => {
    for (let i = 0; i < 5; i++) expect((await entrar(CONTA, `errada-${i}`)).status).toBe(401);

    const barrada = await entrar(CONTA, SENHA);
    expect(barrada.status).toBe(429);
    expect(barrada.corpo.erro).toMatch(/tentativas/i);
    expect(Number(barrada.cabecalhos.get('retry-after'))).toBeGreaterThan(0);
  });

  it('acertar zera a contagem', async () => {
    for (let i = 0; i < 4; i++) await entrar(CONTA, `errada-${i}`);
    expect((await entrar(CONTA, SENHA)).status).toBe(200);
    for (let i = 0; i < 4; i++) await entrar(CONTA, `errada-${i}`);
    expect((await entrar(CONTA, SENHA)).status).toBe(200);
  });

  it('travar um login não tranca outro login no mesmo aparelho', async () => {
    for (let i = 0; i < 5; i++) await entrar(CONTA, `errada-${i}`);
    expect((await entrar(OUTRA, SENHA)).status).toBe(200);
  });

  it('o aparelho que erra em muitos logins diferentes também é barrado', async () => {
    for (let i = 0; i < 20; i++) await entrar(`robo-${i}`, 'chute');
    expect((await entrar(OUTRA, SENHA)).status).toBe(429);
  });

  it('passados 15 minutos, libera', async () => {
    for (let i = 0; i < 5; i++) await entrar(CONTA, `errada-${i}`);
    expect((await entrar(CONTA, SENHA)).status).toBe(429);

    const agora = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(agora + 15 * 60 * 1000 + 1000);
    expect((await entrar(CONTA, SENHA)).status).toBe(200);
  });
});

describe('teto de requisições por aparelho', () => {
  it('a 301ª chamada no mesmo minuto recebe 429', async () => {
    // Sem token: o teto conta antes, e a resposta (401) não toca no banco.
    for (let i = 0; i < 300; i++) expect((await chamar('GET', '/nada')).status).toBe(401);
    const barrada = await chamar('GET', '/nada');
    expect(barrada.status).toBe(429);
    expect(barrada.corpo.erro).toMatch(/requisições/i);
  });
});

describe('cabeçalhos da API', () => {
  it('não anuncia o framework, não vai para cache e não abre dentro de outro site', async () => {
    const { cabecalhos } = await chamar('GET', '/health');
    expect(cabecalhos.get('x-powered-by')).toBeNull();
    expect(cabecalhos.get('cache-control')).toBe('no-store');
    expect(cabecalhos.get('x-frame-options')).toBe('DENY');
    expect(cabecalhos.get('x-content-type-options')).toBe('nosniff');
    expect(cabecalhos.get('content-security-policy')).toMatch(/frame-ancestors 'none'/);
  });
});

describe('URL malformada vira 400, não 500', () => {
  let token;
  beforeEach(async () => {
    token = (await entrar(CONTA, SENHA)).corpo.token;
  });

  it.each([
    ['/vendas?inicio=abc', /data inválida/i],
    ['/despesas?fim=31-12-2026', /data inválida/i],
    ['/estoque/movimentacoes?tipo=QUALQUER', /tipo/i],
    ['/vendas?formaPagamento=BITCOIN', /pagamento/i],
    ['/vendas?inicio=2026-01-01&inicio=2026-02-01', /mais de uma vez/i],
    ['/producoes/previsao?produtoId=x&quantidade=abc', /quantidade/i],
  ])('%s', async (caminho, mensagem) => {
    const { status, corpo } = await chamar('GET', caminho, { token });
    expect(status).toBe(400);
    expect(corpo.erro).toMatch(mensagem);
  });
});

describe('token', () => {
  it('assinado com outro algoritmo é recusado, mesmo com o segredo certo', async () => {
    const conta = await prisma.usuario.findUnique({ where: { email: CONTA } });
    const forjado = jwt.sign({ sub: conta.id, papel: 'ADMIN' }, env.jwt.secret, {
      algorithm: 'HS512',
    });
    expect((await chamar('GET', '/auth/eu', { token: forjado })).status).toBe(401);
  });
});

describe('senha mínima de 8 caracteres', () => {
  it('ao criar alguém na equipe e ao trocar a própria senha', async () => {
    const token = (await entrar(CONTA, SENHA)).corpo.token;
    const nova = await chamar('POST', '/usuarios', {
      token,
      corpo: { nome: 'Curta', email: 'teste-curta', senha: 'curta12' },
    });
    const troca = await chamar('PATCH', '/auth/senha', {
      token,
      corpo: { senhaAtual: SENHA, senhaNova: 'curta12' },
    });
    expect([nova.status, troca.status]).toEqual([422, 422]);
    expect(await prisma.usuario.findUnique({ where: { email: 'teste-curta' } })).toBeNull();
  });

  it('quem já tem senha curta continua entrando', async () => {
    await prisma.usuario.update({
      where: { email: OUTRA },
      data: { senhaHash: await bcrypt.hash('antiga', 10) },
    });
    expect((await entrar(OUTRA, 'antiga')).status).toBe(200);
  });
});
