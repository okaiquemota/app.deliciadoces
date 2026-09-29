import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Modal } from '../components/Modal.jsx';
import {
  IconeAjuste,
  IconeCompra,
  IconeFiltros,
  IconePerda,
  IconeProducao,
  IconeVenda,
  IconeVisto,
} from '../components/Icones.jsx';
import {
  Dado,
  EscolherPeriodo,
  Total,
  hora,
  intervalo,
  normalizar,
  porDia,
  quandoPorExtenso,
  rotuloDoDia,
  rotuloDoPeriodo,
} from '../components/Extrato.jsx';
import { avisarEstoqueMudou } from '../components/EstoqueComum.jsx';
import { estoque, insumos, producoes, produtos } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import {
  data as formatarData,
  moeda,
  paraInput,
  quantidade,
  UNIDADE_CURTA,
} from '../utils/formato.js';

/**
 * Kardex: o extrato do ESTOQUE, no mesmo desenho do Caixa.
 *
 * Tudo o que entrou e saiu, dos doces e do material, numa lista só. Antes
 * isso ficava em três abas — os Lotes e o Histórico da Produção, o
 * Histórico do Estoque —, e a pergunta "para onde foi o leite condensado"
 * pedia juntar as três de cabeça.
 *
 * Cada linha é um ACONTECIMENTO, não um registro do banco. Um lote de
 * brigadeiro grava a entrada do doce e uma saída por ingrediente; uma
 * venda de três doces grava três saídas. Listados crus, um lote ocupava
 * cinco linhas. Aqui o lote é uma linha ("Lote de Brigadeiro, +50 un") e o
 * que ele consumiu está no detalhe.
 *
 * Escolhido UM item, a lista vira o kardex clássico: só as linhas dele,
 * cada uma com o saldo que ficou depois — o que mostra onde a conta
 * desandou quando o estoque não bate com a prateleira.
 */

const TIPOS = {
  producao: { rotulo: 'Produção', Icone: IconeProducao },
  venda: { rotulo: 'Venda', Icone: IconeVenda },
  compra: { rotulo: 'Compra', Icone: IconeCompra },
  perda: { rotulo: 'Perda', Icone: IconePerda },
  ajuste: { rotulo: 'Ajuste', Icone: IconeAjuste },
};

const TIPO_DO_MOVIMENTO = {
  ENTRADA_PRODUCAO: 'producao',
  SAIDA_PRODUCAO: 'producao',
  SAIDA_VENDA: 'venda',
  ENTRADA_COMPRA: 'compra',
  PERDA: 'perda',
  AJUSTE: 'ajuste',
};

/** Como a linha se chama quando se olha UM item. */
const TITULO_NO_ITEM = {
  ENTRADA_PRODUCAO: () => 'Lote produzido',
  SAIDA_PRODUCAO: (m) => `Usado no lote de ${m.producao?.produto?.nome ?? 'doce'}`,
  SAIDA_VENDA: () => 'Venda',
  ENTRADA_COMPRA: () => 'Compra',
  PERDA: () => 'Perda',
  AJUSTE: () => 'Ajuste de contagem',
};

/**
 * Os tipos em chips, como no Caixa: cada um liga e desliga sozinho, e
 * nenhum ligado é tudo. Perda e ajuste andam juntos — os dois são o
 * estoque que mudou sem ser uso.
 */
const CHIPS_TIPO = [
  { id: 'producao', rotulo: 'Produção', tipos: ['producao'] },
  { id: 'venda', rotulo: 'Vendas', tipos: ['venda'] },
  { id: 'compra', rotulo: 'Compras', tipos: ['compra'] },
  { id: 'perda', rotulo: 'Perdas e ajustes', tipos: ['perda', 'ajuste'] },
];

/**
 * Teto por carga. Cada doce vendido é um registro, e "Este mês" passa
 * fácil de mil; se mesmo assim bater no teto, a tela avisa.
 */
const LIMITE = 3000;

// -------------------------------------------------------- movimentos

/** Quanto o movimento mexeu no saldo, com sinal. */
function delta(m) {
  const q = Number(m.quantidade);
  if (m.tipo === 'AJUSTE') return q;
  return m.tipo === 'ENTRADA_COMPRA' || m.tipo === 'ENTRADA_PRODUCAO' ? Math.abs(q) : -Math.abs(q);
}

/**
 * "+50 un" ou "−2 lata": o sinal de menos tipográfico e um espaço que não
 * quebra, como os valores do Caixa.
 */
const comSinal = (n, unidade) => `${n < 0 ? '−' : '+'}\u00a0${quantidade(Math.abs(n), unidade)}`;

/** O item do movimento, com o lado dele — é o que o filtro por item pede. */
const alvoDe = (m) =>
  m.insumo ? { lado: 'insumo', ...m.insumo } : m.produto ? { lado: 'produto', ...m.produto } : null;

/**
 * A validade vem como instante de meia-noite UTC; o que vale é o DIA.
 * Formatado como instante, o navegador em Brasília mostrava a véspera.
 */
const diaDaValidade = (m) => (m.validade ? String(m.validade).slice(0, 10) : null);

/** O complemento da linha: a validade da compra, o motivo da perda. */
function complemento(m) {
  if (m.tipo === 'ENTRADA_COMPRA') {
    const dia = diaDaValidade(m);
    return dia ? `vence ${formatarData(dia)}` : '';
  }
  return m.motivo ?? '';
}

/** Junta os registros do mesmo lote e da mesma venda num acontecimento. */
function acontecimentos(movs) {
  const grupos = new Map();
  for (const m of movs) {
    const chave = m.producaoId ? `p-${m.producaoId}` : m.vendaId ? `v-${m.vendaId}` : `m-${m.id}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(m);
  }
  // Dentro do acontecimento, em ordem de nome. Os registros de uma venda
  // nascem no mesmo instante, e sem isso "4× Brigadeiro, 2× Beijinho"
  // podia aparecer invertido de uma carga para a outra.
  const porNome = (a, b) => (alvoDe(a)?.nome ?? '').localeCompare(alvoDe(b)?.nome ?? '', 'pt-BR');
  return [...grupos].map(([chave, lista]) => montar(chave, lista.sort(porNome)));
}

function montar(chave, movs) {
  const [m] = movs;
  const base = { chave, movs, tipo: TIPO_DO_MOVIMENTO[m.tipo], data: new Date(m.data) };

  if (m.producaoId && m.producao) {
    const doce = m.producao.produto;
    const usados = movs.filter((x) => x.tipo === 'SAIDA_PRODUCAO').length;
    return {
      ...base,
      tipo: 'producao',
      titulo: `Lote de ${doce?.nome ?? 'doce'}`,
      detalhe: usados
        ? `Produção · usou ${usados} ${usados === 1 ? 'ingrediente' : 'ingredientes'}`
        : 'Produção',
      valor: comSinal(Number(m.producao.quantidade), doce?.unidade),
      entrada: true,
      alvo: alvoDe(movs.find((x) => x.tipo === 'ENTRADA_PRODUCAO') ?? {}),
    };
  }

  if (m.vendaId) {
    const unidades = new Set(movs.map((x) => x.produto?.unidade));
    const pecas = movs.reduce((s, x) => s + Number(x.quantidade), 0);
    return {
      ...base,
      tipo: 'venda',
      titulo: movs.map((x) => `${quantidade(x.quantidade)}× ${x.produto?.nome ?? ''}`).join(', '),
      detalhe: 'Venda',
      valor: comSinal(-pecas, unidades.size === 1 ? [...unidades][0] : ''),
      entrada: false,
      alvo: movs.length === 1 ? alvoDe(m) : null,
    };
  }

  const alvo = alvoDe(m);
  const d = delta(m);
  return {
    ...base,
    titulo: alvo?.nome ?? '—',
    detalhe: [TIPOS[base.tipo].rotulo, complemento(m)].filter(Boolean).join(' · '),
    valor: comSinal(d, alvo?.unidade),
    entrada: d > 0,
    alvo,
  };
}

/** Uma linha do kardex de UM item: cada registro dele, com o saldo depois. */
function linhaDoItem(m) {
  const alvo = alvoDe(m);
  const d = delta(m);
  const data = new Date(m.data);
  return {
    chave: m.id,
    movs: [m],
    tipo: TIPO_DO_MOVIMENTO[m.tipo],
    data,
    titulo: TITULO_NO_ITEM[m.tipo](m),
    detalhe: [hora(data), complemento(m)].filter(Boolean).join(' · '),
    valor: comSinal(d, alvo?.unidade),
    entrada: d > 0,
    delta: d,
    saldo: m.saldoDepois,
    unidade: alvo?.unidade,
  };
}

function textoDeBusca(a) {
  return normalizar(
    [
      a.titulo,
      a.detalhe,
      TIPOS[a.tipo].rotulo,
      ...a.movs.map((m) => `${alvoDe(m)?.nome ?? ''} ${m.motivo ?? ''}`),
    ].join(' ')
  );
}

// ============================================================ página

export function Kardex() {
  // Vindo do "Ver no Kardex" de um ingrediente ou de um doce, a tela já
  // abre no kardex daquele item — e no mês, que é o que conta a história
  // dele; a semana mostraria só o fim.
  const { state } = useLocation();
  const [periodo, setPeriodo] = useState(state?.item ? 'mes' : '7dias');
  const [datas, setDatas] = useState(() => intervalo('mes'));
  const [tipos, setTipos] = useState([]);
  const [busca, setBusca] = useState('');
  const [item, setItem] = useState(state?.item ?? null);
  const [escolhendoPeriodo, setEscolhendoPeriodo] = useState(false);
  const [escolhendoItem, setEscolhendoItem] = useState(false);

  // A lista guarda o item PARA O QUAL foi buscada: ao trocar de item, a
  // lista velha não pode ser lida como se fosse do item novo enquanto a
  // nova carrega.
  const [dados, setDados] = useState(null);
  const [catalogo, setCatalogo] = useState({ doces: [], ingredientes: [] });
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
      const movs = await estoque.movimentacoes({
        ...faixa,
        limite: LIMITE,
        ...(item ? { [item.lado === 'insumo' ? 'insumoId' : 'produtoId']: item.id } : {}),
      });
      setDados({ movs, item });
      setCarga((n) => n + 1);
      setCortado(movs.length >= LIMITE);
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar o Kardex.'));
    } finally {
      setAtualizando(false);
    }
  }, [faixa, item]);

  const carregarCatalogo = useCallback(
    () =>
      Promise.all([produtos.listar(), insumos.listar()])
        .then(([doces, ingredientes]) => setCatalogo({ doces, ingredientes }))
        // Sem o catálogo, só a escolha de item fica vazia; a lista segue.
        .catch(() => {}),
    []
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    carregarCatalogo();
  }, [carregarCatalogo]);

  const doItem = dados?.item ?? null;

  const linhas = useMemo(() => {
    if (!dados) return null;
    return dados.item ? dados.movs.map(linhaDoItem) : acontecimentos(dados.movs);
  }, [dados]);

  const visiveis = useMemo(() => {
    if (!linhas) return [];
    const ligados = CHIPS_TIPO.filter((c) => tipos.includes(c.id)).flatMap((c) => c.tipos);
    const termo = normalizar(busca.trim());
    return linhas.filter((a) => {
      if (ligados.length && !ligados.includes(a.tipo)) return false;
      return !termo || textoDeBusca(a).includes(termo);
    });
  }, [linhas, tipos, busca]);

  const dias = useMemo(() => porDia(visiveis), [visiveis]);

  const filtrando = tipos.length > 0 || busca.trim() !== '';

  const atual = doItem
    ? (doItem.lado === 'insumo' ? catalogo.ingredientes : catalogo.doces).find(
        (x) => x.id === doItem.id
      )
    : null;

  function aoMudar(mensagem) {
    setAberto(null);
    setAviso(mensagem);
    carregar();
    carregarCatalogo();
    avisarEstoqueMudou();
  }

  function escolherPeriodo(id, novasDatas) {
    if (novasDatas) setDatas(novasDatas);
    setPeriodo(id);
    setEscolhendoPeriodo(false);
    setAviso('');
  }

  function escolherItem(novo) {
    setItem(novo);
    setEscolhendoItem(false);
    setAberto(null);
    setAviso('');
  }

  const alternarTipo = (id) =>
    setTipos((a) => (a.includes(id) ? a.filter((t) => t !== id) : [...a, id]));

  return (
    <section className="extrato">
      <p className="cabeca__titulo" aria-hidden="true">
        Kardex
      </p>

      <input
        type="search"
        className="campo__entrada extrato__busca"
        placeholder="Buscar"
        aria-label="Buscar por doce, ingrediente ou motivo"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

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
        {/* Abre a escolha do item, não liga e desliga: por isso não é um
            botão "apertado" para o leitor de tela — só o desenho acende. */}
        <button
          type="button"
          className={item ? 'chip chip--ligado' : 'chip'}
          aria-haspopup="dialog"
          onClick={() => setEscolhendoItem(true)}
        >
          <span className="so-leitor">Item: </span>
          {item ? item.nome : 'Todos os itens'}
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

      <Resumo visiveis={visiveis} doItem={doItem} atual={atual} />

      <div className={atualizando ? 'extrato__lista conteudo--atualizando' : 'extrato__lista'}>
        {linhas === null ? (
          <p className="extrato__vazio">Carregando...</p>
        ) : dias.length === 0 ? (
          <p className="extrato__vazio">
            {busca.trim()
              ? `Nada encontrado para “${busca.trim()}”.`
              : filtrando
                ? 'Nada com esses filtros neste período.'
                : doItem
                  ? `Nada de ${doItem.nome} neste período.`
                  : 'Nenhuma entrada ou saída neste período.'}
          </p>
        ) : (
          <div key={`${carga}|${tipos.join()}`} className="extrato__troca">
            {dias.map((dia) => (
              <section key={dia.chave} className="extrato__dia">
                <h2 className="extrato__dia-titulo">
                  <span>{rotuloDoDia(dia.chave)}</span>
                  {/* O saldo do fim do dia é o da linha mais recente dele —
                      só enquanto nenhuma linha do dia está escondida por
                      filtro, senão seria o saldo de uma linha qualquer. */}
                  {doItem && !filtrando && dia.itens[0].saldo != null && (
                    <span className="extrato__dia-saldo">
                      Fechou com {quantidade(dia.itens[0].saldo, dia.itens[0].unidade)}
                    </span>
                  )}
                </h2>
                <ul className="extrato__itens">
                  {dia.itens.map((a) => (
                    <li key={a.chave}>
                      <Movimento a={a} aoAbrir={() => setAberto(a)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        {cortado && (
          <p className="extrato__vazio">
            Mostrando os {LIMITE} movimentos mais recentes do período.
          </p>
        )}
      </div>

      {escolhendoPeriodo && (
        <EscolherPeriodo
          periodo={periodo}
          datas={datas}
          aoFechar={() => setEscolhendoPeriodo(false)}
          aoEscolher={escolherPeriodo}
          rotuloAplicar="Ver movimentos"
        />
      )}
      {escolhendoItem && (
        <EscolherItem
          catalogo={catalogo}
          atual={item}
          aoFechar={() => setEscolhendoItem(false)}
          aoEscolher={escolherItem}
        />
      )}
      {aberto && (
        <Detalhe
          a={aberto}
          doItem={Boolean(doItem)}
          aoFechar={() => setAberto(null)}
          aoMudar={aoMudar}
          aoVerItem={escolherItem}
        />
      )}
    </section>
  );
}

/**
 * O bloco de totais. Olhando UM item, o que entrou, o que saiu e quanto
 * tem agora — as três colunas de um kardex. Olhando tudo, latas e
 * brigadeiros não se somam: aí são contagens do que aconteceu.
 */
function Resumo({ visiveis, doItem, atual }) {
  if (doItem) {
    const entrou = visiveis.reduce((s, a) => s + Math.max(a.delta, 0), 0);
    const saiu = visiveis.reduce((s, a) => s + Math.max(-a.delta, 0), 0);
    return (
      <div className="extrato__resumo">
        <Total rotulo="Entrou" valor={quantidade(entrou, doItem.unidade)} tom="entrada" />
        <Total rotulo="Saiu" valor={quantidade(saiu, doItem.unidade)} />
        <Total
          rotulo="Tem agora"
          valor={atual ? quantidade(atual.quantidadeAtual, atual.unidade) : '—'}
        />
      </div>
    );
  }

  const quantos = (tipo) => visiveis.filter((a) => a.tipo === tipo).length;
  return (
    <div className="extrato__resumo">
      <Total rotulo="Lotes" valor={quantos('producao')} />
      <Total rotulo="Vendas" valor={quantos('venda')} />
      <Total rotulo="Perdas" valor={quantos('perda')} />
    </div>
  );
}

/**
 * Uma linha: o ícone num círculo, o que foi e o detalhe à esquerda; a
 * quantidade com sinal à direita e, embaixo dela, a hora — ou, olhando um
 * item, o saldo que ficou (aí a hora vai para o detalhe).
 */
function Movimento({ a, aoAbrir }) {
  const { Icone } = TIPOS[a.tipo];
  return (
    <button type="button" className="extrato__item" onClick={aoAbrir}>
      <span className="extrato__icone icone-aro">
        <Icone tamanho={22} />
      </span>
      <span className="extrato__textos">
        <span className="extrato__titulo">{a.titulo}</span>
        <span className="extrato__detalhe">{a.detalhe}</span>
      </span>
      <span className="extrato__lado">
        <span className={a.entrada ? 'extrato__valor extrato__valor--entrada' : 'extrato__valor'}>
          {a.valor}
        </span>
        <span className="extrato__hora">
          {a.saldo != null ? `saldo ${quantidade(a.saldo, a.unidade)}` : hora(a.data)}
        </span>
      </span>
    </button>
  );
}

// ======================================================= escolher item

/**
 * A escolha do item, no desenho da escolha do período: a lista com o
 * visto no escolhido. Com a busca no alto — são todos os doces e todos
 * os ingredientes, e rolar atrás de um nome é mais lento que digitar três
 * letras dele.
 */
function EscolherItem({ catalogo, atual, aoFechar, aoEscolher }) {
  const [busca, setBusca] = useState('');
  const termo = normalizar(busca.trim());
  const filtrar = (lista) => lista.filter((x) => !termo || normalizar(x.nome).includes(termo));
  const grupos = [
    { lado: 'produto', titulo: 'Doces', lista: filtrar(catalogo.doces) },
    { lado: 'insumo', titulo: 'Ingredientes', lista: filtrar(catalogo.ingredientes) },
  ];
  const nada = grupos.every((g) => g.lista.length === 0);

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Ver um item" largura={440}>
      <input
        type="search"
        className="campo__entrada extrato__busca opcoes__busca"
        placeholder="Buscar"
        aria-label="Buscar item"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {!termo && (
        <div className="opcoes" role="group" aria-label="Todos">
          <button
            type="button"
            className="opcao"
            aria-pressed={!atual}
            onClick={() => aoEscolher(null)}
          >
            Todos os itens
            {!atual && <IconeVisto tamanho={20} />}
          </button>
        </div>
      )}

      {grupos.map(
        (g) =>
          g.lista.length > 0 && (
            <div key={g.lado} className="opcoes__bloco">
              <h3 className="opcoes__grupo">{g.titulo}</h3>
              <div className="opcoes" role="group" aria-label={g.titulo}>
                {g.lista.map((x) => {
                  const escolhido = atual?.lado === g.lado && atual.id === x.id;
                  return (
                    <button
                      key={x.id}
                      type="button"
                      className="opcao"
                      aria-pressed={escolhido}
                      onClick={() =>
                        aoEscolher({ lado: g.lado, id: x.id, nome: x.nome, unidade: x.unidade })
                      }
                    >
                      <span className="opcao__textos">
                        <span>{x.nome}</span>
                        <span className="opcao__nota">
                          tem {quantidade(x.quantidadeAtual, x.unidade)}
                        </span>
                      </span>
                      {escolhido && <IconeVisto tamanho={20} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )
      )}

      {nada && (
        <p className="extrato__vazio">
          {termo ? `Nada encontrado para “${busca.trim()}”.` : 'Nenhum item cadastrado ainda.'}
        </p>
      )}
    </Modal>
  );
}

// ========================================================== detalhe

const TITULO_DO_DETALHE = {
  producao: 'Lote produzido',
  venda: 'Venda',
  compra: 'Compra',
  perda: 'Perda',
  ajuste: 'Ajuste de contagem',
};

/**
 * O detalhe de uma linha. O que se corrige daqui é o lote — excluir
 * desfaz o doce que entrou e devolve os ingredientes. A venda se corrige
 * no Caixa, onde ela mexe também no dinheiro; compra, perda e ajuste
 * errados se consertam com um Ajustar no próprio item.
 */
function Detalhe({ a, doItem, aoFechar, aoMudar, aoVerItem }) {
  const [excluindo, setExcluindo] = useState(false);
  const { usuario, admin } = useAuth();
  const [m] = a.movs;
  const lote = m.producao;
  // A funcionária desfaz o lote que ela lançou, no mesmo dia — a mesma
  // regra do Caixa, e o servidor confere de novo.
  const doDia =
    lote && (admin || (lote.usuarioId === usuario?.id && paraInput(a.data) === paraInput()));
  const podeExcluirLote = !doItem && a.tipo === 'producao' && doDia;

  if (excluindo) {
    return <ExcluirLote a={a} aoVoltar={() => setExcluindo(false)} aoMudar={aoMudar} />;
  }

  const titulo =
    doItem && m.tipo === 'SAIDA_PRODUCAO' ? 'Usado na produção' : TITULO_DO_DETALHE[a.tipo];

  return (
    <Modal aberto aoFechar={aoFechar} titulo={titulo} largura={480}>
      <div className="lancamento">
        <p
          className={
            a.entrada ? 'lancamento__valor lancamento__valor--entrada' : 'lancamento__valor'
          }
        >
          {a.valor}
        </p>
        <p className="lancamento__quando">{quandoPorExtenso(a.data)}</p>
      </div>

      <dl className="lancamento__dados">
        {a.tipo === 'producao' && lote && (
          <Dado rotulo={doItem && m.tipo === 'SAIDA_PRODUCAO' ? 'No lote de' : 'Doce'}>
            {lote.produto?.nome} · {quantidade(lote.quantidade, lote.produto?.unidade)}
          </Dado>
        )}
        {a.tipo === 'producao' && !doItem && (
          <Dado rotulo="Usou">
            {a.movs.some((x) => x.tipo === 'SAIDA_PRODUCAO')
              ? a.movs
                  .filter((x) => x.tipo === 'SAIDA_PRODUCAO')
                  .map((x) => (
                    <span key={x.id} className="lancamento__item">
                      {quantidade(x.quantidade, x.insumo?.unidade)} de {x.insumo?.nome}
                    </span>
                  ))
              : 'Nada do estoque'}
          </Dado>
        )}
        {a.tipo === 'producao' && !doItem && lote?.custoEstimado && (
          <Dado rotulo="Custo estimado">{moeda(lote.custoEstimado)}</Dado>
        )}
        {a.tipo === 'producao' && lote?.observacao && (
          <Dado rotulo="Observação">{lote.observacao}</Dado>
        )}

        {a.tipo === 'venda' && (
          <Dado rotulo="Doces">
            {a.movs.map((x) => (
              <span key={x.id} className="lancamento__item">
                {quantidade(x.quantidade)}× {x.produto?.nome}
              </span>
            ))}
          </Dado>
        )}

        {(a.tipo === 'compra' || a.tipo === 'perda' || a.tipo === 'ajuste') && !doItem && (
          <Dado rotulo={m.insumo ? 'Ingrediente' : 'Doce'}>{alvoDe(m)?.nome}</Dado>
        )}
        {a.tipo === 'compra' && m.custoUnitario && (
          <Dado rotulo="Pagou">
            {moeda(Number(m.custoUnitario) * Number(m.quantidade))} · {moeda(m.custoUnitario)} por{' '}
            {UNIDADE_CURTA[m.insumo?.unidade] ?? m.insumo?.unidade?.toLowerCase()}
          </Dado>
        )}
        {a.tipo === 'compra' && (
          <Dado rotulo="Validade">
            {diaDaValidade(m) ? formatarData(diaDaValidade(m)) : 'Não informada'}
          </Dado>
        )}
        {m.motivo && <Dado rotulo="Motivo">{m.motivo}</Dado>}

        {doItem && a.saldo != null && (
          <Dado rotulo="Saldo depois">{quantidade(a.saldo, a.unidade)}</Dado>
        )}
      </dl>

      {a.tipo === 'venda' && (
        <p className="lancamento__pergunta">
          Para corrigir ou cancelar a venda, abra ela no Caixa — lá o dinheiro acompanha.
        </p>
      )}

      <div className="modal__acoes modal__acoes--separadas">
        {podeExcluirLote && (
          <button
            type="button"
            className="botao botao--auto botao--perigo"
            onClick={() => setExcluindo(true)}
          >
            Excluir lote
          </button>
        )}
        {a.tipo === 'venda' && (
          <Link to="/caixa" className="botao botao--auto">
            Abrir o Caixa
          </Link>
        )}
        {!doItem && a.alvo && (
          <button
            type="button"
            className="botao botao--primario botao--auto"
            onClick={() => aoVerItem(a.alvo)}
          >
            Ver o Kardex de {a.alvo.nome}
          </button>
        )}
      </div>
    </Modal>
  );
}

/**
 * Excluir um lote: a confirmação DENTRO da janela, como no Caixa — e não
 * o alerta do navegador. Diz o que acontece com o estoque, que é o que ela
 * precisa pesar antes.
 */
function ExcluirLote({ a, aoVoltar, aoMudar }) {
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const lote = a.movs[0].producao;
  const usou = a.movs.some((x) => x.tipo === 'SAIDA_PRODUCAO');

  async function excluir() {
    setOcupado(true);
    setErro('');
    try {
      await producoes.excluir(lote.id);
      aoMudar('Lote excluído.');
    } catch (e) {
      setErro(mensagemDeErro(e));
      setOcupado(false);
    }
  }

  return (
    <Modal aberto aoFechar={aoVoltar} titulo="Excluir este lote?" largura={440}>
      <div className="lancamento__alvo">
        <span className="lancamento__alvo-textos">
          <span className="lancamento__alvo-titulo">
            {quantidade(lote.quantidade, lote.produto?.unidade)} de {lote.produto?.nome}
          </span>
          <span className="lancamento__alvo-quando">{quandoPorExtenso(a.data)}</span>
        </span>
      </div>
      <p className="lancamento__pergunta">
        Os doces saem do estoque de prontos
        {usou ? ' e os ingredientes usados voltam para o Estoque.' : '.'}
      </p>
      {erro && (
        <p className="alerta alerta--erro" role="alert">
          {erro}
        </p>
      )}
      <div className="modal__acoes">
        <button type="button" className="botao botao--auto" onClick={aoVoltar}>
          Voltar
        </button>
        <button
          type="button"
          className="botao botao--auto botao--perigo"
          disabled={ocupado}
          onClick={excluir}
        >
          {ocupado ? 'Excluindo...' : 'Excluir'}
        </button>
      </div>
    </Modal>
  );
}
