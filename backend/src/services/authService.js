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

  /**
   * Troca a senha do próprio usuário.
   *
   * Exige a senha atual mesmo estando autenticado: se alguém pegar a
   * máquina dela com a sessão aberta, não consegue trocar a senha e
   * tomar a conta. É a mesma razão pela qual bancos pedem a senha de
   * novo em operação sensível.
   */
  async trocarSenha(usuarioId, { senhaAtual, senhaNova }) {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });

    if (!usuario) {
      throw AppError.naoEncontrado('Usuário não encontrado.');
    }

    const confere = await bcrypt.compare(senhaAtual, usuario.senhaHash);

    if (!confere) {
      /*
       * 422 e não 401 de propósito.
       *
       * A requisição ESTÁ autenticada — a sessão é válida, o que falhou
       * foi o dado enviado. Devolver 401 faria o frontend entender que o
       * token morreu e deslogar a usuária no meio da troca de senha, em
       * vez de mostrar "senha atual incorreta". Foi exatamente o que
       * acontecia antes desta correção.
       */
      throw new AppError('Senha atual incorreta.', 422);
    }

    if (senhaAtual === senhaNova) {
      throw new AppError('A nova senha precisa ser diferente da atual.', 422);
    }

    await prisma.usuario.update({
      where: { id: usuarioId },
      data: { senhaHash: await bcrypt.hash(senhaNova, CUSTO_HASH) },
    });

    return { trocada: true };
  },

  /**
   * Muda o nome e/ou o e-mail da própria conta.
   *
   * O NOME muda sem senha: é só como o sistema a chama.
   *
   * O E-MAIL pede a senha atual. Ele é o login, e com a sessão aberta
   * numa máquina esquecida bastaria trocá-lo para trancar a dona fora da
   * conta — ela tentaria entrar com o e-mail dela e não existiria mais.
   * É a mesma razão pela qual a troca de senha pede a senha atual.
   *
   * Reenvia o token porque ele carrega nome e e-mail. O servidor hoje só
   * lê o id dele, mas um token dizendo um e-mail que a conta não tem mais
   * é o tipo de coisa que vira defeito quando alguém passar a confiar nele.
   */
  async atualizarPerfil(usuarioId, { nome, email, senhaAtual }) {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });

    if (!usuario) {
      throw AppError.naoEncontrado('Usuário não encontrado.');
    }

    const dados = {};
    if (nome !== undefined) dados.nome = nome;

    if (email !== undefined && email !== usuario.email) {
      // 422 e não 401, pelo mesmo motivo da troca de senha: a sessão é
      // válida, o que falhou foi o dado — 401 faria o frontend deslogá-la.
      if (!senhaAtual) {
        throw new AppError('Para trocar o e-mail, confirme com a sua senha atual.', 422);
      }
      if (!(await bcrypt.compare(senhaAtual, usuario.senhaHash))) {
        throw new AppError('Senha atual incorreta.', 422);
      }
      const dono = await prisma.usuario.findUnique({ where: { email } });
      if (dono) {
        throw AppError.conflito('Já existe um usuário com este e-mail.');
      }
      dados.email = email;
    }

    const atualizado = Object.keys(dados).length
      ? await prisma.usuario.update({ where: { id: usuarioId }, data: dados })
      : usuario;

    return { usuario: semSenha(atualizado), token: gerarToken(atualizado) };
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
