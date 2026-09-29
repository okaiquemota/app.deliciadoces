import { ehAdmin } from './auth.js';

/**
 * Custo é resultado financeiro, e a funcionária não vê resultado
 * financeiro — decisão da Dalila. Ela continua vendo quantidade, validade
 * e preço de venda (sem preço não dá para vender).
 *
 * Tirar na RESPOSTA, e não em cada tela: esconder só no React deixaria o
 * número a um F12 de distância. E tirar pelo NOME do campo, num só lugar,
 * cobre qualquer rota que devolva insumo, lote ou movimentação — inclusive
 * uma rota que ainda não existe e que alguém escreva sem lembrar disto.
 *
 * O que ela DIGITA continua indo: o valor pago em "Comprei" entra no
 * custo médio. Só não volta para a tela dela.
 */
const CAMPOS_DE_CUSTO = new Set(['custoUnitario', 'custoEstimado']);

export function ocultarCustos(req, res, next) {
  if (ehAdmin(req.usuario)) return next();
  const responder = res.json.bind(res);
  res.json = (corpo) => responder(semCustos(corpo));
  return next();
}

/**
 * Percorre só objeto comum e lista. `Date` e o `Decimal` do Prisma são
 * valores, não registros: passam intactos, e o JSON os serializa depois.
 */
export function semCustos(valor) {
  if (Array.isArray(valor)) return valor.map(semCustos);
  if (valor && Object.getPrototypeOf(valor) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(valor)
        .filter(([chave]) => !CAMPOS_DE_CUSTO.has(chave))
        .map(([chave, v]) => [chave, semCustos(v)])
    );
  }
  return valor;
}
