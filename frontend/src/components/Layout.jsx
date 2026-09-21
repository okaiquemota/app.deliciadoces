import { NavLink, Outlet } from 'react-router-dom';
import { Marca } from './Marca.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

/**
 * Casca das telas autenticadas: cabeçalho, menu e área de conteúdo.
 * O `<Outlet />` é onde o React Router renderiza a página atual.
 */
export function Layout() {
  const { usuario, sair } = useAuth();

  const itensMenu = [
    { para: '/dashboard', rotulo: 'Início' },
    { para: '/caixa', rotulo: 'Caixa' },
    { para: '/fechamento', rotulo: 'Fechamento' },
    { para: '/resumo', rotulo: 'Resumo' },
    { para: '/producao', rotulo: 'Produção' },
    { para: '/estoque', rotulo: 'Estoque' },
  ];

  return (
    <div className="layout">
      <header className="layout__topo">
        <span className="layout__marca">
          <Marca />
        </span>

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
          <NavLink to="/minha-conta" className="layout__usuario-link">
            {usuario?.nome}
          </NavLink>
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
