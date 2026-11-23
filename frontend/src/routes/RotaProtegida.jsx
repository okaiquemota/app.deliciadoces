import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

/**
 * Barreira de rota: só deixa passar quem está autenticado.
 *
 * Isto é conveniência de interface, não segurança — quem protege os dados
 * é o middleware `autenticar` do backend. O front apenas evita mostrar
 * telas que resultariam em 401.
 */
export function RotaProtegida() {
  const { autenticado, carregando, semConexao, tentarDeNovo } = useAuth();
  const localizacao = useLocation();

  if (carregando) {
    return (
      <div className="carregando" role="status">
        Carregando…
      </div>
    );
  }

  // A sessão existe, mas o servidor não respondeu: em vez de mandar para o
  // login (e fazer digitar a senha de novo), explica e oferece tentar.
  if (semConexao) {
    return (
      <main className="pagina-erro">
        <h1 className="pagina-erro__titulo">Sem conexão com o sistema</h1>
        <p className="pagina-erro__texto">
          Confira a internet do aparelho. Se ela estiver funcionando, o sistema pode estar fora do
          ar por alguns minutos. Seus dados estão guardados.
        </p>
        <button type="button" className="botao botao--primario botao--auto" onClick={tentarDeNovo}>
          Tentar de novo
        </button>
      </main>
    );
  }

  if (!autenticado) {
    // `state` guarda de onde o usuário veio, para voltar após o login.
    return <Navigate to="/login" replace state={{ de: localizacao }} />;
  }

  return <Outlet />;
}

/**
 * Telas do dinheiro do negócio (Fechar dia, Resumo): só a administração.
 * Quem não é e chega pelo endereço digitado volta para o Início — sem
 * isso, veria a tela vazia com o erro de permissão do servidor.
 */
export function SoAdmin() {
  const { admin } = useAuth();
  return admin ? <Outlet /> : <Navigate to="/dashboard" replace />;
}
