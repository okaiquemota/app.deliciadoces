import { useCallback, useEffect, useState } from 'react';
import { Abas } from '../components/Abas.jsx';
import { Tabela } from '../components/Tabela.jsx';
import { Modal } from '../components/Modal.jsx';
import { Linha, Selecao, Texto } from '../components/Campo.jsx';
import {
  AjusteEstoque,
  HistoricoMovimentos,
  SaldoComAlerta,
  avisarEstoqueMudou,
  lerNumero,
  quantosAcabando,
} from '../components/EstoqueComum.jsx';
import { estoque, insumos } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { data as formatarData, moeda, quantidade, UNIDADE_CURTA } from '../utils/formato.js';

const UNIDADES = Object.entries(UNIDADE_CURTA).map(([valor, rotulo]) => ({
  valor,
  rotulo: `${rotulo} (${valor.toLowerCase()})`,
}));

/**
 * Estoque: o MATERIAL — ingredientes e embalagens. A pergunta desta tela
 * é "o que eu tenho para fazer os doces?".
 *
 * Os doces prontos moram na Produção, que responde "o que eu tenho para
 * vender?". Antes os dois dividiam esta tela, e o doce ficava espalhado:
 * o saldo aqui, o lote feito lá.
 */
export function Estoque() {
  const [aba, setAba] = useState('insumos');

  return (
    <section>
      <Abas
        ativa={aba}
        aoTrocar={setAba}
        abas={[
          { id: 'insumos', rotulo: 'Ingredientes' },
          { id: 'validade', rotulo: 'Validade' },
          { id: 'historico', rotulo: 'Histórico' },
        ]}
      />

      {aba === 'insumos' && <ListaInsumos />}
      {aba === 'validade' && <Validades />}
      {aba === 'historico' && (
        <HistoricoMovimentos
          de="insumos"
          rotuloItem="Ingrediente"
          vazio="Nenhuma entrada ou saída de material ainda."
        />
      )}
    </section>
  );
}

/**
 * A lista de ingredientes, com as duas coisas que acontecem com eles
 * direto na linha: **Comprei** (o gesto de toda semana) e **Ajustar**
 * (perdeu, ou a contagem não bate). Antes as duas passavam por um
 * "Movimentar" com um menu dentro — um toque e uma escolha a mais para
 * registrar a compra, que é quase sempre o que ela quer.
 */
function ListaInsumos() {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(null);
  const [comprando, setComprando] = useState(null);
  const [ajustando, setAjustando] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await insumos.listar());
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const acabando = quantosAcabando(lista);
  const depoisDeSalvar = (fechar) => () => {
    fechar(null);
    carregar();
    avisarEstoqueMudou();
  };

  return (
    <>
      <div className="barra-acoes">
        <span className="barra-acoes__resumo">
          {lista.length} ingrediente(s)
          {acabando > 0 && <span className="fechamento__falta"> · {acabando} acabando</span>}
        </span>
        <button className="botao botao--primario botao--auto" onClick={() => setEditando({})}>
          + Novo ingrediente
        </button>
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}

      <Tabela
        carregando={carregando}
        dados={lista}
        vazio="Nenhum ingrediente cadastrado ainda."
        colunas={[
          { chave: 'nome', titulo: 'Ingrediente' },
          {
            chave: 'quantidadeAtual',
            titulo: 'Em estoque',
            render: (i) => <SaldoComAlerta item={i} />,
          },
          {
            chave: 'estoqueMinimo',
            titulo: 'Mínimo',
            render: (i) => quantidade(i.estoqueMinimo, i.unidade),
          },
          {
            chave: 'custoUnitario',
            titulo: 'Custo médio',
            alinhar: 'right',
            render: (i) => `${moeda(i.custoUnitario)}/${UNIDADE_CURTA[i.unidade] ?? i.unidade}`,
          },
          {
            chave: 'acoes',
            titulo: '',
            alinhar: 'right',
            render: (i) => (
              <span className="acoes-linha">
                <button className="botao botao--texto" onClick={() => setComprando(i)}>
                  Comprei
                </button>
                <button className="botao botao--texto" onClick={() => setAjustando(i)}>
                  Ajustar
                </button>
                <button className="botao botao--texto" onClick={() => setEditando(i)}>
                  Editar
                </button>
              </span>
            ),
          },
        ]}
      />

      {editando && (
        <FormularioInsumo
          insumo={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={depoisDeSalvar(setEditando)}
        />
      )}
      {comprando && (
        <FormularioCompra
          insumo={comprando}
          aoFechar={() => setComprando(null)}
          aoSalvar={depoisDeSalvar(setComprando)}
        />
      )}
      {ajustando && (
        <AjusteEstoque
          alvo={ajustando}
          tipoAlvo="insumo"
          aoFechar={() => setAjustando(null)}
          aoSalvar={depoisDeSalvar(setAjustando)}
        />
      )}
    </>
  );
}

function FormularioInsumo({ insumo, aoFechar, aoSalvar }) {
  const edicao = Boolean(insumo.id);
  const [form, setForm] = useState({
    nome: insumo.nome ?? '',
    unidade: insumo.unidade ?? 'KG',
    estoqueMinimo: insumo.estoqueMinimo ?? 0,
    controlaValidade: insumo.controlaValidade ?? false,
    fornecedorPadrao: insumo.fornecedorPadrao ?? '',
  });
  const [erro, setErro] = useState('');
  const campo = (nome) => (e) => setForm((f) => ({ ...f, [nome]: e.target.value }));

  async function enviar(e) {
    e.preventDefault();
    try {
      const corpo = {
        ...form,
        estoqueMinimo: Number(form.estoqueMinimo),
        fornecedorPadrao: form.fornecedorPadrao || null,
      };
      if (edicao) await insumos.atualizar(insumo.id, corpo);
      else await insumos.criar(corpo);
      aoSalvar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={edicao ? 'Editar ingrediente' : 'Novo ingrediente'}>
      <form onSubmit={enviar}>
        <Texto rotulo="Nome" value={form.nome} onChange={campo('nome')} required />
        <Linha>
          <Selecao
            rotulo="Unidade"
            value={form.unidade}
            onChange={campo('unidade')}
            opcoes={UNIDADES}
          />
          <Texto
            rotulo="Estoque mínimo"
            type="number"
            step="any"
            min="0"
            value={form.estoqueMinimo}
            onChange={campo('estoqueMinimo')}
            dica="Avisa quando chegar nesse nível"
          />
        </Linha>
        <Texto
          rotulo="Fornecedor habitual (opcional)"
          value={form.fornecedorPadrao}
          onChange={campo('fornecedorPadrao')}
        />
        <label className="campo campo--inline">
          <input
            type="checkbox"
            checked={form.controlaValidade}
            onChange={(e) => setForm((f) => ({ ...f, controlaValidade: e.target.checked }))}
          />
          <span>Controlar validade nas compras</span>
        </label>

        {erro && <p className="alerta alerta--erro">{erro}</p>}
        <button type="submit" className="botao botao--primario">
          Salvar
        </button>
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
 */
function FormularioCompra({ insumo, aoFechar, aoSalvar }) {
  const [qtd, setQtd] = useState('');
  const [total, setTotal] = useState('');
  const [validade, setValidade] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const unidade = UNIDADE_CURTA[insumo.unidade] ?? insumo.unidade;
  const n = lerNumero(qtd);
  const pago = lerNumero(total);
  const porUnidade = n > 0 && pago > 0 ? pago / n : null;

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
      aoSalvar();
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
              → vai ficar com{' '}
              <strong>{quantidade(Number(insumo.quantidadeAtual) + n, insumo.unidade)}</strong>
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
          <Texto
            rotulo="Quanto pagou (R$)"
            type="text"
            inputMode="decimal"
            placeholder="Opcional"
            value={total}
            onChange={mudar(setTotal)}
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

/**
 * Lotes com validade.
 *
 * A unidade é o LOTE e não o ingrediente: a validade está na entrada de
 * compra, então o mesmo creme de leite pode ter três caixas com três
 * datas. Agrupar por ingrediente esconderia justamente o que ela precisa
 * saber — qual usar primeiro.
 *
 * Vencido e vencendo ficam visualmente separados porque a ação é oposta:
 * um se joga fora, o outro se usa antes. O filtro abre em "30 dias", que
 * é a pergunta do dia a dia; "vencidos" é conferência de descarte.
 */
const SITUACOES = [
  { id: '30', rotulo: 'Vence em 30 dias' },
  { id: '7', rotulo: 'Vence em 7 dias' },
  { id: 'vencidos', rotulo: 'Vencidos' },
  { id: 'todos', rotulo: 'Todos' },
];

function Validades() {
  const [situacao, setSituacao] = useState('30');
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await estoque.validades(situacao === 'todos' ? {} : { situacao }));
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }, [situacao]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const vencidos = lista.filter((l) => l.vencido).length;

  return (
    <>
      {/* Filtro, não navegação: um grupo de botões com o ligado anunciado,
          como os controles do Caixa. Quebra em 2x2 abaixo de 400px — numa
          fileira, "Vence em 30 dias" empurrava "Todos" para fora da tela. */}
      <div className="seletor-periodo seletor-periodo--quebra" role="group" aria-label="Situação">
        {SITUACOES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={situacao === s.id}
            className={
              situacao === s.id
                ? 'seletor-periodo__item seletor-periodo__item--ativo'
                : 'seletor-periodo__item'
            }
            onClick={() => setSituacao(s.id)}
          >
            {s.rotulo}
          </button>
        ))}
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}

      <div className="barra-acoes">
        <span className="barra-acoes__resumo">
          {lista.length} lote(s)
          {vencidos > 0 && <span className="fechamento__falta"> · {vencidos} vencido(s)</span>}
        </span>
      </div>

      {/* O sistema não sabe quanto RESTA de cada lote: as saídas não
          apontam para qual entrada baixaram. Dizer isso é melhor que
          deixar ela achar que a coluna é saldo atual. */}
      <p className="cartao__aviso">
        A quantidade é a que entrou na compra. O sistema ainda não acompanha quanto sobrou de cada
        lote separadamente.
      </p>

      <Tabela
        carregando={carregando}
        dados={lista}
        vazio="Nenhum lote com validade neste filtro."
        colunas={[
          { chave: 'insumo', titulo: 'Ingrediente', render: (l) => l.insumo?.nome ?? '—' },
          {
            chave: 'quantidadeEntrada',
            titulo: 'Entrou',
            render: (l) => quantidade(l.quantidadeEntrada, l.insumo?.unidade),
          },
          { chave: 'data', titulo: 'Comprado em', render: (l) => formatarData(l.data) },
          { chave: 'validade', titulo: 'Vence em', render: (l) => formatarData(l.validade) },
          { chave: 'dias', titulo: 'Situação', render: (l) => <Prazo lote={l} /> },
        ]}
      />
    </>
  );
}

/** O prazo em palavras: "vencido há 3 dias" diz o que fazer; "-3" não. */
function Prazo({ lote }) {
  if (lote.vencido) {
    const d = Math.abs(lote.dias);
    return <span className="fechamento__falta">vencido há {d === 1 ? '1 dia' : `${d} dias`}</span>;
  }
  if (lote.dias === 0) {
    return <span className="fechamento__sobra">vence hoje</span>;
  }
  const classe = lote.dias <= 7 ? 'fechamento__sobra' : undefined;
  return <span className={classe}>em {lote.dias === 1 ? '1 dia' : `${lote.dias} dias`}</span>;
}
