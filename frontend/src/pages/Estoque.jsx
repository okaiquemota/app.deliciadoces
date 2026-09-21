import { useCallback, useEffect, useState } from 'react';
import { Abas } from '../components/Abas.jsx';
import { Tabela } from '../components/Tabela.jsx';
import { Modal } from '../components/Modal.jsx';
import { Linha, Selecao, Texto } from '../components/Campo.jsx';
import { estoque, insumos, produtos } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import {
  data as formatarData,
  dataHora,
  moeda,
  quantidade,
  ROTULO_MOVIMENTACAO,
  UNIDADE_CURTA,
} from '../utils/formato.js';

const UNIDADES = Object.entries(UNIDADE_CURTA).map(([valor, rotulo]) => ({
  valor,
  rotulo: `${rotulo} (${valor.toLowerCase()})`,
}));

export function Estoque() {
  const [aba, setAba] = useState('insumos');

  return (
    <section>
      <Abas
        ativa={aba}
        aoTrocar={setAba}
        abas={[
          { id: 'insumos', rotulo: 'Ingredientes' },
          { id: 'produtos', rotulo: 'Doces prontos' },
          { id: 'validade', rotulo: 'Validade' },
          { id: 'historico', rotulo: 'Histórico' },
        ]}
      />

      {aba === 'insumos' && <ListaInsumos />}
      {aba === 'produtos' && <ListaProdutos />}
      {aba === 'validade' && <Validades />}
      {aba === 'historico' && <Historico />}
    </section>
  );
}

/** Marca em vermelho quem está no ou abaixo do mínimo. */
function saldoComAlerta(item) {
  const baixo =
    Number(item.estoqueMinimo) > 0 && Number(item.quantidadeAtual) <= Number(item.estoqueMinimo);
  return (
    <span className={baixo ? 'saldo saldo--baixo' : 'saldo'}>
      {quantidade(item.quantidadeAtual, item.unidade)}
      {baixo && <span className="etiqueta etiqueta--alerta">acabando</span>}
    </span>
  );
}

function ListaInsumos() {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(null);
  const [movimentando, setMovimentando] = useState(null);

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

  return (
    <>
      <div className="barra-acoes">
        <span className="barra-acoes__resumo">{lista.length} ingrediente(s)</span>
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
          { chave: 'quantidadeAtual', titulo: 'Em estoque', render: saldoComAlerta },
          {
            chave: 'estoqueMinimo',
            titulo: 'Mínimo',
            render: (i) => quantidade(i.estoqueMinimo, i.unidade),
          },
          {
            chave: 'custoUnitario',
            titulo: 'Custo médio',
            alinhar: 'right',
            render: (i) => moeda(i.custoUnitario),
          },
          {
            chave: 'acoes',
            titulo: '',
            alinhar: 'right',
            render: (i) => (
              <>
                <button className="botao botao--texto" onClick={() => setMovimentando(i)}>
                  Movimentar
                </button>
                <button className="botao botao--texto" onClick={() => setEditando(i)}>
                  Editar
                </button>
              </>
            ),
          },
        ]}
      />

      {editando && (
        <FormularioInsumo
          insumo={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}

      {movimentando && (
        <FormularioMovimentacao
          alvo={movimentando}
          tipoAlvo="insumo"
          aoFechar={() => setMovimentando(null)}
          aoSalvar={() => {
            setMovimentando(null);
            carregar();
          }}
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

function ListaProdutos() {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await produtos.listar());
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

  return (
    <>
      <div className="barra-acoes">
        <span className="barra-acoes__resumo">{lista.length} doce(s)</span>
        <button className="botao botao--primario botao--auto" onClick={() => setEditando({})}>
          + Novo doce
        </button>
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}

      <Tabela
        carregando={carregando}
        dados={lista}
        vazio="Nenhum doce cadastrado ainda."
        colunas={[
          { chave: 'nome', titulo: 'Doce' },
          { chave: 'quantidadeAtual', titulo: 'Prontos', render: saldoComAlerta },
          {
            chave: 'precoVenda',
            titulo: 'Preço',
            alinhar: 'right',
            render: (p) => moeda(p.precoVenda),
          },
          {
            chave: 'rendimentoReceita',
            titulo: 'Receita rende',
            render: (p) => (p.rendimentoReceita ? `${p.rendimentoReceita} un` : '—'),
          },
          {
            chave: 'acoes',
            titulo: '',
            alinhar: 'right',
            render: (p) => (
              <button className="botao botao--texto" onClick={() => setEditando(p)}>
                Editar
              </button>
            ),
          },
        ]}
      />

      {editando && (
        <FormularioProduto
          produto={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}
    </>
  );
}

function FormularioProduto({ produto, aoFechar, aoSalvar }) {
  const edicao = Boolean(produto.id);
  const [form, setForm] = useState({
    nome: produto.nome ?? '',
    precoVenda: produto.precoVenda ?? '',
    unidade: produto.unidade ?? 'UNIDADE',
    estoqueMinimo: produto.estoqueMinimo ?? 0,
    rendimentoReceita: produto.rendimentoReceita ?? '',
  });
  const [erro, setErro] = useState('');
  const campo = (nome) => (e) => setForm((f) => ({ ...f, [nome]: e.target.value }));

  async function enviar(e) {
    e.preventDefault();
    try {
      const corpo = {
        ...form,
        precoVenda: Number(form.precoVenda),
        estoqueMinimo: Number(form.estoqueMinimo),
        rendimentoReceita: form.rendimentoReceita ? Number(form.rendimentoReceita) : null,
      };
      if (edicao) await produtos.atualizar(produto.id, corpo);
      else await produtos.criar(corpo);
      aoSalvar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={edicao ? 'Editar doce' : 'Novo doce'}>
      <form onSubmit={enviar}>
        <Texto rotulo="Nome" value={form.nome} onChange={campo('nome')} required />
        <Linha>
          <Texto
            rotulo="Preço de venda (R$)"
            type="number"
            step="0.01"
            min="0.01"
            value={form.precoVenda}
            onChange={campo('precoVenda')}
            required
          />
          <Texto
            rotulo="Estoque mínimo"
            type="number"
            step="any"
            min="0"
            value={form.estoqueMinimo}
            onChange={campo('estoqueMinimo')}
          />
        </Linha>
        <Texto
          rotulo="Uma receita rende quantos? (opcional)"
          type="number"
          min="1"
          value={form.rendimentoReceita}
          onChange={campo('rendimentoReceita')}
          dica="Só precisa se for usar ficha técnica"
        />

        {erro && <p className="alerta alerta--erro">{erro}</p>}
        <button type="submit" className="botao botao--primario">
          Salvar
        </button>
      </form>
    </Modal>
  );
}

function FormularioMovimentacao({ alvo, tipoAlvo, aoFechar, aoSalvar }) {
  const [form, setForm] = useState({
    tipo: 'ENTRADA_COMPRA',
    quantidade: '',
    custoUnitario: '',
    validade: '',
    motivo: '',
  });
  const [erro, setErro] = useState('');
  const campo = (nome) => (e) => setForm((f) => ({ ...f, [nome]: e.target.value }));
  const precisaMotivo = form.tipo === 'PERDA' || form.tipo === 'AJUSTE';

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    try {
      await estoque.movimentar({
        tipo: form.tipo,
        [tipoAlvo === 'insumo' ? 'insumoId' : 'produtoId']: alvo.id,
        quantidade: Number(form.quantidade),
        custoUnitario: form.custoUnitario ? Number(form.custoUnitario) : null,
        validade: form.validade || null,
        motivo: form.motivo || null,
      });
      aoSalvar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Movimentar — ${alvo.nome}`}>
      <form onSubmit={enviar}>
        <Selecao
          rotulo="O que aconteceu"
          value={form.tipo}
          onChange={campo('tipo')}
          opcoes={[
            { valor: 'ENTRADA_COMPRA', rotulo: 'Comprei' },
            { valor: 'PERDA', rotulo: 'Perdi (estragou, venceu)' },
            { valor: 'AJUSTE', rotulo: 'Corrigir contagem' },
          ]}
        />

        <Linha>
          <Texto
            rotulo="Quantidade"
            type="number"
            step="any"
            value={form.quantidade}
            onChange={campo('quantidade')}
            required
            dica={
              form.tipo === 'AJUSTE'
                ? 'Use negativo para diminuir (ex.: -2)'
                : `Em ${UNIDADE_CURTA[alvo.unidade] ?? alvo.unidade}`
            }
          />
          {form.tipo === 'ENTRADA_COMPRA' && (
            <Texto
              rotulo="Custo por unidade (R$)"
              type="number"
              step="0.0001"
              value={form.custoUnitario}
              onChange={campo('custoUnitario')}
              dica="Recalcula o custo médio"
            />
          )}
        </Linha>

        {form.tipo === 'ENTRADA_COMPRA' && alvo.controlaValidade && (
          <Texto rotulo="Validade" type="date" value={form.validade} onChange={campo('validade')} />
        )}

        {precisaMotivo && (
          <Texto
            rotulo="Motivo"
            value={form.motivo}
            onChange={campo('motivo')}
            required
            dica="Obrigatório para perda e ajuste"
          />
        )}

        {erro && <p className="alerta alerta--erro">{erro}</p>}
        <button type="submit" className="botao botao--primario">
          Registrar
        </button>
      </form>
    </Modal>
  );
}

function Historico() {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    estoque
      .movimentacoes({})
      .then(setLista)
      .finally(() => setCarregando(false));
  }, []);

  return (
    <>
      <Tabela
        carregando={carregando}
        dados={lista}
        vazio="Nenhuma movimentação registrada."
        colunas={[
          { chave: 'data', titulo: 'Quando', render: (m) => dataHora(m.data) },
          {
            chave: 'item',
            titulo: 'Item',
            render: (m) => m.insumo?.nome ?? m.produto?.nome ?? '—',
          },
          {
            chave: 'tipo',
            titulo: 'O que foi',
            render: (m) => <span className="etiqueta">{ROTULO_MOVIMENTACAO[m.tipo]}</span>,
          },
          {
            chave: 'quantidade',
            titulo: 'Qtd.',
            alinhar: 'right',
            render: (m) => quantidade(m.quantidade, m.insumo?.unidade ?? m.produto?.unidade ?? ''),
          },
          { chave: 'motivo', titulo: 'Motivo', render: (m) => m.motivo ?? '' },
        ]}
      />
    </>
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
      <nav className="seletor-periodo">
        {SITUACOES.map((s) => (
          <button
            key={s.id}
            type="button"
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
      </nav>

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
