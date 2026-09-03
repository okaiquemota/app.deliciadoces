import app from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';

/**
 * Ponto de entrada do backend.
 */
const servidor = app.listen(env.port, () => {
  console.log(`\n  🍰 API Delícia Doces`);
  console.log(`  ➜  http://localhost:${env.port}/api`);
  console.log(`  ➜  Health: http://localhost:${env.port}/api/health`);
  console.log(`  ➜  Ambiente: ${env.nodeEnv}\n`);
});

/**
 * Encerramento gracioso: fecha o servidor HTTP e a conexão com o banco
 * antes de morrer. Sem isso, reinícios frequentes em desenvolvimento
 * deixam conexões penduradas no PostgreSQL.
 */
async function encerrar(sinal) {
  console.log(`\n[servidor] Recebido ${sinal}, encerrando...`);
  servidor.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));
