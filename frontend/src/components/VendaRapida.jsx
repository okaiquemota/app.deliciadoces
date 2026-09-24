import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { produtos as apiProdutos, vendas } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { Modal } from './Modal.jsx';
import { corDoDoce, moeda, quantidade } from '../utils/formato.js';

const FORMAS = [
  ['DINHEIRO', 'Dinheiro'],
  ['PIX', 'Pix'],
  ['CARTAO_DEBITO', 'Débito'],
  ['CARTAO_CREDITO', 'Crédito'],
];

/**
 * Venda em toques, não em formulário.
 *
 * O fluxo antigo era: abrir Caixa, Nova venda, escolher produto num
 * select, digitar quantidade, escolher pagamento, salvar. Cinco decisões
 * para vender um brigadeiro.
 *
 * Aqui os doces são botões: toca uma vez para um, toca de novo para dois.
 * A conta aparece sozinha embaixo e a forma de pagamento são quatro
 * botões — nada de select, que no celular abre uma roleta.
 *
 * O total mostrado é uma PRÉVIA, calculada com o preço que veio da API. O
 * valor que vale é o que o servidor calcula de novo na hora de gravar:
 * quem chama a API não decide preço.
 *
 * O total é EDITÁVEL, e é assim que o desconto entra. No balcão ela não
 * pensa "dou 8% de desconto", ela pensa "faço por vinte e cinco" — então
 * o campo aceita o valor final e o sistema deduz o desconto sozinho
 * (`desconto = subtotal − o que ela cobrou`). O servidor continua mandando
 * no preço: ele recalcula o subtotal pelo cadastro e só aceita o desconto
 * se couber dentro dele, então mexer aqui não vira uma via de cobrar o que
 * se quiser.
 */
export function VendaRapida({ aberto, aoFechar, aoLancar }) {
  const [lista, setLista] = useState([]);
  const [carrinho, setCarrinho] = useState({});
  const [forma, setForma] = useState('DINHEIRO');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  // `null` = ela não mexeu no total; string = está editando ou já editou.
  const [cobrado, setCobrado] = useState(null);
  const campoTotal = useRef(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await apiProdutos.listar());
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!aberto) return;
    setCarrinho({});
    setForma('DINHEIRO');
    setCobrado(null);
    setErro('');
    carregar();
  }, [aberto, carregar]);

  const itens = useMemo(() => Object.entries(carrinho).filter(([, qtd]) => qtd > 0), [carrinho]);

  /** Soma dos doces pelo preço de cadastro, antes de qualquer desconto. */
  const subtotal = useMemo(
    () =>
      itens.reduce((soma, [id, qtd]) => {
        const p = lista.find((x) => x.id === id);
        return soma + (p ? Number(p.precoVenda) * qtd : 0);
      }, 0),
    [itens, lista]
  );

  /**
   * Mexer no carrinho DESFAZ o total editado.
   *
   * Sem isso, ela fecha em R$ 25, lembra de mais um brigadeiro, toca — e o
   * total continua R$ 25 com o desconto crescendo sozinho para engolir o
   * doce novo. O preço combinado valia para aquela sacola; mudou a sacola,
   * volta a valer a conta.
   */
  const mexer = (id, passo) => {
    setCobrado(null);
    setCarrinho((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + passo) }));
  };

  const pecas = itens.reduce((n, [, q]) => n + q, 0);

  const editando = cobrado !== null;
  const valorCobrado = editando ? Number(cobrado.replace(',', '.')) : subtotal;
  const cobradoValido = Number.isFinite(valorCobrado) && valorCobrado >= 0;
  const desconto = cobradoValido ? Number((subtotal - valorCobrado).toFixed(2)) : 0;

  function abrirEdicao() {
    setCobrado(subtotal.toFixed(2).replace('.', ','));
    // O campo só existe depois deste render; daí o atraso de um quadro.
    setTimeout(() => campoTotal.current?.select(), 0);
  }

  function digitarTotal(texto) {
    const limpo = texto.replace(/\./g, ',').replace(/[^\d,]/g, '');
    const [inteiro, ...resto] = limpo.split(',');
    setCobrado(resto.length ? `${inteiro},${resto.join('').slice(0, 2)}` : inteiro);
  }

  async function confirmar() {
    if (!itens.length) return;
    if (editando && !cobradoValido) {
      setErro('Informe quanto você cobrou.');
      return;
    }
    if (desconto < 0) {
      setErro('O valor cobrado não pode passar do total dos doces.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await vendas.criar({
        itens: itens.map(([produtoId, qtd]) => ({ produtoId, quantidade: qtd })),
        formaPagamento: forma,
        desconto,
      });
      aoLancar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="O que foi vendido?" largura={620}>
      {erro && <p className="alerta alerta--erro">{erro}</p>}

      {carregando && <p className="tabela__aviso">Carregando...</p>}

      {!carregando && lista.length === 0 && (
        <p className="tabela__aviso">
          Nenhum doce cadastrado ainda. Cadastre em Estoque para vender por aqui.
        </p>
      )}

      {!carregando && lista.length > 0 && (
        <>
          <div className="grade-produtos">
            {lista.map((p) => {
              const qtd = carrinho[p.id] ?? 0;
              return (
                <div key={p.id} className={qtd > 0 ? 'doce doce--escolhido' : 'doce'}>
                  <button
                    type="button"
                    className="doce__toque"
                    onClick={() => mexer(p.id, 1)}
                    aria-label={`Adicionar ${p.nome}`}
                  >
                    {/* A bolinha de cor vem do nome do doce. Ela reconhece
                        pela cor antes de ler, que no balcão é a diferença
                        entre achar e procurar. */}
                    <span
                      className="doce__cor"
                      style={{ backgroundColor: corDoDoce(p.nome) }}
                      aria-hidden="true"
                    />
                    <span className="doce__info">
                      <span className="doce__nome">{p.nome}</span>
                      <span className="doce__preco">{moeda(p.precoVenda)}</span>
                      <span className="doce__estoque">
                        {quantidade(p.quantidadeAtual, p.unidade)}
                      </span>
                    </span>
                  </button>

                  {qtd > 0 && (
                    <div className="doce__contador">
                      <button
                        type="button"
                        className="doce__passo"
                        onClick={() => mexer(p.id, -1)}
                        aria-label={`Tirar um ${p.nome}`}
                      >
                        −
                      </button>
                      <strong>{qtd}</strong>
                      <button
                        type="button"
                        className="doce__passo"
                        onClick={() => mexer(p.id, 1)}
                        aria-label={`Somar um ${p.nome}`}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <h3 className="cartao__subtitulo">Como ela pagou</h3>
          <div className="formas">
            {FORMAS.map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                className={forma === id ? 'forma forma--ativa' : 'forma'}
                onClick={() => setForma(id)}
              >
                {rotulo}
              </button>
            ))}
          </div>

          <div className="barra-confirmar">
            <span className="barra-confirmar__valor">
              <span className="barra-confirmar__itens">
                {/* Concorda com a QUANTIDADE que está escrita ao lado, não
                    com quantos doces diferentes há no carrinho: dois
                    brigadeiros são um produto só e escreviam "2 item". */}
                {pecas} {pecas === 1 ? 'item' : 'itens'}
                {desconto > 0 && ` · ${moeda(subtotal)} − ${moeda(desconto)}`}
                {desconto < 0 && ' · acima do total dos doces'}
              </span>

              {editando ? (
                <span className="total-editavel">
                  <span className="total-editavel__moeda" aria-hidden="true">
                    R$
                  </span>
                  <input
                    ref={campoTotal}
                    className="total-editavel__campo"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    size={Math.max(4, cobrado.length || 4)}
                    value={cobrado}
                    onChange={(e) => digitarTotal(e.target.value)}
                    aria-label="Quanto você cobrou"
                  />
                </span>
              ) : (
                /* O total é um botão, não um número com um lápis do lado:
                   o alvo passa a ser o próprio valor, que é grande, em vez
                   de um ícone de vinte pixels ao lado dele. */
                <button
                  type="button"
                  className="barra-confirmar__total"
                  onClick={abrirEdicao}
                  disabled={!itens.length}
                  aria-label={`Total ${moeda(subtotal)}. Tocar para cobrar outro valor`}
                >
                  {moeda(subtotal)}
                  <span className="barra-confirmar__editar" aria-hidden="true">
                    editar
                  </span>
                </button>
              )}
            </span>
            <button
              type="button"
              className="botao botao--primario"
              onClick={confirmar}
              disabled={!itens.length || salvando || desconto < 0}
            >
              {salvando ? 'Salvando...' : 'Confirmar venda'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
