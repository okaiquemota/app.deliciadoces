import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/**
 * Autenticação via JWT (Bearer token).
 *
 * Espera o header: `Authorization: Bearer <token>`.
 * Em caso de sucesso, popula `req.usuario` com os dados do payload —
 * daqui para frente qualquer controller sabe quem está fazendo a chamada.
 *
 * OBS (fase inicial): validamos apenas a assinatura e a expiração do token.
 * Não consultamos o banco a cada request para checar se o usuário continua
 * ativo. Isso é suficiente para o MVP e evita um SELECT em toda chamada;
 * se a cliente pedir bloqueio imediato de acesso, revisamos aqui.
 */
export function autenticar(req, _res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return next(AppError.naoAutorizado('Token de autenticação não informado.'));
  }

  const [esquema, token] = header.split(' ');

  if (esquema !== 'Bearer' || !token) {
    return next(
      AppError.naoAutorizado('Formato de token inválido. Use: Bearer <token>.')
    );
  }

  try {
    const payload = jwt.verify(token, env.jwt.secret);

    req.usuario = {
      id: payload.sub,
      nome: payload.nome,
      email: payload.email,
      papel: payload.papel,
    };

    return next();
  } catch (erro) {
    if (erro.name === 'TokenExpiredError') {
      return next(AppError.naoAutorizado('Sessão expirada. Faça login novamente.'));
    }
    return next(AppError.naoAutorizado('Token inválido.'));
  }
}

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
      return next(
        AppError.proibido('Seu perfil não tem permissão para esta operação.')
      );
    }

    return next();
  };
}
