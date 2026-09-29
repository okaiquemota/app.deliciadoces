import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal.jsx';
import { EntradaDinheiro, Texto } from '../components/Campo.jsx';
import { diaPorExtenso, diasAtras, rotuloDoDia } from '../components/Extrato.jsx';
import { IconeAtencao, IconeFechamento, IconeFiltros, IconeVisto } from '../components/Icones.jsx';
import { fechamentos } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { dinheiroParaCampo, lerDinheiro, moeda, paraInput } from '../utils/formato.js';

/**
 * Fechar dia: a conferência da gaveta.
 *
 * No fim do dia a cliente conta o dinheiro da gaveta e compara com o que o
 * sistema esperava. A tela é construída em volta desse gesto: primeiro o
 * esperado, em número grande, com a conta que chegou nele; depois o campo
 * para o que ela contou — o mesmo campo grande de valor da Entrada e da
 * Saída —, e a diferença aparece ENQUANTO ela digita, em palavras. É o
 * momento em que ela decide se procura o erro ou fecha o dia em paz.
 *
 * Só dinheiro vivo entra na conta: venda no Pix ou no cartão não passa
 * pela gaveta. As outras formas aparecem à parte, para ela não achar que
 * o sistema perdeu venda.
 *
 * No desenho do resto do sistema: título grande, o dia num chip, o bloco
 * cinza e, ao lado (embaixo, no celular), os últimos dias numa lista de
 * extrato — tocar num deles abre aquele dia.
 */
export function Fechamento() {
  const [dia, setDia] = useState(paraInput());
  const [previa, setPrevia] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [contado, setContado] = useState('');
  const [observacao, setObservacao] = useState('');
  const [atualizando, setAtualizando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [escolhendoDia, setEscolhendoDia] = useState(false);
  const [apagando, setApagando] = useState(false);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    setErro('');
    try {
      const [p, h] = await Promise.all([fechamentos.previa(dia), fechamentos.listar()]);
      setPrevia(p);
      setHistorico(h);
      // Se o dia já foi fechado, a tela abre com o que ela tinha contado.
      setContado(
        p.fechamento?.saldoConferido != null ? dinheiroParaCampo(p.fechamento.saldoConferido) : ''
      );
      setObservacao(p.fechamento?.observacao ?? '');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setAtualizando(false);
    }
  }, [dia]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const numeroContado = contado === '' ? null : lerDinheiro(contado);

  /**
   * Diferença calculada na hora, no navegador.
   *
   * Refaz a mesma conta do servidor de propósito: ela precisa ver o
   * resultado no instante em que digita, sem ida e volta de rede. O valor
   * que vale é sempre o que o servidor grava.
   */
  const diferenca = useMemo(() => {
    if (numeroContado === null || !previa || Number.isNaN(numeroContado)) return null;
    return Math.round((numeroContado - previa.saldoCalculado) * 100) / 100;
  }, [numeroContado, previa]);

  async function salvar(evento) {
    evento.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      const corpo = { saldoConferido: numeroContado, observacao: observacao.trim() || null };
      if (previa.fechamento) {
        await fechamentos.conferir(previa.fechamento.id, corpo);
        setAviso('Fechamento atualizado.');
      } else {
        await fechamentos.fechar({ ...corpo, data: dia });
        setAviso(`${rotuloDoDia(dia)} fechado.`);
      }
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  function abrirDia(novo) {
    setDia(novo);
    setAviso('');
    setEscolhendoDia(false);
    // No celular os últimos dias ficam embaixo: volta ao alto, onde o dia
    // escolhido aparece.
    document.querySelector('.app__conteudo')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <section className="pagina-lisa">
      {/* Título e dia numa fileira só no computador, como no Resumo: é a
          linha que faz a tela caber na altura, sem rolar. */}
      <div className="pagina-lisa__topo">
        <header className="cabeca">
          {/* O título da página para o leitor de tela é o `h1` da casca. */}
          <p className="cabeca__titulo" aria-hidden="true">
            Fechar dia
          </p>
          <p className="cabeca__sub">{diaPorExtenso(dia)}</p>
        </header>

        <div className="extrato__chips" role="group" aria-label="Dia">
          <button
            type="button"
            className="chip"
            aria-haspopup="dialog"
            onClick={() => setEscolhendoDia(true)}
          >
            <IconeFiltros tamanho={18} />
            <span className="so-leitor">Dia: </span>
            {rotuloDoDia(dia)}
          </button>
          {previa?.fechamento && (
            <span className="selo selo--ok">
              <IconeVisto tamanho={16} />
              Dia fechado
            </span>
          )}
        </div>
      </div>

      {erro && (
        <p className="alerta alerta--erro" role="alert">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="alerta alerta--ok" role="status">
          {aviso}
        </p>
      )}

      {!previa ? (
        <p className="extrato__vazio">Carregando...</p>
      ) : (
        <div className={atualizando ? 'fechar conteudo--atualizando' : 'fechar'}>
          <div className="fechar__principal">
            <div className="fechar__conta">
              <p className="fechar__rotulo">Deveria ter na gaveta</p>
              <p className="fechar__esperado">{moeda(previa.saldoCalculado)}</p>
              <dl className="conta-linhas">
                <div>
                  <dt>Sobrou de ontem</dt>
                  <dd>{moeda(previa.saldoInicial)}</dd>
                </div>
                <div>
                  <dt>Vendas em dinheiro</dt>
                  <dd>
                    +{'\u00a0'}
                    {moeda(previa.detalhe.vendasDinheiro)}
                  </dd>
                </div>
                <div>
                  <dt>Saídas em dinheiro</dt>
                  <dd>
                    −{'\u00a0'}
                    {moeda(previa.totalSaidas)}
                  </dd>
                </div>
              </dl>
            </div>

            {previa.detalhe.vendasOutrasFormas > 0 && (
              <p className="fechar__nota">
                Fora isso, {moeda(previa.detalhe.vendasOutrasFormas)} entraram por Pix ou cartão.
                Esse dinheiro não passa pela gaveta, então não entra nesta conta.
              </p>
            )}
            {previa.detalhe.despesasSemFormaInformada > 0 && (
              <p className="fechar__nota">
                {previa.detalhe.despesasSemFormaInformada === 1
                  ? '1 saída do dia está sem forma de pagamento e foi contada como dinheiro.'
                  : `${previa.detalhe.despesasSemFormaInformada} saídas do dia estão sem forma de pagamento e foram contadas como dinheiro.`}
              </p>
            )}

            <form className="fechar__form" onSubmit={salvar}>
              <div className="valor">
                <label className="valor__rotulo" htmlFor="campo-contado">
                  Quanto tem na gaveta
                </label>
                <span className="valor__linha">
                  <span className="valor__moeda" aria-hidden="true">
                    R$
                  </span>
                  <EntradaDinheiro
                    id="campo-contado"
                    className="valor__campo"
                    justo
                    value={contado}
                    aoMudar={setContado}
                  />
                </span>
              </div>

              {diferenca !== null && <Veredito valor={diferenca} />}

              <Texto
                rotulo="Observação"
                placeholder="Ex.: troco emprestado para a vizinha"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />

              <button className="botao botao--primario" type="submit" disabled={salvando}>
                {salvando
                  ? 'Salvando...'
                  : previa.fechamento
                    ? 'Atualizar fechamento'
                    : 'Fechar o dia'}
              </button>

              {previa.fechamento && (
                <button
                  className="botao botao--texto botao--perigo fechar__apagar"
                  type="button"
                  onClick={() => setApagando(true)}
                >
                  Apagar este fechamento
                </button>
              )}
            </form>
          </div>

          <section className="fechar__historico" aria-labelledby="titulo-ultimos-dias">
            <h2 className="bloco__titulo" id="titulo-ultimos-dias">
              Últimos dias
            </h2>
            {historico.length === 0 ? (
              <p className="extrato__vazio">Nenhum dia fechado ainda.</p>
            ) : (
              <ul className="extrato__itens">
                {historico.map((f) => (
                  <li key={f.id}>
                    <DiaFechado f={f} atual={f.data === dia} aoAbrir={() => abrirDia(f.data)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {escolhendoDia && (
        <EscolherDia dia={dia} aoFechar={() => setEscolhendoDia(false)} aoEscolher={abrirDia} />
      )}
      {apagando && previa?.fechamento && (
        <ApagarFechamento
          dia={dia}
          fechamento={previa.fechamento}
          aoFechar={() => setApagando(false)}
          aoApagar={() => {
            setApagando(false);
            setAviso('Fechamento apagado. O dia está aberto de novo.');
            carregar();
          }}
        />
      )}
    </section>
  );
}

/**
 * O veredito em palavras, não só em número.
 *
 * "Faltou R$ 10" diz o que fazer; "-10,00" precisa ser interpretado. Quem
 * usa isso às nove da noite, cansada, merece a frase pronta — com o ícone
 * e a cor do estado, mas nunca só a cor.
 */
function Veredito({ valor }) {
  if (valor === 0) {
    return (
      <p className="veredito veredito--ok">
        <IconeVisto tamanho={20} />A gaveta bate certinho com o esperado.
      </p>
    );
  }
  if (valor > 0) {
    return (
      <p className="veredito veredito--aviso">
        <IconeAtencao tamanho={20} />
        Sobrou {moeda(valor)}. Pode ser venda que não foi lançada.
      </p>
    );
  }
  return (
    <p className="veredito veredito--alerta">
      <IconeAtencao tamanho={20} />
      Faltou {moeda(Math.abs(valor))}. Confira se alguma saída não foi registrada.
    </p>
  );
}

/**
 * Um dia já fechado, como linha de extrato: o círculo diz o resultado de
 * longe (bateu, sobrou, faltou), o valor da direita diz quanto.
 */
function DiaFechado({ f, atual, aoAbrir }) {
  const dif = f.diferenca == null ? null : Number(f.diferenca);
  const estado =
    dif === null
      ? { tom: null, Icone: IconeFechamento, texto: 'em aberto', classe: 'fechamento__neutro' }
      : dif === 0
        ? { tom: 'ok', Icone: IconeVisto, texto: 'certo', classe: 'fechamento__certo' }
        : dif > 0
          ? {
              tom: 'aviso',
              Icone: IconeAtencao,
              texto: `sobrou ${moeda(dif)}`,
              classe: 'fechamento__sobra',
            }
          : {
              tom: 'alerta',
              Icone: IconeAtencao,
              texto: `faltou ${moeda(-dif)}`,
              classe: 'fechamento__falta',
            };
  const detalhe = [
    f.saldoConferido == null ? 'não contou' : `contou ${moeda(f.saldoConferido)}`,
    f.observacao,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      className={atual ? 'extrato__item extrato__item--atual' : 'extrato__item'}
      aria-current={atual ? 'date' : undefined}
      onClick={aoAbrir}
    >
      <span className={estado.tom ? `icone-aro icone-aro--${estado.tom}` : 'icone-aro'}>
        <estado.Icone tamanho={22} />
      </span>
      <span className="extrato__textos">
        <span className="extrato__titulo">{rotuloDoDia(f.data)}</span>
        <span className="extrato__detalhe">{detalhe}</span>
      </span>
      <span className="extrato__lado">
        <span className={`extrato__valor ${estado.classe}`}>{estado.texto}</span>
        <span className="extrato__hora">esperava {moeda(f.saldoCalculado)}</span>
      </span>
    </button>
  );
}

/**
 * A escolha do dia, no desenho da escolha de período do Caixa: hoje e
 * ontem a um toque, e qualquer outro dia pelo calendário.
 */
function EscolherDia({ dia, aoFechar, aoEscolher }) {
  const hoje = paraInput();
  const ontem = diasAtras(1);
  const [escolhido, setEscolhido] = useState(
    dia === hoje ? 'hoje' : dia === ontem ? 'ontem' : 'outro'
  );
  const [outro, setOutro] = useState(dia);

  const opcoes = [
    { id: 'hoje', rotulo: 'Hoje', aoTocar: () => aoEscolher(hoje) },
    { id: 'ontem', rotulo: 'Ontem', aoTocar: () => aoEscolher(ontem) },
    { id: 'outro', rotulo: 'Outro dia', aoTocar: () => setEscolhido('outro') },
  ];

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Dia" largura={440}>
      <div className="opcoes" role="group" aria-label="Dia">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            className="opcao"
            aria-pressed={escolhido === o.id}
            onClick={o.aoTocar}
          >
            {o.rotulo}
            {escolhido === o.id && <IconeVisto tamanho={20} />}
          </button>
        ))}
      </div>

      {escolhido === 'outro' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (outro) aoEscolher(outro);
          }}
        >
          <div className="extrato__datas">
            <label className="extrato__data">
              <span>Dia</span>
              <input
                type="date"
                className="campo__entrada"
                value={outro}
                max={hoje}
                onChange={(e) => setOutro(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="modal__acoes">
            <button type="submit" className="botao botao--primario botao--auto" disabled={!outro}>
              Ver este dia
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/**
 * Apagar o fechamento: a confirmação DENTRO da janela, como no Caixa — e
 * não o alerta do navegador, uma caixa de sistema diferente em cada
 * aparelho. Diz que as vendas não mudam, que é o que ela teme.
 */
function ApagarFechamento({ dia, fechamento, aoFechar, aoApagar }) {
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function apagar() {
    setOcupado(true);
    setErro('');
    try {
      await fechamentos.excluir(fechamento.id);
      aoApagar();
    } catch (e) {
      setErro(mensagemDeErro(e));
      setOcupado(false);
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Apagar este fechamento?" largura={440}>
      <div className="lancamento__alvo">
        <span className="lancamento__alvo-textos">
          <span className="lancamento__alvo-titulo">{diaPorExtenso(dia)}</span>
          <span className="lancamento__alvo-quando">
            {fechamento.saldoConferido == null
              ? 'Sem contagem'
              : `Contou ${moeda(fechamento.saldoConferido)}`}
          </span>
        </span>
      </div>
      <p className="lancamento__pergunta">
        O dia volta a ficar aberto. As vendas e as saídas dele não mudam.
      </p>
      {erro && (
        <p className="alerta alerta--erro" role="alert">
          {erro}
        </p>
      )}
      <div className="modal__acoes">
        <button type="button" className="botao botao--auto" onClick={aoFechar}>
          Voltar
        </button>
        <button
          type="button"
          className="botao botao--auto botao--perigo"
          disabled={ocupado}
          onClick={apagar}
        >
          {ocupado ? 'Apagando...' : 'Apagar'}
        </button>
      </div>
    </Modal>
  );
}
