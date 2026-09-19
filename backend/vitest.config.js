import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Carregado antes de qualquer teste: recusa rodar fora de banco local,
    // porque os testes apagam todas as tabelas de negócio.
    setupFiles: ['./tests/protecao.js'],

    // Os testes compartilham o mesmo banco, então rodam em sequência: em
    // paralelo um apagaria os dados do outro no meio da verificação.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30000,
    include: ['tests/**/*.test.js'],
  },
});
