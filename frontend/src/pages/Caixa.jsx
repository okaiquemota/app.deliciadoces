import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal.jsx';
import { Linha, Selecao, Texto } from '../components/Campo.jsx';
import { Segmentado } from '../components/Segmentado.jsx';
import {
  IconeVenda,
  IconeEntrada,
  IconeSaida,
  IconeRetirada,
  IconeFiltros,
  IconeVisto,
} from '../components/Icones.jsx';
import { despesas, produtos, vendas } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import {
  data as formatarData,
  moeda,
  paraInput,
  quantidade,
  ROTULO_PAGAMENTO,
} from '../utils/formato.js';

/**
 * Caixa: o extrato do dinheiro, no desenho do extrato dos apps de banco.
 *
 * Lançar não é mais aqui — venda, entrada, saída e retirada nascem nos
 * botões da tela inicial. Esta tela existe para CONFERIR e CORRIGIR: o
 * que entrou e saiu, em que dia, e consertar o que foi digitado errado.
 *
 * Por isso uma lista só, e não abas de Vendas e Despesas. A pergunta que
 * ela faz aqui é "o que aconteceu com o meu dinheiro", e a resposta
 * separada em duas abas obrigava a juntar as duas de cabeça. Agrupada por
 * dia, com o saldo de cada dia, é a leitura que qualquer extrato ensinou.
 *
 * O arranjo é o do extrato do banco que ela já usa: título grande, busca
 * de largura toda e os filtros em chips. O primeiro chip mostra o período
 * e abre a escolha dele; os outros ligam e desligam um tipo de lançamento
 * com um toque. A busca cobre doce, descrição, cliente e forma de
 * pagamento — um campo só em vez de três menus.
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
  { id: '7dias', rotulo: 'Últimos 7 dias' },
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'datas', rotulo: 'Escolher datas' },
];

/**
 * Os tipos em chips. Cada um liga e desliga sozinho; nenhum ligado é
 * tudo. Ligar dois soma os dois — "Vendas" e "Entradas avulsas" juntos
 * são tudo o que entrou.
 */
const CHIPS_TIPO = [
  { id: 'venda', rotulo: 'Vendas' },
  { id: 'entrada', rotulo: 'Entradas avulsas' },
  { id: 'saida', rotulo: 'Saídas' },
  { id: 'retirada', rotulo: 'Retiradas' },
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
const DIA_DO_MES = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });

const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** "16h40", como a hora aparece nos extratos de banco. */
const hora = (data) => HORA.format(data).replace(':', 'h');

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

/** "Hoje", "Ontem", ou "24 de setembro" (+ ano, se outro). */
function rotuloDoDia(chave) {
  if (chave === paraInput()) return 'Hoje';
  if (chave === diasAtras(1)) return 'Ontem';
  const data = daChave(chave);
  const ano = data.getFullYear() !== new Date().getFullYear() ? ` de ${data.getFullYear()}` : '';
  return DIA_DO_MES.format(data) + ano;
}

/** O que o chip de período diz: "Últimos 7 dias", ou "01/09 – 25/09". */
function rotuloDoPeriodo(periodo, datas) {
  if (periodo === 'datas') return `${formatarData(datas.inicio)} – ${formatarData(datas.fim)}`;
  return PERIODOS.find((p) => p.id === periodo).rotulo;
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
    cancelada: v.cancelada,
  };
}

function daDespesa(d) {
  return {
    chave: `d-${d.id}`,
    origem: 'despesa',
    tipo: d.retirada ? 'retirada' : 'saida',
    registro: d,
    data: new Date(d.data),
    valor: Number(d.valor),
    titulo: d.descricao,
    forma: d.formaPagamento,
    cancelada: false,
  };
}

/** "Saída · Pix". A hora fica embaixo do valor, como no extrato do banco. */
function subtitulo(l) {
  return [l.cancelada ? 'Cancelada' : TIPOS[l.tipo].rotulo, FORMA_CURTA[l.forma]]
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
      FORMA_CURTA[l.forma],
      ROTULO_PAGAMENTO[l.forma],
      r.clienteNome,
      r.observacao,
    ].join(' ')
  );
}

/**
 * "+ R$ 27,00" ou "− R$ 140,00", com o sinal de menos tipográfico e um
 * espaço que não quebra: o sinal nunca fica sozinho no fim da linha.
 */
const comSinal = (sinal, valor) => `${sinal > 0 ? '+' : '−'}\u00a0${moeda(valor)}`;

// ============================================================ página

export function Caixa() {
  const [periodo, setPeriodo] = useState('7dias');
  const [datas, setDatas] = useState(() => intervalo('mes'));
  const [tipos, setTipos] = useState([]);
  const [busca, setBusca] = useState('');
  const [escolhendoPeriodo, setEscolhendoPeriodo] = useState(false);

  const [lancamentos, setLancamentos] = useState(null);
  // Conta as cargas da lista. Vai na `key` do conteúdo dela: a cada carga
  // nova, a lista entra de novo com a animação — o sinal de que o que se
  // vê já é o período escolhido, e não o anterior.
  const [carga, setCarga] = useState(0);
  const [cortado, setCortado] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [aberto, setAberto] = useState(null);

  const faixa = useMemo(() => intervalo(periodo, datas), [periodo, datas]);

  const carregar = useCallback(async () => {
    if (!faixa.inicio || !faixa.fim || faixa.inicio > faixa.fim) return;
    setAtualizando(true);
    try {
      const [v, d] = await Promise.all([
        vendas.listar({ ...faixa, incluirCanceladas: true, limite: LIMITE }),
        despesas.listar({ ...faixa, limite: LIMITE }),
      ]);
      setLancamentos([...v.map(daVenda), ...d.map(daDespesa)].sort((a, b) => b.data - a.data));
      setCarga((n) => n + 1);
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
      if (tipos.length && !tipos.includes(l.tipo)) return false;
      return !termo || textoDeBusca(l).includes(termo);
    });
  }, [lancamentos, tipos, busca]);

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

  function escolherPeriodo(id, novasDatas) {
    if (novasDatas) setDatas(novasDatas);
    setPeriodo(id);
    setEscolhendoPeriodo(false);
    setAviso('');
  }

  const alternarTipo = (id) =>
    setTipos((atuais) => (atuais.includes(id) ? atuais.filter((t) => t !== id) : [...atuais, id]));

  const filtrando = tipos.length > 0 || busca.trim() !== '';

  return (
    <section className="extrato">
      {/* O título à vista, grande, como o "Extrato" dos apps de banco. Para
          o leitor de tela o título da página é o `h1` da casca; este fica
          escondido dele para não ser lido duas vezes. */}
      <p className="cabeca__titulo" aria-hidden="true">
        Caixa
      </p>

      <input
        type="search"
        className="campo__entrada extrato__busca"
        placeholder="Buscar"
        aria-label="Buscar por doce, descrição, cliente ou forma de pagamento"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {/* No celular a fileira rola para o lado, e o chip cortado na borda
          da tela é o que avisa que tem mais. */}
      <div className="extrato__chips" role="group" aria-label="Filtros">
        <button
          type="button"
          className="chip"
          aria-haspopup="dialog"
          onClick={() => setEscolhendoPeriodo(true)}
        >
          <IconeFiltros tamanho={18} />
          <span className="so-leitor">Período: </span>
          {rotuloDoPeriodo(periodo, datas)}
        </button>
        {CHIPS_TIPO.map((c) => (
          <button
            key={c.id}
            type="button"
            className="chip"
            aria-pressed={tipos.includes(c.id)}
            onClick={() => alternarTipo(c.id)}
          >
            {c.rotulo}
          </button>
        ))}
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
              : filtrando
                ? 'Nada com esses filtros neste período.'
                : 'Nada lançado neste período.'}
          </p>
        ) : (
          // Muda de `key` a cada carga e a cada chip: a lista entra de novo,
          // suave. A busca fica de fora — animar a cada letra digitada
          // seria a lista piscando enquanto ela escreve.
          <div key={`${carga}|${tipos.join()}`} className="extrato__troca">
            {dias.map((dia) => (
              // Sem nome acessível de propósito: nomeada, cada seção vira um
              // marco de navegação, e uma semana seriam sete no meio dos do app.
              // O título do dia já é cabeçalho — é por ele que se pula.
              <section key={dia.chave} className="extrato__dia">
                <h2 className="extrato__dia-titulo">
                  <span>{rotuloDoDia(dia.chave)}</span>
                  <span className="extrato__dia-saldo">
                    Saldo do dia{' '}
                    {dia.saldo === 0
                      ? moeda(0)
                      : comSinal(Math.sign(dia.saldo), Math.abs(dia.saldo))}
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
            ))}
          </div>
        )}
        {cortado && (
          <p className="extrato__vazio">
            Mostrando os {LIMITE} lançamentos mais recentes do período.
          </p>
        )}
      </div>

      {escolhendoPeriodo && (
        <EscolherPeriodo
          periodo={periodo}
          datas={datas}
          aoFechar={() => setEscolhendoPeriodo(false)}
          aoEscolher={escolherPeriodo}
        />
      )}
      {aberto && <Detalhe l={aberto} aoFechar={() => setAberto(null)} aoMudar={aoMudar} />}
    </section>
  );
}

/**
 * A escolha do período, numa janela: a lista de opções com o visto na
 * escolhida, como nos ajustes do iPhone. Um toque escolhe e fecha; só
 * "Escolher datas" pede mais — as duas datas e a confirmação.
 */
function EscolherPeriodo({ periodo, datas, aoFechar, aoEscolher }) {
  const [escolhido, setEscolhido] = useState(periodo);
  const [rascunho, setRascunho] = useState(datas);
  const invalido = rascunho.inicio && rascunho.fim && rascunho.inicio > rascunho.fim;

  function escolher(id) {
    if (id === 'datas') setEscolhido('datas');
    else aoEscolher(id);
  }

  function aplicar(e) {
    e.preventDefault();
    if (!invalido) aoEscolher('datas', rascunho);
  }

  const data = (campo) => (e) => setRascunho((r) => ({ ...r, [campo]: e.target.value }));

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Período" largura={440}>
      <div className="opcoes" role="group" aria-label="Período">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="opcao"
            aria-pressed={escolhido === p.id}
            onClick={() => escolher(p.id)}
          >
            {p.rotulo}
            {escolhido === p.id && <IconeVisto tamanho={20} />}
          </button>
        ))}
      </div>

      {escolhido === 'datas' && (
        <form onSubmit={aplicar}>
          <div className="extrato__datas">
            <label className="extrato__data">
              <span>De</span>
              <input
                type="date"
                className="campo__entrada"
                value={rascunho.inicio}
                max={paraInput()}
                onChange={data('inicio')}
                required
              />
            </label>
            <label className="extrato__data">
              <span>Até</span>
              <input
                type="date"
                className="campo__entrada"
                value={rascunho.fim}
                max={paraInput()}
                onChange={data('fim')}
                required
              />
            </label>
          </div>
          {invalido && (
            <p className="alerta alerta--erro" role="alert">
              A data inicial é depois da final.
            </p>
          )}
          <div className="modal__acoes">
            <button
              type="submit"
              className="botao botao--primario botao--auto"
              disabled={Boolean(invalido) || !rascunho.inicio || !rascunho.fim}
            >
              Ver lançamentos
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/**
 * Uma linha do extrato: o ícone num círculo, o que foi e o tipo à
 * esquerda; o valor com sinal e a hora, um embaixo do outro, à direita.
 */
function Lancamento({ l, aoAbrir }) {
  const { Icone, sinal } = TIPOS[l.tipo];
  return (
    <button
      type="button"
      className={l.cancelada ? 'extrato__item extrato__item--cancelado' : 'extrato__item'}
      onClick={aoAbrir}
    >
      <span className="extrato__icone icone-aro">
        <Icone tamanho={22} />
      </span>
      <span className="extrato__textos">
        <span className="extrato__titulo">{l.titulo}</span>
        <span className="extrato__detalhe">{subtitulo(l)}</span>
      </span>
      <span className="extrato__lado">
        <span className={sinal > 0 ? 'extrato__valor extrato__valor--entrada' : 'extrato__valor'}>
          {comSinal(sinal, l.valor)}
        </span>
        <span className="extrato__hora">{hora(l.data)}</span>
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
              {maiuscula(DIA_LONGO.format(l.data))}, às {hora(l.data)}
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
          {maiuscula(DIA_LONGO.format(l.data))}, às {hora(l.data)}
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

const TIPOS_DESPESA = [
  { id: 'saida', rotulo: 'Saída' },
  { id: 'retirada', rotulo: 'Retirada pessoal' },
];

/**
 * Saída e retirada pessoal se editam aqui. Sem categoria: o que foi, diz
 * o "Com o quê".
 *
 * O Tipo existe para consertar o botão errado da tela inicial. Não é
 * detalhe: saída conta como custo no lucro, retirada não — uma feira de
 * casa lançada como saída faria a confeitaria parecer dar menos lucro.
 */
function EditarDespesa({ registro, aoVoltar, aoSalvar }) {
  const [form, setForm] = useState({
    descricao: registro.descricao,
    valor: valorParaCampo(registro.valor),
    tipo: registro.retirada ? 'retirada' : 'saida',
    formaPagamento: registro.formaPagamento ?? '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

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
        retirada: form.tipo === 'retirada',
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
      <div className="campo">
        {/* O nome acessível vem do próprio grupo; o rótulo à vista não é
            repetido para quem usa leitor de tela. */}
        <span className="campo__rotulo" aria-hidden="true">
          Tipo
        </span>
        <Segmentado
          rotulo="Tipo"
          opcoes={TIPOS_DESPESA}
          valor={form.tipo}
          aoTrocar={(tipo) => setForm((f) => ({ ...f, tipo }))}
          cheio
        />
      </div>
      <Erro texto={erro} />
      <Acoes salvando={salvando} aoVoltar={aoVoltar} />
    </form>
  );
}
