import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Marca } from './Marca.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

/**
 * Casca das telas autenticadas.
 *
 * O cabeçalho é um "hero": faixa da marca que carrega identidade,
 * navegação e o NOME DA SEÇÃO. Antes cada página repetia o próprio título
 * e um parágrafo explicando o que ela era — texto que a cliente lê uma
 * vez e depois só atrapalha, empurrando o conteúdo útil para baixo toda
 * vez que ela abre a tela no balcão.
 *
 * O título continua existindo como `h1`, aqui dentro. Tirar de vez
 * deixaria as páginas sem cabeçalho nenhum para leitor de tela, que
 * navega justamente por essa marcação.
 */

const TITULOS = {
  '/caixa': 'Caixa',
  '/fechamento': 'Fechamento de caixa',
  '/producao': 'Produção',
  '/estoque': 'Estoque',
  '/resumo': 'Resumo',
  '/minha-conta': 'Minha conta',
};

export function Layout() {
  const { usuario, sair } = useAuth();
  const { pathname } = useLocation();

  /**
   * Quatro seções, e quatro é o que cabe em 390px sem rolar: os cinco
   * pediam 462px e "Estoque" ficava cortado, sem pista de que existia.
   *
   * Fechamento e Resumo saíram daqui porque são cartões na tela inicial —
   * tarefa de fim de dia se alcança de onde ela já está, e a inicial é
   * onde ela cai ao abrir o sistema. Menu é moldura: o que não couber
   * inteiro nele fica mais achável como cartão do que escondido numa
   * barra que rola.
   */
  const itensMenu = [
    { para: '/dashboard', rotulo: 'Início' },
    { para: '/caixa', rotulo: 'Caixa' },
    { para: '/producao', rotulo: 'Produção' },
    { para: '/estoque', rotulo: 'Estoque' },
  ];

  // Na inicial o título é o cumprimento; nas outras, o nome da seção.
  const titulo = TITULOS[pathname] ?? `Olá, ${usuario?.nome?.split(' ')[0] ?? ''}`;

  return (
    <div className="layout">
      <header className="hero">
        <div className="hero__interno">
          <div className="hero__topo">
            <span className="hero__marca">
              <Marca />
            </span>

            <div className="hero__usuario">
              <NavLink to="/minha-conta" className="hero__conta">
                {usuario?.nome}
              </NavLink>
              <button type="button" className="hero__sair" onClick={sair}>
                Sair
              </button>
            </div>
          </div>

          <h1 className="hero__titulo">{titulo}</h1>

          <nav className="hero__menu" aria-label="Seções do sistema">
            {itensMenu.map((item) => (
              <NavLink
                key={item.para}
                to={item.para}
                className={({ isActive }) =>
                  isActive ? 'hero__link hero__link--ativo' : 'hero__link'
                }
              >
                {item.rotulo}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="layout__conteudo">
        <Outlet />
      </main>
    </div>
  );
}
