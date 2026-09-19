import { Router } from 'express';
import {
  authController,
  loginSchema,
  registrarSchema,
  trocarSenhaSchema,
} from '../controllers/authController.js';
import { autenticar, autorizar } from '../middlewares/auth.js';
import { validar } from '../middlewares/validate.js';

const router = Router();

/**
 * POST /api/auth/login — pública, é a porta de entrada do sistema.
 */
router.post('/login', validar(loginSchema), authController.login);

/**
 * POST /api/auth/registrar — restrita a ADMIN.
 *
 * Decisão: este é um sistema interno da confeitaria, não um SaaS com
 * cadastro aberto. Quem cria contas é a administração. A conta da Dalila
 * nasce do seed (`npm run db:seed`), resolvendo o problema do "ovo e da
 * galinha" sem deixar uma rota pública de criação de admin.
 *
 * Hoje a trava de papel é efetivamente um no-op, já que só existe ADMIN.
 * Ela fica no lugar porque é a regra correta e não custa nada: no dia em
 * que existir um OPERADOR, esta rota já está protegida.
 */
router.post(
  '/registrar',
  autenticar,
  autorizar('ADMIN'),
  validar(registrarSchema),
  authController.registrar
);

/**
 * GET /api/auth/eu — o frontend chama ao abrir o app para saber se o
 * token guardado ainda é válido e quem é o usuário.
 */
router.get('/eu', autenticar, authController.eu);

/**
 * PATCH /api/auth/senha — o usuário troca a própria senha.
 *
 * Só mexe na conta de quem está autenticado: o id vem do token, nunca do
 * corpo da requisição. Assim ninguém troca a senha de outra pessoa.
 */
router.patch('/senha', autenticar, validar(trocarSenhaSchema), authController.trocarSenha);

export default router;
