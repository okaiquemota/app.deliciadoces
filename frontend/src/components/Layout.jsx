import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Marca } from './Marca.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { estoque } from '../services/recursos.js';
import { EVENTO_ESTOQUE } from './EstoqueComum.jsx';
import {
  IconeInicio,
  IconeCaixa,
  IconeProducao,
  IconeEstoque,
  IconeKardex,
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
 * cinco itens — o máximo que cabe no iPhone SE com rótulo de uma linha;
 * com sete, cada alvo cairia para 45px. Os dois continuam a um toque,
 * como botões na tela inicial — que é onde ela cai ao abrir o sistema.
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
 * `soDesktop` não aparece na barra do celular: ali cabem cinco itens com
 * rótulo de uma linha, e os dois continuam a um toque, como botões na
 * tela inicial.
 */
const GRUPOS = [
  {
    grupo: 'No expediente',
    itens: [
      { para: '/dashboard', rotulo: 'Início', titulo: null, Icone: IconeInicio },
      { para: '/caixa', rotulo: 'Caixa', titulo: 'Caixa', Icone: IconeCaixa },
      {
        para: '/producao',
        rotulo: 'Produção',
        titulo: 'Produção',
        Icone: IconeProducao,
        contador: 'doces',
      },
      {
        para: '/estoque',
        rotulo: 'Estoque',
        titulo: 'Estoque',
        Icone: IconeEstoque,
        contador: 'material',
      },
      { para: '/kardex', rotulo: 'Kardex', titulo: 'Kardex', Icone: IconeKardex },
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
   * Os contadores de pendência vivem AQUI, e não na tela inicial.
   *
   * Antes era uma faixa de aviso na inicial: ela só via o problema se
   * estivesse naquela tela, e a faixa ocupava altura que os botões
   * queriam. Como número no item do menu, o aviso fica à vista nas seis
   * telas, custa nada de espaço, e o toque que resolve — abrir o Estoque —
   * é o próprio item onde o número aparece.
   *
   * Recarrega a cada troca de tela: é quando ela pode ter mexido no
   * estoque, e evita uma consulta em laço só para manter o número fresco.
   *
   * Um número por aba, cada um com a sua ação: na Produção, doce acabando
   * (produzir); no Estoque, ingrediente acabando ou vencendo (comprar,
   * usar primeiro). Somados num só, "3" não dizia qual das duas coisas.
   */
  const [alertas, setAlertas] = useState({ doces: 0, material: 0 });

  useEffect(() => {
    let vivo = true;
    const buscar = () =>
      estoque
        .alertas()
        .then((a) => {
          if (!vivo) return;
          setAlertas({
            doces: a.produtosBaixos?.length ?? 0,
            // Ingredientes DIFERENTES: o creme de leite que está acabando
            // e vencendo é um item pedindo atenção, não dois.
            material: new Set(
              [...(a.insumosBaixos ?? []), ...(a.validadeProxima ?? [])].map((i) => i.id)
            ).size,
          });
        })
        // Um contador que não carregou não é motivo para quebrar a casca do
        // sistema inteiro: sem número, o menu segue funcionando.
        .catch(() => {});
    buscar();
    // E de novo a cada lançamento que mexe no estoque, na mesma tela.
    window.addEventListener(EVENTO_ESTOQUE, buscar);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_ESTOQUE, buscar);
    };
  }, [pathname]);

  /**
   * O marcador do item ativo é UM elemento que desliza de um item para o
   * outro — no computador, a pastilha cinza da barra lateral; no celular,
   * o traço na borda de cima da barra. Com um marcador por item, trocar
   * de tela seria um apagar e acender; deslizando, o olho acompanha para
   * onde foi.
   *
   * A posição é medida no próprio item, e não calculada: no computador os
   * itens têm cabeçalhos de grupo entre eles, no celular dividem a largura
   * — medir serve os dois arranjos sem conta nenhuma. Sem item ativo à
   * vista (Minha conta; Fechar dia no celular), o marcador some.
   */
  const refNav = useRef(null);
  const [marca, setMarca] = useState(null);
  const [marcaPronta, setMarcaPronta] = useState(false);

  useLayoutEffect(() => {
    let vivo = true;
    const medir = () => {
      if (!vivo) return;
      const ativo = refNav.current?.querySelector('.nav__item--ativo');
      if (!ativo || !ativo.offsetWidth) return setMarca(null);
      setMarca({
        x: ativo.offsetLeft,
        y: ativo.offsetTop,
        w: ativo.offsetWidth,
        h: ativo.offsetHeight,
      });
    };
    medir();
    // A fonte do sistema chega depois do primeiro desenho e muda a altura
    // dos itens: mede de novo quando ela estiver pronta.
    document.fonts?.ready.then(medir);
    window.addEventListener('resize', medir);
    return () => {
      vivo = false;
      window.removeEventListener('resize', medir);
    };
  }, [pathname]);

  // Na primeira medida o marcador só aparece no lugar; deslizar do canto
  // da tela até o item ao abrir o sistema seria movimento sem motivo.
  useEffect(() => {
    if (!marca || marcaPronta) return undefined;
    const quadro = requestAnimationFrame(() => setMarcaPronta(true));
    return () => cancelAnimationFrame(quadro);
  }, [marca, marcaPronta]);

  const primeiroNome = usuario?.nome?.split(' ')[0] ?? '';

  const secao = SECOES.find((s) => s.para === pathname);
  const titulo = secao?.titulo ?? TITULOS_EXTRA[pathname] ?? `Olá, ${primeiroNome}`;

  const conta = (
    <NavLink to="/minha-conta" className="conta-link">
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
        <nav className="nav" aria-label="Seções do sistema" ref={refNav}>
          {marca && (
            <span
              className={marcaPronta ? 'nav__marca nav__marca--desliza' : 'nav__marca'}
              aria-hidden="true"
              style={{
                '--marca-x': `${marca.x}px`,
                '--marca-y': `${marca.y}px`,
                '--marca-w': `${marca.w}px`,
                '--marca-h': `${marca.h}px`,
              }}
            />
          )}
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
                  {contador && alertas[contador] > 0 && (
                    <span className="nav__contador">
                      {alertas[contador]}
                      <span className="so-leitor">
                        {contador === 'doces'
                          ? alertas.doces === 1
                            ? ' doce acabando'
                            : ' doces acabando'
                          : alertas.material === 1
                            ? ' item precisa de atenção'
                            : ' itens precisam de atenção'}
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
