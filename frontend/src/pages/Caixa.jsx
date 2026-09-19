import { useCallback, useEffect, useMemo, useState } from 'react';
import { Abas } from '../components/Abas.jsx';
import { Tabela } from '../components/Tabela.jsx';
import { Modal } from '../components/Modal.jsx';
import { Linha, Selecao, Texto } from '../components/Campo.jsx';
import { despesas, produtos, vendas } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { dataHora, moeda, paraInput, quantidade, ROTULO_PAGAMENTO } from '../utils/formato.js';

const FORMAS = Object.entries(ROTULO_PAGAMENTO).map(([valor, rotulo]) => ({ valor, rotulo }));

/** Primeiro dia do mês corrente — período padrão das listagens. */
function inicioDoMes() {
  const d = new Date();
  d.setDate(1);
  return paraInput(d);
}

export function Caixa() {
  const [aba, setAba] = useState('vendas');
  const [periodo, setPeriodo] = useState({ inicio: inicioDoMes(), fim: paraInput() });

  return (
    <section>
      <header className="pagina__cabecalho">
        <div>
          <h1 className="pagina__titulo">Caixa</h1>
          <p className="pagina__texto">
            Vendas e despesas. Toda venda é à vista — a Delícia Doces não vende fiado.
          </p>
        </div>
        <div className="filtro-periodo">
          <input
            type="date"
            className="campo__entrada"
            value={periodo.inicio}
            onChange={(e) => setPeriodo((p) => ({ ...p, inicio: e.target.value }))}
          />
          <span>até</span>
          <input
            type="date"
            className="campo__entrada"
            value={periodo.fim}
            onChange={(e) => setPeriodo((p) => ({ ...p, fim: e.target.value }))}
          />
        </div>
      </header>

      <Abas
        ativa={aba}
        aoTrocar={setAba}
        abas={[
          { id: 'vendas', rotulo: 'Vendas' },
          { id: 'despesas', rotulo: 'Despesas' },
        ]}
      />

      {aba === 'vendas' ? <Vendas periodo={periodo} /> : <Despesas periodo={periodo} />}
    </section>
  );
}

// ---------------------------------------------------------------- VENDAS

function Vendas({ periodo }) {
  const [lista, setLista] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [v, p] = await Promise.all([
        vendas.listar({ ...periodo, incluirCanceladas: true }),
        produtos.listar(),
      ]);
      setLista(v);
      setCatalogo(p);
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar as vendas.'));
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const total = useMemo(
    () => lista.filter((v) => !v.cancelada).reduce((s, v) => s + Number(v.total), 0),
    [lista]
  );

  async function cancelar(venda) {
    // "Excluir" na tela é cancelamento por baixo: nada some e o estoque
    // volta. A cliente erra com frequência e precisa poder voltar atrás.
    if (!window.confirm(`Excluir a venda de ${moeda(venda.total)}? O estoque será devolvido.`))
      return;
    try {
      await vendas.cancelar(venda.id);
      carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <>
      <div className="barra-acoes">
        <span className="barra-acoes__resumo">
          {lista.filter((v) => !v.cancelada).length} venda(s) · <strong>{moeda(total)}</strong>
        </span>
        <button className="botao botao--primario botao--auto" onClick={() => setEditando({})}>
          + Nova venda
        </button>
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}

      <Tabela
        carregando={carregando}
        dados={lista}
        vazio="Nenhuma venda no período."
        colunas={[
          { chave: 'data', titulo: 'Data', render: (v) => dataHora(v.data) },
          {
            chave: 'itens',
            titulo: 'Itens',
            render: (v) =>
              v.itens
                .map((i) => `${quantidade(i.quantidade)}× ${i.produto?.nome ?? ''}`)
                .join(', '),
          },
          {
            chave: 'formaPagamento',
            titulo: 'Pagamento',
            render: (v) => ROTULO_PAGAMENTO[v.formaPagamento],
          },
          {
            chave: 'total',
            titulo: 'Total',
            alinhar: 'right',
            render: (v) => (
              <span className={v.cancelada ? 'riscado' : undefined}>{moeda(v.total)}</span>
            ),
          },
          {
            chave: 'acoes',
            titulo: '',
            alinhar: 'right',
            render: (v) =>
              v.cancelada ? (
                <span className="etiqueta">cancelada</span>
              ) : (
                <>
                  <button className="botao botao--texto" onClick={() => setEditando(v)}>
                    Editar
                  </button>
                  <button className="botao botao--texto botao--perigo" onClick={() => cancelar(v)}>
                    Excluir
                  </button>
                </>
              ),
          },
        ]}
      />

      {editando && (
        <FormularioVenda
          venda={editando}
          catalogo={catalogo}
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

function FormularioVenda({ venda, catalogo, aoFechar, aoSalvar }) {
  const edicao = Boolean(venda.id);
  const [itens, setItens] = useState(
    edicao
      ? venda.itens.map((i) => ({ produtoId: i.produtoId, quantidade: Number(i.quantidade) }))
      : [{ produtoId: catalogo[0]?.id ?? '', quantidade: 1 }]
  );
  const [formaPagamento, setFormaPagamento] = useState(venda.formaPagamento ?? 'DINHEIRO');
  const [desconto, setDesconto] = useState(Number(venda.desconto ?? 0));
  const [clienteNome, setClienteNome] = useState(venda.clienteNome ?? '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Prévia do total. O servidor recalcula — aqui é só para ela conferir.
  const total = useMemo(() => {
    const soma = itens.reduce((s, item) => {
      const produto = catalogo.find((p) => p.id === item.produtoId);
      return s + Number(produto?.precoVenda ?? 0) * Number(item.quantidade || 0);
    }, 0);
    return Math.max(0, soma - Number(desconto || 0));
  }, [itens, desconto, catalogo]);

  async function enviar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    const corpo = {
      itens: itens.filter((i) => i.produtoId && Number(i.quantidade) > 0),
      formaPagamento,
      desconto: Number(desconto || 0),
      clienteNome: clienteNome || null,
    };
    try {
      if (edicao) await vendas.atualizar(venda.id, corpo);
      else await vendas.criar(corpo);
      aoSalvar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={edicao ? 'Editar venda' : 'Nova venda'} largura={620}>
      <form onSubmit={enviar}>
        {itens.map((item, indice) => (
          <Linha key={indice}>
            <Selecao
              rotulo={indice === 0 ? 'Produto' : ''}
              value={item.produtoId}
              onChange={(e) =>
                setItens((atual) =>
                  atual.map((i, n) => (n === indice ? { ...i, produtoId: e.target.value } : i))
                )
              }
              opcoes={catalogo.map((p) => ({
                valor: p.id,
                rotulo: `${p.nome} — ${moeda(p.precoVenda)}`,
              }))}
            />
            <Texto
              rotulo={indice === 0 ? 'Qtd.' : ''}
              type="number"
              min="0.001"
              step="any"
              value={item.quantidade}
              onChange={(e) =>
                setItens((atual) =>
                  atual.map((i, n) => (n === indice ? { ...i, quantidade: e.target.value } : i))
                )
              }
            />
            {itens.length > 1 && (
              <button
                type="button"
                className="botao botao--texto botao--perigo"
                onClick={() => setItens((a) => a.filter((_, n) => n !== indice))}
              >
                remover
              </button>
            )}
          </Linha>
        ))}

        <button
          type="button"
          className="botao botao--texto"
          onClick={() =>
            setItens((a) => [...a, { produtoId: catalogo[0]?.id ?? '', quantidade: 1 }])
          }
        >
          + adicionar item
        </button>

        <Linha>
          <Selecao
            rotulo="Forma de pagamento"
            value={formaPagamento}
            onChange={(e) => setFormaPagamento(e.target.value)}
            opcoes={FORMAS}
          />
          <Texto
            rotulo="Desconto (R$)"
            type="number"
            min="0"
            step="0.01"
            value={desconto}
            onChange={(e) => setDesconto(e.target.value)}
            dica="Quase nunca usado"
          />
        </Linha>

        <Texto
          rotulo="Cliente (opcional)"
          value={clienteNome}
          onChange={(e) => setClienteNome(e.target.value)}
          dica="A Dalila normalmente não anota"
        />

        <p className="total-previa">
          Total: <strong>{moeda(total)}</strong>
        </p>

        {erro && <p className="alerta alerta--erro">{erro}</p>}

        <button type="submit" className="botao botao--primario" disabled={salvando}>
          {salvando ? 'Salvando...' : edicao ? 'Salvar alterações' : 'Registrar venda'}
        </button>
      </form>
    </Modal>
  );
}

// -------------------------------------------------------------- DESPESAS

function Despesas({ periodo }) {
  const [lista, setLista] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [d, c] = await Promise.all([despesas.listar(periodo), despesas.categorias()]);
      setLista(d);
      setCategorias(c);
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar as despesas.'));
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const totais = useMemo(() => {
    const custo = lista
      .filter((d) => d.categoria.tipo === 'CUSTO_OPERACIONAL')
      .reduce((s, d) => s + Number(d.valor), 0);
    const retirada = lista
      .filter((d) => d.categoria.tipo === 'RETIRADA_PESSOAL')
      .reduce((s, d) => s + Number(d.valor), 0);
    return { custo, retirada };
  }, [lista]);

  async function excluir(despesa) {
    if (!window.confirm(`Excluir "${despesa.descricao}"?`)) return;
    try {
      await despesas.excluir(despesa.id);
      carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <>
      <div className="barra-acoes">
        <span className="barra-acoes__resumo">
          Custos <strong>{moeda(totais.custo)}</strong> · Retiradas{' '}
          <strong>{moeda(totais.retirada)}</strong>
        </span>
        <button className="botao botao--primario botao--auto" onClick={() => setEditando({})}>
          + Nova despesa
        </button>
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}

      <Tabela
        carregando={carregando}
        dados={lista}
        vazio="Nenhuma despesa no período."
        colunas={[
          { chave: 'data', titulo: 'Data', render: (d) => dataHora(d.data) },
          { chave: 'descricao', titulo: 'Descrição' },
          {
            chave: 'categoria',
            titulo: 'Categoria',
            render: (d) => (
              <span
                className={
                  d.categoria.tipo === 'RETIRADA_PESSOAL'
                    ? 'etiqueta etiqueta--retirada'
                    : 'etiqueta'
                }
              >
                {d.categoria.nome}
              </span>
            ),
          },
          { chave: 'valor', titulo: 'Valor', alinhar: 'right', render: (d) => moeda(d.valor) },
          {
            chave: 'acoes',
            titulo: '',
            alinhar: 'right',
            render: (d) => (
              <>
                <button className="botao botao--texto" onClick={() => setEditando(d)}>
                  Editar
                </button>
                <button className="botao botao--texto botao--perigo" onClick={() => excluir(d)}>
                  Excluir
                </button>
              </>
            ),
          },
        ]}
      />

      <p className="cartao__aviso">
        Retirada pessoal sai do caixa, mas não entra no cálculo de lucro do negócio.
      </p>

      {editando && (
        <FormularioDespesa
          despesa={editando}
          categorias={categorias}
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

function FormularioDespesa({ despesa, categorias, aoFechar, aoSalvar }) {
  const edicao = Boolean(despesa.id);
  const [form, setForm] = useState({
    descricao: despesa.descricao ?? '',
    valor: despesa.valor ?? '',
    categoriaId: despesa.categoriaId ?? categorias[0]?.id ?? '',
    fornecedor: despesa.fornecedor ?? '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const campo = (nome) => (e) => setForm((f) => ({ ...f, [nome]: e.target.value }));

  async function enviar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      const corpo = { ...form, valor: Number(form.valor), fornecedor: form.fornecedor || null };
      if (edicao) await despesas.atualizar(despesa.id, corpo);
      else await despesas.criar(corpo);
      aoSalvar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={edicao ? 'Editar despesa' : 'Nova despesa'}>
      <form onSubmit={enviar}>
        <Texto rotulo="Descrição" value={form.descricao} onChange={campo('descricao')} required />
        <Linha>
          <Texto
            rotulo="Valor (R$)"
            type="number"
            step="0.01"
            min="0.01"
            value={form.valor}
            onChange={campo('valor')}
            required
          />
          <Selecao
            rotulo="Categoria"
            value={form.categoriaId}
            onChange={campo('categoriaId')}
            opcoes={categorias.map((c) => ({
              valor: c.id,
              rotulo: c.tipo === 'RETIRADA_PESSOAL' ? `${c.nome} (não é custo)` : c.nome,
            }))}
          />
        </Linha>
        <Texto
          rotulo="Fornecedor (opcional)"
          value={form.fornecedor}
          onChange={campo('fornecedor')}
        />

        {erro && <p className="alerta alerta--erro">{erro}</p>}

        <button type="submit" className="botao botao--primario" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </form>
    </Modal>
  );
}
