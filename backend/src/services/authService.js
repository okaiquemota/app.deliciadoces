import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/**
 * Regras de autenticação.
 *
 * A camada de serviço concentra as regras e o acesso ao banco; o controller
 * só traduz HTTP <-> serviço. Isso mantém a regra testável sem subir o
 * Express e evita controllers gigantes conforme o projeto cresce.
 */

const CUSTO_HASH = 10; // padrão do bcrypt: seguro e rápido o bastante

/** Remove o hash da senha antes de devolver o usuário para fora. */
function semSenha(usuario) {
  const { senhaHash: _ignorado, ...publico } = usuario;
  return publico;
}

function gerarToken(usuario) {
  return jwt.sign(
    {
      sub: usuario.id, // "subject": identificador do dono do token
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel,
    },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );
}

export const authService = {
  /**
   * Cadastra um novo usuário.
   * A rota é restrita a ADMIN — não é um cadastro público. O primeiro
   * administrador é criado pelo seed (`npm run db:seed`).
   */
  async registrar({ nome, email, senha, papel }) {
    const jaExiste = await prisma.usuario.findUnique({ where: { email } });

    if (jaExiste) {
      throw AppError.conflito('Já existe um usuário com este e-mail.');
    }

    const senhaHash = await bcrypt.hash(senha, CUSTO_HASH);

    const usuario = await prisma.usuario.create({
      data: { nome, email, senhaHash, papel },
    });

    return semSenha(usuario);
  },

  /**
   * Autentica e devolve o token de acesso.
   *
   * Detalhe de segurança: e-mail inexistente e senha errada retornam a
   * MESMA mensagem. Mensagens diferentes permitiriam descobrir quais
   * e-mails estão cadastrados no sistema.
   */
  async login({ email, senha }) {
    const usuario = await prisma.usuario.findUnique({ where: { email } });

    if (!usuario || !usuario.ativo) {
      throw AppError.naoAutorizado('E-mail ou senha inválidos.');
    }

    const senhaConfere = await bcrypt.compare(senha, usuario.senhaHash);

    if (!senhaConfere) {
      throw AppError.naoAutorizado('E-mail ou senha inválidos.');
    }

    return {
      token: gerarToken(usuario),
      usuario: semSenha(usuario),
    };
  },

  /** Dados do usuário logado — usado pelo frontend para restaurar a sessão. */
  async perfil(usuarioId) {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });

    if (!usuario) {
      throw AppError.naoEncontrado('Usuário não encontrado.');
    }

    return semSenha(usuario);
  },
};
