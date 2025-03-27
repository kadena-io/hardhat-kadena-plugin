const globals = require('globals');
const pluginJs = require('@eslint/js');
const tseslint = require('typescript-eslint');
const { defineConfig } = require('eslint/config');

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = defineConfig(
  pluginJs.configs.recommended,
  { languageOptions: { globals: globals.browser } },
  ...tseslint.configs.recommended,
  {
    name: 'files',
    files: ['packages/*/src/**/*.ts'],
  },
  {
    name: 'globalIgnores',
    ignores: [
      'packages/*/lib/**/*',
      'eslint.config.js',
      '**/*.{mjs,cjs,js}',
      '**/typechain-types/*',
    ],
  },
);

module.exports = eslintConfig;
