import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Configuração da CLI do Prisma (migrations, studio, seed).
 *
 * A partir do Prisma 7 a URL do banco não fica mais no `schema.prisma`:
 * o schema descreve só o MODELO e a conexão vem daqui.
 *
 * Usa a conexão DIRETA (DIRECT_DATABASE_URL). Em produção a aplicação fala
 * com o banco através do pooler do Supabase, mas migration precisa de
 * conexão direta — o pooler em modo transação não aguenta os comandos de
 * DDL. Localmente as duas variáveis apontam para o mesmo lugar.
 *
 * Lemos `process.env` direto, e não o helper `env()` do Prisma, porque o
 * `postinstall` roda `prisma generate` logo após o `npm install`, quando o
 * `.env` de um clone novo ainda não existe. O helper abortaria e derrubaria
 * o install inteiro; `generate` não precisa de banco nenhum.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'node prisma/seed.js',
  },
  datasource: {
    url:
      process.env.DIRECT_DATABASE_URL ??
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL ??
      '',
  },
});
