import { z } from 'zod';
import { authService } from '../services/authService.js';

/**
 * Schemas de entrada das rotas de autenticação.
 * Ficam junto do controller porque descrevem o CONTRATO HTTP da rota.
 *
 * Nota: os controllers são `async` e NÃO precisam de try/catch. A partir do
 * Express 5, uma Promise rejeitada dentro do handler vai automaticamente
 * para o middleware de erro (`errorHandler`).
 */
export const registrarSchema = z.object({
  nome: z.string().trim().min(3, 'Nome deve ter ao menos 3 caracteres.'),
  email: z.email('E-mail inválido.').trim().toLowerCase(),
  senha: z.string().min(6, 'Senha deve ter ao menos 6 caracteres.'),
  // Por ora só a Dalila usa o sistema e todo mundo entra como ADMIN.
  // OPERADOR fica reservado para quando uma ajudante passar a lançar
  // venda e estoque sem ver o resultado financeiro.
  papel: z.enum(['ADMIN', 'OPERADOR']).default('ADMIN'),
});

/**
 * No LOGIN o identificador não precisa ser um e-mail válido.
 *
 * O cadastro (acima) continua exigindo e-mail de verdade, porque é dado
 * que fica gravado. Aqui é só uma busca: exigir formato de e-mail
 * impediria contas de usuário simples, como a de apresentação, de sequer
 * chegar na verificação de senha.
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Informe o e-mail ou usuário.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

export const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual.'),
    senhaNova: z.string().min(6, 'A nova senha precisa ter ao menos 6 caracteres.'),
  })
  .refine((d) => d.senhaAtual !== d.senhaNova, {
    message: 'A nova senha precisa ser diferente da atual.',
    path: ['senhaNova'],
  });

export const authController = {
  async registrar(req, res) {
    const usuario = await authService.registrar(req.body);
    res.status(201).json(usuario);
  },

  async login(req, res) {
    const resultado = await authService.login(req.body);
    res.json(resultado);
  },

  async trocarSenha(req, res) {
    res.json(await authService.trocarSenha(req.usuario.id, req.body));
  },

  /** GET /auth/eu — devolve o usuário do token. */
  async eu(req, res) {
    const usuario = await authService.perfil(req.usuario.id);
    res.json(usuario);
  },
};
