import { AppError } from '../utils/AppError.js';

/**
 * Freios contra quem martela a API: tentativas de senha e excesso de
 * requisições.
 *
 * Sem isto, um robô testava senhas no login o dia inteiro: cada tentativa
 * errada só custava um 401. Agora, errou demais, espera.
 *
 * LIMITE CONHECIDO: a contagem mora na memória do processo. Na Vercel cada
 * instância da função tem a sua, então um ataque espalhado por várias
 * instâncias é freado, não barrado. O bloqueio forte é uma regra de rate
 * limit no Firewall da Vercel (ver docs/DEPLOY.md). Guardar a contagem no
 * banco pediria uma tabela nova, e o modelo de dados está fechado.
 */

const QUINZE_MINUTOS = 15 * 60 * 1000;

/**
 * Janela fixa por chave: conta a partir da primeira ocorrência e zera
 * quando a janela vence. Guarda só chave, contagem e fim da janela.
 */
function criarContador({ janelaMs, maximo }) {
  const mapa = new Map();

  function vigente(chave, agora) {
    const registro = mapa.get(chave);
    if (registro && registro.ate > agora) return registro;
    mapa.delete(chave);
    return null;
  }

  /** Varre as janelas vencidas de vez em quando, para a memória não crescer. */
  function faxina(agora) {
    if (mapa.size < 5000) return;
    for (const [chave, registro] of mapa) if (registro.ate <= agora) mapa.delete(chave);
  }

  return {
    /** Milissegundos até liberar, ou 0 se a chave está livre. */
    espera(chave, agora = Date.now()) {
      const registro = vigente(chave, agora);
      return registro && registro.quantas >= maximo ? registro.ate - agora : 0;
    },
    somar(chave, agora = Date.now()) {
      faxina(agora);
      const registro = vigente(chave, agora) ?? { quantas: 0, ate: agora + janelaMs };
      registro.quantas += 1;
      mapa.set(chave, registro);
    },
    limpar(chave) {
      mapa.delete(chave);
    },
    zerar() {
      mapa.clear();
    },
  };
}

function recusar(res, esperaMs, mensagem) {
  const segundos = Math.ceil(esperaMs / 1000);
  res.set('Retry-After', String(segundos));
  return new AppError(mensagem(Math.ceil(segundos / 60)), 429);
}

// ------------------------------------------------------------- login

/**
 * Duas contagens de senha errada:
 * - por IP E login: 5 erros em 15 min travam aquele login naquele
 *   aparelho. Acertar zera.
 * - por IP: 20 erros em 15 min, em qualquer login, travam o aparelho —
 *   é o robô que troca de nome de usuário a cada tentativa.
 *
 * Não existe trava só por login, de propósito: com ela, qualquer um
 * trancaria a Dalila fora da própria conta errando a senha dela de casa.
 */
const errosPorLogin = criarContador({ janelaMs: QUINZE_MINUTOS, maximo: 5 });
const errosPorIp = criarContador({ janelaMs: QUINZE_MINUTOS, maximo: 20 });

const chaveDoLogin = (req) =>
  `${req.ip}|${String(req.body?.email ?? '')
    .trim()
    .toLowerCase()}`;

export const tentativasDeLogin = {
  /** Lança 429 se este login, ou este aparelho, errou demais. */
  conferir(req, res) {
    const espera = Math.max(errosPorLogin.espera(chaveDoLogin(req)), errosPorIp.espera(req.ip));
    if (espera) {
      throw recusar(
        res,
        espera,
        (min) => `Muitas tentativas erradas. Espere ${min} min e tente de novo.`
      );
    }
  },
  falhou(req) {
    errosPorLogin.somar(chaveDoLogin(req));
    errosPorIp.somar(req.ip);
  },
  acertou(req) {
    errosPorLogin.limpar(chaveDoLogin(req));
  },
};

// ------------------------------------------------------------- geral

/**
 * Teto por aparelho para a API inteira: 300 chamadas por minuto.
 *
 * Uma tela do sistema faz de 2 a 5 chamadas, e três pessoas no mesmo
 * Wi-Fi da confeitaria (mesmo IP) não chegam perto disso. Serve para
 * cortar laço de robô, não para medir uso.
 */
const chamadasPorIp = criarContador({ janelaMs: 60 * 1000, maximo: 300 });

export function limitarRequisicoes(req, res, next) {
  const espera = chamadasPorIp.espera(req.ip);
  if (espera) {
    return next(recusar(res, espera, () => 'Muitas requisições em pouco tempo. Espere um minuto.'));
  }
  chamadasPorIp.somar(req.ip);
  return next();
}

/** Para os testes: cada caso começa com as contagens zeradas. */
export function zerarLimites() {
  errosPorLogin.zerar();
  errosPorIp.zerar();
  chamadasPorIp.zerar();
}
