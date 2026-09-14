/**
 * Ponte entre a Vercel e o Express.
 *
 * Na Vercel não existe um servidor ligado o tempo todo: cada requisição
 * acorda uma função. Por isso importamos `app.js` (que só monta o Express)
 * e NUNCA `server.js` (que chama `app.listen`) — abrir porta aqui não faz
 * sentido e quebraria o deploy.
 *
 * Um app Express já é uma função (req, res), que é exatamente o que a
 * Vercel espera de um handler. Daí o export direto.
 *
 * Sobre o roteamento: a primeira tentativa usou um arquivo com nome
 * `[...rota].mjs`, esperando catch-all. A Vercel leu o nome como um
 * segmento único chamado "...rota", então `/api/health` funcionava e
 * `/api/auth/login` dava 404 sem nem chegar aqui. A rota agora vem de um
 * rewrite explícito em `vercel.json`, que manda todo `/api/*` para esta
 * função em qualquer profundidade.
 */
import app from '../backend/src/app.js';

export default app;
