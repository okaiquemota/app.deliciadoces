import { Router } from 'express';
import {
  authController,
  loginSchema,
  registrarSchema,
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
 * cadastro aberto. Quem cria contas é a administração. O primeiro ADMIN
 * nasce do seed (`npm run db:seed`), resolvendo o problema do "ovo e da
 * galinha" sem deixar uma rota pública de criação de admin.
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

export default router;
