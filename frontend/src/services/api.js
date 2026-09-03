import axios from 'axios';

/**
 * Cliente HTTP único da aplicação.
 *
 * Todo acesso à API passa por aqui — nenhum componente deve chamar axios
 * diretamente. Isso concentra num só lugar a URL base, o envio do token e
 * o tratamento de sessão expirada.
 */

export const CHAVE_TOKEN = '@deliciadoces:token';

export const api = axios.create({
  // Vazio => usa o proxy do Vite (mesma origem). Ver vite.config.js.
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

/**
 * Interceptor de REQUISIÇÃO: anexa o token JWT em toda chamada.
 * Sem isso, cada tela precisaria montar o header manualmente.
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(CHAVE_TOKEN);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/**
 * Interceptor de RESPOSTA: se a API devolver 401, o token venceu ou é
 * inválido — limpamos a sessão e mandamos o usuário para o login.
 *
 * Nota: `window.location` é uma solução simples e suficiente aqui porque
 * estamos fora da árvore do React (não há acesso ao hook de navegação).
 */
api.interceptors.response.use(
  (resposta) => resposta,
  (erro) => {
    const naoAutorizado = erro.response?.status === 401;
    const estaNoLogin = window.location.pathname === '/login';

    if (naoAutorizado && !estaNoLogin) {
      localStorage.removeItem(CHAVE_TOKEN);
      window.location.assign('/login');
    }

    return Promise.reject(erro);
  }
);

/** Extrai a mensagem de erro da API, com um texto de reserva. */
export function mensagemDeErro(erro, padrao = 'Não foi possível concluir a operação.') {
  return erro?.response?.data?.erro ?? padrao;
}
