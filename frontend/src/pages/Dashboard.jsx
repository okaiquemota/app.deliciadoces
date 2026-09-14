import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { dashboard } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { data as formatarData, moeda, quantidade, ROTULO_PAGAMENTO } from '../utils/formato.js';

/**
 * Dashboard.
 *
 * A cliente confere o caixa todo dia, mas olha o RESULTADO por semana —
 * por isso o período padrão é a semana corrente, definido no backend.
 */
export function Dashboard() {
  const { usuario } = useAuth();
  const [resumo, setResumo] = useState(null);
  const [serie, setSerie] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [r, s] = await Promise.all([dashboard.resumo(), dashboard.porDia()]);
      setResumo(r);
      setSerie(s);
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar o resumo.'));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (carregando) return <p className="tabela__aviso">Carregando...</p>;
  if (erro) return <p className="alerta alerta--erro">{erro}</p>;
  if (!resumo) return null;

  const alertas = resumo.alertas.detalhe;
  const temAlerta =
    resumo.alertas.insumosBaixos + resumo.alertas.produtosBaixos + resumo.alertas.validadeProxima >
    0;

  return (
    <section>
      <h1 className="pagina__titulo">Olá, {usuario?.nome?.split(' ')[0]} 👋</h1>
      <p className="pagina__texto">
        Semana de {formatarData(resumo.periodo.inicio)} a {formatarData(resumo.periodo.fim)}
      </p>

      <div className="indicadores">
        <Indicador rotulo="Vendas da semana" valor={moeda(resumo.vendas)} dica={`${resumo.quantidadeVendas} venda(s)`} />
        <Indicador rotulo="Custos do negócio" valor={moeda(resumo.custos)} dica="Ingredientes, contas, aluguel..." />
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
            Entrou {moeda(resumo.vendas)}, saiu {moeda(resumo.saidaDeCaixa)} (custos + retiradas).
          </p>
          <p className={resumo.saldoCaixa >= 0 ? 'saldo-grande' : 'saldo-grande saldo-grande--negativo'}>
            {moeda(resumo.saldoCaixa)}
          </p>
        </article>
      </div>

      {temAlerta && (
        <article className="cartao cartao--alerta">
          <h2 className="cartao__subtitulo">⚠️ Precisa de atenção</h2>
          <ul className="lista-simples">
            {alertas.insumosBaixos.map((i) => (
              <li key={i.id}>
                <span>{i.nome} está acabando</span>
                <strong>{quantidade(i.quantidadeAtual, i.unidade)}</strong>
              </li>
            ))}
            {alertas.produtosBaixos.map((p) => (
              <li key={p.id}>
                <span>{p.nome} está acabando</span>
                <strong>{quantidade(p.quantidadeAtual, p.unidade)}</strong>
              </li>
            ))}
            {alertas.validadeProxima.map((m) => (
              <li key={m.id}>
                <span>{m.insumo?.nome} vence em breve</span>
                <strong>{formatarData(m.validade)}</strong>
              </li>
            ))}
          </ul>
        </article>
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
        <span><i className="ponto ponto--venda" /> vendas</span>
        <span><i className="ponto ponto--despesa" /> despesas</span>
      </div>
    </>
  );
}
