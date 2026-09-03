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
  papel: z.enum(['ADMIN', 'OPERADOR']).default('OPERADOR'),
});

export const loginSchema = z.object({
  email: z.email('E-mail inválido.').trim().toLowerCase(),
  senha: z.string().min(1, 'Informe a senha.'),
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

  /** GET /auth/eu — devolve o usuário do token. */
  async eu(req, res) {
    const usuario = await authService.perfil(req.usuario.id);
    res.json(usuario);
  },
};
