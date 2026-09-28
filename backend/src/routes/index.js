import { Router } from 'express';
import authRoutes from './authRoutes.js';
import { autenticar, autorizar } from '../middlewares/auth.js';
import { ocultarCustos } from '../middlewares/ocultarCustos.js';
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
  equipeController,
  novaPessoaSchema,
  alterarPessoaSchema,
  redefinirSenhaSchema,
} from '../controllers/equipeController.js';
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
 *
 * Dois papéis. A ADMINISTRAÇÃO (a Dalila) faz tudo. A funcionária
 * (OPERADOR) trabalha no balcão e na cozinha — lança venda, entrada e
 * saída, produção e estoque — mas não vê o dinheiro do negócio: nem o
 * caixa como um todo, nem o fechamento, nem o resumo, nem custo. Pedido
 * da Dalila. Onde uma rota não diz papel, as duas passam; o recorte fino
 * (só os lançamentos dela, só os de hoje) fica no controller.
 */
const router = Router();
const soAdmin = autorizar('ADMIN');

router.use('/auth', authRoutes);

// A partir daqui, ninguém passa sem token
router.use(autenticar);
router.use(ocultarCustos);

// ---------------------------------------------------------------- insumos
router
  .route('/insumos')
  .get(insumoController.listar)
  .post(validar(insumoSchema), insumoController.criar);

router
  .route('/insumos/:id')
  .get(insumoController.porId)
  .put(validar(insumoUpdateSchema), insumoController.atualizar)
  .delete(soAdmin, insumoController.inativar);

// --------------------------------------------------------------- produtos
// Cadastro do doce é da administração: é ali que moram o preço e a
// receita, que decide o custo. A funcionária vê o doce e produz.
router
  .route('/produtos')
  .get(produtoController.listar)
  .post(soAdmin, validar(produtoSchema), produtoController.criar);

router
  .route('/produtos/:id')
  .get(produtoController.porId)
  .put(soAdmin, validar(produtoUpdateSchema), produtoController.atualizar)
  .delete(soAdmin, produtoController.inativar);

router.put(
  '/produtos/:id/ficha-tecnica',
  soAdmin,
  validar(fichaTecnicaSchema),
  produtoController.salvarFicha
);

// ---------------------------------------------------------------- estoque
router.get('/estoque/movimentacoes', estoqueController.listarMovimentacoes);
router.post('/estoque/movimentacoes', validar(movimentacaoSchema), estoqueController.movimentar);
router.get('/estoque/alertas', estoqueController.alertas);
router.post('/estoque/recalcular', soAdmin, estoqueController.recalcular);

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
// Totais do dia, da semana e do mês: é o "vendas totais" que a Dalila
// pediu para ficar só com ela.
router.get('/dashboard', soAdmin, dashboardController.resumo);
router.get('/dashboard/por-dia', soAdmin, dashboardController.porDia);
router.get('/dashboard/ultimos', soAdmin, dashboardController.ultimos);

// ------------------------------------------------------- fechamento diário
// `/previa` antes de `/:id` — senão "previa" seria lido como um id.
router.use('/fechamentos', soAdmin);
router.get('/fechamentos/previa', fechamentoController.previa);
router
  .route('/fechamentos')
  .get(fechamentoController.listar)
  .post(validar(fechamentoSchema), fechamentoController.fechar);
router
  .route('/fechamentos/:id')
  .put(validar(conferenciaSchema), fechamentoController.conferir)
  .delete(fechamentoController.excluir);

// ------------------------------------------------------------------ equipe
// Quem tem acesso ao sistema. Só a administração vê e mexe.
router.use('/usuarios', soAdmin);
router
  .route('/usuarios')
  .get(equipeController.listar)
  .post(validar(novaPessoaSchema), equipeController.criar);
router.patch('/usuarios/:id', validar(alterarPessoaSchema), equipeController.alterar);
router.patch('/usuarios/:id/senha', validar(redefinirSenhaSchema), equipeController.redefinirSenha);

export default router;
