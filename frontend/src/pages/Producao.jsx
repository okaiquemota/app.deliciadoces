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
  paraCampo,
  quantosAcabando,
} from '../components/EstoqueComum.jsx';
import { insumos, producoes, produtos } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { dataHora, moeda, quantidade, UNIDADE_CURTA } from '../utils/formato.js';

/**
 * Produção: os DOCES. A pergunta desta tela é "o que eu tenho para
 * vender?" — quantos de cada doce estão prontos, o que está acabando, e
 * o lote que ela acabou de fazer.
 *
 * O material (ingredientes e embalagens) fica no Estoque. Antes o doce
 * ficava espalhado: o saldo e o cadastro lá, o lote aqui.
 *
 * Três abas:
 *   Doces     o catálogo com o que tem pronto, e na própria linha o que se
 *             faz com cada doce: produzir, ajustar (perdeu, contagem) e
 *             editar — com a receita dentro;
 *   Lotes     o que foi produzido, para conferir ou desfazer um lançamento;
 *   Histórico tudo o que entrou e saiu de doce: lotes, vendas, perdas.
 */
export function Producao() {
  const [aba, setAba] = useState('doces');
  const [catalogo, setCatalogo] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const [produzindo, setProduzindo] = useState(null);
  const [editando, setEditando] = useState(null);
  const [ajustando, setAjustando] = useState(null);
  // Muda a cada lançamento: as abas Lotes e Histórico usam na `key` e
  // buscam de novo, em vez de mostrarem a lista de antes do lançamento.
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    try {
      setCatalogo(await produtos.listar());
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

  /** Fecha a janela, avisa e recarrega o que o lançamento mudou. */
  const concluir = (fechar, mensagem) => () => {
    fechar(null);
    setAviso(mensagem);
    setVersao((v) => v + 1);
    carregar();
    avisarEstoqueMudou();
  };

  return (
    <section>
      <Abas
        ativa={aba}
        aoTrocar={(id) => {
          setAba(id);
          setAviso('');
        }}
        abas={[
          { id: 'doces', rotulo: 'Doces' },
          { id: 'lotes', rotulo: 'Lotes' },
          { id: 'historico', rotulo: 'Histórico' },
        ]}
      />

      {erro && <p className="alerta alerta--erro">{erro}</p>}
      {aviso && (
        <p className="alerta alerta--ok" role="status">
          {aviso}
        </p>
      )}

      {aba === 'doces' && (
        <ListaDoces
          catalogo={catalogo}
          carregando={carregando}
          aoProduzir={(doce) => setProduzindo({ produtoId: doce?.id })}
          aoAjustar={setAjustando}
          aoEditar={setEditando}
        />
      )}
      {aba === 'lotes' && (
        <ListaLotes
          key={versao}
          aoRegistrar={() => setProduzindo({})}
          aoExcluir={() => {
            setAviso('Lote excluído.');
            setVersao((v) => v + 1);
            carregar();
            avisarEstoqueMudou();
          }}
        />
      )}
      {aba === 'historico' && (
        <HistoricoMovimentos
          key={versao}
          de="doces"
          rotuloItem="Doce"
          vazio="Nenhuma entrada ou saída de doce ainda."
        />
      )}

      {produzindo && (
        <FormularioLote
          catalogo={catalogo}
          produtoInicial={produzindo.produtoId}
          aoFechar={() => setProduzindo(null)}
          aoSalvar={concluir(setProduzindo, 'Lote registrado.')}
        />
      )}
      {editando && (
        <FormularioDoce
          doce={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={concluir(setEditando, editando.id ? 'Doce alterado.' : 'Doce cadastrado.')}
        />
      )}
      {ajustando && (
        <AjusteEstoque
          alvo={ajustando}
          tipoAlvo="produto"
          aoFechar={() => setAjustando(null)}
          aoSalvar={concluir(setAjustando, 'Estoque do doce ajustado.')}
        />
      )}
    </section>
  );
}

// ============================================================ doces

function ListaDoces({ catalogo, carregando, aoProduzir, aoAjustar, aoEditar }) {
  const acabando = quantosAcabando(catalogo);

  return (
    <>
      <div className="barra-acoes">
        <span className="barra-acoes__resumo">
          {catalogo.length} doce(s)
          {acabando > 0 && <span className="fechamento__falta"> · {acabando} acabando</span>}
        </span>
        <span className="acoes-linha">
          <button className="botao botao--auto" onClick={() => aoEditar({})}>
            + Novo doce
          </button>
          <button
            className="botao botao--primario botao--auto"
            onClick={() => aoProduzir(null)}
            disabled={!catalogo.length}
          >
            Registrar lote
          </button>
        </span>
      </div>

      <Tabela
        carregando={carregando}
        dados={catalogo}
        vazio="Nenhum doce cadastrado ainda. Comece pelo + Novo doce."
        colunas={[
          { chave: 'nome', titulo: 'Doce' },
          {
            chave: 'quantidadeAtual',
            titulo: 'Prontos',
            render: (p) => <SaldoComAlerta item={p} />,
          },
          {
            chave: 'precoVenda',
            titulo: 'Preço',
            alinhar: 'right',
            render: (p) => moeda(p.precoVenda),
          },
          {
            chave: 'rendimentoReceita',
            titulo: 'Receita',
            render: (p) => (p.rendimentoReceita ? `rende ${p.rendimentoReceita}` : '—'),
          },
          {
            chave: 'acoes',
            titulo: '',
            alinhar: 'right',
            render: (p) => (
              <span className="acoes-linha">
                <button className="botao botao--texto" onClick={() => aoProduzir(p)}>
                  Produzir
                </button>
                <button className="botao botao--texto" onClick={() => aoAjustar(p)}>
                  Ajustar
                </button>
                <button className="botao botao--texto" onClick={() => aoEditar(p)}>
                  Editar
                </button>
              </span>
            ),
          },
        ]}
      />
    </>
  );
}

/**
 * Cadastro do doce, com a RECEITA dentro.
 *
 * A receita (a ficha técnica) já existia no servidor, mas nenhuma tela
 * deixava cadastrá-la — a Produção prometia calcular os ingredientes
 * sozinha e nunca tinha como. Ela fica aqui porque é parte do doce, e é
 * opcional: a cliente disse que só usaria "se for simples". Sem receita,
 * o doce funciona igual; com ela, o lote desconta os ingredientes sem
 * ninguém digitar nada.
 */
function FormularioDoce({ doce, aoFechar, aoSalvar }) {
  const edicao = Boolean(doce.id);
  const [form, setForm] = useState({
    nome: doce.nome ?? '',
    precoVenda: doce.precoVenda ? paraCampo(doce.precoVenda) : '',
    estoqueMinimo: doce.estoqueMinimo ? paraCampo(doce.estoqueMinimo) : '',
  });
  const [rendimento, setRendimento] = useState(
    doce.rendimentoReceita ? String(doce.rendimentoReceita) : ''
  );
  const [itens, setItens] = useState([]);
  const [listaInsumos, setListaInsumos] = useState([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    insumos
      .listar()
      .then(setListaInsumos)
      .catch(() => setListaInsumos([]));
    if (edicao) {
      produtos
        .porId(doce.id)
        .then((p) =>
          setItens(
            (p.fichaTecnica ?? []).map((i) => ({
              insumoId: i.insumoId,
              quantidade: paraCampo(i.quantidade),
            }))
          )
        )
        .catch((e) => setErro(mensagemDeErro(e)));
    }
  }, [edicao, doce.id]);

  const campo = (nome) => (e) => {
    setForm((f) => ({ ...f, [nome]: e.target.value }));
    setErro('');
  };

  const mudarItem = (indice, chave) => (e) =>
    setItens((a) => a.map((i, n) => (n === indice ? { ...i, [chave]: e.target.value } : i)));

  async function enviar(e) {
    e.preventDefault();
    const preco = lerNumero(form.precoVenda);
    const minimo = form.estoqueMinimo.trim() ? lerNumero(form.estoqueMinimo) : 0;
    const itensValidos = itens
      .filter((i) => i.insumoId && lerNumero(i.quantidade) > 0)
      .map((i) => ({ insumoId: i.insumoId, quantidade: lerNumero(i.quantidade) }));
    const rende = rendimento.trim() ? Number(rendimento) : null;

    if (!(preco > 0)) return setErro('Informe o preço de venda.');
    if (!(minimo >= 0)) return setErro('O aviso de "acabando" precisa ser um número.');
    if (itensValidos.length && !(Number.isInteger(rende) && rende > 0)) {
      return setErro('Diga quantos doces uma receita rende — sem isso não dá para calcular.');
    }

    setSalvando(true);
    setErro('');
    try {
      const corpo = { nome: form.nome.trim(), precoVenda: preco, estoqueMinimo: minimo };
      const salvo = edicao ? await produtos.atualizar(doce.id, corpo) : await produtos.criar(corpo);
      await produtos.salvarFicha(salvo.id, {
        rendimentoReceita: itensValidos.length ? rende : null,
        itens: itensValidos,
      });
      aoSalvar();
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSalvando(false);
    }
  }

  const opcoesInsumo = listaInsumos.map((i) => ({
    valor: i.id,
    rotulo: `${i.nome} (${UNIDADE_CURTA[i.unidade] ?? i.unidade})`,
  }));

  return (
    <Modal aberto aoFechar={aoFechar} titulo={edicao ? 'Editar doce' : 'Novo doce'} largura={560}>
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
          <Texto
            rotulo="Preço de venda (R$)"
            type="text"
            inputMode="decimal"
            value={form.precoVenda}
            onChange={campo('precoVenda')}
            required
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

        <div className="previsao">
          <h3 className="previsao__titulo">Receita (opcional)</h3>
          <p className="previsao__aviso">
            Com a receita, cada lote registrado desconta os ingredientes sozinho.
          </p>
          <Texto
            rotulo="Uma receita rende quantos doces?"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={rendimento}
            onChange={(e) => {
              setRendimento(e.target.value);
              setErro('');
            }}
          />
          {itens.map((item, indice) => (
            <div key={indice} className="edicao-item">
              {/* Da segunda linha em diante o rótulo some do desenho, mas
                  não do leitor de tela. */}
              <Selecao
                rotulo={
                  indice === 0 ? (
                    'Ingrediente'
                  ) : (
                    <span className="so-leitor">Ingrediente {indice + 1}</span>
                  )
                }
                value={item.insumoId}
                onChange={mudarItem(indice, 'insumoId')}
                opcoes={opcoesInsumo}
              />
              <Texto
                rotulo={
                  indice === 0 ? 'Qtd.' : <span className="so-leitor">Quantidade {indice + 1}</span>
                }
                type="text"
                inputMode="decimal"
                value={item.quantidade}
                onChange={mudarItem(indice, 'quantidade')}
              />
              <button
                type="button"
                className="botao botao--texto botao--perigo edicao-item__tirar"
                aria-label={`Tirar ingrediente ${indice + 1}`}
                onClick={() => setItens((a) => a.filter((_, n) => n !== indice))}
              >
                Tirar
              </button>
            </div>
          ))}
          <button
            type="button"
            className="botao botao--texto edicao-item__mais"
            onClick={() =>
              setItens((a) => [...a, { insumoId: listaInsumos[0]?.id ?? '', quantidade: '' }])
            }
            disabled={!listaInsumos.length}
          >
            + Ingrediente
          </button>
          {!listaInsumos.length && (
            <p className="previsao__aviso">
              Cadastre os ingredientes no Estoque para montar a receita.
            </p>
          )}
        </div>

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

// ============================================================ lotes

/**
 * Registrar lote: "fiz 50 brigadeiros".
 *
 * Mostra o antes e o depois ("tem 12 prontos → vai ficar com 62") para
 * ela conferir que digitou o número certo. Com receita, lista o que vai
 * sair do estoque e avisa o que não tem o bastante — o lote registra do
 * mesmo jeito (ela pode ter comprado e não lançado), mas o aviso aparece
 * antes, e não no fim do mês.
 */
function FormularioLote({ catalogo, produtoInicial, aoFechar, aoSalvar }) {
  const [produtoId, setProdutoId] = useState(produtoInicial ?? catalogo[0]?.id ?? '');
  const [qtd, setQtd] = useState('');
  const [previsao, setPrevisao] = useState([]);
  const [manuais, setManuais] = useState([]);
  const [listaInsumos, setListaInsumos] = useState([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const doce = catalogo.find((p) => p.id === produtoId);
  const n = lerNumero(qtd);

  useEffect(() => {
    insumos
      .listar()
      .then(setListaInsumos)
      .catch(() => setListaInsumos([]));
  }, []);

  // A prévia da receita acompanha o doce e a quantidade.
  useEffect(() => {
    let vivo = true;
    const pedir = produtoId && n > 0 ? producoes.previsao(produtoId, n) : Promise.resolve([]);
    pedir.then((p) => vivo && setPrevisao(p)).catch(() => vivo && setPrevisao([]));
    return () => {
      vivo = false;
    };
  }, [produtoId, n]);

  const temReceita = previsao.length > 0;
  const saldoDe = (id) => Number(listaInsumos.find((i) => i.id === id)?.quantidadeAtual ?? 0);

  async function enviar(e) {
    e.preventDefault();
    if (!(n > 0)) {
      setErro('Informe quantos doces saíram no lote.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await producoes.registrar({
        produtoId,
        quantidade: n,
        // Sem receita, manda o que ela informou na mão (pode ser nada).
        ...(temReceita
          ? {}
          : {
              insumos: manuais
                .filter((m) => m.insumoId && lerNumero(m.quantidade) > 0)
                .map((m) => ({ insumoId: m.insumoId, quantidade: lerNumero(m.quantidade) })),
            }),
      });
      aoSalvar();
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSalvando(false);
    }
  }

  const mudarManual = (indice, chave) => (e) =>
    setManuais((a) => a.map((m, i) => (i === indice ? { ...m, [chave]: e.target.value } : m)));

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Registrar lote" largura={560}>
      <form onSubmit={enviar}>
        <Linha>
          <Selecao
            rotulo="Doce"
            value={produtoId}
            onChange={(e) => setProdutoId(e.target.value)}
            opcoes={catalogo.map((p) => ({ valor: p.id, rotulo: p.nome }))}
          />
          <Texto
            rotulo="Quantos fez"
            type="text"
            inputMode="decimal"
            value={qtd}
            onChange={(e) => {
              setQtd(e.target.value);
              setErro('');
            }}
            required
            autoFocus
          />
        </Linha>

        {doce && (
          <p className="ajuste__atual">
            Tem <strong>{quantidade(doce.quantidadeAtual, doce.unidade)}</strong> prontos
            {n > 0 && (
              <>
                {' '}
                → vai ficar com{' '}
                <strong>{quantidade(Number(doce.quantidadeAtual) + n, doce.unidade)}</strong>
              </>
            )}
          </p>
        )}

        {temReceita ? (
          <div className="previsao">
            <h3 className="previsao__titulo">Vai usar (pela receita)</h3>
            <ul className="previsao__lista">
              {previsao.map((i) => {
                const tem = saldoDe(i.insumoId);
                return (
                  <li key={i.insumoId}>
                    {quantidade(i.quantidade, i.unidade)} de {i.nome}
                    {tem < i.quantidade && (
                      <span className="fechamento__falta">
                        {tem > 0
                          ? ` — o estoque tem só ${quantidade(tem, i.unidade)}`
                          : ' — não tem no estoque'}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="previsao">
            <h3 className="previsao__titulo">Ingredientes usados (opcional)</h3>
            <p className="previsao__aviso">
              Este doce não tem receita. Diga o que usou se quiser que saia do Estoque — ou deixe em
              branco. Para não digitar toda vez, cadastre a receita no doce.
            </p>
            {manuais.map((item, indice) => (
              <div key={indice} className="edicao-item">
                <Selecao
                  rotulo={
                    indice === 0 ? (
                      'Ingrediente'
                    ) : (
                      <span className="so-leitor">Ingrediente {indice + 1}</span>
                    )
                  }
                  value={item.insumoId}
                  onChange={mudarManual(indice, 'insumoId')}
                  opcoes={listaInsumos.map((i) => ({
                    valor: i.id,
                    rotulo: `${i.nome} (${UNIDADE_CURTA[i.unidade] ?? i.unidade})`,
                  }))}
                />
                <Texto
                  rotulo={
                    indice === 0 ? (
                      'Qtd.'
                    ) : (
                      <span className="so-leitor">Quantidade {indice + 1}</span>
                    )
                  }
                  type="text"
                  inputMode="decimal"
                  value={item.quantidade}
                  onChange={mudarManual(indice, 'quantidade')}
                />
                <button
                  type="button"
                  className="botao botao--texto botao--perigo edicao-item__tirar"
                  aria-label={`Tirar ingrediente ${indice + 1}`}
                  onClick={() => setManuais((a) => a.filter((_, i) => i !== indice))}
                >
                  Tirar
                </button>
              </div>
            ))}
            <button
              type="button"
              className="botao botao--texto edicao-item__mais"
              onClick={() =>
                setManuais((a) => [...a, { insumoId: listaInsumos[0]?.id ?? '', quantidade: '' }])
              }
              disabled={!listaInsumos.length}
            >
              + Ingrediente
            </button>
          </div>
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
            {salvando ? 'Registrando...' : 'Registrar lote'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Lotes produzidos, para conferir o que entrou ou desfazer um lançamento. */
function ListaLotes({ aoRegistrar, aoExcluir }) {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [excluindo, setExcluindo] = useState(null);

  useEffect(() => {
    producoes
      .listar({})
      .then(setLista)
      .catch((e) => setErro(mensagemDeErro(e)))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <>
      <div className="barra-acoes">
        <span className="barra-acoes__resumo">{lista.length} lote(s)</span>
        <button className="botao botao--primario botao--auto" onClick={aoRegistrar}>
          Registrar lote
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
            titulo: 'Fez',
            render: (p) => quantidade(p.quantidade, p.produto?.unidade),
          },
          {
            chave: 'ingredientes',
            titulo: 'Usou',
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
              <button className="botao botao--texto botao--perigo" onClick={() => setExcluindo(p)}>
                Excluir
              </button>
            ),
          },
        ]}
      />

      {excluindo && (
        <ExcluirLote
          lote={excluindo}
          aoFechar={() => setExcluindo(null)}
          aoExcluir={() => {
            setExcluindo(null);
            aoExcluir();
          }}
        />
      )}
    </>
  );
}

/**
 * Confirmação dentro da janela, como no Caixa — e não o alerta do
 * navegador, uma caixa de sistema diferente em cada aparelho. Diz o que
 * acontece com o estoque, que é o que ela precisa pesar antes.
 */
function ExcluirLote({ lote, aoFechar, aoExcluir }) {
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const usouIngrediente = lote.movimentacoes?.some((m) => m.insumoId);

  async function excluir() {
    setOcupado(true);
    setErro('');
    try {
      await producoes.excluir(lote.id);
      aoExcluir();
    } catch (e) {
      setErro(mensagemDeErro(e));
      setOcupado(false);
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Excluir este lote?" largura={440}>
      <div className="lancamento__alvo">
        <span className="lancamento__alvo-textos">
          <span className="lancamento__alvo-titulo">
            {quantidade(lote.quantidade, lote.produto?.unidade)} de {lote.produto?.nome}
          </span>
          <span className="lancamento__alvo-quando">{dataHora(lote.data)}</span>
        </span>
      </div>
      <p className="lancamento__pergunta">
        Os doces saem do estoque de prontos
        {usouIngrediente ? ' e os ingredientes usados voltam para o Estoque.' : '.'}
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
          onClick={excluir}
        >
          {ocupado ? 'Excluindo...' : 'Excluir'}
        </button>
      </div>
    </Modal>
  );
}
