import { AuthProvider } from './contexts/AuthContext.jsx';
import { AppRoutes } from './routes/AppRoutes.jsx';

/**
 * Raiz da aplicação: o provider de autenticação envolve as rotas para que
 * qualquer tela consiga saber quem está logado.
 */
export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
