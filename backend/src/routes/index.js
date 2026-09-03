import { Router } from 'express';
import authRoutes from './authRoutes.js';

/**
 * Agregador de rotas da API.
 *
 * Cada módulo do sistema (estoque, caixa, contas, dashboard) ganha seu
 * próprio arquivo de rotas e é registrado aqui. Assim `app.js` não precisa
 * ser tocado a cada nova funcionalidade.
 */
const router = Router();

router.use('/auth', authRoutes);

// --- Próximos módulos (Fase 1) ---
// router.use('/produtos', produtoRoutes);
// router.use('/estoque', estoqueRoutes);
// router.use('/caixa', caixaRoutes);
// router.use('/contas', contaRoutes);
// router.use('/dashboard', dashboardRoutes);

export default router;
