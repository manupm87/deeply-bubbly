// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // The e2e tree: Playwright specs are TypeScript (typescript-eslint turns `no-undef` off for those),
    // but the driver scripts under `e2e/tools` are plain ESM that runs half in Node and half, through
    // `page.evaluate`, in the browser. Declaring both sets of globals is what lets `pnpm lint` cover
    // the drag helpers and the screenshot bot at all — they were outside every gate until now.
    files: ['apps/web/e2e/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        document: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        window: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
  {
    // The core package must stay free of rendering / DOM dependencies.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['phaser', 'phaser/*', 'pixi.js', 'matter-js'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage', 'performance'],
    },
  },
);
