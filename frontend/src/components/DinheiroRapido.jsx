import { useEffect, useRef, useState } from 'react';
import { despesas, vendas } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { Modal } from './Modal.jsx';
import { EntradaDinheiro } from './Campo.jsx';
import { dinheiroParaCampo, lerDinheiro, moeda } from '../utils/formato.js';

const FORMAS = [
  ['DINHEIRO', 'Dinheiro'],
  ['PIX', 'Pix'],
  ['CARTAO_DEBITO', 'Débito'],
  ['CARTAO_CREDITO', 'Crédito'],
];

/**
 * `exemplo` liga o campo "Com o quê" e dá o texto de exemplo dele.
 *
 * Nada de categoria: quem diz o que foi é o "Com o quê". A retirada só
 * avisa o servidor que é retirada — é o que tira o valor do cálculo do
 * lucro, porque o dinheiro saiu do caixa mas não é custo do negócio.
 */
const MODOS = {
  entrada: {
    titulo: 'Entrada avulsa',
    rotuloValor: 'Quanto entrou',
    botao: 'Registrar entrada',
    exemplo: 'Ex.: encomenda, bolo de aniversário',
  },
  saida: {
    titulo: 'Saída',
    rotuloValor: 'Quanto saiu',
    botao: 'Registrar saída',
    exemplo: 'Ex.: gás, farinha, luz',
  },
  retirada: {
    titulo: 'Retirada pessoal',
    rotuloValor: 'Quanto você tirou',
    botao: 'Registrar retirada',
    retirada: true,
  },
};

/**
 * Entrada e saída de dinheiro em um passo.
 *
 * Os três casos compartilham o mesmo gesto — digitar um valor — e por isso
 * dividem o mesmo componente, com o modo mudando o texto e para onde o
 * lançamento vai:
 *
 *   entrada  -> venda SEM itens (não mexe em estoque, por não saber o quê)
 *   saida    -> despesa, custo do negócio
 *   retirada -> despesa com `retirada: true`, fora do lucro
 *
 * A entrada avisa em tela que não baixou estoque. A cliente pediu o
 * caminho curto, mas ela precisa saber que ele tem esse custo — um
 * sistema que resolve o atalho escondendo a consequência é pior que um
 * sistema lento.
 *
 * QUEM DIGITA É O TECLADO DO APARELHO.
 *
 * Havia aqui um teclado numérico desenhado à mão, com o campo em
 * `readOnly` para o do sistema não abrir. A ideia era controlar o
 * tamanho das teclas; na prática ele ocupava metade da tela, tinha
 * teclas menores que as do teclado nativo, não tinha o retorno tátil que
 * o aparelho dá, e no computador era só um monte de botão para clicar
 * com o mouse em vez de digitar.
 *
 * Com `inputMode="decimal"` o celular abre o teclado numérico sozinho e
 * o computador aceita o teclado físico. O que sobrou aqui é o que o
 * aparelho não faz: os valores de atalho e as regras do formato.
 */
export function DinheiroRapido({ modo, aoFechar, aoLancar }) {
  const config = modo ? MODOS[modo] : null;

  const [valor, setValor] = useState('');
  const [forma, setForma] = useState('DINHEIRO');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const campo = useRef(null);

  useEffect(() => {
    if (!modo) return;
    setValor('');
    setForma('DINHEIRO');
    setDescricao('');
    setErro('');

    /**
     * Foco no campo assim que o modal abre: no celular é o que faz o
     * teclado subir sozinho, e ela começa a digitar o valor sem um toque
     * a mais. O atraso existe porque o modal ainda está entrando na tela
     * — focar antes disso o navegador ignora.
     */
    const t = setTimeout(() => campo.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [modo]);

  async function enviar(evento) {
    evento.preventDefault();
    const numero = lerDinheiro(valor);
    if (!Number.isFinite(numero) || numero <= 0) {
      setErro('Informe um valor maior que zero.');
      return;
    }

    setSalvando(true);
    setErro('');
    try {
      if (modo === 'entrada') {
        // Venda sem itens não tem campo de descrição; o "Com o quê" vai na
        // observação, que é o que o Caixa e o mini-histórico mostram.
        await vendas.criar({
          valor: numero,
          formaPagamento: forma,
          observacao: descricao.trim() || undefined,
        });
      } else {
        await despesas.criar({
          descricao: descricao.trim() || config.titulo,
          valor: numero,
          retirada: Boolean(config.retirada),
          formaPagamento: forma,
        });
      }
      aoLancar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (!config) return null;

  return (
    <Modal aberto={Boolean(modo)} aoFechar={aoFechar} titulo={config.titulo} largura={460}>
      <form onSubmit={enviar}>
        {erro && <p className="alerta alerta--erro">{erro}</p>}

        <div className="valor">
          <label className="valor__rotulo" htmlFor="campo-valor">
            {config.rotuloValor}
          </label>
          <span className="valor__linha">
            <span className="valor__moeda" aria-hidden="true">
              R$
            </span>
            <EntradaDinheiro
              id="campo-valor"
              ref={campo}
              className="valor__campo"
              justo
              value={valor}
              aoMudar={setValor}
              aria-label={config.rotuloValor}
            />
          </span>
        </div>

        {/* Os valores que ela mais lança: um toque em vez de digitar. */}
        <div className="atalhos-valor">
          {[5, 10, 20, 50].map((v) => (
            <button
              key={v}
              type="button"
              className="atalho-valor"
              onClick={() => setValor(dinheiroParaCampo(v))}
            >
              {moeda(v)}
            </button>
          ))}
        </div>

        {config.exemplo && (
          <label className="campo">
            <span className="campo__rotulo">Com o quê</span>
            <input
              className="campo__entrada"
              type="text"
              placeholder={config.exemplo}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </label>
        )}

        <span className="campo__rotulo">
          {modo === 'entrada' ? 'Como ela pagou' : 'Como você pagou'}
        </span>
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

        {modo === 'entrada' && (
          <p className="cartao__aviso">
            Esta entrada não baixa nenhum doce do estoque, porque o sistema não sabe o que foi
            vendido. Para o estoque acompanhar, use o botão Venda.
          </p>
        )}

        <button className="botao botao--primario" type="submit" disabled={salvando}>
          {salvando ? 'Salvando...' : config.botao}
        </button>
      </form>
    </Modal>
  );
}
