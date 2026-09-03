import { AppError } from '../utils/AppError.js';

/**
 * Valida uma parte da requisição (`body`, `query`, `params`) contra um
 * schema Zod. Validar na borda mantém os controllers limpos: quando o
 * código do controller roda, os dados já chegaram no formato certo.
 */
export const validar =
  (schema, origem = 'body') =>
  (req, _res, next) => {
    const resultado = schema.safeParse(req[origem]);

    if (!resultado.success) {
      const detalhes = resultado.error.issues.map((problema) => ({
        campo: problema.path.join('.'),
        mensagem: problema.message,
      }));

      return next(new AppError('Dados inválidos.', 422, detalhes));
    }

    /**
     * Substitui pelos dados já parseados (com defaults aplicados e tipos
     * convertidos).
     *
     * Detalhe do Express 5: `req.query` virou uma propriedade somente de
     * leitura — atribuir direto lança TypeError. Por isso redefinimos a
     * propriedade nesse caso.
     */
    if (origem === 'query') {
      Object.defineProperty(req, 'query', {
        value: resultado.data,
        writable: true,
        configurable: true,
      });
    } else {
      req[origem] = resultado.data;
    }

    return next();
  };
