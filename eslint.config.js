import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist-review', 'node_modules', 'public', 'Louvor_Lagoinha_GoogleDrive', '**/.wrangler'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node }
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Dependências erradas de hooks geram closures velhas no palco (ex.: próxima música errada).
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' }
  },
  {
    // Os tipos do Workers se estendem por `declare global { namespace Cloudflare { interface Env ... } }`
    files: ['workers/**/*.ts'],
    rules: { '@typescript-eslint/no-namespace': 'off', '@typescript-eslint/no-empty-object-type': 'off' }
  }
);
