import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env, emProducao } from '../config/env.js';

/**
 * Instância única (singleton) do Prisma Client.
 *
 * A partir do Prisma 7 a conexão não vem mais do `schema.prisma`: passamos
 * um "driver adapter" (aqui, o driver oficial do PostgreSQL) direto para o
 * cliente. O `schema.prisma` cuida só do MODELO; a CONEXÃO fica no código
 * e em `prisma.config.js` (usado pela CLI nas migrations).
 *
 * O singleton em `globalThis` existe porque `node --watch` reinicia o
 * processo a cada alteração: sem ele, cada reload abriria uma nova pool de
 * conexões e o PostgreSQL logo recusaria novas conexões.
 */

const globalParaPrisma = globalThis;

function criarClient() {
  const adapter = new PrismaPg({ connectionString: env.databaseUrl });

  return new PrismaClient({
    adapter,
    log: emProducao ? ['error'] : ['warn', 'error'],
  });
}

export const prisma = globalParaPrisma.prisma ?? criarClient();

if (!emProducao) {
  globalParaPrisma.prisma = prisma;
}
