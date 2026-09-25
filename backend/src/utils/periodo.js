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

export const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

const [, SINAL, HORAS, MINUTOS] = FUSO_CLIENTE.match(/^([+-])(\d{2}):(\d{2})$/);
const DESLOCAMENTO_MS = (SINAL === '-' ? -1 : 1) * (Number(HORAS) * 60 + Number(MINUTOS)) * 60_000;

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

/**
 * O DIA de calendário da cliente ("2026-09-25") de um instante.
 *
 * É o dia que ela vê no relógio da parede. Às 21h30 de Brasília o UTC já
 * virou o dia seguinte — e foi assim que o Fechar dia, aberto na hora de
 * fechar o caixa, mostrava a gaveta de amanhã.
 *
 * Uma data sem hora já é um dia e passa como veio. Sem valor, é hoje.
 * Valor que não é data devolve `null`, para quem chamou responder 400.
 */
export function diaDoCliente(valor = new Date()) {
  if (typeof valor === 'string' && SO_DATA.test(valor)) return valor;
  const instante = new Date(valor);
  if (Number.isNaN(instante.getTime())) return null;
  return new Date(instante.getTime() + DESLOCAMENTO_MS).toISOString().slice(0, 10);
}

/** De 00:00:00.000 a 23:59:59.999 do dia, no horário da cliente. */
export function limitesDoDia(dia) {
  return {
    inicio: paraInstante(dia, '00:00:00.000'),
    fim: paraInstante(dia, '23:59:59.999'),
  };
}

/**
 * Coluna de DIA no banco (`@db.Date`, ou a validade digitada num campo de
 * data): o Prisma grava e lê como meia-noite UTC daquele dia. Estas duas
 * funções são a ponte — e a volta devolve texto, não `Date`, porque um
 * `Date` de meia-noite UTC, mostrado no navegador em Brasília, vira o dia
 * ANTERIOR.
 */
export const colunaDoDia = (dia) => new Date(`${dia}T00:00:00.000Z`);

export const diaDaColuna = (data) => new Date(data).toISOString().slice(0, 10);
