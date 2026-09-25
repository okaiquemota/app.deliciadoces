import { Fragment, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Marca } from './Marca.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { estoque } from '../services/recursos.js';
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
      {
        para: '/estoque',
        rotulo: 'Estoque',
        titulo: 'Estoque',
        Icone: IconeEstoque,
        contador: true,
      },
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

  /**
   * O contador de estoque vive AQUI, e não na tela inicial.
   *
   * Antes era uma faixa de aviso na inicial: ela só via o problema se
   * estivesse naquela tela, e a faixa ocupava altura que os botões
   * queriam. Como número no item do menu, o aviso fica à vista nas seis
   * telas, custa nada de espaço, e o toque que resolve — abrir o Estoque —
   * é o próprio item onde o número aparece.
   *
   * Recarrega a cada troca de tela: é quando ela pode ter mexido no
   * estoque, e evita uma consulta em laço só para manter o número fresco.
   */
  const [alertas, setAlertas] = useState(0);

  useEffect(() => {
    let vivo = true;
    estoque
      .alertas()
      .then((a) => {
        if (!vivo) return;
        const total =
          (a.insumosBaixos?.length ?? 0) +
          (a.produtosBaixos?.length ?? 0) +
          (a.validadeProxima?.length ?? 0);
        setAlertas(total);
      })
      // Um contador que não carregou não é motivo para quebrar a casca do
      // sistema inteiro: sem número, o menu segue funcionando.
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [pathname]);

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
      {/* `header` e não `div`: é o marco de cabeçalho da página, e sem ele
          a marca e a conta ficavam fora de qualquer marco — conteúdo que
          um leitor de tela não alcança pela navegação por regiões. */}
      <header className="app__topo">
        <Marca />
        <span className="app__conta">
          {conta}
          {botaoSair}
        </span>
      </header>

      <div className="app__lado">
        <nav className="nav" aria-label="Seções do sistema">
          {GRUPOS.map(({ grupo, itens }) => (
            <Fragment key={grupo}>
              <span className="nav__grupo" aria-hidden="true">
                {grupo}
              </span>
              {itens.map(({ para, rotulo, Icone, soDesktop, contador }) => (
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
                  {contador && alertas > 0 && (
                    <span className="nav__contador">
                      {alertas}
                      <span className="so-leitor">
                        {alertas === 1 ? ' item precisa de atenção' : ' itens precisam de atenção'}
                      </span>
                    </span>
                  )}
                </NavLink>
              ))}
            </Fragment>
          ))}
        </nav>

        {/* `footer` com papel explícito: aninhado num `div`, o elemento
            sozinho não vira marco, e a linha da versão ficava como o único
            pedaço da tela fora de qualquer região. */}
        <footer className="app__versao" role="contentinfo">
          Delícia Doces · v1.0
        </footer>
      </div>

      <div className="app__principal">
        <main className="app__conteudo">
          {/* O título fica DENTRO do `main`: fora dele era conteúdo sem
              marco, e é justamente por ele que quem usa leitor de tela
              percebe que a página mudou. */}
          <h1 className="so-leitor">{titulo}</h1>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
