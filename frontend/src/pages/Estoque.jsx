import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Modal } from '../components/Modal.jsx';
import { Dinheiro, Interruptor, Linha, Selecao, Texto } from '../components/Campo.jsx';
import { Dado, Total, normalizar } from '../components/Extrato.jsx';
import { IconeEstoque } from '../components/Icones.jsx';
import {
  AjusteEstoque,
  CabecaComNovo,
  LinhaItem,
  LinkKardex,
  SecaoItens,
  avisarEstoqueMudou,
  comPontos,
  estaAcabando,
  lerNumero,
  paraCampo,
} from '../components/EstoqueComum.jsx';
import { estoque, insumos } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { data as formatarData, moeda, quantidade, UNIDADE_CURTA } from '../utils/formato.js';

const UNIDADES = Object.entries(UNIDADE_CURTA).map(([valor, rotulo]) => ({
  valor,
  rotulo: `${rotulo} (${valor.toLowerCase()})`,
}));

/** Dias até o vencimento que já pedem atenção — os mesmos 15 do menu. */
const AVISO_VALIDADE = 15;

const curta = (unidade) => UNIDADE_CURTA[unidade] ?? unidade?.toLowerCase();

/**
 * A validade em palavras: "vencido há 3 dias" diz o que fazer; "-3" não.
 *
 * Vencido e vencendo têm cores diferentes porque a ação é oposta: um vai
 * pro lixo, o outro se usa primeiro. Longe do vencimento, a data basta.
 * `urgente` é a mesma régua do número no menu.
 */
function prazoDaValidade(v) {
  if (!v) return null;
  const d = Math.abs(v.dias);
  if (v.vencido) {
    return {
      texto: `vencido há ${d === 1 ? '1 dia' : `${d} dias`}`,
      classe: 'fechamento__falta',
      urgente: true,
      vencido: true,
    };
  }
  if (v.dias === 0) return { texto: 'vence hoje', classe: 'fechamento__sobra', urgente: true };
  if (v.dias === 1) return { texto: 'vence amanhã', classe: 'fechamento__sobra', urgente: true };
  if (v.dias <= 30) {
    const urgente = v.dias <= AVISO_VALIDADE;
    return {
      texto: `vence em ${v.dias} dias`,
      classe: urgente ? 'fechamento__sobra' : undefined,
      urgente,
    };
  }
  return { texto: `vence ${formatarData(v.validade)}` };
}

/** Pede atenção: acabando, vencido ou vencendo — o que o número do menu conta. */
const pedeAtencao = (i) => estaAcabando(i) || Boolean(prazoDaValidade(i.validade)?.urgente);

/**
 * Estoque: o MATERIAL — ingredientes e embalagens. A pergunta desta tela
 * é "o que eu tenho para fazer os doces?".
 *
 * No desenho do Caixa e do Kardex: título grande, busca, o resumo cinza e
 * a lista lisa. A lista vem em dois grupos — o que pede atenção (acabando,
 * vencido, vencendo) no alto, e o resto embaixo —, que é a ordem em que
 * ela precisa ler.
 *
 * Na linha, só o gesto de toda semana: **Comprei**. Ajustar, Editar e o
 * histórico ficam no detalhe, que abre ao tocar no ingrediente.
 */
export function Estoque() {
  // Custo é resultado financeiro: a funcionária não vê (o servidor nem
  // manda). Ela cadastra, compra, ajusta e vê validade e quantidade.
  const { admin } = useAuth();
  const [lista, setLista] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');

  const [aberto, setAberto] = useState(null);
  const [editando, setEditando] = useState(null);
  const [comprando, setComprando] = useState(null);
  const [ajustando, setAjustando] = useState(null);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    try {
      setLista(await insumos.listar());
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /** Fecha a janela, avisa o que aconteceu e recarrega. */
  const concluir = (fechar) => (mensagem) => {
    fechar(null);
    setAviso(mensagem);
    carregar();
    avisarEstoqueMudou();
  };

  /** Do detalhe para uma ação: fecha o detalhe e abre a janela dela. */
  const doDetalhe = (abrir) => () => {
    abrir(aberto);
    setAberto(null);
  };

  const todos = lista ?? [];
  const termo = normalizar(busca.trim());
  const visiveis = todos.filter((i) => !termo || normalizar(i.nome).includes(termo));
  const atencao = visiveis.filter(pedeAtencao);
  const emDia = visiveis.filter((i) => !pedeAtencao(i));

  const quantosAtencao = todos.filter(pedeAtencao).length;
  const valorEmEstoque = todos.reduce(
    (s, i) => s + Math.max(Number(i.quantidadeAtual), 0) * Number(i.custoUnitario),
    0
  );

  const linha = (i) => (
    <LinhaInsumo
      key={i.id}
      insumo={i}
      aoAbrir={() => setAberto(i)}
      aoComprar={() => setComprando(i)}
    />
  );

  return (
    <section className="extrato">
      <CabecaComNovo titulo="Estoque" oQue="ingrediente" aoNovo={() => setEditando({})} />

      <input
        type="search"
        className="campo__entrada extrato__busca"
        placeholder="Buscar"
        aria-label="Buscar ingrediente"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

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

      <div className={admin ? 'extrato__resumo' : 'extrato__resumo extrato__resumo--dois'}>
        <Total rotulo="Ingredientes" valor={todos.length} />
        <Total
          rotulo="Pedem atenção"
          valor={quantosAtencao}
          tom={quantosAtencao ? 'alerta' : undefined}
        />
        {admin && <Total rotulo="Valor em estoque" valor={moeda(valorEmEstoque)} />}
      </div>

      <div className={atualizando ? 'extrato__lista conteudo--atualizando' : 'extrato__lista'}>
        {lista === null ? (
          <p className="extrato__vazio">Carregando...</p>
        ) : todos.length === 0 ? (
          <div className="extrato__vazio">
            <p>Nenhum ingrediente cadastrado ainda.</p>
            <button
              type="button"
              className="botao botao--primario botao--auto"
              onClick={() => setEditando({})}
            >
              Cadastrar o primeiro
            </button>
          </div>
        ) : visiveis.length === 0 ? (
          <p className="extrato__vazio">Nada encontrado para “{busca.trim()}”.</p>
        ) : (
          <div className="extrato__troca">
            {atencao.length > 0 && (
              <SecaoItens titulo="Pede atenção" conta={atencao.length}>
                {atencao.map(linha)}
              </SecaoItens>
            )}
            {emDia.length > 0 && (
              <SecaoItens titulo="Em dia" conta={emDia.length}>
                {emDia.map(linha)}
              </SecaoItens>
            )}
          </div>
        )}
      </div>

      {aberto && (
        <DetalheInsumo
          insumo={aberto}
          aoFechar={() => setAberto(null)}
          aoComprar={doDetalhe(setComprando)}
          aoAjustar={doDetalhe(setAjustando)}
          aoEditar={doDetalhe(setEditando)}
        />
      )}
      {editando && (
        <FormularioInsumo
          insumo={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={concluir(setEditando)}
        />
      )}
      {comprando && (
        <FormularioCompra
          insumo={comprando}
          aoFechar={() => setComprando(null)}
          aoSalvar={concluir(setComprando)}
        />
      )}
      {ajustando && (
        <AjusteEstoque
          alvo={ajustando}
          tipoAlvo="insumo"
          aoFechar={() => setAjustando(null)}
          aoSalvar={() => concluir(setAjustando)(`Estoque de ${ajustando.nome} ajustado.`)}
        />
      )}
    </section>
  );
}

/**
 * Um ingrediente na lista. O detalhe da linha diz o que pede atenção,
 * primeiro — vencido, vencendo, acabando. Sem nada a avisar, diz quanto
 * custa e quando vence.
 */
function LinhaInsumo({ insumo: i, aoAbrir, aoComprar }) {
  const { admin } = useAuth();
  const acabando = estaAcabando(i);
  const prazo = prazoDaValidade(i.validade);
  const custo = Number(i.custoUnitario);
  const minimo = Number(i.estoqueMinimo);

  const partes = [];
  if (prazo?.urgente) {
    partes.push(
      <span key="prazo" className={prazo.classe}>
        {prazo.texto}
      </span>
    );
  }
  if (acabando) {
    partes.push(
      <span key="acabando" className="fechamento__falta">
        acabando
      </span>
    );
  }
  if (!partes.length) {
    if (custo > 0) partes.push(`${moeda(custo)} por ${curta(i.unidade)}`);
    if (prazo) partes.push(prazo.texto);
    // Sem o custo (que não chega para a funcionária), "nenhuma compra"
    // seria mentira: para ela, sem aviso, a linha só não diz nada.
    if (!partes.length && admin) partes.push('nenhuma compra ainda');
  }

  return (
    <LinhaItem
      marca={<IconeEstoque tamanho={22} />}
      tom={prazo?.vencido || acabando ? 'alerta' : prazo?.urgente ? 'aviso' : undefined}
      titulo={i.nome}
      detalhe={comPontos(partes)}
      valor={quantidade(i.quantidadeAtual, i.unidade)}
      alerta={acabando}
      sub={minimo > 0 ? `mín. ${quantidade(minimo, i.unidade)}` : null}
      aoAbrir={aoAbrir}
      acao={{ rotulo: 'Comprei', aoTocar: aoComprar }}
    />
  );
}

/**
 * O detalhe de um ingrediente: quanto tem, em números grandes, e tudo o
 * que se sabe dele — validade, custo, aviso, fornecedor. As ações ficam
 * no pé, com a compra (a mais comum) no lugar do polegar.
 */
function DetalheInsumo({ insumo: i, aoFechar, aoComprar, aoAjustar, aoEditar }) {
  const { admin } = useAuth();
  const acabando = estaAcabando(i);
  const prazo = prazoDaValidade(i.validade);
  const custo = Number(i.custoUnitario);
  const minimo = Number(i.estoqueMinimo);
  const parte = i.validade && Number(i.validade.quantidade) < Number(i.quantidadeAtual);

  return (
    <Modal aberto aoFechar={aoFechar} titulo={i.nome} largura={480}>
      <div className="lancamento">
        <p
          className={acabando ? 'lancamento__valor lancamento__valor--alerta' : 'lancamento__valor'}
        >
          {quantidade(i.quantidadeAtual, i.unidade)}
        </p>
        <p className="lancamento__quando">
          {acabando ? 'no estoque — está acabando' : 'no estoque'}
        </p>
      </div>

      <dl className="lancamento__dados">
        <Dado rotulo="Validade">
          {prazo ? (
            <>
              <span className={prazo.classe}>{prazo.texto}</span>
              {i.validade.dias <= 30 && ` (${formatarData(i.validade.validade)})`}
              {parte && (
                <span className="lancamento__item lancamento__nota">
                  só {quantidade(i.validade.quantidade, i.unidade)} — o resto vence depois
                </span>
              )}
            </>
          ) : i.controlaValidade ? (
            'Sem data no que sobrou'
          ) : (
            'Não controla'
          )}
        </Dado>
        {admin && (
          <Dado rotulo="Custo médio">
            {custo > 0 ? `${moeda(custo)} por ${curta(i.unidade)}` : 'Nenhuma compra com valor'}
          </Dado>
        )}
        {admin && custo > 0 && (
          <Dado rotulo="Valor em estoque">
            {moeda(Math.max(Number(i.quantidadeAtual), 0) * custo)}
          </Dado>
        )}
        <Dado rotulo="Avisa com menos de">
          {minimo > 0 ? quantidade(minimo, i.unidade) : 'Sem aviso'}
        </Dado>
        {i.fornecedorPadrao && <Dado rotulo="Fornecedor">{i.fornecedorPadrao}</Dado>}
      </dl>

      <LinkKardex item={{ lado: 'insumo', id: i.id, nome: i.nome, unidade: i.unidade }} />

      <div className="modal__acoes">
        <button type="button" className="botao botao--auto" onClick={aoAjustar}>
          Ajustar
        </button>
        <button type="button" className="botao botao--auto" onClick={aoEditar}>
          Editar
        </button>
        <button type="button" className="botao botao--primario botao--auto" onClick={aoComprar}>
          Comprei
        </button>
      </div>
    </Modal>
  );
}

function FormularioInsumo({ insumo, aoFechar, aoSalvar }) {
  const edicao = Boolean(insumo.id);
  const [form, setForm] = useState({
    nome: insumo.nome ?? '',
    unidade: insumo.unidade ?? 'KG',
    estoqueMinimo: Number(insumo.estoqueMinimo) > 0 ? paraCampo(insumo.estoqueMinimo) : '',
    controlaValidade: insumo.controlaValidade ?? false,
    fornecedorPadrao: insumo.fornecedorPadrao ?? '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const campo = (nome) => (e) => {
    setForm((f) => ({ ...f, [nome]: e.target.value }));
    setErro('');
  };

  async function enviar(e) {
    e.preventDefault();
    const minimo = form.estoqueMinimo.trim() ? lerNumero(form.estoqueMinimo) : 0;
    if (!(minimo >= 0)) {
      setErro('O aviso de "acabando" precisa ser um número.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const corpo = {
        nome: form.nome.trim(),
        unidade: form.unidade,
        estoqueMinimo: minimo,
        controlaValidade: form.controlaValidade,
        fornecedorPadrao: form.fornecedorPadrao.trim() || null,
      };
      if (edicao) await insumos.atualizar(insumo.id, corpo);
      else await insumos.criar(corpo);
      aoSalvar(edicao ? 'Ingrediente alterado.' : `${corpo.nome} cadastrado.`);
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={edicao ? 'Editar ingrediente' : 'Novo ingrediente'}
      largura={480}
    >
      <form onSubmit={enviar}>
        <Texto
          rotulo="Nome"
          value={form.nome}
          onChange={campo('nome')}
          required
          minLength={2}
          autoFocus={!edicao}
        />
        <Linha>
          <Selecao
            rotulo="Unidade"
            value={form.unidade}
            onChange={campo('unidade')}
            opcoes={UNIDADES}
          />
          <Texto
            rotulo="Avisar quando tiver menos de"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={form.estoqueMinimo}
            onChange={campo('estoqueMinimo')}
          />
        </Linha>
        <Texto
          rotulo="Fornecedor habitual"
          placeholder="Opcional"
          value={form.fornecedorPadrao}
          onChange={campo('fornecedorPadrao')}
        />
        <Interruptor
          rotulo="Controlar validade"
          dica="O Comprei passa a pedir a data de validade."
          checked={form.controlaValidade}
          onChange={(e) => setForm((f) => ({ ...f, controlaValidade: e.target.checked }))}
        />

        {erro && (
          <p className="alerta alerta--erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal__acoes">
          <button type="button" className="botao botao--auto" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao botao--primario botao--auto" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Comprei: quanto entrou e quanto pagou.
 *
 * Pede o TOTAL pago, e não o preço por unidade. É o número que está na
 * nota e no extrato; o preço do quilo, com a lata de 395 g, ela teria que
 * calcular de cabeça. A conta é do sistema, e é ela que atualiza o custo
 * médio que alimenta o custo de cada lote na Produção.
 *
 * O valor pago fica no estoque: não lança nada no Caixa. Se a compra saiu
 * da gaveta, a Saída se lança à parte, no Início.
 */
function FormularioCompra({ insumo, aoFechar, aoSalvar }) {
  const [qtd, setQtd] = useState('');
  const [total, setTotal] = useState('');
  const [validade, setValidade] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const unidade = curta(insumo.unidade);
  const n = lerNumero(qtd);
  const pago = lerNumero(total);
  const porUnidade = n > 0 && pago > 0 ? pago / n : null;
  const depois = Number(insumo.quantidadeAtual) + n;

  async function enviar(e) {
    e.preventDefault();
    if (!(n > 0)) {
      setErro('Informe quanto comprou.');
      return;
    }
    if (total.trim() && !(pago > 0)) {
      setErro('O valor pago não é um número válido.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await estoque.movimentar({
        tipo: 'ENTRADA_COMPRA',
        insumoId: insumo.id,
        quantidade: n,
        custoUnitario: porUnidade ? Number(porUnidade.toFixed(4)) : null,
        validade: validade || null,
      });
      aoSalvar(
        `Compra registrada: ${insumo.nome} agora tem ${quantidade(depois, insumo.unidade)}.`
      );
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSalvando(false);
    }
  }

  const mudar = (setter) => (e) => {
    setter(e.target.value);
    setErro('');
  };

  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Comprei ${insumo.nome}`} largura={460}>
      <form onSubmit={enviar}>
        <p className="ajuste__atual">
          Tem agora <strong>{quantidade(insumo.quantidadeAtual, insumo.unidade)}</strong>
          {n > 0 && (
            <>
              {' '}
              → vai ficar com <strong>{quantidade(depois, insumo.unidade)}</strong>
            </>
          )}
        </p>
        <Linha>
          <Texto
            rotulo={`Quanto comprou (${unidade})`}
            type="text"
            inputMode="decimal"
            value={qtd}
            onChange={mudar(setQtd)}
            required
            autoFocus
          />
          <Dinheiro
            rotulo="Quanto pagou (R$)"
            placeholder="Opcional"
            value={total}
            aoMudar={(v) => {
              setTotal(v);
              setErro('');
            }}
          />
        </Linha>
        {porUnidade && (
          <p className="ajuste__atual">
            Sai a <strong>{moeda(porUnidade)}</strong> por {unidade}.
          </p>
        )}
        {insumo.controlaValidade && (
          <Texto rotulo="Validade" type="date" value={validade} onChange={mudar(setValidade)} />
        )}

        {erro && (
          <p className="alerta alerta--erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal__acoes">
          <button type="button" className="botao botao--auto" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao botao--primario botao--auto" disabled={salvando}>
            {salvando ? 'Registrando...' : 'Registrar compra'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
