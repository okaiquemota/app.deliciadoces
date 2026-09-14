import { useCallback, useEffect, useState } from 'react';
import { Tabela } from '../components/Tabela.jsx';
import { Modal } from '../components/Modal.jsx';
import { Linha, Selecao, Texto } from '../components/Campo.jsx';
import { insumos, producoes, produtos } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { dataHora, moeda, quantidade } from '../utils/formato.js';

/**
 * Produção em lote.
 *
 * A ficha técnica é opcional — a cliente só cadastraria "se for simples".
 * Por isso a tela funciona dos dois jeitos: se o doce tem ficha, os
 * ingredientes vêm calculados e ela só confere; se não tem, ela informa
 * na mão (ou nem informa).
 */
export function Producao() {
  const [lista, setLista] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [registrando, setRegistrando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [p, c] = await Promise.all([producoes.listar({}), produtos.listar()]);
      setLista(p);
      setCatalogo(c);
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

  async function excluir(producao) {
    if (!window.confirm('Excluir este lote? Os ingredientes voltam ao estoque.')) return;
    try {
      await producoes.excluir(producao.id);
      carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <section>
      <h1 className="pagina__titulo">Produção</h1>
      <p className="pagina__texto">
        O lote consome ingredientes e gera doces prontos. A venda depois baixa o doce.
      </p>

      <div className="barra-acoes">
        <span className="barra-acoes__resumo">{lista.length} lote(s)</span>
        <button className="botao botao--primario botao--auto" onClick={() => setRegistrando(true)}>
          + Novo lote
        </button>
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}

      <Tabela
        carregando={carregando}
        dados={lista}
        vazio="Nenhum lote produzido ainda."
        colunas={[
          { chave: 'data', titulo: 'Quando', render: (p) => dataHora(p.data) },
          { chave: 'produto', titulo: 'Doce', render: (p) => p.produto?.nome },
          {
            chave: 'quantidade',
            titulo: 'Produziu',
            render: (p) => quantidade(p.quantidade, p.produto?.unidade),
          },
          {
            chave: 'ingredientes',
            titulo: 'Consumiu',
            render: (p) =>
              p.movimentacoes?.filter((m) => m.insumoId).length
                ? p.movimentacoes
                    .filter((m) => m.insumoId)
                    .map((m) => `${quantidade(m.quantidade, m.insumo?.unidade)} ${m.insumo?.nome}`)
                    .join(', ')
                : '—',
          },
          {
            chave: 'custoEstimado',
            titulo: 'Custo',
            alinhar: 'right',
            render: (p) => (p.custoEstimado ? moeda(p.custoEstimado) : '—'),
          },
          {
            chave: 'acoes',
            titulo: '',
            alinhar: 'right',
            render: (p) => (
              <button className="botao botao--texto botao--perigo" onClick={() => excluir(p)}>
                Excluir
              </button>
            ),
          },
        ]}
      />

      {registrando && (
        <FormularioProducao
          catalogo={catalogo}
          aoFechar={() => setRegistrando(false)}
          aoSalvar={() => {
            setRegistrando(false);
            carregar();
          }}
        />
      )}
    </section>
  );
}

function FormularioProducao({ catalogo, aoFechar, aoSalvar }) {
  const [produtoId, setProdutoId] = useState(catalogo[0]?.id ?? '');
  const [qtd, setQtd] = useState('');
  const [previsao, setPrevisao] = useState([]);
  const [manuais, setManuais] = useState([]);
  const [listaInsumos, setListaInsumos] = useState([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    insumos.listar().then(setListaInsumos).catch(() => setListaInsumos([]));
  }, []);

  // Busca a prévia da ficha técnica sempre que produto ou quantidade mudam
  useEffect(() => {
    if (!produtoId || !Number(qtd)) {
      setPrevisao([]);
      return;
    }
    producoes
      .previsao(produtoId, Number(qtd))
      .then(setPrevisao)
      .catch(() => setPrevisao([]));
  }, [produtoId, qtd]);

  const temFicha = previsao.length > 0;

  async function enviar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      await producoes.registrar({
        produtoId,
        quantidade: Number(qtd),
        // Sem ficha técnica, manda o que ela informou na mão (pode ser vazio)
        ...(temFicha ? {} : { insumos: manuais.filter((m) => m.insumoId && Number(m.quantidade)) }),
      });
      aoSalvar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Novo lote" largura={600}>
      <form onSubmit={enviar}>
        <Linha>
          <Selecao
            rotulo="Doce"
            value={produtoId}
            onChange={(e) => setProdutoId(e.target.value)}
            opcoes={catalogo.map((p) => ({ valor: p.id, rotulo: p.nome }))}
          />
          <Texto
            rotulo="Quantidade produzida"
            type="number"
            step="any"
            min="0.001"
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            required
          />
        </Linha>

        {temFicha ? (
          <div className="previsao">
            <h3 className="previsao__titulo">Vai consumir (pela ficha técnica)</h3>
            <ul className="previsao__lista">
              {previsao.map((i) => (
                <li key={i.insumoId}>
                  {quantidade(i.quantidade, i.unidade)} de {i.nome}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="previsao">
            <h3 className="previsao__titulo">Ingredientes usados (opcional)</h3>
            <p className="previsao__aviso">
              Este doce não tem ficha técnica cadastrada. Informe os ingredientes se quiser que o
              sistema baixe do estoque — ou deixe em branco.
            </p>
            {manuais.map((item, indice) => (
              <Linha key={indice}>
                <Selecao
                  rotulo=""
                  value={item.insumoId}
                  onChange={(e) =>
                    setManuais((a) =>
                      a.map((m, n) => (n === indice ? { ...m, insumoId: e.target.value } : m))
                    )
                  }
                  opcoes={listaInsumos.map((i) => ({ valor: i.id, rotulo: i.nome }))}
                />
                <Texto
                  rotulo=""
                  type="number"
                  step="any"
                  placeholder="Qtd."
                  value={item.quantidade}
                  onChange={(e) =>
                    setManuais((a) =>
                      a.map((m, n) => (n === indice ? { ...m, quantidade: e.target.value } : m))
                    )
                  }
                />
              </Linha>
            ))}
            <button
              type="button"
              className="botao botao--texto"
              onClick={() =>
                setManuais((a) => [...a, { insumoId: listaInsumos[0]?.id ?? '', quantidade: '' }])
              }
            >
              + adicionar ingrediente
            </button>
          </div>
        )}

        {erro && <p className="alerta alerta--erro">{erro}</p>}
        <button type="submit" className="botao botao--primario" disabled={salvando}>
          {salvando ? 'Registrando...' : 'Registrar lote'}
        </button>
      </form>
    </Modal>
  );
}
