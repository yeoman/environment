import { defineConfig } from 'expect-node/config';

export default defineConfig({
  // The tests of the package, not the ones of its fixtures and generators.
  files: ['test/*.ts'],
  // The tests use the `this` of mocha (`this.timeout`, `this.skip`) and `done`.
  compatibility: 'mocha',
  workers: true,
  forbidOnly: true,
  coverage: { include: ['src/**/*.ts'] },
});
