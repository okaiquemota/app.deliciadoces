import { useCallback, useEffect, useState } from 'react';
import { Total } from '../components/Extrato.jsx';
import { dashboard } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { data as formatarData, moeda, paraInput, ROTULO_PAGAMENTO } from '../utils/formato.js';

/**
 * Resumo do período.
 *
 * Saiu do Início quando ele virou tela de ação. A cliente destacou que
 * não tem tempo de mexer no sistema: o que ela abre no meio da correria
 * precisa ser botão, não número. Os números moram aqui, para quando ela
 * senta para olhar o resultado.
 *
 * No desenho do resto do sistema: título grande, o período em chips, o
 * LUCRO como o número da tela — é a pergunta que ela traz — e, embaixo,
 * de onde ele veio: vendas, custos, retirada, o movimento de cada dia e
 * como o dinheiro entrou.
 */

/**
 * Períodos que a cliente usa de verdade.
 *
 * Ela confere o caixa todo dia, mas olha o RESULTADO por semana — e o que
 * ela quer saber é se esta semana foi melhor que a passada. Por isso a
 * semana passada está a um toque, e não escondida num filtro de datas.
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

const PERIODOS = [
  {
    id: 'semana',
    rotulo: 'Esta semana',
    calcular: () => ({ inicio: inicioDaSemana(0), fim: fimDaSemana(0) }),
  },
  {
    id: 'anterior',
    rotulo: 'Semana passada',
    calcular: () => ({ inicio: inicioDaSemana(-1), fim: fimDaSemana(-1) }),
  },
  {
    id: 'mes',
    rotulo: 'Este mês',
    calcular: () => {
      const inicio = new Date();
      inicio.setDate(1);
      inicio.setHours(0, 0, 0, 0);
      return { inicio, fim: new Date() };
    },
  },
];

export function Resumo() {
  const [periodo, setPeriodo] = useState('semana');
  const [resumo, setResumo] = useState(null);
  const [serie, setSerie] = useState([]);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setAtualizando(true);
    try {
      const { inicio, fim } = PERIODOS.find((p) => p.id === periodo).calcular();
      const params = { inicio: paraInput(inicio), fim: paraInput(fim) };
      const [r, s] = await Promise.all([dashboard.resumo(params), dashboard.porDia(params)]);
      setResumo(r);
      setSerie(s);
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar o resumo.'));
    } finally {
      setAtualizando(false);
    }
  }, [periodo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <section className="pagina-lisa">
      <header className="cabeca">
        {/* O título da página para o leitor de tela é o `h1` da casca. */}
        <p className="cabeca__titulo" aria-hidden="true">
          Resumo
        </p>
        <p className="cabeca__sub">
          {resumo
            ? `De ${formatarData(resumo.periodo.inicio)} a ${formatarData(resumo.periodo.fim)}`
            : 'Carregando...'}
        </p>
      </header>

      <div className="extrato__chips" role="group" aria-label="Período">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="chip"
            aria-pressed={periodo === p.id}
            onClick={() => setPeriodo(p.id)}
          >
            {p.rotulo}
          </button>
        ))}
      </div>

      {erro && (
        <p className="alerta alerta--erro" role="alert">
          {erro}
        </p>
      )}

      {!resumo ? (
        <p className="extrato__vazio">Carregando...</p>
      ) : (
        // Recarregando, a tela fica onde estava, apagada — sem esqueleto
        // nem salto: o número novo entra no lugar do velho.
        <div className={atualizando ? 'resumo conteudo--atualizando' : 'resumo'}>
          <div className="resumo__lucro">
            <p className="resumo__rotulo">Lucro</p>
            <p
              className={
                resumo.lucro < 0 ? 'resumo__numero resumo__numero--negativo' : 'resumo__numero'
              }
            >
              {moeda(resumo.lucro)}
            </p>
            <p className="resumo__explica">
              Vendas menos os custos do negócio. A retirada pessoal não entra na conta.
            </p>
          </div>

          <div className="extrato__resumo">
            <Total
              rotulo="Vendas"
              valor={moeda(resumo.vendas)}
              tom="entrada"
              nota={`${resumo.quantidadeVendas} ${resumo.quantidadeVendas === 1 ? 'venda' : 'vendas'}`}
            />
            <Total rotulo="Custos do negócio" valor={moeda(resumo.custos)} />
            <Total rotulo="Retirada pessoal" valor={moeda(resumo.retiradas)} />
          </div>

          <div className="resumo__grade">
            <section className="resumo__bloco" aria-labelledby="titulo-movimento">
              <div className="bloco__cabeca">
                <h2 className="bloco__titulo" id="titulo-movimento">
                  Movimento por dia
                </h2>
                <ul className="grafico__legenda" aria-label="Legenda">
                  <li>
                    <i className="grafico__chave grafico__chave--venda" aria-hidden="true" />
                    Vendas
                  </li>
                  <li>
                    <i className="grafico__chave grafico__chave--custo" aria-hidden="true" />
                    Custos
                  </li>
                </ul>
              </div>
              <GraficoDias serie={serie} />
            </section>

            <div className="resumo__lado">
              <section className="resumo__bloco" aria-labelledby="titulo-formas">
                <h2 className="bloco__titulo" id="titulo-formas">
                  Como receberam
                </h2>
                <Formas porForma={resumo.vendasPorFormaPagamento} total={resumo.vendas} />
              </section>

              <section className="resumo__bloco" aria-labelledby="titulo-caixa">
                <h2 className="bloco__titulo" id="titulo-caixa">
                  No caixa
                </h2>
                <dl className="conta-linhas">
                  <div>
                    <dt>Entrou</dt>
                    <dd>{moeda(resumo.vendas)}</dd>
                  </div>
                  <div>
                    <dt>Saiu (custos e retiradas)</dt>
                    <dd>
                      −{'\u00a0'}
                      {moeda(resumo.saidaDeCaixa)}
                    </dd>
                  </div>
                  <div className="conta-linhas__total">
                    <dt>Sobrou</dt>
                    <dd className={resumo.saldoCaixa < 0 ? 'fechamento__falta' : undefined}>
                      {moeda(resumo.saldoCaixa)}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Como o dinheiro entrou: uma linha por forma de pagamento, da maior para
 * a menor, com a fatia de cada uma numa barra. A barra é uma parte do
 * todo — o trilho é o total das vendas, no mesmo verde mais claro.
 */
function Formas({ porForma, total }) {
  const linhas = Object.entries(porForma).sort((a, b) => b[1] - a[1]);
  if (!linhas.length) return <p className="resumo__vazio">Nenhuma venda no período.</p>;

  return (
    <ul className="formas-pagamento">
      {linhas.map(([forma, valor]) => {
        const fatia = total > 0 ? valor / total : 0;
        return (
          <li key={forma} className="forma-pagamento">
            <span className="forma-pagamento__nome">{ROTULO_PAGAMENTO[forma] ?? forma}</span>
            <span className="forma-pagamento__valor">
              {moeda(valor)}
              <span className="forma-pagamento__fatia">{Math.round(fatia * 100)}%</span>
            </span>
            <span className="forma-pagamento__trilho" aria-hidden="true">
              <span
                className="forma-pagamento__barra"
                style={{ width: `${Math.max(fatia * 100, 1)}%` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------- gráfico

const DIA_DA_SEMANA = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

/** "2026-09-25" -> Date local, sem passar por UTC. */
function daChave(chave) {
  const [a, m, d] = chave.split('-').map(Number);
  return new Date(a, m - 1, d);
}

/** "seg 22": o dia da semana e o do mês, o que ela procura no eixo. */
function rotuloCurto(chave) {
  const data = daChave(chave);
  return `${DIA_DA_SEMANA.format(data).replace('.', '')} ${data.getDate()}`;
}

/**
 * Teto redondo para o eixo, com a METADE redonda também — o eixo marca o
 * teto, a metade e o zero. Com teto de R$ 25 a metade era R$ 12,50, que
 * sem centavos virava "R$ 13". Abaixo de R$ 10 só servem os pares.
 */
function tetoRedondo(valor) {
  if (valor <= 0) return 100;
  const potencia = 10 ** Math.floor(Math.log10(valor));
  const passos = potencia >= 10 ? [1, 2, 3, 4, 5, 6, 8, 10] : [2, 4, 6, 8, 10];
  return passos.find((p) => p * potencia >= valor) * potencia;
}

/** R$ sem centavos, para o eixo: "R$ 150", "R$ 1.500". */
const moedaCurta = (v) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/**
 * Colunas por dia: vendas e custos lado a lado.
 *
 * Feito em HTML e CSS, sem biblioteca — são no máximo 31 dias de duas
 * barras. As regras vêm do guia de gráficos do projeto:
 *
 * - vendas é a série que conta a história, no verde de "dinheiro
 *   entrando" do resto do sistema; custos é o contexto, em cinza (com
 *   contraste de 3,6:1 no branco, validado);
 * - barras finas (no máximo 24px), canto arredondado só na ponta, 2px de
 *   vão entre as duas do mesmo dia, e um eixo só;
 * - a grade é um fio contínuo, um tom acima do branco;
 * - passar o dedo ou o mouse (ou o foco do teclado) num dia mostra os
 *   dois valores dele — e a tabela embaixo tem todos, para quem não
 *   aponta.
 */
function GraficoDias({ serie }) {
  const [ativo, setAtivo] = useState(null);

  if (!serie.length) return <p className="resumo__vazio">Sem dados no período.</p>;

  const maior = Math.max(0, ...serie.map((d) => Math.max(d.vendas, d.despesas)));
  if (maior === 0) return <p className="resumo__vazio">Nenhuma venda nem custo no período.</p>;

  const teto = tetoRedondo(maior);
  const marcas = [teto, teto / 2, 0];
  // Com um mês, rótulo em todo dia vira borrão: um por semana, e o último.
  const denso = serie.length > 10;
  const mostraRotulo = (i) => !denso || i % 7 === 0 || i === serie.length - 1;
  const lado = (i) =>
    i < serie.length / 4 ? 'esquerda' : i >= (serie.length * 3) / 4 ? 'direita' : 'meio';

  return (
    <>
      <div className="grafico">
        <div className="grafico__eixo" aria-hidden="true">
          {marcas.map((m) => (
            <span key={m}>{moedaCurta(m)}</span>
          ))}
        </div>

        <div className="grafico__area">
          <div className="grafico__grade" aria-hidden="true">
            {marcas.map((m) => (
              <span key={m} />
            ))}
          </div>

          <div className={denso ? 'grafico__dias grafico__dias--denso' : 'grafico__dias'}>
            {serie.map((d, i) => (
              <button
                key={d.dia}
                type="button"
                className={ativo === i ? 'grafico__dia grafico__dia--ativo' : 'grafico__dia'}
                aria-label={`${rotuloCurto(d.dia)}: vendas ${moeda(d.vendas)}, custos ${moeda(d.despesas)}`}
                onPointerEnter={() => setAtivo(i)}
                onPointerLeave={() => setAtivo(null)}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
                onClick={() => setAtivo(i)}
              >
                <span className="grafico__barras">
                  <span
                    className="grafico__barra grafico__barra--venda"
                    style={{ height: `${(d.vendas / teto) * 100}%` }}
                  />
                  <span
                    className="grafico__barra grafico__barra--custo"
                    style={{ height: `${(d.despesas / teto) * 100}%` }}
                  />
                </span>
                <span className="grafico__rotulo" aria-hidden="true">
                  {mostraRotulo(i) ? rotuloCurto(d.dia) : ''}
                </span>
                {ativo === i && (
                  <span className={`grafico__dica grafico__dica--${lado(i)}`} aria-hidden="true">
                    <span className="grafico__dica-dia">{rotuloCurto(d.dia)}</span>
                    <span className="grafico__dica-linha">
                      <i className="grafico__traco grafico__traco--venda" />
                      <strong>{moeda(d.vendas)}</strong> vendas
                    </span>
                    <span className="grafico__dica-linha">
                      <i className="grafico__traco grafico__traco--custo" />
                      <strong>{moeda(d.despesas)}</strong> custos
                    </span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* A tabela é o gráfico em números: nada do gráfico depende só de
          apontar ou só de enxergar a cor. */}
      <details className="grafico__tabela">
        <summary>Ver os números de cada dia</summary>
        <table className="tabela-simples">
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col">Vendas</th>
              <th scope="col">Custos</th>
            </tr>
          </thead>
          <tbody>
            {serie.map((d) => (
              <tr key={d.dia}>
                <th scope="row">{rotuloCurto(d.dia)}</th>
                <td>{moeda(d.vendas)}</td>
                <td>{moeda(d.despesas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
