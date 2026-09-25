import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';
import { authService } from '../src/services/authService.js';
import { atualizarPerfilSchema } from '../src/controllers/authController.js';

const EMAIL = 'teste-senha@deliciadoces.local';
const OUTRO = 'teste-outro@deliciadoces.local';
const NOVO = 'teste-novo@deliciadoces.local';

beforeEach(async () => {
  await prisma.usuario.deleteMany({ where: { email: { in: [EMAIL, OUTRO, NOVO] } } });
  await prisma.usuario.create({
    data: { nome: 'Teste', email: EMAIL, senhaHash: await bcrypt.hash('senha-antiga', 10) },
  });
});
afterAll(async () => {
  await prisma.usuario.deleteMany({ where: { email: { in: [EMAIL, OUTRO, NOVO] } } });
  await prisma.$disconnect();
});

const buscar = () => prisma.usuario.findUnique({ where: { email: EMAIL } });

describe('trocar senha', () => {
  it('troca quando a senha atual confere', async () => {
    const u = await buscar();
    await authService.trocarSenha(u.id, {
      senhaAtual: 'senha-antiga',
      senhaNova: 'senha-nova-123',
    });

    const depois = await buscar();
    expect(await bcrypt.compare('senha-nova-123', depois.senhaHash)).toBe(true);
    expect(await bcrypt.compare('senha-antiga', depois.senhaHash)).toBe(false);
  });

  it('recusa quando a senha atual está errada', async () => {
    // Impede tomada de conta por quem encontrar a sessão aberta.
    const u = await buscar();
    await expect(
      authService.trocarSenha(u.id, { senhaAtual: 'chute', senhaNova: 'nova-123456' })
    ).rejects.toThrow(/senha atual/i);

    const depois = await buscar();
    expect(await bcrypt.compare('senha-antiga', depois.senhaHash)).toBe(true);
  });

  it('recusa nova senha igual à atual', async () => {
    const u = await buscar();
    await expect(
      authService.trocarSenha(u.id, { senhaAtual: 'senha-antiga', senhaNova: 'senha-antiga' })
    ).rejects.toThrow(/diferente/i);
  });

  it('guarda hash, nunca a senha em texto', async () => {
    const u = await buscar();
    await authService.trocarSenha(u.id, {
      senhaAtual: 'senha-antiga',
      senhaNova: 'texto-puro-nao',
    });
    const depois = await buscar();
    expect(depois.senhaHash).not.toContain('texto-puro-nao');
    expect(depois.senhaHash.startsWith('$2')).toBe(true);
  });

  it('o login passa a valer com a senha nova e não com a antiga', async () => {
    const u = await buscar();
    await authService.trocarSenha(u.id, { senhaAtual: 'senha-antiga', senhaNova: 'agora-e-essa' });

    await expect(authService.login({ email: EMAIL, senha: 'senha-antiga' })).rejects.toThrow();
    const sessao = await authService.login({ email: EMAIL, senha: 'agora-e-essa' });
    expect(sessao.token).toBeTruthy();
  });
});

describe('código de status', () => {
  it('senha atual errada devolve 422, não 401', async () => {
    // 401 faria o frontend entender que a sessão morreu e deslogar a
    // usuária no meio da troca de senha. A sessão está válida; o que
    // falhou foi o dado enviado.
    const u = await buscar();
    try {
      await authService.trocarSenha(u.id, { senhaAtual: 'errada', senhaNova: 'outra-senha-1' });
      throw new Error('deveria ter recusado');
    } catch (erro) {
      expect(erro.statusCode).toBe(422);
    }
  });
});

/**
 * Nome e e-mail da própria conta.
 *
 * O que estes testes travam é a assimetria: o nome muda sem senha, o
 * e-mail não. O e-mail é o login — trocá-lo numa sessão esquecida aberta
 * trancaria a dona fora da própria conta.
 */
describe('atualizar perfil', () => {
  it('troca o nome sem pedir senha', async () => {
    const u = await buscar();
    const r = await authService.atualizarPerfil(u.id, { nome: 'Dalila' });
    expect(r.usuario.nome).toBe('Dalila');
    expect((await buscar()).nome).toBe('Dalila');
  });

  it('recusa trocar o e-mail sem a senha atual, e não mexe em nada', async () => {
    const u = await buscar();
    await expect(authService.atualizarPerfil(u.id, { email: NOVO })).rejects.toThrow(/senha/i);
    expect(await buscar()).not.toBeNull();
  });

  it('recusa trocar o e-mail com a senha errada', async () => {
    const u = await buscar();
    await expect(
      authService.atualizarPerfil(u.id, { email: NOVO, senhaAtual: 'chute' })
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(await prisma.usuario.findUnique({ where: { email: NOVO } })).toBeNull();
  });

  it('troca o e-mail quando a senha confere, e o login passa a ser o novo', async () => {
    const u = await buscar();
    await authService.atualizarPerfil(u.id, { email: NOVO, senhaAtual: 'senha-antiga' });

    await expect(authService.login({ email: NOVO, senha: 'senha-antiga' })).resolves.toHaveProperty(
      'token'
    );
    await expect(authService.login({ email: EMAIL, senha: 'senha-antiga' })).rejects.toThrow();
  });

  it('recusa um e-mail que já é de outra pessoa', async () => {
    await prisma.usuario.create({ data: { nome: 'Outra', email: OUTRO, senhaHash: 'x' } });
    const u = await buscar();
    await expect(
      authService.atualizarPerfil(u.id, { email: OUTRO, senhaAtual: 'senha-antiga' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('repetir o próprio e-mail não pede senha: não é troca', async () => {
    const u = await buscar();
    const r = await authService.atualizarPerfil(u.id, { nome: 'Dalila', email: EMAIL });
    expect(r.usuario.email).toBe(EMAIL);
  });

  it('devolve um token novo com o nome atualizado', async () => {
    const u = await buscar();
    const { token } = await authService.atualizarPerfil(u.id, { nome: 'Dalila' });
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.nome).toBe('Dalila');
  });

  it('o formato exige e-mail de verdade e grava em minúsculas', () => {
    expect(atualizarPerfilSchema.safeParse({ email: 'admin' }).success).toBe(false);
    expect(atualizarPerfilSchema.parse({ email: 'Dalila@Exemplo.com' }).email).toBe(
      'dalila@exemplo.com'
    );
    expect(atualizarPerfilSchema.safeParse({}).success).toBe(false);
  });
});
