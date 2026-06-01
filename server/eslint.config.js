import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules', 'dist'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-console': 'warn',
    },
  },
];
