/**
 * Formatação de valores para exibição.
 *
 * ATENÇÃO com Decimal: o Prisma devolve campos decimais como STRING no
 * JSON, para não perder precisão no caminho. Por isso todo valor passa por
 * `Number()` antes de qualquer conta ou formatação — somar strings daria
 * "1010" em vez de 20.
 */

const moedaBR = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const moeda = (valor) => moedaBR.format(Number(valor ?? 0));

export const UNIDADE_CURTA = {
  G: 'g',
  KG: 'kg',
  ML: 'ml',
  L: 'L',
  UNIDADE: 'un',
  PACOTE: 'pct',
  LATA: 'lata',
  CAIXA: 'cx',
};

/** Quantidade sem casas decimais inúteis: 2,5 kg mas 100 un (não 100,000). */
export function quantidade(valor, unidade = '') {
  const n = Number(valor ?? 0);
  const texto = Number.isInteger(n)
    ? n.toString()
    : n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  return unidade ? `${texto} ${UNIDADE_CURTA[unidade] ?? unidade.toLowerCase()}` : texto;
}

export const ROTULO_PAGAMENTO = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  CARTAO_DEBITO: 'Cartão de débito',
  CARTAO_CREDITO: 'Cartão de crédito',
};

export const ROTULO_MOVIMENTACAO = {
  ENTRADA_COMPRA: 'Compra',
  ENTRADA_PRODUCAO: 'Produção',
  SAIDA_PRODUCAO: 'Usado na produção',
  SAIDA_VENDA: 'Venda',
  PERDA: 'Perda',
  AJUSTE: 'Ajuste',
};

export const data = (valor) =>
  new Date(valor).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export const dataHora = (valor) =>
  new Date(valor).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Data no formato que o <input type="date"> espera.
 *
 * Montada com os componentes LOCAIS, não com `toISOString()`. O ISO
 * converte para UTC, e no Brasil (UTC-3) qualquer hora a partir das 21h
 * já cai no dia seguinte: às 21h30 de 19/09 o ISO devolve "2026-09-20".
 * A cliente fecha o caixa justamente nesse horário — o movimento do dia
 * iria parar na data errada.
 */
export function paraInput(valor = new Date()) {
  const d = new Date(valor);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}
