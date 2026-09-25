import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, CHAVE_TOKEN } from '../services/api.js';
import { authService } from '../services/authService.js';

/**
 * Estado global de autenticação.
 *
 * Context API basta para o MVP: o único estado realmente global é o
 * usuário logado. Trazer Redux/Zustand agora seria complexidade sem
 * retorno — reavaliamos se aparecer estado compartilhado de verdade.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  // `carregando` evita o "flash" da tela de login enquanto validamos o
  // token guardado no navegador durante o primeiro render.
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function restaurarSessao() {
      const token = localStorage.getItem(CHAVE_TOKEN);

      if (!token) {
        setCarregando(false);
        return;
      }

      try {
        setUsuario(await authService.perfil());
      } catch {
        // Token inválido ou expirado: descarta e segue para o login.
        localStorage.removeItem(CHAVE_TOKEN);
      } finally {
        setCarregando(false);
      }
    }

    restaurarSessao();
  }, []);

  const entrar = useCallback(async (email, senha) => {
    const { token, usuario: usuarioLogado } = await authService.login(email, senha);

    localStorage.setItem(CHAVE_TOKEN, token);
    api.defaults.headers.Authorization = `Bearer ${token}`;
    setUsuario(usuarioLogado);

    return usuarioLogado;
  }, []);

  /**
   * Troca o usuário e o token da sessão sem passar pelo login.
   *
   * Usado quando ela muda o próprio nome ou e-mail: a barra lateral
   * precisa mostrar o nome novo na hora, e o token antigo carregaria os
   * dados velhos.
   */
  const atualizarSessao = useCallback(({ usuario: novo, token }) => {
    if (token) {
      localStorage.setItem(CHAVE_TOKEN, token);
      api.defaults.headers.Authorization = `Bearer ${token}`;
    }
    setUsuario(novo);
  }, []);

  const sair = useCallback(() => {
    localStorage.removeItem(CHAVE_TOKEN);
    delete api.defaults.headers.Authorization;
    setUsuario(null);
  }, []);

  const valor = useMemo(
    () => ({ usuario, autenticado: Boolean(usuario), carregando, entrar, sair, atualizarSessao }),
    [usuario, carregando, entrar, sair, atualizarSessao]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

/** Hook de acesso ao contexto, com erro claro se usado fora do provider. */
export function useAuth() {
  const contexto = useContext(AuthContext);

  if (!contexto) {
    throw new Error('useAuth precisa ser usado dentro de <AuthProvider>.');
  }

  return contexto;
}
