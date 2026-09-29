import { insumoService, produtoService, movimentacaoService } from '../services/cadastroService.js';
import { vendaService, despesaService } from '../services/caixaService.js';
import { producaoService } from '../services/producaoService.js';
import { dashboardService } from '../services/dashboardService.js';
import { estoqueService } from '../services/estoqueService.js';
import { fechamentoService } from '../services/fechamentoService.js';
import { diaDoCliente, filtrosPeriodo, limiteDaListagem, limitesDoDia } from '../utils/periodo.js';
import { AppError } from '../utils/AppError.js';
import { ehAdmin } from '../middlewares/auth.js';
import { exigirProprioDeHoje, semDataSeNaoAdmin } from '../utils/permissao.js';
import { FORMAS_PAGAMENTO } from './schemas.js';

/**
 * Filtro de lista vindo da URL que não existe vira 400. Sem isto, um
 * `?tipo=qualquer` chegava ao banco como valor fora do enum e voltava 500.
 */
function opcaoDaQuery(valor, opcoes, nome) {
  if (valor === undefined || valor === '') return undefined;
  if (!opcoes.includes(valor)) throw new AppError(`Filtro de ${nome} inválido.`, 400);
  return valor;
}

const TIPOS_MOVIMENTACAO = [
  'ENTRADA_COMPRA',
  'ENTRADA_PRODUCAO',
  'SAIDA_PRODUCAO',
  'SAIDA_VENDA',
  'PERDA',
  'AJUSTE',
];

/**
 * Controllers: traduzem HTTP <-> serviço. Nenhuma regra de negócio aqui.
 *
 * São `async` e sem try/catch de propósito: o Express 5 encaminha Promise
 * rejeitada direto para o errorHandler.
 */

/**
 * O que cada pessoa enxerga do caixa.
 *
 * A administração pede o período que quiser. A funcionária vê só os
 * lançamentos da conta dela, e só os de hoje — é o que ela pode corrigir
 * (ver `exigirProprioDeHoje`); o caixa como um todo, não. O filtro é
 * imposto aqui, e não pedido pela tela: vale mesmo que alguém monte a
 * URL na mão.
 */
function recorteDoCaixa(req) {
  if (ehAdmin(req.usuario)) return filtrosPeriodo(req.query);
  return { ...limitesDoDia(diaDoCliente()), usuarioId: req.usuario.id };
}

/**
 * Custo do ingrediente só a administração escreve à mão. A funcionária
 * cadastra e edita o ingrediente, mas o custo dela chega pelo valor pago
 * em "Comprei" — que passa pela conta do custo médio, e não por cima dela.
 */
function semCustoSeNaoAdmin(req) {
  if (ehAdmin(req.usuario)) return req.body;
  const { custoUnitario: _custo, ...resto } = req.body;
  return resto;
}

export const insumoController = {
  async listar(req, res) {
    res.json(await insumoService.listar({ busca: req.query.busca }));
  },
  async porId(req, res) {
    res.json(await insumoService.porId(req.params.id));
  },
  async criar(req, res) {
    res.status(201).json(await insumoService.criar(semCustoSeNaoAdmin(req)));
  },
  async atualizar(req, res) {
    res.json(await insumoService.atualizar(req.params.id, semCustoSeNaoAdmin(req)));
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
        tipo: opcaoDaQuery(req.query.tipo, TIPOS_MOVIMENTACAO, 'tipo'),
        // Teto mais alto que o das outras listas: cada doce vendido é uma
        // linha, e um mês de Kardex passa fácil de mil.
        limite: limiteDaListagem(req.query, 200, 3000),
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
        ...recorteDoCaixa(req),
        formaPagamento: opcaoDaQuery(req.query.formaPagamento, FORMAS_PAGAMENTO, 'pagamento'),
        incluirCanceladas: req.query.incluirCanceladas === 'true',
        limite: limiteDaListagem(req.query),
      })
    );
  },
  async porId(req, res) {
    const venda = await vendaService.porId(req.params.id);
    exigirProprioDeHoje(req.usuario, venda);
    res.json(venda);
  },
  async criar(req, res) {
    const corpo = semDataSeNaoAdmin(req.usuario, req.body);
    res.status(201).json(await vendaService.criar(corpo, req.usuario.id));
  },
  async atualizar(req, res) {
    exigirProprioDeHoje(req.usuario, await vendaService.porId(req.params.id));
    const corpo = semDataSeNaoAdmin(req.usuario, req.body);
    res.json(await vendaService.atualizar(req.params.id, corpo, req.usuario.id));
  },
  async cancelar(req, res) {
    exigirProprioDeHoje(req.usuario, await vendaService.porId(req.params.id));
    res.json(await vendaService.cancelar(req.params.id));
  },
  async reabrir(req, res) {
    exigirProprioDeHoje(req.usuario, await vendaService.porId(req.params.id));
    res.json(await vendaService.reabrir(req.params.id));
  },
};

/**
 * Retirada pessoal é dinheiro da Dalila saindo para ela: só ela lança,
 * e só ela transforma uma saída em retirada.
 */
function recusarRetiradaSeNaoAdmin(req) {
  if (!ehAdmin(req.usuario) && req.body.retirada === true) {
    throw AppError.proibido('Retirada pessoal só a administração lança.');
  }
}

export const despesaController = {
  async listar(req, res) {
    res.json(
      await despesaService.listar({
        ...recorteDoCaixa(req),
        limite: limiteDaListagem(req.query),
      })
    );
  },
  async criar(req, res) {
    recusarRetiradaSeNaoAdmin(req);
    const corpo = semDataSeNaoAdmin(req.usuario, req.body);
    res.status(201).json(await despesaService.criar(corpo, req.usuario.id));
  },
  async atualizar(req, res) {
    recusarRetiradaSeNaoAdmin(req);
    exigirProprioDeHoje(req.usuario, await despesaService.porId(req.params.id));
    const corpo = semDataSeNaoAdmin(req.usuario, req.body);
    res.json(await despesaService.atualizar(req.params.id, corpo));
  },
  async excluir(req, res) {
    exigirProprioDeHoje(req.usuario, await despesaService.porId(req.params.id));
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
    const quantidade = Number(req.query.quantidade);
    if (!req.query.produtoId || !(quantidade > 0)) {
      throw new AppError('Informe o doce e uma quantidade maior que zero.', 400);
    }
    res.json(await producaoService.previsaoInsumos(req.query.produtoId, quantidade));
  },
  async registrar(req, res) {
    res.status(201).json(await producaoService.registrar(req.body, req.usuario.id));
  },
  async excluir(req, res) {
    exigirProprioDeHoje(req.usuario, await producaoService.porId(req.params.id));
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
  async ultimos(_req, res) {
    res.json(await dashboardService.ultimos());
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
    // Sem `data`, é o dia de HOJE em Brasília — não o do relógio do servidor.
    const dia = diaDoCliente(req.query.data ?? new Date());
    if (!dia) throw new AppError('Data inválida.');
    const [previa, gravado] = await Promise.all([
      fechamentoService.previa(dia),
      fechamentoService.porData(dia),
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
