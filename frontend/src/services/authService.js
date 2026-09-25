import { api } from './api.js';

/**
 * Chamadas da API relacionadas a autenticação.
 *
 * Cada módulo do sistema terá seu próprio arquivo aqui em `services/`
 * (produtoService, caixaService, contaService...), mantendo as páginas
 * livres de detalhes de endpoint.
 */
export const authService = {
  async login(email, senha) {
    const { data } = await api.post('/auth/login', { email, senha });
    return data; // { token, usuario }
  },

  async perfil() {
    const { data } = await api.get('/auth/eu');
    return data;
  },

  /** Nome e/ou e-mail. Devolve { usuario, token } — o token é reemitido. */
  async atualizarPerfil(dados) {
    const { data } = await api.patch('/auth/perfil', dados);
    return data;
  },

  async trocarSenha(dados) {
    const { data } = await api.patch('/auth/senha', dados);
    return data;
  },
};
