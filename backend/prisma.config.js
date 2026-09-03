import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Configuração da CLI do Prisma (migrations, studio, seed).
 *
 * A partir do Prisma 7 a URL do banco não fica mais no `schema.prisma`:
 * o schema descreve só o MODELO e a conexão vem daqui.
 *
 * Sobre ler `process.env.DATABASE_URL` direto, em vez do helper `env()`
 * do Prisma: o script `postinstall` roda `prisma generate` logo após o
 * `npm install`, quando o arquivo `.env` de um clone novo ainda não foi
 * criado. O helper `env()` aborta se a variável não existir, o que faria
 * o `npm install` inteiro falhar. Como `generate` não precisa de conexão
 * com o banco, deixamos a string vazia nesse momento — os comandos que
 * realmente acessam o banco (`migrate`, `studio`) avisam com clareza se
 * a variável estiver faltando.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'node prisma/seed.js',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
