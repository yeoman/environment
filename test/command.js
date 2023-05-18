import assert from 'node:assert';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sinon from 'sinon';
import semver from 'semver';
import { prepareCommand } from '../src/commands.js';
import Environment from '../src/index.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('environment (command)', () => {
  describe('#execute() with options', () => {
    let env;

    beforeEach(async () => {
      env = new Environment([], { skipInstall: true, dryRun: true });
      env.adapter.log = sinon.stub();
      await env.register(path.join(__dirname, 'fixtures/generator-commands/generators/options'));
    });

    describe('generator with options', () => {
      describe('without options', () => {
        let generator;
        beforeEach(async () => {
          await env.execute('commands:options');
          const generators = Object.values(env.composedStore.getGenerators());
          assert(generators.length === 1);
          generator = generators[0];
        });

        it('should parse options correctly', () => {
          assert.strictEqual(generator.options.bool, undefined);
          assert.strictEqual(generator.options.boolDefault, true);

          assert.strictEqual(generator.options.string, undefined);
          assert.strictEqual(generator.options.stringDefault, 'defaultValue');
        });
      });

      describe('with options', () => {
        let generator;
        beforeEach(async () => {
          await env.execute('commands:options', ['--bool', '--no-bool-default', '--string', 'customValue', '--string-default', 'newValue']);

          const generators = Object.values(env.composedStore.getGenerators());
          assert(generators.length === 1);
          generator = generators[0];
        });

        it('should parse options correctly', () => {
          assert.strictEqual(generator.options.bool, true);
          assert.strictEqual(generator.options.boolDefault, false);

          assert.strictEqual(generator.options.string, 'customValue');
          assert.strictEqual(generator.options.stringDefault, 'newValue');
        });
      });

      describe('using aliases', () => {
        let generator;
        beforeEach(async () => {
          await env.execute('commands:options', ['-b', '-s', 'customValue']);
          const generators = Object.values(env.composedStore.getGenerators());
          assert(generators.length === 1);
          generator = generators[0];
        });

        it('should parse options correctly', () => {
          assert.strictEqual(generator.options.bool, true);
          assert.strictEqual(generator.options.string, 'customValue');
        });
      });
    });
  });

  describe('#execute() with arguments', () => {
    let env;

    beforeEach(() => {
      env = new Environment([], { skipInstall: true, dryRun: true });
      env.adapter.log = sinon.stub();
      env.register(path.join(__dirname, 'fixtures/generator-commands/generators/arguments'));
    });

    describe('generator with arguments', () => {
      describe('without arguments', () => {
        let generator;
        beforeEach(async () => {
          await env.execute('commands:arguments');
          const generators = Object.values(env.composedStore.getGenerators());
          assert(generators.length === 1);
          generator = generators[0];
        });

        it('should parse arguments correctly', () => {
          assert.deepStrictEqual(generator._args, []);
        });
      });

      describe('with arguments', () => {
        let generator;
        beforeEach(async () => {
          await env.execute('commands:arguments', ['foo']);
          const generators = Object.values(env.composedStore.getGenerators());
          assert(generators.length === 1);
          generator = generators[0];
        });

        it('should parse arguments correctly', () => {
          assert.deepStrictEqual(generator._args, ['foo']);
        });

        it('should load arguments into options', () => {
          assert.strictEqual(generator.options.name, 'foo');
        });
      });
    });
  });

  describe('#prepareCommand()', () => {
    if (!semver.satisfies(require('../node_modules/yeoman-generator/package.json').version, '>=5.0.0-beta.1')) {
      return;
    }

    describe('generator with arguments', () => {
      describe('passing bar argument', () => {
        let generator;
        let env;

        beforeEach(async () => {
          const command = await prepareCommand({
            resolved: require.resolve('./fixtures/generator-commands/generators/arguments/index.js'),
          });
          console.log('beforeEach', command);
          await command.parseAsync(['node', 'yo', 'bar']);

          env = command.env;
          const generators = Object.values(env.composedStore.getGenerators());
          assert(generators.length === 1);
          generator = generators[0];
        });

        it('should parse arguments correctly', () => {
          assert.deepStrictEqual(generator._args, ['bar']);
        });
      });
    });
    describe('generator with options', () => {
      describe('passing options', () => {
        let generator;
        let env;

        beforeEach(async () => {
          const command = await prepareCommand({ resolved: require.resolve('./fixtures/generator-commands/generators/options/index.js') });
          await command.parseAsync([
            'node',
            'yo',
            '--bool',
            '--no-bool-default',
            '--string',
            'customValue',
            '--string-default',
            'newValue',
          ]);

          env = command.env;
          const generators = Object.values(env.composedStore.getGenerators());
          assert(generators.length === 1);
          generator = generators[0];
        });

        it('should parse options correctly', () => {
          assert.strictEqual(generator.options.bool, true);
          assert.strictEqual(generator.options.boolDefault, false);

          assert.strictEqual(generator.options.string, 'customValue');
          assert.strictEqual(generator.options.stringDefault, 'newValue');
        });
      });
    });
  });
});
