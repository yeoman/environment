// @ts-check
import configs from '@yeoman/eslint';
import { config } from 'typescript-eslint';

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
);
