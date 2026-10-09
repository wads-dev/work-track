import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/lib/**',
      '**/dist/**',
      'coverage/**',
      'node_modules/**',
      '.npm-cache/**',
      '.firebase/**',
      '.release/**',
      '.firebase-cli/**',
      '.agents/**',
    ],
  },
  {
    files: ['apps/frontend/public/**/*.js', 'apps/frontend/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: { eqeqeq: ['error', 'always'] },
  },
  {
    files: ['apps/backend/src/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['apps/backend/src/modules/**/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'firebase-admin',
                'firebase-admin/**',
                'firebase-functions/**',
                'express',
                '@modelcontextprotocol/**',
              ],
              message: 'Domínio não depende de adaptadores externos.',
            },
            {
              group: [
                '**/infrastructure/**',
                '**/presentation/**',
                '**/application/**',
                '**/core/**',
              ],
              message: 'Dependências de domínio devem apontar para dentro.',
            },
          ],
        },
      ],
    },
  },
);
