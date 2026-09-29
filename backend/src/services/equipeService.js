import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';

/**
 * Quem tem acesso ao sistema — a tela Equipe da Dalila.
 *
 * Ninguém é apagado: vendas, saídas e lotes guardam quem lançou, e apagar
 * a pessoa apagaria essa resposta. Quem sai da confeitaria é DESATIVADO:
 * não entra mais (nem com a sessão que já estava aberta, ver
 * `autenticar`), e o histórico continua dizendo quem fez o quê.
 */

const CUSTO_HASH = 10;

const PUBLICO = {
  id: true,
  nome: true,
  email: true,
  papel: true,
  ativo: true,
  criadoEm: true,
};

async function buscar(id) {
  const pessoa = await prisma.usuario.findUnique({ where: { id }, select: PUBLICO });
  if (!pessoa) throw AppError.naoEncontrado('Pessoa não encontrada.');
  return pessoa;
}

export const equipeService = {
  /** Ativos primeiro; entre eles, a administração no alto. */
  listar() {
    return prisma.usuario.findMany({
      select: PUBLICO,
      orderBy: [{ ativo: 'desc' }, { papel: 'asc' }, { nome: 'asc' }],
    });
  },

  async criar({ nome, email, senha, papel }) {
    if (await prisma.usuario.findUnique({ where: { email } })) {
      throw AppError.conflito('Já existe alguém com este e-mail ou usuário.');
    }
    return prisma.usuario.create({
      data: { nome, email, papel, senhaHash: await bcrypt.hash(senha, CUSTO_HASH) },
      select: PUBLICO,
    });
  },

  /**
   * Nome, papel e ativo/inativo.
   *
   * A própria conta não perde o acesso por aqui: com um clique errado a
   * Dalila se trancaria fora da administração, e não haveria mais
   * ninguém para devolver. Como só a administração chega nesta rota e
   * ela não mexe em si mesma, sempre sobra ao menos uma administração
   * ativa.
   */
  async alterar(id, dados, quem) {
    const tiraAcesso = dados.ativo === false || (dados.papel && dados.papel !== 'ADMIN');
    if (id === quem.id && tiraAcesso) {
      throw new AppError('Você não pode tirar o seu próprio acesso de administração.', 422);
    }
    await buscar(id);
    return prisma.usuario.update({ where: { id }, data: dados, select: PUBLICO });
  },

  /**
   * Senha nova para quem esqueceu a dela. A pessoa entra com esta e
   * troca na Minha conta.
   *
   * A própria senha não se troca por aqui: a Minha conta pede a senha
   * atual antes, e esta rota seria o atalho para pular essa conferência.
   */
  async redefinirSenha(id, { senha }, quem) {
    if (id === quem.id) {
      throw new AppError('Para trocar a sua senha, use a Minha conta: lá ela pede a atual.', 422);
    }
    await buscar(id);
    await prisma.usuario.update({
      where: { id },
      data: { senhaHash: await bcrypt.hash(senha, CUSTO_HASH) },
    });
    return { redefinida: true };
  },
};
