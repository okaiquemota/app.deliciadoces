import { Fragment } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Marca } from './Marca.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import {
  IconeInicio,
  IconeCaixa,
  IconeProducao,
  IconeEstoque,
  IconeFechamento,
  IconeResumo,
  IconeSair,
} from './Icones.jsx';

/**
 * Casca das telas autenticadas.
 *
 * Três blocos, e NENHUM deles é escrito duas vezes: identidade/conta,
 * navegação e conteúdo. Quem muda o arranjo é a grade do CSS.
 *
 *   computador          celular
 *   ┌──────┬────────┐   ┌───────────────┐
 *   │ topo │        │   │     topo      │
 *   ├──────┤ conteú.│   ├───────────────┤
 *   │ nav  │        │   │    conteúdo   │
 *   └──────┴────────┘   ├───────────────┤
 *                       │      nav      │
 *                       └───────────────┘
 *
 * No computador a navegação é a coluna da esquerda; no celular ela desce
 * para uma barra colada no rodapé, onde o polegar chega sem a cliente
 * trocar a mão de posição — a diferença entre registrar uma venda de uma
 * mão só no balcão e não registrar.
 *
 * Fechamento e Resumo aparecem só no computador. No celular a barra tem
 * quatro itens: com seis, cada alvo cairia para 65px de largura com
 * rótulo de duas linhas. Eles continuam a um toque, como botões na tela
 * inicial — que é onde ela cai ao abrir o sistema.
 *
 * O título da seção existe como `h1` invisível. Na tela ele é redundante
 * (o item aceso do menu já diz onde ela está) e ocupava uma faixa inteira
 * de altura; para quem navega por leitor de tela, ele é a única forma de
 * saber que a página mudou.
 */

/**
 * O menu em dois grupos, com cabeçalho — o arranjo de barra lateral do
 * macOS. Não é enfeite: separa o que ela toca durante o expediente do que
 * ela abre quando senta para fechar a conta, e sem essa divisão os seis
 * itens viram uma lista sem ordem aparente.
 *
 * `soDesktop` não aparece na barra do celular. Com seis itens ali cada
 * alvo cairia para 65px de largura com rótulo de duas linhas; os dois
 * continuam a um toque, como botões na tela inicial.
 */
const GRUPOS = [
  {
    grupo: 'No expediente',
    itens: [
      { para: '/dashboard', rotulo: 'Início', titulo: null, Icone: IconeInicio },
      { para: '/caixa', rotulo: 'Caixa', titulo: 'Caixa', Icone: IconeCaixa },
      { para: '/producao', rotulo: 'Produção', titulo: 'Produção', Icone: IconeProducao },
      { para: '/estoque', rotulo: 'Estoque', titulo: 'Estoque', Icone: IconeEstoque },
    ],
  },
  {
    grupo: 'Fim do dia',
    itens: [
      {
        para: '/fechamento',
        rotulo: 'Fechar dia',
        titulo: 'Fechamento de caixa',
        Icone: IconeFechamento,
        soDesktop: true,
      },
      { para: '/resumo', rotulo: 'Resumo', titulo: 'Resumo', Icone: IconeResumo, soDesktop: true },
    ],
  },
];

const SECOES = GRUPOS.flatMap((g) => g.itens);

const TITULOS_EXTRA = { '/minha-conta': 'Minha conta' };

export function Layout() {
  const { usuario, sair } = useAuth();
  const { pathname } = useLocation();

  const primeiroNome = usuario?.nome?.split(' ')[0] ?? '';
  const inicial = (usuario?.nome?.trim()?.[0] ?? '?').toUpperCase();

  const secao = SECOES.find((s) => s.para === pathname);
  const titulo = secao?.titulo ?? TITULOS_EXTRA[pathname] ?? `Olá, ${primeiroNome}`;

  const conta = (
    <NavLink to="/minha-conta" className="conta-link">
      <span className="conta-link__inicial" aria-hidden="true">
        {inicial}
      </span>
      <span className="conta-link__nome">{usuario?.nome}</span>
    </NavLink>
  );

  const botaoSair = (
    <button type="button" className="app__sair" onClick={sair} aria-label="Sair do sistema">
      <IconeSair tamanho={18} />
    </button>
  );

  return (
    <div className="app">
      {/* No computador este bloco é o topo da coluna da esquerda, em duas
          linhas; no celular ele vira a barra do topo, em uma linha só. */}
      <div className="app__topo">
        <Marca />
        <span className="app__conta">
          {conta}
          {botaoSair}
        </span>
      </div>

      <div className="app__lado">
        <nav className="nav" aria-label="Seções do sistema">
          {GRUPOS.map(({ grupo, itens }) => (
            <Fragment key={grupo}>
              <span className="nav__grupo" aria-hidden="true">
                {grupo}
              </span>
              {itens.map(({ para, rotulo, Icone, soDesktop }) => (
                <NavLink
                  key={para}
                  to={para}
                  className={({ isActive }) =>
                    [
                      'nav__item',
                      isActive ? 'nav__item--ativo' : '',
                      soDesktop ? 'nav__item--so-desktop' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                  }
                >
                  <Icone tamanho={20} />
                  <span className="nav__rotulo">{rotulo}</span>
                </NavLink>
              ))}
            </Fragment>
          ))}
        </nav>

        <span className="app__versao">Delícia Doces · v1.0</span>
      </div>

      <div className="app__principal">
        <h1 className="so-leitor">{titulo}</h1>
        <main className="app__conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
