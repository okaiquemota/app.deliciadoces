import { Router } from 'express';
import authRoutes from './authRoutes.js';
import { autenticar } from '../middlewares/auth.js';
import { validar } from '../middlewares/validate.js';
import {
  insumoController,
  produtoController,
  estoqueController,
  vendaController,
  despesaController,
  producaoController,
  dashboardController,
  fechamentoController,
} from '../controllers/index.js';
import {
  insumoSchema,
  insumoUpdateSchema,
  produtoSchema,
  produtoUpdateSchema,
  fichaTecnicaSchema,
  movimentacaoSchema,
  vendaSchema,
  despesaSchema,
  despesaUpdateSchema,
  producaoSchema,
  fechamentoSchema,
  conferenciaSchema,
} from '../controllers/schemas.js';

/**
 * Agregador de rotas da API.
 *
 * Tudo que não é `/auth` fica atrás de `autenticar`: são dados financeiros
 * de um negócio real. A proteção de verdade é aqui, não no React.
 */
const router = Router();

router.use('/auth', authRoutes);

// A partir daqui, ninguém passa sem token
router.use(autenticar);

// ---------------------------------------------------------------- insumos
router
  .route('/insumos')
  .get(insumoController.listar)
  .post(validar(insumoSchema), insumoController.criar);

router
  .route('/insumos/:id')
  .get(insumoController.porId)
  .put(validar(insumoUpdateSchema), insumoController.atualizar)
  .delete(insumoController.inativar);

// --------------------------------------------------------------- produtos
router
  .route('/produtos')
  .get(produtoController.listar)
  .post(validar(produtoSchema), produtoController.criar);

router
  .route('/produtos/:id')
  .get(produtoController.porId)
  .put(validar(produtoUpdateSchema), produtoController.atualizar)
  .delete(produtoController.inativar);

router.put(
  '/produtos/:id/ficha-tecnica',
  validar(fichaTecnicaSchema),
  produtoController.salvarFicha
);

// ---------------------------------------------------------------- estoque
router.get('/estoque/movimentacoes', estoqueController.listarMovimentacoes);
router.post('/estoque/movimentacoes', validar(movimentacaoSchema), estoqueController.movimentar);
router.get('/estoque/alertas', estoqueController.alertas);
router.get('/estoque/validades', estoqueController.validades);
router.post('/estoque/recalcular', estoqueController.recalcular);

// ----------------------------------------------------------------- vendas
router
  .route('/vendas')
  .get(vendaController.listar)
  .post(validar(vendaSchema), vendaController.criar);

router
  .route('/vendas/:id')
  .get(vendaController.porId)
  .put(validar(vendaSchema), vendaController.atualizar);

/**
 * O botão "Excluir" da tela chama `cancelar`, não um DELETE.
 * Decisão de produto: nada some, a venda é marcada como cancelada e o
 * estoque estornado — a cliente erra com frequência e precisa voltar atrás.
 */
router.patch('/vendas/:id/cancelar', vendaController.cancelar);
router.patch('/vendas/:id/reabrir', vendaController.reabrir);

// --------------------------------------------------------------- despesas
router.get('/categorias-despesa', despesaController.categorias);

router
  .route('/despesas')
  .get(despesaController.listar)
  .post(validar(despesaSchema), despesaController.criar);

router
  .route('/despesas/:id')
  .put(validar(despesaUpdateSchema), despesaController.atualizar)
  .delete(despesaController.excluir);

// --------------------------------------------------------------- produção
router.get('/producoes/previsao', producaoController.previsao);
router
  .route('/producoes')
  .get(producaoController.listar)
  .post(validar(producaoSchema), producaoController.registrar);
router.delete('/producoes/:id', producaoController.excluir);

// -------------------------------------------------------------- dashboard
router.get('/dashboard', dashboardController.resumo);
router.get('/dashboard/por-dia', dashboardController.porDia);

// ------------------------------------------------------- fechamento diário
// `/previa` antes de `/:id` — senão "previa" seria lido como um id.
router.get('/fechamentos/previa', fechamentoController.previa);
router
  .route('/fechamentos')
  .get(fechamentoController.listar)
  .post(validar(fechamentoSchema), fechamentoController.fechar);
router
  .route('/fechamentos/:id')
  .put(validar(conferenciaSchema), fechamentoController.conferir)
  .delete(fechamentoController.excluir);

export default router;
