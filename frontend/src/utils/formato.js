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

/**
 * "25/09". Aceita um instante ou um DIA ("2026-09-25").
 *
 * O dia é montado com os componentes LOCAIS. `new Date("2026-09-25")` é
 * meia-noite UTC — 21h do dia 24 em Brasília —, e o histórico do
 * fechamento, as barras do Resumo e a validade apareciam com a véspera.
 */
export const data = (valor) => {
  const dia = typeof valor === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  const d = dia ? new Date(Number(dia[1]), Number(dia[2]) - 1, Number(dia[3])) : new Date(valor);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

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

/**
 * Cor de identificação do doce, derivada do NOME.
 *
 * O schema está fechado, então não há campo `cor` no produto — e não
 * precisa haver. O nome já é único no cadastro, então some os códigos das
 * letras e escolha uma matiz: o mesmo doce recebe sempre a mesma cor, sem
 * migração e sem ela ter que escolher nada.
 *
 * As cores saem de uma lista fixa em vez de `hsl()` calculado na hora
 * porque matiz livre produz tons que brigam com o rosa da marca. Estas
 * foram escolhidas à mão, todas com luminosidade parecida, para nenhuma
 * puxar a atenção sozinha na grade.
 */
const CORES_DOCE = [
  '#7B4A2E', // chocolate
  '#E8C48F', // massa
  '#F6E27A', // limão
  '#FA9EB0', // morango
  '#D9A441', // dourado
  '#B5C99A', // pistache
  '#C9A0DC', // uva
  '#E8A87C', // doce de leite
  '#9ED8DB', // menta
  '#EFD9C1', // coco
];

export function corDoDoce(nome = '') {
  let soma = 0;
  for (let i = 0; i < nome.length; i += 1) soma += nome.charCodeAt(i);
  return CORES_DOCE[soma % CORES_DOCE.length];
}
