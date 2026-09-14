import 'dotenv/config';

/**
 * Centraliza a leitura das variáveis de ambiente.
 *
 * Em vez de espalhar `process.env.X` pelo código, lemos tudo aqui e
 * falhamos na inicialização se algo essencial faltar. É melhor não subir
 * do que quebrar no meio de um request.
 */

const obrigatorias = ['DATABASE_URL', 'JWT_SECRET'];
const ausentes = obrigatorias.filter((chave) => !process.env[chave]);

if (ausentes.length > 0) {
  const mensagem =
    `Variáveis de ambiente obrigatórias não definidas: ${ausentes.join(', ')}. ` +
    'Localmente: copie backend/.env.example para backend/.env e preencha. ' +
    'Na Vercel: defina em Settings → Environment Variables.';

  console.error(`\n[config] ${mensagem}\n`);

  // `throw` em vez de `process.exit`: em ambiente serverless (Vercel) cada
  // requisição roda numa função, e um exit derrubaria o processo sem
  // mensagem útil no log. O throw aparece direitinho no painel.
  throw new Error(mensagem);
}

export const env = {
  port: Number(process.env.PORT ?? 3333),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  /**
   * Conexão usada em TEMPO DE EXECUÇÃO.
   *
   * Em produção serverless isto aponta para o *pooler* do Supabase
   * (porta 6543). Cada requisição pode acordar uma função nova, e sem
   * pooler o Postgres esgotaria o limite de conexões rapidinho.
   */
  databaseUrl: process.env.DATABASE_URL,

  /**
   * Conexão DIRETA (porta 5432), usada só pelas migrations.
   * O pooler em modo transação não suporta os comandos de DDL que o
   * `prisma migrate` precisa. Localmente as duas são a mesma coisa.
   */
  directDatabaseUrl: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  },

  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origem) => origem.trim())
    .filter(Boolean),
};

export const emProducao = env.nodeEnv === 'production';
