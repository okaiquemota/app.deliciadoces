import { useState } from 'react';
import { Modal } from './Modal.jsx';
import { IconeVisto } from './Icones.jsx';
import { data as formatarData, paraInput } from '../utils/formato.js';

/**
 * Peças do extrato, comuns ao Caixa (o dinheiro) e ao Kardex (o
 * estoque): o período em chip, os dias agrupados, a hora "16h40". As duas
 * telas se leem do mesmo jeito — o que ela aprendeu numa vale na outra.
 */

export const PERIODOS = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7dias', rotulo: 'Últimos 7 dias' },
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'datas', rotulo: 'Escolher datas' },
];

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const DIA_LONGO = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const DIA_DO_MES = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });

export const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** "16h40", como a hora aparece nos extratos de banco. */
export const hora = (data) => HORA.format(data).replace(':', 'h');

/** "Quinta-feira, 25 de setembro, às 16h40". */
export const quandoPorExtenso = (data) => `${maiuscula(DIA_LONGO.format(data))}, às ${hora(data)}`;

/** "2026-09-25" -> Date local, sem passar por UTC. */
function daChave(chave) {
  const [a, m, d] = chave.split('-').map(Number);
  return new Date(a, m - 1, d);
}

/** O dia de `n` dias atrás, como texto: "2026-09-24". */
export function diasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return paraInput(d);
}

/** "Quinta-feira, 25 de setembro", de um dia em texto. */
export const diaPorExtenso = (chave) => maiuscula(DIA_LONGO.format(daChave(chave)));

/** "Hoje", "Ontem", ou "24 de setembro" (+ ano, se outro). */
export function rotuloDoDia(chave) {
  if (chave === paraInput()) return 'Hoje';
  if (chave === diasAtras(1)) return 'Ontem';
  const data = daChave(chave);
  const ano = data.getFullYear() !== new Date().getFullYear() ? ` de ${data.getFullYear()}` : '';
  return DIA_DO_MES.format(data) + ano;
}

/** O que o chip de período diz: "Últimos 7 dias", ou "01/09 – 25/09". */
export function rotuloDoPeriodo(periodo, datas) {
  if (periodo === 'datas') return `${formatarData(datas.inicio)} – ${formatarData(datas.fim)}`;
  return PERIODOS.find((p) => p.id === periodo).rotulo;
}

export function intervalo(periodo, datas) {
  if (periodo === 'hoje') return { inicio: paraInput(), fim: paraInput() };
  if (periodo === '7dias') return { inicio: diasAtras(6), fim: paraInput() };
  if (periodo === 'mes') {
    const primeiro = new Date();
    primeiro.setDate(1);
    return { inicio: paraInput(primeiro), fim: paraInput() };
  }
  return datas;
}

/** Agrupa por dia, na ordem em que a lista veio: `[{ chave, itens }]`. */
export function porDia(lista) {
  const grupos = new Map();
  for (const l of lista) {
    const chave = paraInput(l.data);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(l);
  }
  return [...grupos].map(([chave, itens]) => ({ chave, itens }));
}

/**
 * Um número do bloco de resumo cinza, com o rótulo pequeno em cima.
 * `tom`: 'entrada' (verde, o que entra) ou 'alerta' (vermelho, problema).
 */
export function Total({ rotulo, valor, tom, nota }) {
  return (
    <div className="extrato__total">
      <span className="extrato__total-rotulo">{rotulo}</span>
      <span
        className={
          tom ? `extrato__total-valor extrato__total-valor--${tom}` : 'extrato__total-valor'
        }
      >
        {valor}
      </span>
      {nota && <span className="extrato__total-nota">{nota}</span>}
    </div>
  );
}

/** Uma linha dos dados de um detalhe: o rótulo à esquerda, o valor à direita. */
export function Dado({ rotulo, children }) {
  return (
    <div>
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Minúsculas e sem acento: "credito" acha "Crédito". */
export const normalizar = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * A escolha do período, numa janela: a lista de opções com o visto na
 * escolhida, como nos ajustes do iPhone. Um toque escolhe e fecha; só
 * "Escolher datas" pede mais — as duas datas e a confirmação.
 */
export function EscolherPeriodo({ periodo, datas, aoFechar, aoEscolher, rotuloAplicar }) {
  const [escolhido, setEscolhido] = useState(periodo);
  const [rascunho, setRascunho] = useState(datas);
  const invalido = rascunho.inicio && rascunho.fim && rascunho.inicio > rascunho.fim;

  function escolher(id) {
    if (id === 'datas') setEscolhido('datas');
    else aoEscolher(id);
  }

  function aplicar(e) {
    e.preventDefault();
    if (!invalido) aoEscolher('datas', rascunho);
  }

  const data = (campo) => (e) => setRascunho((r) => ({ ...r, [campo]: e.target.value }));

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Período" largura={440}>
      <div className="opcoes" role="group" aria-label="Período">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="opcao"
            aria-pressed={escolhido === p.id}
            onClick={() => escolher(p.id)}
          >
            {p.rotulo}
            {escolhido === p.id && <IconeVisto tamanho={20} />}
          </button>
        ))}
      </div>

      {escolhido === 'datas' && (
        <form onSubmit={aplicar}>
          <div className="extrato__datas">
            <label className="extrato__data">
              <span>De</span>
              <input
                type="date"
                className="campo__entrada"
                value={rascunho.inicio}
                max={paraInput()}
                onChange={data('inicio')}
                required
              />
            </label>
            <label className="extrato__data">
              <span>Até</span>
              <input
                type="date"
                className="campo__entrada"
                value={rascunho.fim}
                max={paraInput()}
                onChange={data('fim')}
                required
              />
            </label>
          </div>
          {invalido && (
            <p className="alerta alerta--erro" role="alert">
              A data inicial é depois da final.
            </p>
          )}
          <div className="modal__acoes">
            <button
              type="submit"
              className="botao botao--primario botao--auto"
              disabled={Boolean(invalido) || !rascunho.inicio || !rascunho.fim}
            >
              {rotuloAplicar}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
