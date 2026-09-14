import { api } from './api.js';

/**
 * Todas as chamadas da API, agrupadas por recurso.
 *
 * Nenhuma tela usa axios direto: se um endpoint mudar, muda só aqui.
 */

const dados = (promessa) => promessa.then((r) => r.data);

export const insumos = {
  listar: (busca) => dados(api.get('/insumos', { params: { busca } })),
  porId: (id) => dados(api.get(`/insumos/${id}`)),
  criar: (corpo) => dados(api.post('/insumos', corpo)),
  atualizar: (id, corpo) => dados(api.put(`/insumos/${id}`, corpo)),
  inativar: (id) => dados(api.delete(`/insumos/${id}`)),
};

export const produtos = {
  listar: (busca) => dados(api.get('/produtos', { params: { busca } })),
  porId: (id) => dados(api.get(`/produtos/${id}`)),
  criar: (corpo) => dados(api.post('/produtos', corpo)),
  atualizar: (id, corpo) => dados(api.put(`/produtos/${id}`, corpo)),
  inativar: (id) => dados(api.delete(`/produtos/${id}`)),
  salvarFicha: (id, corpo) => dados(api.put(`/produtos/${id}/ficha-tecnica`, corpo)),
};

export const estoque = {
  movimentacoes: (params) => dados(api.get('/estoque/movimentacoes', { params })),
  movimentar: (corpo) => dados(api.post('/estoque/movimentacoes', corpo)),
  alertas: () => dados(api.get('/estoque/alertas')),
};

export const vendas = {
  listar: (params) => dados(api.get('/vendas', { params })),
  criar: (corpo) => dados(api.post('/vendas', corpo)),
  atualizar: (id, corpo) => dados(api.put(`/vendas/${id}`, corpo)),
  cancelar: (id) => dados(api.patch(`/vendas/${id}/cancelar`)),
  reabrir: (id) => dados(api.patch(`/vendas/${id}/reabrir`)),
};

export const despesas = {
  categorias: () => dados(api.get('/categorias-despesa')),
  listar: (params) => dados(api.get('/despesas', { params })),
  criar: (corpo) => dados(api.post('/despesas', corpo)),
  atualizar: (id, corpo) => dados(api.put(`/despesas/${id}`, corpo)),
  excluir: (id) => dados(api.delete(`/despesas/${id}`)),
};

export const producoes = {
  listar: (params) => dados(api.get('/producoes', { params })),
  previsao: (produtoId, quantidade) =>
    dados(api.get('/producoes/previsao', { params: { produtoId, quantidade } })),
  registrar: (corpo) => dados(api.post('/producoes', corpo)),
  excluir: (id) => dados(api.delete(`/producoes/${id}`)),
};

export const dashboard = {
  resumo: (params) => dados(api.get('/dashboard', { params })),
  porDia: (params) => dados(api.get('/dashboard/por-dia', { params })),
};
