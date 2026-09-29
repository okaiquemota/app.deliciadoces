import { z } from 'zod';
import { equipeService } from '../services/equipeService.js';

/**
 * Schemas e controller da Equipe. Como no `authController`, o schema fica
 * junto porque descreve o contrato HTTP da rota.
 */

/**
 * O login pode ser um e-mail ou um usuário simples ("maria").
 *
 * Nem toda funcionária tem — ou quer dar — um e-mail, e o login já aceita
 * qualquer identificador. O usuário simples é curto e sem espaço, para
 * digitar no celular sem errar.
 */
const USUARIO_SIMPLES = /^[a-z0-9][a-z0-9._-]{2,29}$/;

const identificador = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => z.email().safeParse(v).success || USUARIO_SIMPLES.test(v), {
    message: 'Use um e-mail ou um usuário de 3 a 30 letras ou números, sem espaço.',
  });

const nome = z.string().trim().min(2, 'Informe o nome.');
// 8, e não 6: com 6 caracteres, um robô sem freio acha a senha em horas.
// Quem já tem senha menor continua entrando; a regra vale ao criar e trocar.
const senha = z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.');
const papel = z.enum(['ADMIN', 'OPERADOR']);

export const novaPessoaSchema = z.object({
  nome,
  email: identificador,
  senha,
  papel: papel.default('OPERADOR'),
});

export const alterarPessoaSchema = z
  .object({ nome: nome.optional(), papel: papel.optional(), ativo: z.boolean().optional() })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Nada para alterar.',
  });

export const redefinirSenhaSchema = z.object({ senha });

export const equipeController = {
  async listar(_req, res) {
    res.json(await equipeService.listar());
  },
  async criar(req, res) {
    res.status(201).json(await equipeService.criar(req.body));
  },
  async alterar(req, res) {
    res.json(await equipeService.alterar(req.params.id, req.body, req.usuario));
  },
  async redefinirSenha(req, res) {
    res.json(await equipeService.redefinirSenha(req.params.id, req.body, req.usuario));
  },
};
