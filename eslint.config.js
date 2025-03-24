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
    files: ['packages/*/src/**/*.{mjs,ts}'],
  },
  {
    name: 'globalIgnores',
    ignores: ['packages/*/lib/**/*', 'eslint.config.js', '**/*.{mjs,cjs}'],
  },
  // {
  //   overrides: [
  //     {
  //       files: ['**/*.js'], // Only apply to JS files
  //       languageOptions: {
  //         parserOptions: {
  //           // sourceType: 'script', // Enable CommonJS
  //         },
  //       },
  //     },
  //   ],
  // },
);

module.exports = eslintConfig;

// module.exports = checkFiles({
//   files: ['packages/*/src/**/*.{js,mjs,cjs,ts}'],
// })(config);
