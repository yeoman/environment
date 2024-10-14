import assert from 'node:assert';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sinon from 'sinon';
import { beforeEach, describe, it } from 'esmocha';
import { prepareCommand } from '../src/commands.js';
import Environment from '../src/index.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('environment (command)', () => {
  describe('#execute() with options', () => {
    let environment;

    beforeEach(async () => {
      environment = new Environment([], { skipInstall: true, dryRun: true });
      environment.adapter.log = sinon.stub();
      await environment.register(path.join(__dirname, 'fixtures/generator-commands/generators/options'));
    });

    describe('generator with options', () => {
      describe('without options', () => {
        let generator;
        beforeEach(async () => {
          await environment.execute('commands:options');
          const generators = Object.values(environment.composedStore.getGenerators());
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
          await environment.execute('commands:options', [
            '--bool',
            '--no-bool-default',
            '--string',
            'customValue',
            '--string-default',
            'newValue',
          ]);

          const generators = Object.values(environment.composedStore.getGenerators());
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
          await environment.execute('commands:options', ['-b', '-s', 'customValue']);
          const generators = Object.values(environment.composedStore.getGenerators());
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
    let environment;

    beforeEach(() => {
      environment = new Environment([], { skipInstall: true, dryRun: true });
      environment.adapter.log = sinon.stub();
      environment.register(path.join(__dirname, 'fixtures/generator-commands/generators/arguments'));
    });

    describe('generator with arguments', () => {
      describe('without arguments', () => {
        let generator;
        beforeEach(async () => {
          await environment.execute('commands:arguments');
          const generators = Object.values(environment.composedStore.getGenerators());
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
          await environment.execute('commands:arguments', ['foo']);
          const generators = Object.values(environment.composedStore.getGenerators());
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
    describe('generator with arguments', () => {
      describe('passing bar argument', () => {
        let generator;
        let environment;

        beforeEach(async () => {
          const command = await prepareCommand({
            resolved: require.resolve('./fixtures/generator-commands/generators/arguments/index.js'),
          });
          await command.parseAsync(['node', 'yo', 'bar']);

          environment = command.env;
          const generators = Object.values(environment.composedStore.getGenerators());
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
        let environment;

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

          environment = command.env;
          const generators = Object.values(environment.composedStore.getGenerators());
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
