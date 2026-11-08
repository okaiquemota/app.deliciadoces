import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { authService } from './authService.js';

/**
 * Link de acesso: a pessoa escolhe o próprio e-mail e a própria senha.
 *
 * Serve para a Dalila (ou uma funcionária) entrar com uma senha que só ela
 * sabe, sem ninguém ditar senha pelo WhatsApp e sem abrir uma rota pública
 * de cadastro. A administração gera o link na Equipe, para uma conta que
 * JÁ existe; quem abre escolhe o e-mail e a senha dessa conta e já entra.
 *
 * Não precisa de tabela nova. O link é um token assinado que leva:
 * - de quem é a conta (`sub`);
 * - uma impressão digital da senha atual (`h`). Usou o link, a senha muda,
 *   a impressão não bate mais e o link morre. Pelo mesmo motivo, criar uma
 *   senha nova pela Equipe anula os links que estavam soltos;
 * - a validade, de 3 dias.
 *
 * A assinatura usa um segredo DERIVADO do JWT_SECRET, e não o mesmo: assim
 * um link não serve como sessão, nem uma sessão serve como link.
 */

const VALIDADE = '3d';
const CUSTO_HASH = 10;

const LINK_INVALIDO =
  'Este link não vale mais: já foi usado, passou de 3 dias ou foi substituído. ' +
  'Peça um novo a quem te enviou.';

const segredo = () => `${env.jwt.secret}:link-de-acesso`;

/** Resumo da senha atual. Do hash do bcrypt, não da senha: não revela nada. */
const digital = (senhaHash) =>
  crypto.createHash('sha256').update(senhaHash).digest('base64url').slice(0, 22);

/**
 * Confere o link e devolve a conta dele. 410 (e não 401) quando não vale
 * mais: quem abre o link não está logado, e o frontend trata 401 como
 * "sessão caiu" e manda para o login, sem mostrar o motivo.
 */
async function abrir(token) {
  let payload;
  try {
    payload = jwt.verify(token, segredo(), { algorithms: ['HS256'] });
  } catch {
    throw new AppError(LINK_INVALIDO, 410);
  }

  const pessoa = await prisma.usuario.findUnique({ where: { id: payload.sub } });
  if (!pessoa || !pessoa.ativo || digital(pessoa.senhaHash) !== payload.h) {
    throw new AppError(LINK_INVALIDO, 410);
  }
  return pessoa;
}

export const linkAcessoService = {
  /**
   * Gera o link de alguém da equipe. Não da própria conta: com o sistema
   * aberto numa máquina esquecida, seria o atalho para tomar a conta sem a
   * senha atual, que a Minha conta exige.
   */
  async gerar(id, quem) {
    if (id === quem.id) {
      throw new AppError('Para trocar a sua senha, use a Minha conta: lá ela pede a atual.', 422);
    }

    const pessoa = await prisma.usuario.findUnique({ where: { id } });
    if (!pessoa) throw AppError.naoEncontrado('Pessoa não encontrada.');
    if (!pessoa.ativo) {
      throw new AppError(`${pessoa.nome} está sem acesso. Devolva o acesso antes do link.`, 422);
    }

    const token = jwt.sign({ sub: pessoa.id, h: digital(pessoa.senhaHash) }, segredo(), {
      expiresIn: VALIDADE,
      algorithm: 'HS256',
    });
    return { token, expiraEm: new Date(jwt.decode(token).exp * 1000).toISOString() };
  },

  /** O que a tela do link mostra antes de ela preencher: nome e login atual. */
  async conferir(token) {
    const { nome, email } = await abrir(token);
    return { nome, email };
  },

  /** Grava o e-mail e a senha escolhidos e devolve a sessão, como o login. */
  async usar(token, { email, senha }) {
    const pessoa = await abrir(token);

    if (email !== pessoa.email && (await prisma.usuario.findUnique({ where: { email } }))) {
      throw AppError.conflito('Já existe alguém com este e-mail ou usuário. Escolha outro.');
    }

    // A senha antiga entra no filtro: se o mesmo link for usado duas vezes
    // ao mesmo tempo, só a primeira gravação encontra a conta como estava.
    const { count } = await prisma.usuario.updateMany({
      where: { id: pessoa.id, senhaHash: pessoa.senhaHash, ativo: true },
      data: { email, senhaHash: await bcrypt.hash(senha, CUSTO_HASH) },
    });
    if (count === 0) throw new AppError(LINK_INVALIDO, 410);

    return authService.sessao(await prisma.usuario.findUnique({ where: { id: pessoa.id } }));
  },
};
