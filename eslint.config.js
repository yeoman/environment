// @ts-check
import configs from '@yeoman/eslint';
import { config } from 'typescript-eslint';
import imports from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';

export default config(
  ...configs,
  { ignores: ['test/fixtures/'] },
  {
    rules: {
      '@typescript-eslint/no-this-alias': 'off',
      'no-undef': 'off',
      'prefer-destructuring': 'off',
      'unicorn/no-array-for-each': 'off',
      'unicorn/no-array-push-push': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/no-this-assignment': 'off',
      'unicorn/prefer-spread': 'off',
      'unicorn/prevent-abbreviations': 'off',
    },
  },
  {
    extends: [imports.flatConfigs.recommended, imports.flatConfigs.typescript],
    languageOptions: {
      // import plugin does not use ecmaVersion and sourceType from languageOptions object
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver()],
    },
    rules: {
      'import-x/extensions': ['error', 'ignorePackages', { checkTypeImports: true, fix: true }],
      'import-x/namespace': 'off',
      'import-x/no-named-as-default-member': 'off',
    },
  },
);
