import 'dotenv/config';

/**
 * Centraliza a leitura das variáveis de ambiente.
 *
 * Motivo de existir: em vez de espalhar `process.env.X` pelo código, lemos
 * tudo aqui e falhamos rápido na inicialização se algo essencial faltar.
 * É melhor o servidor nem subir do que quebrar no meio de um request.
 */

const obrigatorias = ['DATABASE_URL', 'JWT_SECRET'];
const ausentes = obrigatorias.filter((chave) => !process.env[chave]);

if (ausentes.length > 0) {
  console.error(
    `\n[config] Variáveis de ambiente obrigatórias não definidas: ${ausentes.join(', ')}\n` +
      '[config] Copie backend/.env.example para backend/.env e preencha os valores.\n'
  );
  process.exit(1);
}

export const env = {
  port: Number(process.env.PORT ?? 3333),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  },
  // Aceita uma lista separada por vírgula para permitir mais de um front
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origem) => origem.trim())
    .filter(Boolean),
};

export const emProducao = env.nodeEnv === 'production';
