import { useCallback, useEffect, useState } from 'react';
import { dashboard } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { data as formatarData, moeda, paraInput, ROTULO_PAGAMENTO } from '../utils/formato.js';

/**
 * Resumo do período.
 *
 * Saiu do dashboard quando ele virou tela de ação. A cliente destacou que
 * não tem tempo de mexer no sistema: o que ela abre no meio da correria
 * precisa ser botão, não número. Os números continuam aqui, para quando
 * ela senta para olhar o resultado.
 *
 * Ela confere o caixa todo dia, mas olha o RESULTADO por semana — por
 * isso o período padrão é a semana corrente, definido no backend.
 */
/**
 * Períodos que a cliente usa de verdade.
 *
 * Ela confere o caixa todo dia, mas olha o RESULTADO por semana — e o que
 * ela quer saber é se esta semana foi melhor que a passada. Por isso a
 * comparação entre semanas está a um clique, e não escondida num filtro
 * de datas.
 */
function inicioDaSemana(deslocamentoEmSemanas = 0) {
  const d = new Date();
  const diaDaSemana = d.getDay(); // 0 = domingo
  d.setDate(d.getDate() - (diaDaSemana === 0 ? 6 : diaDaSemana - 1) + deslocamentoEmSemanas * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fimDaSemana(deslocamentoEmSemanas = 0) {
  const d = inicioDaSemana(deslocamentoEmSemanas);
  d.setDate(d.getDate() + 6);
  return d;
}

const PERIODOS = {
  semana: {
    rotulo: 'Esta semana',
    calcular: () => ({ inicio: inicioDaSemana(0), fim: fimDaSemana(0) }),
  },
  anterior: {
    rotulo: 'Semana passada',
    calcular: () => ({ inicio: inicioDaSemana(-1), fim: fimDaSemana(-1) }),
  },
  mes: {
    rotulo: 'Este mês',
    calcular: () => {
      const inicio = new Date();
      inicio.setDate(1);
      inicio.setHours(0, 0, 0, 0);
      return { inicio, fim: new Date() };
    },
  },
};

export function Resumo() {
  const [periodo, setPeriodo] = useState('semana');
  const [resumo, setResumo] = useState(null);
  const [serie, setSerie] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { inicio, fim } = PERIODOS[periodo].calcular();
      const params = { inicio: paraInput(inicio), fim: paraInput(fim) };
      const [r, s] = await Promise.all([dashboard.resumo(params), dashboard.porDia(params)]);
      setResumo(r);
      setSerie(s);
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar o resumo.'));
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => {
    carregar();
  }, [carregar]);
  // Lidos com segurança: o primeiro render acontece antes de a API responder,
  // e a troca de período zera o resumo enquanto recarrega.

  return (
    <section>
      <header className="pagina__cabecalho">
        <p className="pagina__periodo">
          {carregando || !resumo
            ? 'Carregando...'
            : `De ${formatarData(resumo.periodo.inicio)} a ${formatarData(resumo.periodo.fim)}`}
        </p>
        <nav className="seletor-periodo">
          {Object.entries(PERIODOS).map(([id, p]) => (
            <button
              key={id}
              type="button"
              className={
                periodo === id
                  ? 'seletor-periodo__item seletor-periodo__item--ativo'
                  : 'seletor-periodo__item'
              }
              onClick={() => setPeriodo(id)}
            >
              {p.rotulo}
            </button>
          ))}
        </nav>
      </header>

      {erro && <p className="alerta alerta--erro">{erro}</p>}

      {!resumo ? (
        <p className="tabela__aviso">Carregando...</p>
      ) : (
        <div className={carregando ? 'conteudo--atualizando' : undefined}>
          <div className="indicadores">
            <Indicador
              rotulo="Vendas"
              valor={moeda(resumo.vendas)}
              dica={`${resumo.quantidadeVendas} venda(s)`}
            />
            <Indicador
              rotulo="Custos do negócio"
              valor={moeda(resumo.custos)}
              dica="Ingredientes, contas, aluguel..."
            />
            <Indicador
              rotulo="Lucro"
              valor={moeda(resumo.lucro)}
              dica="Vendas menos custos"
              destaque={resumo.lucro >= 0 ? 'positivo' : 'negativo'}
            />
            <Indicador
              rotulo="Retirada pessoal"
              valor={moeda(resumo.retiradas)}
              dica="Sai do caixa, mas não é custo do negócio"
            />
          </div>

          <div className="painel-duplo">
            <article className="cartao">
              <h2 className="cartao__subtitulo">Movimento por dia</h2>
              <GraficoSemana serie={serie} />
            </article>

            <article className="cartao">
              <h2 className="cartao__subtitulo">Como receberam</h2>
              {Object.keys(resumo.vendasPorFormaPagamento).length === 0 ? (
                <p className="cartao__texto">Nenhuma venda nesta semana.</p>
              ) : (
                <ul className="lista-simples">
                  {Object.entries(resumo.vendasPorFormaPagamento).map(([forma, valor]) => (
                    <li key={forma}>
                      <span>{ROTULO_PAGAMENTO[forma] ?? forma}</span>
                      <strong>{moeda(valor)}</strong>
                    </li>
                  ))}
                </ul>
              )}

              <h2 className="cartao__subtitulo">Saldo do caixa</h2>
              <p className="cartao__texto">
                Entrou {moeda(resumo.vendas)}, saiu {moeda(resumo.saidaDeCaixa)} (custos +
                retiradas).
              </p>
              <p
                className={
                  resumo.saldoCaixa >= 0 ? 'saldo-grande' : 'saldo-grande saldo-grande--negativo'
                }
              >
                {moeda(resumo.saldoCaixa)}
              </p>
            </article>
          </div>
        </div>
      )}
    </section>
  );
}

function Indicador({ rotulo, valor, dica, destaque }) {
  return (
    <article className={destaque ? `indicador indicador--${destaque}` : 'indicador'}>
      <span className="indicador__rotulo">{rotulo}</span>
      <strong className="indicador__valor">{valor}</strong>
      <span className="indicador__dica">{dica}</span>
    </article>
  );
}

/**
 * Gráfico de barras em CSS puro.
 *
 * Decisão: não trouxe biblioteca de gráfico só para isso. São sete barras
 * — uma dependência a mais custaria mais do que entrega.
 */
function GraficoSemana({ serie }) {
  const maximo = Math.max(1, ...serie.map((d) => Math.max(d.vendas, d.despesas)));

  if (!serie.length) return <p className="cartao__texto">Sem dados na semana.</p>;

  return (
    <>
      <div className="grafico">
        {serie.map((dia) => (
          <div className="grafico__coluna" key={dia.dia}>
            <div className="grafico__barras">
              <div
                className="grafico__barra grafico__barra--venda"
                style={{ height: `${(dia.vendas / maximo) * 100}%` }}
                title={`Vendas: ${moeda(dia.vendas)}`}
              />
              <div
                className="grafico__barra grafico__barra--despesa"
                style={{ height: `${(dia.despesas / maximo) * 100}%` }}
                title={`Despesas: ${moeda(dia.despesas)}`}
              />
            </div>
            <span className="grafico__rotulo">{formatarData(dia.dia)}</span>
          </div>
        ))}
      </div>
      <div className="grafico__legenda">
        <span>
          <i className="ponto ponto--venda" /> vendas
        </span>
        <span>
          <i className="ponto ponto--despesa" /> despesas
        </span>
      </div>
    </>
  );
}
