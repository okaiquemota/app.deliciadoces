/**
 * Período vindo da URL (`?inicio=...&fim=...`), no horário da cliente.
 *
 * O servidor roda em UTC — o da Vercel e o de desenvolvimento. Lida em
 * UTC, uma data sem hora como "2026-09-25" vira meia-noite de Greenwich,
 * que em Brasília são 21h do dia ANTERIOR. O filtro "dia 25" ia então das
 * 21h do dia 24 às 20h59 do dia 25, e a venda das 21h30 — a hora em que
 * ela fecha o caixa — caía no dia seguinte.
 *
 * Aqui uma data sem hora vale o dia inteiro em Brasília. O Brasil não tem
 * horário de verão desde 2019, então o fuso é fixo; se isso mudar, é esta
 * constante que muda.
 *
 * Um instante completo (com hora e fuso) passa como veio: ele já diz de
 * onde é.
 */
export const FUSO_CLIENTE = '-03:00';

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

function paraInstante(valor, hora) {
  const texto = String(valor);
  return SO_DATA.test(texto) ? new Date(`${texto}T${hora}${FUSO_CLIENTE}`) : new Date(texto);
}

export function filtrosPeriodo(query) {
  return {
    inicio: query.inicio ? paraInstante(query.inicio, '00:00:00.000') : undefined,
    fim: query.fim ? paraInstante(query.fim, '23:59:59.999') : undefined,
  };
}

/** Teto de linhas numa listagem: pedido pela tela, limitado aqui. */
export function limiteDaListagem(query, padrao = 200, maximo = 1000) {
  const pedido = Number(query.limite);
  return Number.isInteger(pedido) && pedido > 0 ? Math.min(pedido, maximo) : padrao;
}
