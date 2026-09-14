import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { env, emProducao } from './config/env.js';
import rotas from './routes/index.js';
import { prisma } from './lib/prisma.js';
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
 *
 * Verifica também o BANCO, não só se o processo subiu. Um health check que
 * responde "ok" com o Postgres fora do ar não serve para nada: esconde
 * justamente a falha mais provável em produção, onde a aplicação e o banco
 * são serviços separados.
 *
 * Devolve 503 quando o banco não responde, para que monitoramento (e a
 * própria Vercel) enxerguem o problema.
 */
app.get('/api/health', async (_req, res) => {
  let banco = 'ok';

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (erro) {
    banco = 'indisponivel';
    // Loga o motivo real para quem tem acesso ao painel, mas nunca o
    // devolve na resposta: a mensagem do driver costuma trazer host,
    // usuário e porta do banco.
    console.error('[health] Banco inacessível:', erro.message);
  }

  res.status(banco === 'ok' ? 200 : 503).json({
    status: banco === 'ok' ? 'ok' : 'degradado',
    servico: 'api-deliciadoces',
    ambiente: env.nodeEnv,
    banco,
    horario: new Date().toISOString(),
  });
});

// Todas as rotas da aplicação sob o prefixo /api
app.use('/api', rotas);

// Estes dois middlewares precisam ser os ÚLTIMOS da cadeia
app.use(rotaNaoEncontrada);
app.use(errorHandler);

export default app;
