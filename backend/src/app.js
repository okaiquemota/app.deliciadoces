import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { env, emProducao } from './config/env.js';
import rotas from './routes/index.js';
import { errorHandler, rotaNaoEncontrada } from './middlewares/errorHandler.js';

/**
 * Montagem da aplicação Express.
 *
 * `app.js` só monta e configura; quem sobe o servidor é `server.js`.
 * Essa separação permite importar o `app` em testes automatizados
 * (supertest) sem abrir uma porta de verdade.
 */
const app = express();

// Log de requisições — formato enxuto em dev, padrão Apache em produção
app.use(morgan(emProducao ? 'combined' : 'dev'));

// Libera o frontend a consumir a API a partir de outra origem/porta
app.use(cors({ origin: env.corsOrigin, credentials: true }));

// Interpreta corpo JSON das requisições
app.use(express.json());

/**
 * Health check — sem autenticação, de propósito.
 * Útil para conferir rapidamente se a API subiu, e para monitoramento
 * caso o projeto vá para um serviço de deploy.
 */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    servico: 'api-deliciadoces',
    ambiente: env.nodeEnv,
    horario: new Date().toISOString(),
  });
});

// Todas as rotas da aplicação sob o prefixo /api
app.use('/api', rotas);

// Estes dois middlewares precisam ser os ÚLTIMOS da cadeia
app.use(rotaNaoEncontrada);
app.use(errorHandler);

export default app;
