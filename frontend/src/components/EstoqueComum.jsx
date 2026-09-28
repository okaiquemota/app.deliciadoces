import { useState } from 'react';
import { Modal } from './Modal.jsx';
import { Texto } from './Campo.jsx';
import { Segmentado } from './Segmentado.jsx';
import { estoque } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { quantidade, UNIDADE_CURTA } from '../utils/formato.js';

/**
 * Peças comuns ao Estoque (o material) e à Produção (os doces): o saldo
 * com aviso de "acabando" e a janela de Ajustar. As duas telas tratam de
 * estoque, cada uma do seu lado, e uma perda de farinha se registra do
 * mesmo jeito que uma de brigadeiro. O histórico dos dois lados mora no
 * Kardex.
 */

/**
 * Avisa a casca que o estoque mudou, para os números de "acabando" do
 * menu serem buscados de novo. Sem isto, eles só se atualizavam ao
 * trocar de tela — e um lote registrado na Produção deixava o número da
 * própria Produção velho até ela sair e voltar.
 */
export const EVENTO_ESTOQUE = 'estoque-mudou';
export const avisarEstoqueMudou = () => window.dispatchEvent(new Event(EVENTO_ESTOQUE));

/**
 * Número digitado no teclado do celular: "1,5", "1.5" ou "1.250,5".
 * Com vírgula, o ponto é separador de milhar; sem vírgula, o ponto é a
 * casa decimal — é como cada teclado entrega, conforme o idioma do
 * aparelho. Devolve NaN para o que não é número.
 */
export function lerNumero(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return NaN;
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
}

/** Número de volta para o campo: "1,5". */
export const paraCampo = (n) => String(Number(n)).replace('.', ',');

/** Saldo com a etiqueta "acabando" quando está no mínimo ou abaixo. */
export function SaldoComAlerta({ item }) {
  const baixo =
    Number(item.estoqueMinimo) > 0 && Number(item.quantidadeAtual) <= Number(item.estoqueMinimo);
  return (
    <span className={baixo ? 'saldo saldo--baixo' : 'saldo'}>
      {quantidade(item.quantidadeAtual, item.unidade)}
      {baixo && <span className="etiqueta etiqueta--alerta">acabando</span>}
    </span>
  );
}

/** Quantos da lista estão no mínimo ou abaixo — o "3 acabando" do topo. */
export const quantosAcabando = (lista) =>
  lista.filter(
    (i) => Number(i.estoqueMinimo) > 0 && Number(i.quantidadeAtual) <= Number(i.estoqueMinimo)
  ).length;

const MODOS_AJUSTE = [
  { id: 'perda', rotulo: 'Perdi' },
  { id: 'contagem', rotulo: 'Corrigir contagem' },
];

/**
 * Ajustar: o que sai do estoque sem ser uso — perdeu, ou a contagem não
 * bate.
 *
 * "Corrigir contagem" pergunta QUANTO TEM DE VERDADE, e não a diferença.
 * A versão anterior pedia a diferença, com "use negativo para diminuir":
 * ela teria que fazer a conta de cabeça, e sinal trocado dobra o erro em
 * vez de corrigir. Contar a prateleira é o que ela já faz; a conta é do
 * sistema. O motivo, obrigatório no servidor, se escreve sozinho quando
 * ela não diz nada.
 */
export function AjusteEstoque({ alvo, tipoAlvo, aoFechar, aoSalvar }) {
  const [modo, setModo] = useState('perda');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const unidade = UNIDADE_CURTA[alvo.unidade] ?? alvo.unidade;
  const atual = Number(alvo.quantidadeAtual);
  const n = lerNumero(valor);
  const valido = Number.isFinite(n) && n >= 0;
  // Três casas: é o que o banco guarda, e evita "diferença de 0,0000001".
  const depois = modo === 'perda' ? atual - n : n;
  const diferenca = Math.round((depois - atual) * 1000) / 1000;

  function trocarModo(novo) {
    setModo(novo);
    setValor('');
    setMotivo('');
    setErro('');
  }

  async function enviar(e) {
    e.preventDefault();
    if (!valido || (modo === 'perda' && n === 0)) {
      setErro(modo === 'perda' ? 'Informe quanto perdeu.' : 'Informe quanto tem de verdade.');
      return;
    }
    if (diferenca === 0) {
      setErro('O estoque já está com essa quantidade.');
      return;
    }

    const corpo =
      modo === 'perda'
        ? { tipo: 'PERDA', quantidade: n, motivo: motivo.trim() }
        : {
            tipo: 'AJUSTE',
            quantidade: diferenca,
            motivo:
              motivo.trim() ||
              `Contagem corrigida: o sistema tinha ${quantidade(atual, alvo.unidade)}, havia ${quantidade(n, alvo.unidade)}`,
          };

    setSalvando(true);
    setErro('');
    try {
      await estoque.movimentar({
        ...corpo,
        [tipoAlvo === 'insumo' ? 'insumoId' : 'produtoId']: alvo.id,
      });
      aoSalvar();
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSalvando(false);
    }
  }

  const mudar = (setter) => (e) => {
    setter(e.target.value);
    setErro('');
  };

  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Ajustar ${alvo.nome}`} largura={460}>
      <form onSubmit={enviar}>
        <Segmentado
          rotulo="O que aconteceu"
          opcoes={MODOS_AJUSTE}
          valor={modo}
          aoTrocar={trocarModo}
          cheio
        />

        <p className="ajuste__atual">
          Tem agora <strong>{quantidade(atual, alvo.unidade)}</strong>
          {valido && valor.trim() !== '' && diferenca !== 0 && (
            <>
              {' '}
              → vai ficar com <strong>{quantidade(depois, alvo.unidade)}</strong>
            </>
          )}
        </p>

        {modo === 'perda' ? (
          <>
            <Texto
              rotulo={`Quanto perdeu (${unidade})`}
              type="text"
              inputMode="decimal"
              value={valor}
              onChange={mudar(setValor)}
              required
              autoFocus
            />
            <Texto
              rotulo="Por que perdeu"
              placeholder="Ex.: estragou, caiu, venceu"
              value={motivo}
              onChange={mudar(setMotivo)}
              required
            />
          </>
        ) : (
          <>
            <Texto
              rotulo={`Quanto tem de verdade (${unidade})`}
              type="text"
              inputMode="decimal"
              value={valor}
              onChange={mudar(setValor)}
              required
              autoFocus
            />
            <Texto
              rotulo="Por quê (opcional)"
              placeholder="Ex.: contei a prateleira"
              value={motivo}
              onChange={mudar(setMotivo)}
            />
          </>
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
            {salvando ? 'Registrando...' : 'Registrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
