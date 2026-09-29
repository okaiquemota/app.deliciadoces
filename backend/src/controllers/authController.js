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
/**
 * No LOGIN o identificador não precisa ser um e-mail válido.
 *
 * A conta pode ter sido criada com um usuário simples ("maria"), pela
 * tela Equipe (ver `equipeController`). Aqui é só uma busca: exigir
 * formato de e-mail impediria essas contas de sequer chegar na
 * verificação de senha.
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

/**
 * Nome e e-mail da própria conta, em qualquer combinação.
 *
 * O e-mail aqui É validado como e-mail, ao contrário do login: é dado que
 * fica gravado e passa a ser o identificador de acesso. É assim que a
 * conta de apresentação ("admin", sem arroba) consegue virar um e-mail de
 * verdade — mas não o contrário.
 *
 * `senhaAtual` é opcional no formato porque trocar só o NOME não pede
 * senha. Quando o e-mail muda, quem cobra a senha é o serviço — a regra
 * depende do e-mail atual, que só o banco sabe.
 */
export const atualizarPerfilSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(2, 'O nome precisa ter ao menos 2 letras.')
      .max(80, 'O nome pode ter até 80 caracteres.')
      .optional(),
    email: z.email('E-mail inválido.').trim().toLowerCase().optional(),
    senhaAtual: z.string().optional(),
  })
  .refine((d) => d.nome !== undefined || d.email !== undefined, {
    message: 'Informe o nome ou o e-mail.',
    path: ['nome'],
  });

export const authController = {
  async login(req, res) {
    const resultado = await authService.login(req.body);
    res.json(resultado);
  },

  async trocarSenha(req, res) {
    res.json(await authService.trocarSenha(req.usuario.id, req.body));
  },

  async atualizarPerfil(req, res) {
    res.json(await authService.atualizarPerfil(req.usuario.id, req.body));
  },

  /** GET /auth/eu — devolve o usuário do token. */
  async eu(req, res) {
    const usuario = await authService.perfil(req.usuario.id);
    res.json(usuario);
  },
};
