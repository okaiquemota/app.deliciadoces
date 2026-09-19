import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

/**
 * ESLint do monorepo.
 *
 * O projeto é de grupo: cada integrante mexe num módulo e o código vai
 * junto para a mesma entrega. O linter existe para que a revisão discuta
 * a regra de negócio em vez de estilo, e para pegar a classe de erro que
 * passa batido em leitura — variável não usada depois de refatorar,
 * dependência faltando num `useEffect`, `key` esquecida numa lista.
 *
 * Sobre a versão: ESLint 9, não 10. O `eslint-plugin-react` ainda declara
 * suporte só até `^9.7`, e regra que não roda não protege ninguém —
 * melhor a versão que o ecossistema de fato suporta do que a mais nova.
 * Quando o plugin acompanhar, é só subir os dois juntos.
 */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      'backend/prisma/migrations/**',
      'backend/generated/**',
      '**/.vercel/**',
    ],
  },

  js.configs.recommended,

  // ------------------------------------------------------------- backend
  {
    files: ['backend/**/*.js', 'api/**/*.mjs', '*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': [
        'error',
        // `_` na frente marca parâmetro que existe só por posição — o
        // `next` do errorHandler do Express é o caso clássico.
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off', // o servidor loga no console de propósito
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // -------------------------------------------------------------- testes
  {
    files: ['backend/tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
  },

  // ------------------------------------------------------------ frontend
  {
    files: ['frontend/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      /**
       * `set-state-in-effect` fica em aviso, não em erro.
       *
       * A regra é do react-hooks novo, pensada para o React Compiler, e
       * acusa o padrão que TODAS as telas usam para buscar dados ao abrir:
       * `useEffect(() => { carregar(); }, [carregar])`. Sem uma biblioteca
       * de dados (React Query e afins) não há alternativa em React puro
       * para "carregue quando a tela abrir".
       *
       * Como erro, ela reprovaria seis telas corretas — e linter que
       * reprova código certo ensina o grupo a ignorar o linter, que é o
       * oposto do motivo de ele existir. Fica como aviso: quem for
       * escrever efeito novo lê o alerta e pensa; quem já tem o padrão
       * funcionando não é interrompido.
       */
      'react-hooks/set-state-in-effect': 'warn',

      // O Vite usa o transform novo de JSX: não é preciso importar React.
      'react/react-in-jsx-scope': 'off',
      // PropTypes não são usados no projeto — a checagem fica nos testes
      // e na revisão, não numa camada de tipo pela metade.
      'react/prop-types': 'off',

      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },

  // Desliga tudo que briga com o Prettier. Precisa ficar por último.
  prettier,
];
