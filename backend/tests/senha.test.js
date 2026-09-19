import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';
import { authService } from '../src/services/authService.js';

const EMAIL = 'teste-senha@deliciadoces.local';

beforeEach(async () => {
  await prisma.usuario.deleteMany({ where: { email: EMAIL } });
  await prisma.usuario.create({
    data: { nome: 'Teste', email: EMAIL, senhaHash: await bcrypt.hash('senha-antiga', 10) },
  });
});
afterAll(async () => {
  await prisma.usuario.deleteMany({ where: { email: EMAIL } });
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
