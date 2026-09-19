import { useCallback, useEffect, useMemo, useState } from 'react';
import { fechamentos } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { Tabela } from '../components/Tabela.jsx';
import { moeda, paraInput, data as formatarData } from '../utils/formato.js';

/**
 * Fechamento diário de caixa.
 *
 * No fim do dia a cliente conta o dinheiro da gaveta e compara com o que o
 * sistema esperava. A tela é construída em volta desse gesto: primeiro
 * mostra o esperado, depois pede o contado, e a diferença aparece ENQUANTO
 * ela digita — não só depois de salvar. É o momento em que ela decide se
 * procura o erro ou fecha o dia em paz.
 *
 * Só dinheiro vivo entra na conta: venda no Pix ou no cartão não passa
 * pela gaveta. As outras formas aparecem à parte, para ela não achar que
 * o sistema perdeu venda.
 */
export function Fechamento() {
  const [dia, setDia] = useState(paraInput());
  const [previa, setPrevia] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [contado, setContado] = useState('');
  const [observacao, setObservacao] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const [p, h] = await Promise.all([fechamentos.previa(dia), fechamentos.listar()]);
      setPrevia(p);
      setHistorico(h);
      // Se o dia já foi fechado, a tela abre com o que ela tinha contado.
      setContado(
        p.fechamento?.saldoConferido != null ? String(Number(p.fechamento.saldoConferido)) : ''
      );
      setObservacao(p.fechamento?.observacao ?? '');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }, [dia]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /**
   * Diferença calculada na hora, no navegador.
   *
   * Refaz a mesma conta do servidor de propósito: ela precisa ver o
   * resultado no instante em que digita, sem ida e volta de rede. O valor
   * que vale é sempre o que o servidor grava.
   */
  const diferenca = useMemo(() => {
    if (contado === '' || !previa) return null;
    const n = Number(contado.replace(',', '.'));
    if (Number.isNaN(n)) return null;
    return Math.round((n - previa.saldoCalculado) * 100) / 100;
  }, [contado, previa]);

  async function salvar(evento) {
    evento.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      const corpo = {
        saldoConferido: contado === '' ? null : Number(contado.replace(',', '.')),
        observacao: observacao || null,
      };
      if (previa.fechamento) {
        await fechamentos.conferir(previa.fechamento.id, corpo);
      } else {
        await fechamentos.fechar({ ...corpo, data: dia });
      }
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function reabrir() {
    if (!previa?.fechamento) return;
    if (!window.confirm('Apagar o fechamento deste dia? O movimento das vendas não muda.')) return;
    try {
      await fechamentos.excluir(previa.fechamento.id);
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  const colunas = [
    { chave: 'data', titulo: 'Dia', render: (f) => formatarData(f.data) },
    {
      chave: 'saldoCalculado',
      titulo: 'Esperado',
      alinhar: 'right',
      render: (f) => moeda(f.saldoCalculado),
    },
    {
      chave: 'saldoConferido',
      titulo: 'Contado',
      alinhar: 'right',
      render: (f) => (f.saldoConferido == null ? '—' : moeda(f.saldoConferido)),
    },
    {
      chave: 'diferenca',
      titulo: 'Diferença',
      alinhar: 'right',
      render: (f) =>
        f.diferenca == null ? (
          <span className="fechamento__neutro">em aberto</span>
        ) : (
          <SinalDeDiferenca valor={Number(f.diferenca)} />
        ),
    },
    { chave: 'observacao', titulo: 'Observação', render: (f) => f.observacao || '—' },
  ];

  return (
    <section>
      <div className="pagina__cabecalho">
        <div>
          <h1 className="pagina__titulo">Fechamento de caixa</h1>
          <p className="pagina__texto">
            Conte o dinheiro da gaveta e compare com o que o sistema esperava.
          </p>
        </div>

        <label className="filtro-periodo">
          Dia
          <input
            className="campo__entrada"
            type="date"
            value={dia}
            max={paraInput()}
            onChange={(e) => setDia(e.target.value)}
          />
        </label>
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}

      {carregando && <p className="tabela__aviso">Carregando...</p>}

      {!carregando && previa && (
        <>
          <div className="painel-duplo">
            <div className="cartao">
              <h2 className="cartao__subtitulo">O que deveria estar na gaveta</h2>

              <ul className="conta">
                <LinhaConta rotulo="Sobrou de ontem" valor={previa.saldoInicial} />
                <LinhaConta
                  rotulo="Vendas em dinheiro"
                  valor={previa.detalhe.vendasDinheiro}
                  sinal="+"
                />
                <LinhaConta rotulo="Saídas em dinheiro" valor={-previa.totalSaidas} sinal="-" />
                <li className="conta__total">
                  <span>Esperado</span>
                  <strong>{moeda(previa.saldoCalculado)}</strong>
                </li>
              </ul>

              {previa.detalhe.vendasOutrasFormas > 0 && (
                <p className="cartao__aviso">
                  Fora isso, {moeda(previa.detalhe.vendasOutrasFormas)} entraram por Pix ou cartão.
                  Esse dinheiro não passa pela gaveta, então não entra nesta conta.
                </p>
              )}

              {previa.detalhe.despesasSemFormaInformada > 0 && (
                <p className="cartao__aviso">
                  {previa.detalhe.despesasSemFormaInformada === 1
                    ? '1 despesa do dia está sem forma de pagamento e foi contada como dinheiro.'
                    : `${previa.detalhe.despesasSemFormaInformada} despesas do dia estão sem forma de pagamento e foram contadas como dinheiro.`}
                </p>
              )}
            </div>

            <form className="cartao" onSubmit={salvar}>
              <h2 className="cartao__subtitulo">O que você contou</h2>

              <label className="campo">
                <span className="campo__rotulo">Dinheiro na gaveta</span>
                <input
                  className="campo__entrada"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={contado}
                  onChange={(e) => setContado(e.target.value)}
                />
              </label>

              {diferenca !== null && <Veredito valor={diferenca} />}

              <label className="campo">
                <span className="campo__rotulo">Observação</span>
                <input
                  className="campo__entrada"
                  type="text"
                  placeholder="Ex.: troco emprestado para a vizinha"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </label>

              <button className="botao botao--primario" type="submit" disabled={salvando}>
                {salvando
                  ? 'Salvando...'
                  : previa.fechamento
                    ? 'Atualizar fechamento'
                    : 'Fechar o dia'}
              </button>

              {previa.fechamento && (
                <button
                  className="botao botao--texto botao--perigo"
                  type="button"
                  onClick={reabrir}
                >
                  Apagar este fechamento
                </button>
              )}
            </form>
          </div>

          <h2 className="cartao__subtitulo">Últimos dias</h2>
          <Tabela colunas={colunas} dados={historico} vazio="Nenhum dia fechado ainda." />
        </>
      )}
    </section>
  );
}

function LinhaConta({ rotulo, valor, sinal }) {
  return (
    <li className="conta__linha">
      <span>{rotulo}</span>
      <span>
        {sinal && <span className="conta__sinal">{sinal}</span>}
        {moeda(Math.abs(valor))}
      </span>
    </li>
  );
}

function SinalDeDiferenca({ valor }) {
  if (valor === 0) return <span className="fechamento__certo">certo</span>;
  const classe = valor > 0 ? 'fechamento__sobra' : 'fechamento__falta';
  return (
    <span className={classe}>
      {valor > 0 ? '+' : '-'}
      {moeda(Math.abs(valor))}
    </span>
  );
}

/**
 * O veredito em palavras, não só em número.
 *
 * "Faltou R$ 10" diz o que fazer; "-10,00" precisa ser interpretado. Quem
 * usa isso às nove da noite, cansada, merece a frase pronta.
 */
function Veredito({ valor }) {
  if (valor === 0) {
    return <p className="alerta alerta--ok">A gaveta bate certinho com o esperado.</p>;
  }
  if (valor > 0) {
    return (
      <p className="alerta alerta--atencao">
        Sobrou {moeda(valor)} na gaveta. Pode ser venda que não foi lançada.
      </p>
    );
  }
  return (
    <p className="alerta alerta--erro">
      Faltou {moeda(Math.abs(valor))}. Confira se alguma saída não foi registrada.
    </p>
  );
}
