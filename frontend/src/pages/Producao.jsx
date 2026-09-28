import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Modal } from '../components/Modal.jsx';
import { Dinheiro, Linha, Selecao, Texto } from '../components/Campo.jsx';
import { Dado, Total, normalizar } from '../components/Extrato.jsx';
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
import { insumos, producoes, produtos } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import {
  corDoDoce,
  dinheiroParaCampo,
  moeda,
  quantidade,
  UNIDADE_CURTA,
} from '../utils/formato.js';

/**
 * Produção: os DOCES. A pergunta desta tela é "o que eu tenho para
 * vender?" — quantos de cada doce estão prontos, o que está acabando, e
 * o lote que ela acabou de fazer.
 *
 * No desenho do Caixa, do Kardex e do Estoque: título grande, busca, o
 * resumo cinza e a lista lisa, com o que está acabando no alto. Cada doce
 * leva a cor que tem na Venda — é por ela que ela acha o doce antes de
 * ler o nome, e a cor é a mesma nas duas telas.
 *
 * Na linha, só o gesto do dia: **Produzir**. Ajustar, Editar (com a
 * receita) e o histórico ficam no detalhe, que abre ao tocar no doce. O
 * que JÁ aconteceu — lotes, vendas, perdas — mora no Kardex.
 */
export function Producao() {
  // O cadastro do doce (preço e receita) e o dinheiro parado na vitrine
  // são da administração. A funcionária vê os doces, produz e ajusta.
  const { admin } = useAuth();
  const [catalogo, setCatalogo] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');

  const [aberto, setAberto] = useState(null);
  const [produzindo, setProduzindo] = useState(null);
  const [editando, setEditando] = useState(null);
  const [ajustando, setAjustando] = useState(null);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    try {
      setCatalogo(await produtos.listar());
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

  const todos = catalogo ?? [];
  const termo = normalizar(busca.trim());
  const visiveis = todos.filter((p) => !termo || normalizar(p.nome).includes(termo));
  const acabando = visiveis.filter(estaAcabando);
  const prontos = visiveis.filter((p) => !estaAcabando(p));

  const quantosAcabando = todos.filter(estaAcabando).length;
  const valorAVenda = todos.reduce(
    (s, p) => s + Math.max(Number(p.quantidadeAtual), 0) * Number(p.precoVenda),
    0
  );

  const linha = (p) => (
    <LinhaDoce
      key={p.id}
      doce={p}
      aoAbrir={() => setAberto(p)}
      aoProduzir={() => setProduzindo(p)}
    />
  );

  return (
    <section className="extrato">
      <CabecaComNovo
        titulo="Produção"
        oQue="doce"
        aoNovo={admin ? () => setEditando({}) : undefined}
      />

      <input
        type="search"
        className="campo__entrada extrato__busca"
        placeholder="Buscar"
        aria-label="Buscar doce"
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
        <Total rotulo="Doces" valor={todos.length} />
        <Total
          rotulo="Acabando"
          valor={quantosAcabando}
          tom={quantosAcabando ? 'alerta' : undefined}
        />
        {admin && <Total rotulo="Valor à venda" valor={moeda(valorAVenda)} />}
      </div>

      <div className={atualizando ? 'extrato__lista conteudo--atualizando' : 'extrato__lista'}>
        {catalogo === null ? (
          <p className="extrato__vazio">Carregando...</p>
        ) : todos.length === 0 ? (
          <div className="extrato__vazio">
            <p>Nenhum doce cadastrado ainda.</p>
            {admin && (
              <button
                type="button"
                className="botao botao--primario botao--auto"
                onClick={() => setEditando({})}
              >
                Cadastrar o primeiro
              </button>
            )}
          </div>
        ) : visiveis.length === 0 ? (
          <p className="extrato__vazio">Nada encontrado para “{busca.trim()}”.</p>
        ) : (
          <div className="extrato__troca">
            {acabando.length > 0 && (
              <SecaoItens titulo="Acabando" conta={acabando.length}>
                {acabando.map(linha)}
              </SecaoItens>
            )}
            {prontos.length > 0 && (
              <SecaoItens titulo="Prontos para vender" conta={prontos.length}>
                {prontos.map(linha)}
              </SecaoItens>
            )}
          </div>
        )}
      </div>

      {aberto && (
        <DetalheDoce
          doce={aberto}
          aoFechar={() => setAberto(null)}
          aoProduzir={doDetalhe(setProduzindo)}
          aoAjustar={doDetalhe(setAjustando)}
          aoEditar={admin ? doDetalhe(setEditando) : undefined}
        />
      )}
      {produzindo && (
        <FormularioLote
          catalogo={todos}
          produtoInicial={produzindo.id}
          aoFechar={() => setProduzindo(null)}
          aoSalvar={concluir(setProduzindo)}
        />
      )}
      {editando && (
        <FormularioDoce
          doce={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={concluir(setEditando)}
        />
      )}
      {ajustando && (
        <AjusteEstoque
          alvo={ajustando}
          tipoAlvo="produto"
          aoFechar={() => setAjustando(null)}
          aoSalvar={() => concluir(setAjustando)(`Estoque de ${ajustando.nome} ajustado.`)}
        />
      )}
    </section>
  );
}

// ============================================================ doces

/** Um doce na lista: a cor dele, o preço, a receita e quantos tem prontos. */
function LinhaDoce({ doce: p, aoAbrir, aoProduzir }) {
  const acabando = estaAcabando(p);
  const minimo = Number(p.estoqueMinimo);
  const partes = [
    moeda(p.precoVenda),
    p.rendimentoReceita ? `receita rende ${p.rendimentoReceita}` : 'sem receita',
  ];
  if (acabando) {
    partes.unshift(
      <span key="acabando" className="fechamento__falta">
        acabando
      </span>
    );
  }

  return (
    <LinhaItem
      marca={<span className="item-cor" style={{ backgroundColor: corDoDoce(p.nome) }} />}
      tom={acabando ? 'alerta' : undefined}
      titulo={p.nome}
      detalhe={comPontos(partes)}
      valor={quantidade(p.quantidadeAtual, p.unidade)}
      alerta={acabando}
      sub={minimo > 0 ? `mín. ${quantidade(minimo, p.unidade)}` : null}
      aoAbrir={aoAbrir}
      acao={{ rotulo: 'Produzir', aoTocar: aoProduzir }}
    />
  );
}

/**
 * O detalhe de um doce: quantos tem, em números grandes, e o que se sabe
 * dele — preço, aviso, a receita e quanto ela custa.
 *
 * O custo pela receita sai do custo médio dos ingredientes (o que ela
 * paga no Comprei). Ao lado do preço, ele responde a pergunta que a
 * tabela nunca respondia: quanto sobra de cada doce vendido.
 */
function DetalheDoce({ doce: p, aoFechar, aoProduzir, aoAjustar, aoEditar }) {
  const { admin } = useAuth();
  // `null` enquanto a receita carrega.
  const [ficha, setFicha] = useState(null);

  useEffect(() => {
    let vivo = true;
    produtos
      .porId(p.id)
      .then((d) => vivo && setFicha(d.fichaTecnica ?? []))
      .catch(() => vivo && setFicha([]));
    return () => {
      vivo = false;
    };
  }, [p.id]);

  const acabando = estaAcabando(p);
  const preco = Number(p.precoVenda);
  const minimo = Number(p.estoqueMinimo);
  const rende = Number(p.rendimentoReceita);
  const custoReceita = (ficha ?? []).reduce(
    (s, i) => s + Number(i.quantidade) * Number(i.insumo?.custoUnitario ?? 0),
    0
  );
  const custoPorDoce = rende > 0 && custoReceita > 0 ? custoReceita / rende : null;
  const sobra = custoPorDoce === null ? null : preco - custoPorDoce;

  return (
    <Modal aberto aoFechar={aoFechar} titulo={p.nome} largura={480}>
      <div className="lancamento">
        <p
          className={acabando ? 'lancamento__valor lancamento__valor--alerta' : 'lancamento__valor'}
        >
          {quantidade(p.quantidadeAtual, p.unidade)}
        </p>
        <p className="lancamento__quando">
          {acabando ? 'prontos — está acabando' : 'prontos para vender'}
        </p>
      </div>

      <dl className="lancamento__dados">
        <Dado rotulo="Preço">{moeda(preco)}</Dado>
        {admin && (
          <Dado rotulo="Valor à venda">
            {moeda(Math.max(Number(p.quantidadeAtual), 0) * preco)}
          </Dado>
        )}
        <Dado rotulo="Avisa com menos de">
          {minimo > 0 ? quantidade(minimo, p.unidade) : 'Sem aviso'}
        </Dado>
        <Dado rotulo="Receita">
          {ficha === null ? (
            'Carregando...'
          ) : ficha.length ? (
            <>
              <span className="lancamento__item">
                rende {rende} {rende === 1 ? 'doce' : 'doces'}
              </span>
              {ficha.map((i) => (
                <span key={i.insumoId} className="lancamento__item lancamento__nota">
                  {quantidade(i.quantidade, i.insumo?.unidade)} de {i.insumo?.nome}
                </span>
              ))}
            </>
          ) : (
            'Sem receita'
          )}
        </Dado>
        {sobra !== null && (
          <Dado rotulo="Custo pela receita">
            {moeda(custoPorDoce)} por doce
            <span
              className={
                sobra < 0
                  ? 'lancamento__item lancamento__nota fechamento__falta'
                  : 'lancamento__item lancamento__nota'
              }
            >
              {sobra < 0
                ? `custa ${moeda(-sobra)} a mais que o preço`
                : `sobra ${moeda(sobra)} de cada`}
            </span>
          </Dado>
        )}
      </dl>

      <LinkKardex item={{ lado: 'produto', id: p.id, nome: p.nome, unidade: p.unidade }} />

      <div className="modal__acoes">
        <button type="button" className="botao botao--auto" onClick={aoAjustar}>
          Ajustar
        </button>
        {aoEditar && (
          <button type="button" className="botao botao--auto" onClick={aoEditar}>
            Editar
          </button>
        )}
        <button type="button" className="botao botao--primario botao--auto" onClick={aoProduzir}>
          Produzir
        </button>
      </div>
    </Modal>
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
    precoVenda: doce.precoVenda ? dinheiroParaCampo(doce.precoVenda) : '',
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
      aoSalvar(edicao ? 'Doce alterado.' : `${corpo.nome} cadastrado.`);
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
          <Dinheiro
            rotulo="Preço de venda (R$)"
            value={form.precoVenda}
            aoMudar={(v) => {
              setForm((f) => ({ ...f, precoVenda: v }));
              setErro('');
            }}
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
      aoSalvar(
        `Lote registrado: ${doce.nome} agora tem ${quantidade(Number(doce.quantidadeAtual) + n, doce.unidade)}.`
      );
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
