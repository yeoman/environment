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

const getRepository = (env: Environment) => (env as any).repository;
const getComposedStore = (env: Environment) => (env as any).composedStore;

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
        getRepository(environment).install = esmocha.fn().mockReturnValue(Promise.resolve([]));
        await expect(environment.execute('commands:options')).rejects.toThrow(
          /Installation of generator-commands is declined by the user. Install manually and try again/,
        );
        expect(getRepository(environment).install).not.toHaveBeenCalled();
      });

      it('approving installation', async () => {
        adapter.addAnswers({
          aproveInstall: true,
        });
        getRepository(environment).install = esmocha.fn().mockReturnValue(Promise.resolve([]));
        await expect(environment.execute('commands:options')).rejects.toThrow(
          /You don't seem to have a generator with the name “generator-commands” installed./,
        );
        expect(getRepository(environment).install).toHaveBeenCalledWith(['generator-commands']);
      });
    });
  });

  describe('#execute() with options', () => {
    let environment: Environment;

    beforeEach(async () => {
      environment = new Environment({ skipInstall: true, dryRun: true });
      environment.adapter.log = esmocha.fn() as any;
      await environment.register(path.join(__dirname, 'fixtures/generator-commands/generators/options'));
    });

    describe('generator with options', () => {
      describe('without options', () => {
        let generator: ParsedGenerator;
        beforeEach(async () => {
          await environment.execute('commands:options');
          const generators = Object.values(getComposedStore(environment).getGenerators()) as ParsedGenerator[];
          expect(generators.length).toEqual(1);
          generator = generators[0];
        });

        it('should parse options correctly', () => {
          expect(generator.options.bool).toBe(undefined);
          expect(generator.options.boolDefault).toBe(true);

          expect(generator.options.string).toBe(undefined);
          expect(generator.options.stringDefault).toBe('defaultValue');
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

          const generators = Object.values(getComposedStore(environment).getGenerators()) as ParsedGenerator[];
          expect(generators.length).toEqual(1);
          generator = generators[0];
        });

        it('should parse options correctly', () => {
          expect(generator.options.bool).toBe(true);
          expect(generator.options.boolDefault).toBe(false);

          expect(generator.options.string).toBe('customValue');
          expect(generator.options.stringDefault).toBe('newValue');
        });
      });

      describe('using aliases', () => {
        let generator: ParsedGenerator;
        beforeEach(async () => {
          await environment.execute('commands:options', ['-b', '-s', 'customValue']);
          const generators = Object.values(getComposedStore(environment).getGenerators()) as ParsedGenerator[];
          expect(generators.length).toEqual(1);
          generator = generators[0];
        });

        it('should parse options correctly', () => {
          expect(generator.options.bool).toBe(true);
          expect(generator.options.string).toBe('customValue');
        });
      });
    });
  });

  describe('#execute() with arguments', () => {
    let environment: Environment;

    beforeEach(() => {
      environment = new Environment({ skipInstall: true, dryRun: true });
      environment.adapter.log = esmocha.fn() as any;
      environment.register(path.join(__dirname, 'fixtures/generator-commands/generators/arguments'));
    });

    describe('generator with arguments', () => {
      describe('without arguments', () => {
        let generator: ParsedGenerator;
        beforeEach(async () => {
          await environment.execute('commands:arguments');
          const generators = Object.values(getComposedStore(environment).getGenerators()) as ParsedGenerator[];
          expect(generators.length).toEqual(1);
          generator = generators[0];
        });

        it('should parse arguments correctly', () => {
          expect(generator._args).toEqual([]);
        });
      });

      describe('with arguments', () => {
        let generator: ParsedGenerator;
        beforeEach(async () => {
          await environment.execute('commands:arguments', ['foo']);
          const generators = Object.values(getComposedStore(environment).getGenerators()) as ParsedGenerator[];
          expect(generators.length).toEqual(1);
          generator = generators[0];
        });

        it('should parse arguments correctly', () => {
          expect(generator._args).toEqual(['foo']);
        });

        it('should load arguments into options', () => {
          expect(generator.options.name).toBe('foo');
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

          environment = command.env as Environment;
          const generators = Object.values(getComposedStore(environment).getGenerators()) as ParsedGenerator[];
          expect(generators.length).toEqual(1);
          generator = generators[0];
        });

        it('should parse arguments correctly', () => {
          expect(generator._args).toEqual(['bar']);
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

          environment = command.env as Environment;
          const generators = Object.values(getComposedStore(environment).getGenerators()) as ParsedGenerator[];
          expect(generators.length).toEqual(1);
          generator = generators[0];
        });

        it('should parse options correctly', () => {
          expect(generator.options.bool).toBe(true);
          expect(generator.options.boolDefault).toBe(false);

          expect(generator.options.string).toBe('customValue');
          expect(generator.options.stringDefault).toBe('newValue');
        });
      });
    });
  });
});
