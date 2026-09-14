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
 */
import app from '../backend/src/app.js';

export default app;
