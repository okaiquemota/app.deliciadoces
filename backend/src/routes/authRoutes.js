import { Router } from 'express';
import {
  authController,
  loginSchema,
  trocarSenhaSchema,
  atualizarPerfilSchema,
} from '../controllers/authController.js';
import {
  linkAcessoController,
  conferirLinkSchema,
  usarLinkSchema,
} from '../controllers/linkAcessoController.js';
import { autenticar } from '../middlewares/auth.js';
import { validar } from '../middlewares/validate.js';

const router = Router();

/**
 * POST /api/auth/login — pública, é a porta de entrada do sistema.
 */
router.post('/login', validar(loginSchema), authController.login);

/*
 * Criar conta não é daqui: é a tela Equipe, em `POST /api/usuarios`,
 * restrita à administração. A conta da Dalila nasce do seed
 * (`npm run db:seed`), o que resolve o "ovo e a galinha" sem deixar uma
 * rota pública de criação de conta.
 */

/**
 * Link de acesso — públicas, porque quem abre o link ainda não tem senha.
 * Não criam conta: só deixam a dona de uma conta que já existe escolher
 * o e-mail e a senha dela. Quem gera o link é a administração, em
 * `POST /api/usuarios/:id/link-acesso` (ver `linkAcessoService`).
 *
 * POST e com o link no corpo, e não GET com ele na URL: endereço vai para
 * log de servidor e histórico; o corpo, não.
 */
router.post('/link-acesso/conferir', validar(conferirLinkSchema), linkAcessoController.conferir);
router.post('/link-acesso', validar(usarLinkSchema), linkAcessoController.usar);

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

/**
 * PATCH /api/auth/perfil — o usuário muda o próprio nome e/ou e-mail.
 *
 * Mesma regra da senha: o id vem do token, nunca do corpo. Trocar o
 * e-mail pede a senha atual (ver authService.atualizarPerfil).
 */
router.patch('/perfil', autenticar, validar(atualizarPerfilSchema), authController.atualizarPerfil);

export default router;
