import { useCallback, useEffect, useRef, useState } from 'react';
import { despesas, vendas } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { Modal } from './Modal.jsx';
import { moeda } from '../utils/formato.js';

const FORMAS = [
  ['DINHEIRO', 'Dinheiro'],
  ['PIX', 'Pix'],
  ['CARTAO_DEBITO', 'Débito'],
  ['CARTAO_CREDITO', 'Crédito'],
];

const MODOS = {
  entrada: {
    titulo: 'Entrada avulsa',
    rotuloValor: 'Quanto entrou',
    botao: 'Registrar entrada',
  },
  saida: {
    titulo: 'Saída',
    rotuloValor: 'Quanto saiu',
    botao: 'Registrar saída',
    precisaCategoria: 'CUSTO_OPERACIONAL',
    precisaDescricao: true,
  },
  retirada: {
    titulo: 'Retirada pessoal',
    rotuloValor: 'Quanto você tirou',
    botao: 'Registrar retirada',
    precisaCategoria: 'RETIRADA_PESSOAL',
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
 *   saida    -> despesa de custo operacional
 *   retirada -> despesa de categoria RETIRADA_PESSOAL
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
  const [categorias, setCategorias] = useState([]);
  const [categoriaId, setCategoriaId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const campo = useRef(null);

  const carregarCategorias = useCallback(async (tipo) => {
    try {
      const todas = await despesas.categorias();
      const doTipo = todas.filter((c) => c.tipo === tipo);
      setCategorias(doTipo);
      setCategoriaId(doTipo[0]?.id ?? '');
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }, []);

  useEffect(() => {
    if (!modo) return;
    setValor('');
    setForma('DINHEIRO');
    setDescricao('');
    setErro('');
    if (config?.precisaCategoria) carregarCategorias(config.precisaCategoria);

    /**
     * Foco no campo assim que o modal abre: no celular é o que faz o
     * teclado subir sozinho, e ela começa a digitar o valor sem um toque
     * a mais. O atraso existe porque o modal ainda está entrando na tela
     * — focar antes disso o navegador ignora.
     */
    const t = setTimeout(() => campo.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [modo, config?.precisaCategoria, carregarCategorias]);

  /**
   * Filtra o que o teclado do aparelho manda.
   *
   * O teclado numérico do iOS e do Android não impede nada: ela consegue
   * digitar "12,,5", colar "R$ 1.234,56" ou emendar "12,500". Sem este
   * filtro o `Number()` devolveria NaN ou um valor errado, e o erro só
   * apareceria depois de salvar.
   *
   * O ponto vira vírgula porque os dois teclados oferecem um ou outro
   * conforme o idioma do aparelho, e quem digita não deveria precisar
   * saber qual dos dois este campo aceita.
   */
  function aoDigitar(texto) {
    const limpo = texto.replace(/\./g, ',').replace(/[^\d,]/g, '');
    const [inteiro, ...resto] = limpo.split(',');
    if (!resto.length) return setValor(inteiro);
    return setValor(`${inteiro},${resto.join('').slice(0, 2)}`);
  }

  async function enviar(evento) {
    evento.preventDefault();
    const numero = Number(String(valor).replace(',', '.'));
    if (!Number.isFinite(numero) || numero <= 0) {
      setErro('Informe um valor maior que zero.');
      return;
    }

    setSalvando(true);
    setErro('');
    try {
      if (modo === 'entrada') {
        await vendas.criar({ valor: numero, formaPagamento: forma });
      } else {
        if (!categoriaId) {
          setErro('Nenhuma categoria cadastrada para este tipo.');
          setSalvando(false);
          return;
        }
        await despesas.criar({
          descricao: descricao.trim() || config.titulo,
          valor: numero,
          categoriaId,
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
          {/*
            `type="text"` com `inputMode="decimal"`, e não `type="number"`:
            o número nativo aceita notação científica, mostra setinhas de
            incremento que não servem para dinheiro, e no Firefox deixa
            digitar letra sem avisar. O modo de entrada é o que faz o
            celular abrir o teclado numérico — o tipo do campo continua
            texto, e quem valida é o filtro acima.
          */}
          <span className="valor__linha">
            <span className="valor__moeda" aria-hidden="true">
              R$
            </span>
            <input
              id="campo-valor"
              ref={campo}
              className="valor__campo"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              size={Math.max(4, valor.length || 4)}
              value={valor}
              onChange={(e) => aoDigitar(e.target.value)}
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
              onClick={() => setValor(String(v).replace('.', ','))}
            >
              {moeda(v)}
            </button>
          ))}
        </div>

        {config.precisaDescricao && (
          <label className="campo">
            <span className="campo__rotulo">Com o quê</span>
            <input
              className="campo__entrada"
              type="text"
              placeholder="Ex.: gás, farinha, luz"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </label>
        )}

        {config.precisaCategoria && categorias.length > 1 && (
          <label className="campo">
            <span className="campo__rotulo">Categoria</span>
            <select
              className="campo__entrada"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
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
