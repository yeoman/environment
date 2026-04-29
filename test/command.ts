/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import assert from 'node:assert';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, esmocha, expect, it } from 'esmocha';
import { TestAdapter } from 'yeoman-test';
import { prepareCommand } from '../src/commands.ts';
import Environment from '../src/index.ts';

type ParsedGenerator = {
  _args?: string[];
  options: Record<string, unknown>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('environment (command)', () => {
  describe('#execute()', () => {
    let environment: Environment;
    let adapter: TestAdapter;

    beforeEach(async () => {
      adapter = new TestAdapter();
      environment = new Environment({ skipInstall: true, dryRun: true, adapter });
    });

    describe('with non existing generator', () => {
      it('declining installation', async () => {
        adapter.addAnswers({
          aproveInstall: false,
        });
        environment.repository.install = esmocha.fn().mockReturnValue(Promise.resolve([]));
        await expect(environment.execute('commands:options')).rejects.toThrow(
          /Installation of generator-commands is declined by the user. Install manually and try again/,
        );
        expect(environment.repository.install).not.toHaveBeenCalled();
      });

      it('approving installation', async () => {
        adapter.addAnswers({
          aproveInstall: true,
        });
        environment.repository.install = esmocha.fn().mockReturnValue(Promise.resolve([]));
        await expect(environment.execute('commands:options')).rejects.toThrow(
          /You don't seem to have a generator with the name “generator-commands” installed./,
        );
        expect(environment.repository.install).toHaveBeenCalledWith(['generator-commands']);
      });
    });
  });

  describe('#execute() with options', () => {
    let environment: Environment;

    beforeEach(async () => {
      environment = new Environment({ skipInstall: true, dryRun: true });
      environment.adapter.log = esmocha.fn();
      await environment.register(path.join(__dirname, 'fixtures/generator-commands/generators/options'));
    });

    describe('generator with options', () => {
      describe('without options', () => {
        let generator: ParsedGenerator;
        beforeEach(async () => {
          await environment.execute('commands:options');
          const generators = Object.values(environment.composedStore.getGenerators()) as ParsedGenerator[];
          assert.ok(generators.length === 1);
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
        let generator: ParsedGenerator;
        beforeEach(async () => {
          await environment.execute('commands:options', [
            '--bool',
            '--no-bool-default',
            '--string',
            'customValue',
            '--string-default',
            'newValue',
          ]);

          const generators = Object.values(environment.composedStore.getGenerators()) as ParsedGenerator[];
          assert.ok(generators.length === 1);
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
        let generator: ParsedGenerator;
        beforeEach(async () => {
          await environment.execute('commands:options', ['-b', '-s', 'customValue']);
          const generators = Object.values(environment.composedStore.getGenerators()) as ParsedGenerator[];
          assert.ok(generators.length === 1);
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
    let environment: Environment;

    beforeEach(() => {
      environment = new Environment({ skipInstall: true, dryRun: true });
      environment.adapter.log = esmocha.fn();
      environment.register(path.join(__dirname, 'fixtures/generator-commands/generators/arguments'));
    });

    describe('generator with arguments', () => {
      describe('without arguments', () => {
        let generator: ParsedGenerator;
        beforeEach(async () => {
          await environment.execute('commands:arguments');
          const generators = Object.values(environment.composedStore.getGenerators()) as ParsedGenerator[];
          assert.ok(generators.length === 1);
          generator = generators[0];
        });

        it('should parse arguments correctly', () => {
          assert.deepStrictEqual(generator._args, []);
        });
      });

      describe('with arguments', () => {
        let generator: ParsedGenerator;
        beforeEach(async () => {
          await environment.execute('commands:arguments', ['foo']);
          const generators = Object.values(environment.composedStore.getGenerators()) as ParsedGenerator[];
          assert.ok(generators.length === 1);
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
        let generator: ParsedGenerator;
        let environment: Environment;

        beforeEach(async () => {
          const command = await prepareCommand({
            resolved: fileURLToPath(new URL('fixtures/generator-commands/generators/arguments/index.js', import.meta.url)),
          });
          await command.parseAsync(['node', 'yo', 'bar']);

          environment = command.env;
          const generators = Object.values(environment.composedStore.getGenerators()) as ParsedGenerator[];
          assert.ok(generators.length === 1);
          generator = generators[0];
        });

        it('should parse arguments correctly', () => {
          assert.deepStrictEqual(generator._args, ['bar']);
        });
      });
    });
    describe('generator with options', () => {
      describe('passing options', () => {
        let generator: ParsedGenerator;
        let environment: Environment;

        beforeEach(async () => {
          const command = await prepareCommand({
            resolved: fileURLToPath(new URL('fixtures/generator-commands/generators/options/index.js', import.meta.url)),
          });
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
          const generators = Object.values(environment.composedStore.getGenerators()) as ParsedGenerator[];
          assert.ok(generators.length === 1);
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
