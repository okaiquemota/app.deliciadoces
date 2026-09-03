/**
 * Erro de aplicação — usado para falhas ESPERADAS, que devem virar uma
 * resposta HTTP amigável (400, 401, 404...).
 *
 * Qualquer outro erro que chegar ao errorHandler é tratado como bug e
 * vira 500, sem vazar detalhes internos para o cliente.
 */
export class AppError extends Error {
  constructor(mensagem, statusCode = 400, detalhes = undefined) {
    super(mensagem);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.detalhes = detalhes;
    Error.captureStackTrace(this, this.constructor);
  }

  static naoAutorizado(mensagem = 'Não autorizado.') {
    return new AppError(mensagem, 401);
  }

  static proibido(mensagem = 'Acesso negado.') {
    return new AppError(mensagem, 403);
  }

  static naoEncontrado(mensagem = 'Recurso não encontrado.') {
    return new AppError(mensagem, 404);
  }

  static conflito(mensagem = 'Conflito com o estado atual do recurso.') {
    return new AppError(mensagem, 409);
  }
}
