import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

/**
 * Casca das telas autenticadas: cabeçalho, menu e área de conteúdo.
 * O `<Outlet />` é onde o React Router renderiza a página atual.
 */
export function Layout() {
  const { usuario, sair } = useAuth();

  const itensMenu = [
    { para: '/dashboard', rotulo: 'Dashboard' },
    { para: '/caixa', rotulo: 'Caixa' },
    { para: '/producao', rotulo: 'Produção' },
    { para: '/estoque', rotulo: 'Estoque' },
  ];

  return (
    <div className="layout">
      <header className="layout__topo">
        <span className="layout__marca">🍰 Delícia Doces</span>

        <nav className="layout__menu">
          {itensMenu.map((item) => (
            <NavLink
              key={item.para}
              to={item.para}
              className={({ isActive }) =>
                isActive ? 'layout__link layout__link--ativo' : 'layout__link'
              }
            >
              {item.rotulo}
            </NavLink>
          ))}
        </nav>

        <div className="layout__usuario">
          <span>{usuario?.nome}</span>
          <button type="button" className="botao botao--texto" onClick={sair}>
            Sair
          </button>
        </div>
      </header>

      <main className="layout__conteudo">
        <Outlet />
      </main>
    </div>
  );
}
