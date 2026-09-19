import { insumoService, produtoService, movimentacaoService } from '../services/cadastroService.js';
import { vendaService, despesaService } from '../services/caixaService.js';
import { producaoService } from '../services/producaoService.js';
import { dashboardService } from '../services/dashboardService.js';
import { estoqueService } from '../services/estoqueService.js';
import { fechamentoService } from '../services/fechamentoService.js';

/**
 * Controllers: traduzem HTTP <-> serviço. Nenhuma regra de negócio aqui.
 *
 * São `async` e sem try/catch de propósito: o Express 5 encaminha Promise
 * rejeitada direto para o errorHandler.
 */

/**
 * Converte os filtros de período vindos da query.
 *
 * Detalhe que já causou bug: uma data sem hora ("2026-09-14") vira
 * MEIA-NOITE. Usada como fim de período, ela excluiria tudo que aconteceu
 * durante o próprio dia — a tela mostrava "nenhuma venda" tendo vendas.
 * Por isso o fim sem hora é empurrado para 23:59:59.999.
 */
const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

const filtrosPeriodo = (query) => {
  const inicio = query.inicio ? new Date(query.inicio) : undefined;
  let fim;

  if (query.fim) {
    fim = new Date(query.fim);
    if (SO_DATA.test(String(query.fim))) fim.setHours(23, 59, 59, 999);
  }

  return { inicio, fim };
};

export const insumoController = {
  async listar(req, res) {
    res.json(await insumoService.listar({ busca: req.query.busca }));
  },
  async porId(req, res) {
    res.json(await insumoService.porId(req.params.id));
  },
  async criar(req, res) {
    res.status(201).json(await insumoService.criar(req.body));
  },
  async atualizar(req, res) {
    res.json(await insumoService.atualizar(req.params.id, req.body));
  },
  async inativar(req, res) {
    res.json(await insumoService.inativar(req.params.id));
  },
};

export const produtoController = {
  async listar(req, res) {
    res.json(await produtoService.listar({ busca: req.query.busca }));
  },
  async porId(req, res) {
    res.json(await produtoService.porId(req.params.id));
  },
  async criar(req, res) {
    res.status(201).json(await produtoService.criar(req.body));
  },
  async atualizar(req, res) {
    res.json(await produtoService.atualizar(req.params.id, req.body));
  },
  async inativar(req, res) {
    res.json(await produtoService.inativar(req.params.id));
  },
  async salvarFicha(req, res) {
    res.json(await produtoService.salvarFichaTecnica(req.params.id, req.body));
  },
};

export const estoqueController = {
  async movimentar(req, res) {
    res.status(201).json(await movimentacaoService.registrar(req.body, req.usuario.id));
  },
  async listarMovimentacoes(req, res) {
    res.json(
      await estoqueService.listarMovimentacoes({
        ...filtrosPeriodo(req.query),
        insumoId: req.query.insumoId,
        produtoId: req.query.produtoId,
        tipo: req.query.tipo,
      })
    );
  },
  async alertas(_req, res) {
    res.json(await estoqueService.alertas());
  },
  async recalcular(req, res) {
    res.json(
      await estoqueService.recalcularSaldo({
        insumoId: req.query.insumoId ?? null,
        produtoId: req.query.produtoId ?? null,
      })
    );
  },
};

export const vendaController = {
  async listar(req, res) {
    res.json(
      await vendaService.listar({
        ...filtrosPeriodo(req.query),
        formaPagamento: req.query.formaPagamento,
        incluirCanceladas: req.query.incluirCanceladas === 'true',
      })
    );
  },
  async porId(req, res) {
    res.json(await vendaService.porId(req.params.id));
  },
  async criar(req, res) {
    res.status(201).json(await vendaService.criar(req.body, req.usuario.id));
  },
  async atualizar(req, res) {
    res.json(await vendaService.atualizar(req.params.id, req.body, req.usuario.id));
  },
  async cancelar(req, res) {
    res.json(await vendaService.cancelar(req.params.id));
  },
  async reabrir(req, res) {
    res.json(await vendaService.reabrir(req.params.id));
  },
};

export const despesaController = {
  async categorias(_req, res) {
    res.json(await despesaService.listarCategorias());
  },
  async listar(req, res) {
    res.json(
      await despesaService.listar({
        ...filtrosPeriodo(req.query),
        categoriaId: req.query.categoriaId,
      })
    );
  },
  async criar(req, res) {
    res.status(201).json(await despesaService.criar(req.body, req.usuario.id));
  },
  async atualizar(req, res) {
    res.json(await despesaService.atualizar(req.params.id, req.body));
  },
  async excluir(req, res) {
    await despesaService.excluir(req.params.id);
    res.status(204).end();
  },
};

export const producaoController = {
  async listar(req, res) {
    res.json(
      await producaoService.listar({
        ...filtrosPeriodo(req.query),
        produtoId: req.query.produtoId,
      })
    );
  },
  async previsao(req, res) {
    res.json(
      await producaoService.previsaoInsumos(req.query.produtoId, Number(req.query.quantidade))
    );
  },
  async registrar(req, res) {
    res.status(201).json(await producaoService.registrar(req.body, req.usuario.id));
  },
  async excluir(req, res) {
    await producaoService.excluir(req.params.id);
    res.status(204).end();
  },
};

export const dashboardController = {
  async resumo(req, res) {
    res.json(await dashboardService.resumo(filtrosPeriodo(req.query)));
  },
  async porDia(req, res) {
    res.json(await dashboardService.porDia(filtrosPeriodo(req.query)));
  },
};

export const fechamentoController = {
  async listar(req, res) {
    res.json(await fechamentoService.listar(filtrosPeriodo(req.query)));
  },
  /**
   * Prévia do dia: o que o sistema espera na gaveta, antes de a cliente
   * contar. Junto vai o fechamento já gravado, se existir, para a tela
   * saber se está abrindo ou revisando.
   */
  async previa(req, res) {
    const data = req.query.data ? new Date(req.query.data) : new Date();
    const [previa, gravado] = await Promise.all([
      fechamentoService.previa(data),
      fechamentoService.porData(data),
    ]);
    res.json({ ...previa, fechamento: gravado });
  },
  async fechar(req, res) {
    res.status(201).json(await fechamentoService.fechar(req.body, req.usuario.id));
  },
  async conferir(req, res) {
    res.json(await fechamentoService.conferir(req.params.id, req.body));
  },
  async excluir(req, res) {
    await fechamentoService.excluir(req.params.id);
    res.status(204).end();
  },
};
