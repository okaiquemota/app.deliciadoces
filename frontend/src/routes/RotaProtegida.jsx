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
  const { autenticado, carregando } = useAuth();
  const localizacao = useLocation();

  if (carregando) {
    return <div className="carregando">Carregando...</div>;
  }

  if (!autenticado) {
    // `state` guarda de onde o usuário veio, para voltar após o login.
    return <Navigate to="/login" replace state={{ de: localizacao }} />;
  }

  return <Outlet />;
}
