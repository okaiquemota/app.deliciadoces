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
  // token guardado no navegador. Sem token, não há o que conferir e a tela
  // de login aparece de cara.
  const [carregando, setCarregando] = useState(() => Boolean(localStorage.getItem(CHAVE_TOKEN)));
  // O servidor não respondeu ao abrir o app (sem internet, servidor ou
  // banco fora do ar). Diferente de "sessão vencida": a sessão continua
  // valendo, e a tela oferece tentar de novo.
  const [semConexao, setSemConexao] = useState(false);
  // Cada "Tentar de novo" soma um, e o efeito abaixo confere de novo.
  const [tentativa, setTentativa] = useState(0);

  /**
   * Confere o token guardado ao abrir o app.
   *
   * SÓ o 401 descarta a sessão. Antes, qualquer falha descartava: no 4G
   * fraco do balcão, ou com o banco pausado, abrir o sistema deslogava a
   * dona — que tinha de digitar a senha de novo assim que a rede voltasse.
   */
  useEffect(() => {
    async function restaurarSessao() {
      if (!localStorage.getItem(CHAVE_TOKEN)) return;

      try {
        setUsuario(await authService.perfil());
        setSemConexao(false);
      } catch (erro) {
        if (erro.response?.status === 401) {
          // Token inválido ou expirado: descarta e segue para o login.
          localStorage.removeItem(CHAVE_TOKEN);
          setSemConexao(false);
        } else {
          setSemConexao(true);
        }
      } finally {
        setCarregando(false);
      }
    }

    restaurarSessao();
  }, [tentativa]);

  /** O "Tentar de novo" da tela sem conexão. */
  const tentarDeNovo = useCallback(() => {
    setCarregando(true);
    setTentativa((n) => n + 1);
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

  /**
   * `admin`: a Dalila. Quem não é vê o sistema do balcão — lança, mas não
   * vê o dinheiro do negócio. Aqui é só o que a TELA mostra; quem barra
   * de verdade é o servidor, que confere o papel a cada chamada.
   */
  const valor = useMemo(
    () => ({
      usuario,
      admin: usuario?.papel === 'ADMIN',
      autenticado: Boolean(usuario),
      carregando,
      semConexao,
      tentarDeNovo,
      entrar,
      sair,
      atualizarSessao,
    }),
    [usuario, carregando, semConexao, tentarDeNovo, entrar, sair, atualizarSessao]
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
