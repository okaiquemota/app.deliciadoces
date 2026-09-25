import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal.jsx';
import { Linha, Selecao, Texto } from '../components/Campo.jsx';
import {
  IconeVenda,
  IconeEntrada,
  IconeSaida,
  IconeRetirada,
  IconeSeta,
} from '../components/Icones.jsx';
import { despesas, produtos, vendas } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { moeda, paraInput, quantidade, ROTULO_PAGAMENTO } from '../utils/formato.js';

/**
 * Caixa: o extrato do dinheiro, no desenho do extrato de banco.
 *
 * Lançar não é mais aqui — venda, entrada, saída e retirada nascem nos
 * botões da tela inicial. Esta tela existe para CONFERIR e CORRIGIR: o
 * que entrou e saiu, em que dia, e consertar o que foi digitado errado.
 *
 * Por isso uma lista só, e não abas de Vendas e Despesas. A pergunta que
 * ela faz aqui é "o que aconteceu com o meu dinheiro", e a resposta
 * separada em duas abas obrigava a juntar as duas de cabeça. Agrupada por
 * dia, com o total de cada dia, é a leitura que qualquer extrato ensinou.
 *
 * Os filtros são três, e de toque: período, tipo e uma busca. A busca
 * cobre doce, descrição, cliente, categoria e forma de pagamento — um
 * campo só em vez de quatro menus.
 */

const TIPOS = {
  venda: { rotulo: 'Venda', Icone: IconeVenda, sinal: 1 },
  entrada: { rotulo: 'Entrada avulsa', Icone: IconeEntrada, sinal: 1 },
  saida: { rotulo: 'Saída', Icone: IconeSaida, sinal: -1 },
  retirada: { rotulo: 'Retirada pessoal', Icone: IconeRetirada, sinal: -1 },
};

const FORMA_CURTA = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  CARTAO_DEBITO: 'Débito',
  CARTAO_CREDITO: 'Crédito',
};

const FORMAS = Object.entries(ROTULO_PAGAMENTO).map(([valor, rotulo]) => ({ valor, rotulo }));

const PERIODOS = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7dias', rotulo: '7 dias' },
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'datas', rotulo: 'Datas' },
];

const FILTROS_TIPO = [
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'entradas', rotulo: 'Entradas' },
  { id: 'saidas', rotulo: 'Saídas' },
];

/**
 * Teto por listagem. O padrão do servidor é 200, e "Este mês" numa
 * confeitaria com dez vendas por dia passa disso: a lista seria cortada
 * sem aviso e o total do mês sairia errado. Se mesmo assim bater no teto,
 * a tela avisa.
 */
const LIMITE = 1000;

// ------------------------------------------------------------- datas

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const DIA_LONGO = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** "2026-09-25" -> Date local, sem passar por UTC. */
function daChave(chave) {
  const [a, m, d] = chave.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function diasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return paraInput(d);
}

/** "Hoje", "Ontem", ou "Quinta-feira, 24 de setembro" (+ ano, se outro). */
function rotuloDoDia(chave) {
  if (chave === paraInput()) return 'Hoje';
  if (chave === diasAtras(1)) return 'Ontem';
  const data = daChave(chave);
  const ano = data.getFullYear() !== new Date().getFullYear() ? ` de ${data.getFullYear()}` : '';
  return maiuscula(DIA_LONGO.format(data)) + ano;
}

function intervalo(periodo, datas) {
  if (periodo === 'hoje') return { inicio: paraInput(), fim: paraInput() };
  if (periodo === '7dias') return { inicio: diasAtras(6), fim: paraInput() };
  if (periodo === 'mes') {
    const primeiro = new Date();
    primeiro.setDate(1);
    return { inicio: paraInput(primeiro), fim: paraInput() };
  }
  return datas;
}

// ------------------------------------------------------ lançamentos

/**
 * Venda e despesa viram o mesmo formato de linha. É o que deixa a lista
 * ser uma só: ordenar, agrupar, somar e buscar sem perguntar de onde veio.
 */
function daVenda(v) {
  const avulsa = v.itens.length === 0;
  return {
    chave: `v-${v.id}`,
    origem: 'venda',
    tipo: avulsa ? 'entrada' : 'venda',
    registro: v,
    data: new Date(v.data),
    valor: Number(v.total),
    titulo: avulsa
      ? v.observacao || 'Entrada avulsa'
      : v.itens.map((i) => `${quantidade(i.quantidade)}× ${i.produto?.nome ?? ''}`).join(', '),
    forma: v.formaPagamento,
    categoria: null,
    cancelada: v.cancelada,
  };
}

function daDespesa(d) {
  return {
    chave: `d-${d.id}`,
    origem: 'despesa',
    tipo: d.categoria.tipo === 'RETIRADA_PESSOAL' ? 'retirada' : 'saida',
    registro: d,
    data: new Date(d.data),
    valor: Number(d.valor),
    titulo: d.descricao,
    forma: d.formaPagamento,
    categoria: d.categoria.nome,
    cancelada: false,
  };
}

/** "Saída · Diversos · Pix · 14:32" — a categoria some quando repete o tipo. */
function subtitulo(l) {
  const tipo = TIPOS[l.tipo].rotulo;
  return [
    l.cancelada ? 'Cancelada' : tipo,
    l.categoria && l.categoria !== tipo ? l.categoria : null,
    FORMA_CURTA[l.forma],
    HORA.format(l.data),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Minúsculas e sem acento: "credito" acha "Crédito". */
const normalizar = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function textoDeBusca(l) {
  const r = l.registro;
  return normalizar(
    [
      l.titulo,
      TIPOS[l.tipo].rotulo,
      l.categoria,
      FORMA_CURTA[l.forma],
      ROTULO_PAGAMENTO[l.forma],
      r.clienteNome,
      r.observacao,
    ].join(' ')
  );
}

/** "+R$ 27,00" ou "−R$ 140,00", com o sinal de menos tipográfico. */
const comSinal = (sinal, valor) => `${sinal > 0 ? '+' : '−'}${moeda(valor)}`;

// ============================================================ página

export function Caixa() {
  const [periodo, setPeriodo] = useState('7dias');
  const [datas, setDatas] = useState(() => intervalo('mes'));
  const [tipo, setTipo] = useState('tudo');
  const [busca, setBusca] = useState('');

  const [lancamentos, setLancamentos] = useState(null);
  const [cortado, setCortado] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [aberto, setAberto] = useState(null);

  const faixa = useMemo(() => intervalo(periodo, datas), [periodo, datas]);
  const faixaInvalida = faixa.inicio && faixa.fim && faixa.inicio > faixa.fim;

  const carregar = useCallback(async () => {
    if (!faixa.inicio || !faixa.fim || faixa.inicio > faixa.fim) return;
    setAtualizando(true);
    try {
      const [v, d] = await Promise.all([
        vendas.listar({ ...faixa, incluirCanceladas: true, limite: LIMITE }),
        despesas.listar({ ...faixa, limite: LIMITE }),
      ]);
      setLancamentos([...v.map(daVenda), ...d.map(daDespesa)].sort((a, b) => b.data - a.data));
      setCortado(v.length >= LIMITE || d.length >= LIMITE);
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar o caixa.'));
    } finally {
      setAtualizando(false);
    }
  }, [faixa]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const visiveis = useMemo(() => {
    if (!lancamentos) return [];
    const termo = normalizar(busca.trim());
    return lancamentos.filter((l) => {
      if (tipo === 'entradas' && TIPOS[l.tipo].sinal < 0) return false;
      if (tipo === 'saidas' && TIPOS[l.tipo].sinal > 0) return false;
      return !termo || textoDeBusca(l).includes(termo);
    });
  }, [lancamentos, tipo, busca]);

  // Cancelada fica na lista, apagada, mas fora de toda soma.
  const totais = useMemo(() => {
    let entrou = 0;
    let saiu = 0;
    for (const l of visiveis) {
      if (l.cancelada) continue;
      if (TIPOS[l.tipo].sinal > 0) entrou += l.valor;
      else saiu += l.valor;
    }
    return { entrou, saiu, saldo: entrou - saiu };
  }, [visiveis]);

  const dias = useMemo(() => {
    const grupos = new Map();
    for (const l of visiveis) {
      const chave = paraInput(l.data);
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(l);
    }
    return [...grupos].map(([chave, itens]) => ({
      chave,
      itens,
      saldo: itens
        .filter((l) => !l.cancelada)
        .reduce((s, l) => s + TIPOS[l.tipo].sinal * l.valor, 0),
    }));
  }, [visiveis]);

  function aoMudar(mensagem) {
    setAberto(null);
    setAviso(mensagem);
    carregar();
  }

  return (
    <section className="extrato">
      <div className="extrato__filtros">
        <Segmentado
          rotulo="Período"
          opcoes={PERIODOS}
          valor={periodo}
          aoTrocar={(id) => {
            setPeriodo(id);
            setAviso('');
          }}
        />
        <div className="extrato__filtros-linha">
          <Segmentado rotulo="Tipo" opcoes={FILTROS_TIPO} valor={tipo} aoTrocar={setTipo} />
          <input
            type="search"
            className="campo__entrada extrato__busca"
            placeholder="Buscar"
            aria-label="Buscar por doce, descrição, cliente, categoria ou forma de pagamento"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {periodo === 'datas' && (
        <div className="extrato__datas">
          <label className="extrato__data">
            <span>De</span>
            <input
              type="date"
              className="campo__entrada"
              value={datas.inicio}
              max={paraInput()}
              onChange={(e) => setDatas((d) => ({ ...d, inicio: e.target.value }))}
            />
          </label>
          <label className="extrato__data">
            <span>Até</span>
            <input
              type="date"
              className="campo__entrada"
              value={datas.fim}
              max={paraInput()}
              onChange={(e) => setDatas((d) => ({ ...d, fim: e.target.value }))}
            />
          </label>
        </div>
      )}

      {faixaInvalida && (
        <p className="alerta alerta--erro" role="alert">
          A data inicial é depois da final.
        </p>
      )}
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

      <div className="extrato__resumo">
        <div className="extrato__total">
          <span className="extrato__total-rotulo">Entrou</span>
          <span className="extrato__total-valor extrato__total-valor--entrada">
            {moeda(totais.entrou)}
          </span>
        </div>
        <div className="extrato__total">
          <span className="extrato__total-rotulo">Saiu</span>
          <span className="extrato__total-valor">{moeda(totais.saiu)}</span>
        </div>
        <div className="extrato__total">
          <span className="extrato__total-rotulo">Saldo</span>
          <span
            className={
              totais.saldo < 0
                ? 'extrato__total-valor extrato__total-valor--negativo'
                : 'extrato__total-valor'
            }
          >
            {totais.saldo < 0 ? comSinal(-1, -totais.saldo) : moeda(totais.saldo)}
          </span>
        </div>
      </div>

      <div className={atualizando ? 'extrato__lista conteudo--atualizando' : 'extrato__lista'}>
        {lancamentos === null ? (
          <p className="extrato__vazio">Carregando...</p>
        ) : dias.length === 0 ? (
          <p className="extrato__vazio">
            {busca.trim()
              ? `Nada encontrado para “${busca.trim()}”.`
              : 'Nada lançado neste período.'}
          </p>
        ) : (
          dias.map((dia) => (
            // Sem nome acessível de propósito: nomeada, cada seção vira um
            // marco de navegação, e uma semana seriam sete no meio dos do app.
            // O título do dia já é cabeçalho — é por ele que se pula.
            <section key={dia.chave} className="extrato__dia">
              <h2 className="extrato__dia-titulo">
                <span>{rotuloDoDia(dia.chave)}</span>
                <span className="extrato__dia-saldo">
                  {dia.saldo === 0 ? moeda(0) : comSinal(Math.sign(dia.saldo), Math.abs(dia.saldo))}
                </span>
              </h2>
              <ul className="extrato__itens">
                {dia.itens.map((l) => (
                  <li key={l.chave}>
                    <Lancamento l={l} aoAbrir={() => setAberto(l)} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        {cortado && (
          <p className="extrato__vazio">
            Mostrando os {LIMITE} lançamentos mais recentes do período.
          </p>
        )}
      </div>

      {aberto && <Detalhe l={aberto} aoFechar={() => setAberto(null)} aoMudar={aoMudar} />}
    </section>
  );
}

/**
 * Controle segmentado, o mesmo do Resumo. `aria-pressed` diz a quem usa
 * leitor de tela qual opção está ligada — a pastilha branca só diz a quem
 * vê.
 */
function Segmentado({ rotulo, opcoes, valor, aoTrocar }) {
  return (
    <div className="seletor-periodo" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={valor === o.id}
          className={
            valor === o.id
              ? 'seletor-periodo__item seletor-periodo__item--ativo'
              : 'seletor-periodo__item'
          }
          onClick={() => aoTrocar(o.id)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/** Uma linha do extrato: ícone, o que foi, detalhe, valor com sinal. */
function Lancamento({ l, aoAbrir }) {
  const { Icone, sinal } = TIPOS[l.tipo];
  return (
    <button
      type="button"
      className={l.cancelada ? 'extrato__item extrato__item--cancelado' : 'extrato__item'}
      onClick={aoAbrir}
    >
      <span className="extrato__icone">
        <Icone tamanho={20} />
      </span>
      <span className="extrato__textos">
        <span className="extrato__titulo">{l.titulo}</span>
        <span className="extrato__detalhe">{subtitulo(l)}</span>
      </span>
      <span className={sinal > 0 ? 'extrato__valor extrato__valor--entrada' : 'extrato__valor'}>
        {comSinal(sinal, l.valor)}
      </span>
      <span className="extrato__seta">
        <IconeSeta tamanho={16} />
      </span>
    </button>
  );
}

// ========================================================== detalhe

/**
 * Detalhe de um lançamento, com editar e excluir.
 *
 * A exclusão pede confirmação DENTRO da janela, e não com o alerta do
 * navegador: aquele é uma caixa cinza de sistema, diferente em cada
 * aparelho, que tira ela do desenho do app justamente no momento em que
 * precisa ler com atenção.
 *
 * Venda excluída não some: é cancelada, o estoque volta, e aqui ela pode
 * ser restaurada.
 */
function Detalhe({ l, aoFechar, aoMudar }) {
  const [modo, setModo] = useState('ver');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const { rotulo, sinal } = TIPOS[l.tipo];
  const r = l.registro;
  const ehVenda = l.origem === 'venda';

  async function executar(acao, mensagem) {
    setOcupado(true);
    setErro('');
    try {
      await acao();
      aoMudar(mensagem);
    } catch (e) {
      setErro(mensagemDeErro(e));
      setOcupado(false);
    }
  }

  if (modo === 'editar') {
    const Formulario =
      l.tipo === 'venda' ? EditarVenda : l.tipo === 'entrada' ? EditarAvulsa : EditarDespesa;
    return (
      <Modal aberto aoFechar={aoFechar} titulo={`Editar ${rotulo.toLowerCase()}`} largura={560}>
        <Formulario registro={r} aoVoltar={() => setModo('ver')} aoSalvar={aoMudar} />
      </Modal>
    );
  }

  if (modo === 'excluir') {
    return (
      <Modal aberto aoFechar={aoFechar} titulo={`Excluir ${rotulo.toLowerCase()}?`} largura={440}>
        {/* O que vai ser apagado, à vista: numa semana de vendas parecidas,
            é aqui que ela confere que tocou na linha certa. */}
        <div className="lancamento__alvo">
          <span className="lancamento__alvo-textos">
            <span className="lancamento__alvo-titulo">{l.titulo}</span>
            <span className="lancamento__alvo-quando">
              {maiuscula(DIA_LONGO.format(l.data))}, às {HORA.format(l.data)}
            </span>
          </span>
          <strong className="lancamento__alvo-valor">{comSinal(sinal, l.valor)}</strong>
        </div>
        <p className="lancamento__pergunta">
          {l.tipo === 'venda'
            ? 'Ela sai das contas e o estoque dos doces volta. Dá para restaurar depois.'
            : ehVenda
              ? 'Ela sai das contas. Dá para restaurar depois.'
              : 'Ela é apagada de vez.'}
        </p>
        {erro && (
          <p className="alerta alerta--erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal__acoes">
          <button type="button" className="botao botao--auto" onClick={() => setModo('ver')}>
            Voltar
          </button>
          <button
            type="button"
            className="botao botao--auto botao--perigo"
            disabled={ocupado}
            onClick={() =>
              executar(
                () => (ehVenda ? vendas.cancelar(r.id) : despesas.excluir(r.id)),
                `${rotulo} excluída.`
              )
            }
          >
            {ocupado ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </Modal>
    );
  }

  const comOQue = ehVenda ? r.observacao : r.descricao;

  return (
    <Modal aberto aoFechar={aoFechar} titulo={rotulo} largura={480}>
      <div className="lancamento">
        <p
          className={
            sinal > 0 ? 'lancamento__valor lancamento__valor--entrada' : 'lancamento__valor'
          }
        >
          {comSinal(sinal, l.valor)}
        </p>
        <p className="lancamento__quando">
          {maiuscula(DIA_LONGO.format(l.data))}, às {HORA.format(l.data)}
        </p>
        {l.cancelada && <span className="etiqueta">Cancelada</span>}
      </div>

      <dl className="lancamento__dados">
        {l.tipo === 'venda' && (
          <div>
            <dt>Doces</dt>
            <dd>
              {r.itens.map((i) => (
                <span key={i.id} className="lancamento__item">
                  {quantidade(i.quantidade)}× {i.produto?.nome} · {moeda(i.subtotal)}
                </span>
              ))}
            </dd>
          </div>
        )}
        {Number(r.desconto) > 0 && (
          <div>
            <dt>Desconto</dt>
            <dd>{moeda(r.desconto)}</dd>
          </div>
        )}
        <div>
          <dt>Pagamento</dt>
          <dd>{ROTULO_PAGAMENTO[l.forma] ?? 'Não informado'}</dd>
        </div>
        {l.categoria && (
          <div>
            <dt>Categoria</dt>
            <dd>{l.categoria}</dd>
          </div>
        )}
        {comOQue && l.tipo !== 'venda' && (
          <div>
            <dt>Com o quê</dt>
            <dd>{comOQue}</dd>
          </div>
        )}
        {r.clienteNome && (
          <div>
            <dt>Cliente</dt>
            <dd>{r.clienteNome}</dd>
          </div>
        )}
      </dl>

      {erro && (
        <p className="alerta alerta--erro" role="alert">
          {erro}
        </p>
      )}

      <div className="modal__acoes modal__acoes--separadas">
        {l.cancelada ? (
          <button
            type="button"
            className="botao botao--primario botao--auto"
            disabled={ocupado}
            onClick={() => executar(() => vendas.reabrir(r.id), `${rotulo} restaurada.`)}
          >
            {ocupado ? 'Restaurando...' : 'Restaurar'}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="botao botao--auto botao--perigo"
              onClick={() => setModo('excluir')}
            >
              Excluir
            </button>
            <button
              type="button"
              className="botao botao--primario botao--auto"
              onClick={() => setModo('editar')}
            >
              Editar
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Pé dos formulários de edição: voltar ao detalhe, ou salvar. */
function Acoes({ salvando, aoVoltar }) {
  return (
    <div className="modal__acoes">
      <button type="button" className="botao botao--auto" onClick={aoVoltar}>
        Cancelar
      </button>
      <button type="submit" className="botao botao--primario botao--auto" disabled={salvando}>
        {salvando ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  );
}

function Erro({ texto }) {
  if (!texto) return null;
  return (
    <p className="alerta alerta--erro" role="alert">
      {texto}
    </p>
  );
}

/** "25,50" -> 25.5; qualquer coisa que não vire número positivo -> NaN. */
function lerValor(texto) {
  const n = Number(String(texto).trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

const valorParaCampo = (n) => Number(n).toFixed(2).replace('.', ',');

// ----------------------------------------------------- editar venda

function EditarVenda({ registro, aoVoltar, aoSalvar }) {
  const [catalogo, setCatalogo] = useState([]);
  const [itens, setItens] = useState(
    registro.itens.map((i) => ({ produtoId: i.produtoId, quantidade: Number(i.quantidade) }))
  );
  const [formaPagamento, setFormaPagamento] = useState(registro.formaPagamento);
  const [desconto, setDesconto] = useState(valorParaCampo(registro.desconto ?? 0));
  const [clienteNome, setClienteNome] = useState(registro.clienteNome ?? '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    produtos
      .listar()
      .then(setCatalogo)
      .catch((e) => setErro(mensagemDeErro(e)));
  }, []);

  const descontoNumero = Number(String(desconto).replace(',', '.')) || 0;

  // Prévia. O servidor recalcula pelo preço de cadastro — aqui é só para
  // ela conferir antes de salvar.
  const total = useMemo(() => {
    const soma = itens.reduce((s, item) => {
      const p = catalogo.find((x) => x.id === item.produtoId);
      return s + Number(p?.precoVenda ?? 0) * Number(item.quantidade || 0);
    }, 0);
    return Math.max(0, soma - descontoNumero);
  }, [itens, descontoNumero, catalogo]);

  const mudarItem = (indice, campo) => (e) =>
    setItens((atual) =>
      atual.map((i, n) => (n === indice ? { ...i, [campo]: e.target.value } : i))
    );

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      await vendas.atualizar(registro.id, {
        itens: itens.filter((i) => i.produtoId && Number(i.quantidade) > 0),
        formaPagamento,
        desconto: descontoNumero,
        clienteNome: clienteNome.trim() || null,
      });
      aoSalvar('Venda alterada.');
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSalvando(false);
    }
  }

  const opcoes = catalogo.map((p) => ({
    valor: p.id,
    rotulo: `${p.nome} — ${moeda(p.precoVenda)}`,
  }));

  return (
    <form onSubmit={salvar}>
      {itens.map((item, indice) => (
        // Doce, quantidade e "tirar" numa fileira só, também no celular:
        // empilhados, cada doce ocupava três linhas da tela.
        <div key={indice} className="edicao-item">
          {/* Da segunda linha em diante o rótulo some do desenho, mas não
              do leitor de tela: sem ele, "Produto 2" seria um menu sem nome. */}
          <Selecao
            rotulo={indice === 0 ? 'Doce' : <span className="so-leitor">Doce {indice + 1}</span>}
            value={item.produtoId}
            onChange={mudarItem(indice, 'produtoId')}
            opcoes={opcoes}
          />
          <Texto
            rotulo={
              indice === 0 ? 'Qtd.' : <span className="so-leitor">Quantidade {indice + 1}</span>
            }
            type="number"
            min="0.001"
            step="any"
            inputMode="decimal"
            value={item.quantidade}
            onChange={mudarItem(indice, 'quantidade')}
          />
          {itens.length > 1 && (
            <button
              type="button"
              className="botao botao--texto botao--perigo edicao-item__tirar"
              aria-label={`Tirar doce ${indice + 1}`}
              onClick={() => setItens((a) => a.filter((_, n) => n !== indice))}
            >
              Tirar
            </button>
          )}
        </div>
      ))}

      <button
        type="button"
        className="botao botao--texto edicao-item__mais"
        onClick={() => setItens((a) => [...a, { produtoId: catalogo[0]?.id ?? '', quantidade: 1 }])}
      >
        + Outro doce
      </button>

      <Linha>
        <Selecao
          rotulo="Pagamento"
          value={formaPagamento}
          onChange={(e) => setFormaPagamento(e.target.value)}
          opcoes={FORMAS}
        />
        <Texto
          rotulo="Desconto (R$)"
          type="text"
          inputMode="decimal"
          value={desconto}
          onChange={(e) => setDesconto(e.target.value)}
        />
      </Linha>

      <Texto
        rotulo="Cliente"
        placeholder="Opcional"
        value={clienteNome}
        onChange={(e) => setClienteNome(e.target.value)}
      />

      <p className="total-previa">
        Total <strong>{moeda(total)}</strong>
      </p>

      <Erro texto={erro} />
      <Acoes salvando={salvando} aoVoltar={aoVoltar} />
    </form>
  );
}

// -------------------------------------------- editar entrada avulsa

function EditarAvulsa({ registro, aoVoltar, aoSalvar }) {
  const [valor, setValor] = useState(valorParaCampo(registro.total));
  const [formaPagamento, setFormaPagamento] = useState(registro.formaPagamento);
  const [comOQue, setComOQue] = useState(registro.observacao ?? '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    const numero = lerValor(valor);
    if (Number.isNaN(numero)) {
      setErro('Informe um valor maior que zero.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await vendas.atualizar(registro.id, {
        valor: numero,
        formaPagamento,
        observacao: comOQue.trim() || null,
      });
      aoSalvar('Entrada alterada.');
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar}>
      <Linha>
        <Texto
          rotulo="Valor (R$)"
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          required
          autoFocus
        />
        <Selecao
          rotulo="Pagamento"
          value={formaPagamento}
          onChange={(e) => setFormaPagamento(e.target.value)}
          opcoes={FORMAS}
        />
      </Linha>
      <Texto
        rotulo="Com o quê"
        placeholder="Ex.: encomenda, bolo de aniversário"
        value={comOQue}
        onChange={(e) => setComOQue(e.target.value)}
      />
      <Erro texto={erro} />
      <Acoes salvando={salvando} aoVoltar={aoVoltar} />
    </form>
  );
}

// ------------------------------------------------- editar despesa

/**
 * É aqui que uma saída rápida, arquivada em "Diversos", ganha a categoria
 * certa — a tela inicial não pergunta, de propósito.
 */
function EditarDespesa({ registro, aoVoltar, aoSalvar }) {
  const [categorias, setCategorias] = useState([]);
  const [form, setForm] = useState({
    descricao: registro.descricao,
    valor: valorParaCampo(registro.valor),
    categoriaId: registro.categoriaId,
    formaPagamento: registro.formaPagamento ?? '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    despesas
      .categorias()
      .then(setCategorias)
      .catch((e) => setErro(mensagemDeErro(e)));
  }, []);

  const campo = (nome) => (e) => setForm((f) => ({ ...f, [nome]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    const numero = lerValor(form.valor);
    if (Number.isNaN(numero)) {
      setErro('Informe um valor maior que zero.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await despesas.atualizar(registro.id, {
        descricao: form.descricao.trim(),
        valor: numero,
        categoriaId: form.categoriaId,
        formaPagamento: form.formaPagamento || null,
      });
      aoSalvar('Lançamento alterado.');
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar}>
      <Texto
        rotulo="Com o quê"
        value={form.descricao}
        onChange={campo('descricao')}
        required
        minLength={2}
        autoFocus
      />
      <Linha>
        <Texto
          rotulo="Valor (R$)"
          type="text"
          inputMode="decimal"
          value={form.valor}
          onChange={campo('valor')}
          required
        />
        <Selecao
          rotulo="Pagamento"
          value={form.formaPagamento}
          onChange={campo('formaPagamento')}
          opcoes={[{ valor: '', rotulo: 'Não informado' }, ...FORMAS]}
        />
      </Linha>
      <Selecao
        rotulo="Categoria"
        value={form.categoriaId}
        onChange={campo('categoriaId')}
        opcoes={categorias.map((c) => ({
          valor: c.id,
          rotulo: c.tipo === 'RETIRADA_PESSOAL' ? `${c.nome} (não é custo)` : c.nome,
        }))}
      />
      <Erro texto={erro} />
      <Acoes salvando={salvando} aoVoltar={aoVoltar} />
    </form>
  );
}
