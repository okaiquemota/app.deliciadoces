import { ehAdmin } from '../middlewares/auth.js';
import { AppError } from './AppError.js';
import { diaDoCliente } from './periodo.js';

/**
 * A funcionária corrige o que ELA lançou, e só no mesmo dia.
 *
 * O dia é a fronteira porque é onde a Dalila fecha a gaveta: um
 * lançamento de ontem já entrou num fechamento conferido, e mexer nele
 * faria a conta daquele dia deixar de bater sem ninguém perceber. Mudar
 * o que foi lançado antes é com a administração.
 *
 * "Hoje" é o dia de Brasília (ver `diaDoCliente`), não o do servidor.
 */
export function exigirProprioDeHoje(usuario, registro) {
  if (ehAdmin(usuario)) return;
  if (registro.usuarioId !== usuario.id) {
    throw AppError.proibido('Você só pode mudar os lançamentos feitos na sua conta.');
  }
  if (diaDoCliente(registro.data) !== diaDoCliente()) {
    throw AppError.proibido(
      'Lançamentos de outros dias só a administração muda: eles já entraram no fechamento.'
    );
  }
}

/**
 * O corpo de um lançamento feito pela funcionária, sem a data.
 *
 * Com data livre, ela poderia lançar (ou mover) uma venda para um dia já
 * fechado — o mesmo buraco que `exigirProprioDeHoje` fecha na edição.
 * Sem data, o lançamento é de agora.
 */
export function semDataSeNaoAdmin(usuario, corpo) {
  if (ehAdmin(usuario)) return corpo;
  const { data: _data, ...resto } = corpo;
  return resto;
}
