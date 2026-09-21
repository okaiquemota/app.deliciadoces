import { useCallback, useEffect, useState } from 'react';
import { despesas, vendas } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { Modal } from './Modal.jsx';

const FORMAS = [
  ['DINHEIRO', 'Dinheiro'],
  ['PIX', 'Pix'],
  ['CARTAO_DEBITO', 'Débito'],
  ['CARTAO_CREDITO', 'Crédito'],
];

const MODOS = {
  entrada: {
    titulo: 'Entrou dinheiro',
    rotuloValor: 'Quanto entrou',
    botao: 'Registrar entrada',
  },
  saida: {
    titulo: 'Saiu dinheiro',
    rotuloValor: 'Quanto saiu',
    botao: 'Registrar saída',
    precisaCategoria: 'CUSTO_OPERACIONAL',
    precisaDescricao: true,
  },
  retirada: {
    titulo: 'Retirada',
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
  }, [modo, config?.precisaCategoria, carregarCategorias]);

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

        <label className="campo">
          <span className="campo__rotulo">{config.rotuloValor}</span>
          <input
            className="campo__entrada campo__entrada--grande"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            autoFocus
          />
        </label>

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
