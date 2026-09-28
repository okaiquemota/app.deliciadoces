import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';

/**
 * Autenticação via JWT (Bearer token).
 *
 * Espera o header: `Authorization: Bearer <token>`.
 * Em caso de sucesso, popula `req.usuario` com os dados do payload —
 * daqui para frente qualquer controller sabe quem está fazendo a chamada.
 *
 * O token prova QUEM é; o banco diz se a pessoa ainda pode entrar e com
 * que papel. Enquanto só a Dalila usava o sistema, bastava o token. Com
 * funcionária, não: se a Dalila desativa uma conta ou tira dela o acesso
 * de administração, isso tem de valer na próxima requisição — e não
 * quando o token vencer, até um dia depois. O custo é um SELECT pela
 * chave primária por chamada.
 */
export async function autenticar(req, _res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return next(AppError.naoAutorizado('Token de autenticação não informado.'));
  }

  const [esquema, token] = header.split(' ');

  if (esquema !== 'Bearer' || !token) {
    return next(AppError.naoAutorizado('Formato de token inválido. Use: Bearer <token>.'));
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwt.secret);
  } catch (erro) {
    if (erro.name === 'TokenExpiredError') {
      return next(AppError.naoAutorizado('Sessão expirada. Faça login novamente.'));
    }
    return next(AppError.naoAutorizado('Token inválido.'));
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: payload.sub },
    select: { id: true, nome: true, email: true, papel: true, ativo: true },
  });

  if (!usuario || !usuario.ativo) {
    return next(AppError.naoAutorizado('Este acesso foi desativado. Fale com a administração.'));
  }

  const { ativo: _ativo, ...dados } = usuario;
  req.usuario = dados;
  return next();
}

/** Administração (a Dalila) vê e mexe em tudo; os outros papéis, não. */
export const ehAdmin = (usuario) => usuario?.papel === 'ADMIN';

/**
 * Autorização por papel. Uso: `router.delete('/:id', autenticar, autorizar('ADMIN'), ...)`
 *
 * Deve vir SEMPRE depois de `autenticar`, pois depende de `req.usuario`.
 */
export function autorizar(...papeisPermitidos) {
  return (req, _res, next) => {
    if (!req.usuario) {
      return next(AppError.naoAutorizado());
    }

    if (!papeisPermitidos.includes(req.usuario.papel)) {
      return next(AppError.proibido('Seu perfil não tem permissão para esta operação.'));
    }

    return next();
  };
}
