import 'dotenv/config';

/**
 * Trava de segurança dos testes.
 *
 * Os testes apagam TODAS as tabelas de negócio a cada caso. Rodar isso
 * apontando para produção destruiria os dados reais da confeitaria — e
 * seria um comando de uma linha, num terminal aberto no diretório errado.
 *
 * Por isso recusamos rodar contra qualquer banco que não seja local.
 *
 * O `dotenv/config` acima não é decorativo: sem ele este arquivo roda
 * antes de o .env ser lido, DATABASE_URL vem vazia e a trava barra até o
 * banco local — foi exatamente o que aconteceu na primeira versão.
 */
const url = process.env.DATABASE_URL ?? '';

const EHLOCAL =
  /@(localhost|127\.0\.0\.1|host\.docker\.internal|postgres|db)[:/]/.test(url) ||
  url.startsWith('postgresql:///');

if (!EHLOCAL) {
  throw new Error(
    'Os testes apagam o banco e só rodam contra PostgreSQL local.\n' +
      `DATABASE_URL aponta para: ${url.replace(/:[^:@]*@/, ':***@') || '(vazio)'}\n` +
      'Use um banco local antes de rodar os testes.'
  );
}
