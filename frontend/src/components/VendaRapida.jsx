import { useCallback, useEffect, useMemo, useState } from 'react';
import { produtos as apiProdutos, vendas } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { Modal } from './Modal.jsx';
import { moeda, quantidade } from '../utils/formato.js';

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
 */
export function VendaRapida({ aberto, aoFechar, aoLancar }) {
  const [lista, setLista] = useState([]);
  const [carrinho, setCarrinho] = useState({});
  const [forma, setForma] = useState('DINHEIRO');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

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
    setErro('');
    carregar();
  }, [aberto, carregar]);

  const itens = useMemo(() => Object.entries(carrinho).filter(([, qtd]) => qtd > 0), [carrinho]);

  const total = useMemo(
    () =>
      itens.reduce((soma, [id, qtd]) => {
        const p = lista.find((x) => x.id === id);
        return soma + (p ? Number(p.precoVenda) * qtd : 0);
      }, 0),
    [itens, lista]
  );

  const mexer = (id, passo) =>
    setCarrinho((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + passo) }));

  async function confirmar() {
    if (!itens.length) return;
    setSalvando(true);
    setErro('');
    try {
      await vendas.criar({
        itens: itens.map(([produtoId, qtd]) => ({ produtoId, quantidade: qtd })),
        formaPagamento: forma,
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
                    <span className="doce__nome">{p.nome}</span>
                    <span className="doce__preco">{moeda(p.precoVenda)}</span>
                    <span className="doce__estoque">
                      {quantidade(p.quantidadeAtual, p.unidade)}
                    </span>
                  </button>

                  {qtd > 0 && (
                    <div className="doce__contador">
                      <button
                        type="button"
                        className="doce__menos"
                        onClick={() => mexer(p.id, -1)}
                        aria-label={`Tirar um ${p.nome}`}
                      >
                        −
                      </button>
                      <strong>{qtd}</strong>
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
            <span className="barra-confirmar__total">{moeda(total)}</span>
            <button
              type="button"
              className="botao botao--primario"
              onClick={confirmar}
              disabled={!itens.length || salvando}
            >
              {salvando ? 'Salvando...' : 'Confirmar venda'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
