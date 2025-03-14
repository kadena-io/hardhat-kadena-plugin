const globals = require('globals');
const pluginJs = require('@eslint/js');
const tseslint = require('typescript-eslint');

const checkFiles = (files) => (config) => config.map((c) => ({ ...c, files }));

/** @type {import('eslint').Linter.Config[]} */
const config = [
  pluginJs.configs.recommended,
  { languageOptions: { globals: globals.browser } },
  // somehow this plugin want to scan all files, but we only want to scan the files in the files array
  ...tseslint.configs.recommended,
];

module.exports = checkFiles(['packages/*/src/**/*.{js,mjs,cjs,ts}'])(config);
