import { Prisma } from '@prisma/client';
import { AppError } from '../utils/AppError.js';
import { emProducao } from '../config/env.js';

/**
 * Rota não encontrada — registrado DEPOIS de todas as rotas da aplicação.
 */
export function rotaNaoEncontrada(req, res) {
  res.status(404).json({
    erro: 'Rota não encontrada.',
    caminho: `${req.method} ${req.originalUrl}`,
  });
}

/**
 * Tratamento centralizado de erros.
 *
 * Precisa dos 4 parâmetros (inclusive `_next`): é assim que o Express
 * identifica um middleware de erro. Remover o último parâmetro faz o
 * Express tratá-lo como middleware comum e ele nunca é chamado.
 */
export function errorHandler(erro, _req, res, _next) {
  // 1) Erros esperados, lançados de propósito pela aplicação
  if (erro instanceof AppError) {
    return res.status(erro.statusCode).json({
      erro: erro.message,
      ...(erro.detalhes ? { detalhes: erro.detalhes } : {}),
    });
  }

  // 2) Erros conhecidos do Prisma, traduzidos para algo legível
  if (erro instanceof Prisma.PrismaClientKnownRequestError) {
    if (erro.code === 'P2002') {
      // Com o driver adapter, o Prisma nem sempre diz o campo: a mensagem
      // vinha "Já existe um registro com este campo único.", que não diz
      // o que fazer. O modelo basta para falar a língua dela.
      const porModelo = {
        Insumo: 'Já existe um ingrediente com esse nome. Procure por ele na lista do Estoque.',
        Produto: 'Já existe um doce com esse nome. Procure por ele na lista da Produção.',
        Usuario: 'Esse e-mail ou usuário já é de outra pessoa da equipe.',
        FechamentoDiario: 'Este dia já foi fechado.',
      };
      const campos = erro.meta?.target?.join?.(', ');
      return res.status(409).json({
        erro:
          porModelo[erro.meta?.modelName] ??
          (campos
            ? `Já existe um registro com este ${campos}.`
            : 'Já existe um registro igual a este.'),
      });
    }
    if (erro.code === 'P2025') {
      return res.status(404).json({ erro: 'Registro não encontrado.' });
    }
    if (erro.code === 'P2003') {
      return res.status(409).json({
        erro: 'Operação bloqueada: existem registros vinculados a este item.',
      });
    }
  }

  // 3) JSON malformado no corpo da requisição
  if (erro instanceof SyntaxError && 'body' in erro) {
    return res.status(400).json({ erro: 'JSON inválido no corpo da requisição.' });
  }

  // 4) Qualquer outra coisa é bug nosso: loga completo, responde genérico.
  //    Nunca devolvemos stack trace ao cliente em produção.
  console.error('[erro-nao-tratado]', erro);

  return res.status(500).json({
    erro: 'Erro interno do servidor.',
    ...(emProducao ? {} : { mensagem: erro.message, stack: erro.stack }),
  });
}
