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
  {
    files: ['packages/*/src/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'firebase',
                'firebase/**',
                'firebase-admin',
                'firebase-admin/**',
                'firebase-functions',
                'firebase-functions/**',
                'react',
                'react/**',
                'express',
                '@modelcontextprotocol/**',
                'node:*',
                '**/apps/**',
              ],
              message:
                'Pacotes compartilhados não dependem de SDKs, transporte, React, Node ou aplicações.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/frontend/src/**/*.{ts,tsx}', 'apps/backend/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/backend/src/**',
                '**/frontend/src/**',
                '**/packages/*/src/**',
              ],
              message:
                'Use exports públicos dos pacotes; aplicações não importam o código interno umas das outras.',
            },
          ],
        },
      ],
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: { eqeqeq: ['error', 'always'] },
  },
  {
    files: ['apps/backend/src/**/*.ts', 'packages/*/src/**/*.ts'],
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
    files: ['packages/data/src/repositories/snapshots/**/*.ts'],
    // Preserve async contracts and rejected-Promise errors in synchronous snapshot adapters.
    rules: { '@typescript-eslint/require-await': 'off' },
  },
  {
    files: [
      'apps/backend/src/modules/**/domain/**/*.ts',
      'packages/core/src/**/domain/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'firebase',
                'firebase/**',
                'firebase-admin',
                'firebase-admin/**',
                'firebase-functions',
                'firebase-functions/**',
                'react',
                'react/**',
                'node:*',
                '**/apps/**',
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
