/* eslint-disable unicorn/no-await-expression-member, @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import events from 'node:events';
import fs from 'node:fs';
import path, { dirname, join } from 'node:path';
import process from 'node:process';
import util from 'node:util';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { after, afterEach, before, beforeEach, describe, esmocha, expect, it } from 'esmocha';
import { QueuedAdapter } from '@yeoman/adapter';
import Environment, { createEnv as createEnvironment } from '../src/index.ts';
import { resolveModulePath } from '../src/util/resolve.ts';
import { allVersions, importGenerator, isGreaterThan6, isLegacyVersion } from './generator-versions.ts';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ENVIRONMENT_VERSION = require('../package.json').version;
const GROUPED_QUEUE_VERSION = require('grouped-queue/package.json').version;

for (const generatorVersion of allVersions) {
  const Generator = await importGenerator(generatorVersion);
  type GeneratorCtor = typeof Generator;
  type GeneratorRunSpy = ReturnType<typeof esmocha.fn>;
  type GeneratorMockStub = ReturnType<typeof esmocha.fn>;

  describe(`Environment with ${generatorVersion}`, () => {
    let mockedDefault: GeneratorMockStub;
    let MockedGenerator: GeneratorCtor;
    let env: Environment;
    let expected: string;
    let registeredGenerator: GeneratorCtor;
    let stubGenerator: GeneratorCtor;
    let writingStubGenerator: GeneratorCtor;
    let promiseFailingStubGenerator: GeneratorCtor;
    let eventFailingStubGenerator: GeneratorCtor;
    let runMethod: GeneratorRunSpy;
    let postConstruct: GeneratorRunSpy;
    let capturedArgs: [string[] | string, Record<string, unknown>] | undefined;
    let simplePath: string;
    let extendPath: string;
    let simpleDummy: GeneratorRunSpy;
    let resolvedDummy: GeneratorRunSpy;
    let completeDummy: GeneratorCtor;
    let generatorPath: string;
    let generator: unknown;

    beforeEach(async function () {
      env = new Environment({
        skipInstall: true,
        sharedOptions: { sharedConstructorData: {} },
      });

      MockedGenerator = class MockedGenerator extends Generator {};
      mockedDefault = esmocha.fn();
      MockedGenerator.prototype.mockedDefault = mockedDefault;
    });

    afterEach(function () {
      env.removeAllListeners();
    });

    it('is an instance of EventEmitter', () => {
      expect(new Environment() instanceof events.EventEmitter).toBeTruthy();
    });

    describe('constructor', () => {
      it('take options parameter', () => {
        const options = { foo: 'bar' };
        expect(new Environment(options).options).toMatchObject(options);
      });

      it('instantiates a QueuedAdapter if none provided', async function () {
        expect(env.adapter instanceof QueuedAdapter).toBeTruthy();
      });

      it('uses the provided object as adapter if any', () => {
        const dummyAdapter = {};
        const environment = new Environment({ adapter: dummyAdapter });
        expect(environment.adapter).toEqual(dummyAdapter);
      });

      it('instantiates a mem-fs instance', async function () {
        expect(env.sharedFs).toBeTruthy();
      });
    });

    describe('#getVersion()', () => {
      it('output the version number', async function () {
        const version = env.getVersion();
        expect(version).toBeTruthy();
        expect(version).toEqual(ENVIRONMENT_VERSION);
      });

      it('output the grouped-queue version number', async function () {
        const version = env.getVersion('grouped-queue');
        expect(version).toBeTruthy();
        expect(version).toEqual(GROUPED_QUEUE_VERSION);
      });
    });

    describe('#help()', () => {
      beforeEach(async function () {
        await env.register(path.join(__dirname, 'fixtures/generator-simple'));
        await env.register(path.join(__dirname, 'fixtures/generator-extend/support'));

        expected = fs.readFileSync(path.join(__dirname, 'fixtures/help.txt'), 'utf8').trim();

        // Lazy "update the help fixtures because something changed" statement
        // fs.writeFileSync(path.join(__dirname, 'fixtures/help.txt'), env.help().trim());
      });

      it('output the general help', async function () {
        expect(env.help().trim()).toEqual(expected);
      });

      it('output the help with a custom bin name', async function () {
        expected = expected.replace('Usage: init', 'Usage: gg');
        expect(env.help('gg').trim()).toEqual(expected);
      });
    });

    describe('#create()', () => {
      beforeEach(async function () {
        class NewGenerator extends Generator {}
        registeredGenerator = NewGenerator;
        env.register(registeredGenerator, { namespace: 'stub' });
        env.register(registeredGenerator, { namespace: 'stub:foo:bar' });
        env.register(registeredGenerator, { namespace: '@scope/stub' });
      });

      it('instantiate a generator', async function () {
        this.timeout(10_000);
        expect((await env.create('stub')) instanceof registeredGenerator).toBeTruthy();
      });

      it('instantiate a scoped generator', async function () {
        expect((await env.create('@scope/stub')) instanceof registeredGenerator).toBeTruthy();
      });

      it('pass args parameter', async function () {
        const arguments_ = ['foo', 'bar'];
        const generator = await env.create('stub', arguments_);
        expect(generator.arguments).toEqual(arguments_);
      });

      it('pass options parameter', async function () {
        const arguments_ = [];
        const options = { foo: 'bar' };
        const generator = await env.create('stub', arguments_, options);
        expect(generator.options.foo).toEqual('bar');
      });

      it('pass options.arguments', async function () {
        const arguments_ = ['foo', 'bar'];
        const generator = await env.create('stub', { arguments: arguments_ });
        expect(generator.arguments).toEqual(arguments_);
      });

      it('pass options.arguments as string', async function () {
        const arguments_ = 'foo bar';
        const generator = await env.create('stub', { arguments: arguments_ });
        expect(generator.arguments).toEqual(arguments_.split(' '));
      });

      it('pass options.args (as `arguments` alias)', async function () {
        const arguments_ = ['foo', 'bar'];
        const generator = await env.create('stub', { args: arguments_ });
        expect(generator.arguments).toEqual(arguments_);
      });

      it('prefer options.arguments over options.args', async function () {
        const arguments1 = ['yo', 'unicorn'];
        const arguments_ = ['foo', 'bar'];
        const generator = await env.create('stub', { arguments: arguments1, args: arguments_ });
        expect(generator.arguments).toEqual(arguments1);
      });

      it('default arguments to `env.arguments`', async function () {
        const arguments_ = ['foo', 'bar'];
        env.arguments = arguments_;
        const generator = await env.create('stub');
        expect(generator.arguments).not.toEqual(arguments_);
      });

      it('pass options.options', async function () {
        const options = { foo: 'bar' };
        const generator = await env.create('stub', { options });
        expect(generator.options.foo).toEqual('bar');
      });

      it('spread sharedOptions', async function () {
        const options = { foo: 'bar' };
        const generator = await env.create('stub', { options });
        const generator2 = await env.create('stub');
        expect(generator.options.foo).toEqual('bar');
        expect(generator.options.sharedData).toEqual(generator2.options.sharedData);

        generator.options.sharedData.foo = 'bar';
        expect(generator2.options.sharedData.foo).toEqual('bar');

        expect(generator.options.sharedConstructorData).toEqual(generator2.options.sharedConstructorData);
        generator.options.sharedConstructorData.bar = 'foo';
        expect(generator2.options.sharedConstructorData.bar).toEqual('foo');
      });

      it('throws if Generator is not registered', async function () {
        expect(() => env.create('i:do:not:exist')).toThrow();
      });

      it('add the env as property on the generator', async function () {
        expect((await env.create('stub')).env).toEqual(env);
      });

      it('add the Generator resolved path on the options', async function () {
        expect((await env.create('stub')).options.resolved).toEqual((await env.get('stub')).resolved);
      });

      it('adds the namespace on the options', async function () {
        expect((await env.create('stub')).options.namespace).toEqual('stub');
      });

      it('adds the namespace as called on the options', async function () {
        expect((await env.create('stub:foo:bar')).options.namespace).toEqual('stub:foo:bar');
      });

      it('adds the namespace from a module generator on the options', async function () {
        await env.register(path.join(__dirname, './fixtures/generator-module/generators/app'), { namespace: 'fixtures:generator-module' });
        expect((await env.create('fixtures:generator-module')).options.namespace).toEqual('fixtures:generator-module');
      });

      it('adds the Generator resolved path from a module generator on the options', async function () {
        await env.register(path.join(__dirname, './fixtures/generator-module/generators/app'), { namespace: 'fixtures:generator-module' });
        expect((await env.create('fixtures:generator-module')).options.resolved).toEqual(
          (await env.get('fixtures:generator-module')).resolved,
        );
      });
    });

    describe('#composeWith()', () => {
      beforeEach(async function () {
        class NewGenerator extends Generator {
          constructor(arguments_, options, features) {
            super(arguments_, options, { uniqueBy: options.namespace, ...features });
          }

          aTask() {}
        }
        registeredGenerator = NewGenerator;
        env.register(registeredGenerator, { namespace: 'stub' });
        env.register(registeredGenerator, { namespace: 'stub:foo:bar' });
        env.register(registeredGenerator, { namespace: '@scope/stub' });
      });

      it('should instantiate a generator', async function () {
        expect((await env.composeWith('stub')) instanceof registeredGenerator).toBeTruthy();
      });

      it('should instantiate a genarator and set _meta', async function () {
        expect((await env.composeWith('stub'))._meta).toBeTruthy();
      });

      it('should schedule generator queue', async function () {
        env.queueTask = esmocha.fn();
        await env.composeWith('stub');
        expect(env.queueTask).toHaveBeenCalledTimes(1);
        expect((env.queueTask as any).mock.calls[0][0]).toBe('environment:run');
      });

      describe('passing false schedule parameter', () => {
        it('should not schedule generator', async function () {
          env.queueTask = esmocha.fn();
          await env.composeWith('stub', { generatorArgs: [], schedule: false });
          if (isGreaterThan6(generatorVersion)) {
            expect(env.queueTask).toHaveBeenCalledTimes(1);
            expect((env.queueTask as any).mock.calls[0][0]).not.toBe('environment:run');
          } else {
            expect(env.queueTask).not.toHaveBeenCalled();
          }
        });
      });
      describe('passing function schedule parameter', () => {
        it('returning false should not schedule generator', async function () {
          env.queueTask = esmocha.fn();
          await env.composeWith('stub', { generatorArgs: [], schedule: () => false });
          if (isGreaterThan6(generatorVersion)) {
            expect(env.queueTask).toHaveBeenCalledTimes(1);
            expect((env.queueTask as any).mock.calls[0][0]).not.toBe('environment:run');
          } else {
            expect(env.queueTask).not.toHaveBeenCalled();
          }
        });
      });

      it('should emit a compose event', function (done) {
        env.once('compose', (namespace, generator) => {
          expect(namespace === 'stub').toBeTruthy();
          expect(generator instanceof registeredGenerator).toBeTruthy();
          done();
        });
        env.composeWith('stub');
      });

      it('should emit a compose namespace event with scoped generators', function (done) {
        env.once('compose:@scope/stub', generator => {
          expect(generator instanceof registeredGenerator).toBeTruthy();
          done();
        });
        env.composeWith('@scope/stub');
      });

      it('should emit a compose namespace event', function (done) {
        env.once('compose:stub', generator => {
          expect(generator instanceof registeredGenerator).toBeTruthy();
          done();
        });
        env.composeWith('stub');
      });

      describe('when the generator should be a singleton and is already composed', () => {
        let composed: unknown;
        beforeEach(function (done) {
          if (isLegacyVersion(generatorVersion)) {
            this.skip();
            return;
          }

          env.once('compose', (namespace, generator) => {
            expect(namespace === 'stub').toBeTruthy();
            expect(generator instanceof registeredGenerator).toBeTruthy();
            composed = generator;
            done();
          });
          env.composeWith('stub');
        });

        it('should not emit events', async function () {
          env.once('compose', () => {
            throw new Error('should not happen');
          });
          env.once('compose:stub', () => {
            throw new Error('should not happen');
          });
          await env.composeWith('stub');
        });

        it('should return already composed instance', async function () {
          expect(composed).toBe(await env.composeWith('stub'));
        });
      });
    });

    describe('#run()', () => {
      beforeEach(async function () {
        capturedArgs = undefined;

        stubGenerator = class extends Generator {
          constructor(arguments_, options) {
            super(arguments_, options);
            capturedArgs = [arguments_, options];
          }

          exec() {}
        };

        writingStubGenerator = class extends Generator {
          constructor(arguments_, options) {
            super(arguments_, options);
            capturedArgs = [arguments_, options];
          }

          writing() {
            this.fs.write('foo.js', 'foo');
          }
        };

        promiseFailingStubGenerator = class extends Generator {
          install() {
            return Promise.reject(new Error('some error'));
          }
        };

        eventFailingStubGenerator = class extends Generator {
          install() {
            return this.emit('error', new Error('some error'));
          }
        };

        const runName = isLegacyVersion(generatorVersion) ? 'run' : 'queueTasks';
        runMethod = esmocha.spyOn(Generator.prototype as any, runName as any);
        env.register(stubGenerator, { namespace: 'stub:run' });
        env.register(writingStubGenerator, { namespace: 'writingstub:run' });
        env.register(promiseFailingStubGenerator, { namespace: 'promisefailingstub:run' });
        env.register(eventFailingStubGenerator, { namespace: 'eventfailingstub:run' });
        await env.register(path.join(__dirname, './fixtures', 'generator-no-constructor', 'generators', 'app'));
      });

      afterEach(function () {
        runMethod.mockRestore();
      });

      it('runs a registered generator', async function () {
        return env.run(['stub:run']).then(() => {
          expect(runMethod).toHaveBeenCalledTimes(1);
        });
      });

      describe('using relative paths', () => {
        let oldCwd: string;
        before(() => {
          oldCwd = process.cwd();
          process.chdir(dirname(fileURLToPath(import.meta.url)));
        });
        after(() => {
          process.chdir(oldCwd);
        });
        it('runs a generator', async function () {
          return env.run(['./fixtures/generator-esm/generators/app/index.js']);
        });
      });

      it('runs a registered writing generator with bail option', async function () {
        if (isLegacyVersion(generatorVersion)) {
          this.skip();
        }

        return env
          .run(['writingstub:run'], { bail: true })
          .then(() => {
            throw new Error('should not happen');
          })
          .catch(error => {
            expect(error.message).toEqual('Process aborted by conflict: foo.js');
          });
      });

      it('pass args and options to the runned generator', async function () {
        const arguments_ = ['stub:run', 'module'];
        const options = { skipInstall: true };
        return env.run(arguments_, options).then(() => {
          expect(runMethod).toHaveBeenCalledTimes(1);
          expect(capturedArgs[0]).toEqual(['module']);
          expect(capturedArgs[1].skipInstall).toEqual(true);
        });
      });

      it('can take string as args', async function () {
        const arguments_ = 'stub:run module';
        return env.run(arguments_).then(() => {
          expect(runMethod).toHaveBeenCalledTimes(1);
          expect(capturedArgs[0]).toEqual(['module']);
        });
      });

      it('cannot take no arguments', async function () {
        env.arguments = ['stub:run'];
        return env.run().then(
          () => {
            throw new Error('not supposed to happen');
          },
          error => {
            expect(runMethod).not.toHaveBeenCalled();
            expect(error.message.includes('Must provide at least one argument, the generator namespace to invoke.')).toBeTruthy();
          },
        );
      });

      it('launch error if generator is not found', async function () {
        return env.run('some:unknown:generator').then(
          () => expect.fail('Assertion failed'),
          error => {
            expect(error.message).toMatch('“generator-some”');
          },
        );
      });

      it("launch error if generator doesn't have a constructor", async function () {
        return env.run('no-constructor:app').then(
          () => {
            throw new Error('Should throw');
          },
          error => {
            expect(error.message).toMatch('provide a constructor');
          },
        );
      });

      it('generator error event emits error event when no callback passed', function (done) {
        env.on('error', error => {
          expect(runMethod).toHaveBeenCalledTimes(1);
          expect(error instanceof Error).toBeTruthy();
          expect(error.message).toEqual('some error');
          done();
        });
        const generator = env.create('eventfailingstub:run');
        expect(generator.listenerCount('error')).toEqual(0);
        env.runGenerator(generator).catch(() => {});
      });

      it('generator failing task emits error', function (done) {
        env.on('error', error => {
          expect(runMethod).toHaveBeenCalledTimes(1);
          expect(error instanceof Error).toBeTruthy();
          expect(error.message).toEqual('some error');
          done();
        });
        const generator = env.create('promisefailingstub:run');
        expect(generator.listenerCount('error')).toEqual(0);
        env.runGenerator(generator).catch(() => {});
      });

      it('returns the generator', async function () {
        const runReturnValue = env.run('stub:run');
        expect(runReturnValue instanceof Promise).toBeTruthy();
      });

      it('correctly rejects promise on generator not found error', function (done) {
        env.run('@dummyscope/package').catch(() => {
          done();
        });
      });

      it('correctly rejects promise on missing args error', function (done) {
        env.run().catch(() => {
          done();
        });
      });

      it('correctly append scope in generator hint', async function () {
        return env.run('@dummyscope/package').then(
          () => {
            throw new Error('Should throw');
          },
          error => {
            expect(error.message.includes('@dummyscope/generator-package')).toBeTruthy();
          },
        );
      });

      it('runs a module generator', async function () {
        await env.register(path.join(__dirname, './fixtures/generator-module/generators/app'), 'fixtures:generator-module');
        return env.run('fixtures:generator-module');
      });
    });

    describe('#getGeneratorMeta{}', () => {
      it('importGenerator should return a class', async function () {
        env.register(path.join(__dirname, './fixtures/generator-module/generators/app'), 'fixtures:generator-module');
        const meta = env.getGeneratorMeta('fixtures:generator-module');
        expect(typeof (await meta.importGenerator())).toEqual('function');
      });
      it('importModule should return the generator module', async function () {
        env.register(path.join(__dirname, './fixtures/generator-module/generators/app'), 'fixtures:generator-module');
        const meta = env.getGeneratorMeta('fixtures:generator-module');
        const Generator = await meta.importGenerator();
        const module = await meta.importModule();
        expect(Generator).toBe(module.default);
      });
      it('intantiate should return an instance', async function () {
        env.register(path.join(__dirname, './fixtures/generator-module/generators/app'), 'fixtures:generator-module');
        const meta = env.getGeneratorMeta('fixtures:generator-module');
        const Generator = await meta.importGenerator();
        const generator = await meta.instantiate();
        expect(generator instanceof Generator).toBeTruthy();
      });
      it('intantiateHelp should return an instance with help option', async function () {
        env.register(path.join(__dirname, './fixtures/generator-module/generators/app'), 'fixtures:generator-module');
        const meta = env.getGeneratorMeta('fixtures:generator-module');
        const generator = await meta.instantiateHelp();
        expect(generator.options.help).toBe(true);
      });
    });

    describe('#run() a ts generator', () => {
      beforeEach(async function () {
        await env.register(path.join(__dirname, './fixtures/generator-ts/generators/app/index.ts'), { namespace: 'ts:app' });
        runMethod = esmocha.spyOn((await env.get('ts:app')).prototype as any, 'exec' as any);
      });

      afterEach(function () {
        runMethod.mockRestore();
      });

      it('runs a registered generator', async function () {
        return env.run(['ts:app']).then(() => {
          expect(runMethod).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('#run() a cjs generator', () => {
      beforeEach(async function () {
        await env.register(path.join(__dirname, './fixtures/generator-common-js/generators/cjs/index.cjs'), { namespace: 'common-js:cjs' });
        const Generator = await env.get('common-js:cjs');
        runMethod = esmocha.spyOn(Generator.prototype as any, 'default' as any);
        postConstruct = esmocha.spyOn(Generator.prototype as any, '_postConstruct' as any);
      });

      afterEach(function () {
        runMethod.mockRestore();
        postConstruct.mockRestore();
      });

      it('runs a registered generator', async function () {
        await env.run(['common-js:cjs']);
        expect(runMethod).toHaveBeenCalledTimes(1);
      });
      it('calls generator _postConstruct method', async function () {
        return env.run(['common-js:cjs']).then(() => {
          expect(postConstruct).toHaveBeenCalledTimes(1);
        });
      });
      it('should not call generator _postConstruct method with help option', async function () {
        return env.run(['common-js:cjs'], { help: true }).then(() => {
          expect(postConstruct).not.toHaveBeenCalled();
        });
      });
    });

    describe('#run() an esm generator', () => {
      describe('with js extension', () => {
        beforeEach(async function () {
          await env.register(path.join(__dirname, './fixtures/generator-esm/generators/app/index.js'), { namespace: 'esm:app' });
          const esmClass = await env.get('esm:app');
          runMethod = esmocha.spyOn(esmClass.prototype as any, 'default' as any);
          postConstruct = esmocha.spyOn(esmClass.prototype as any, '_postConstruct' as any);
        });

        afterEach(function () {
          runMethod.mockRestore();
          postConstruct.mockRestore();
        });

        it('runs a registered generator', async function () {
          return env.run(['esm:app']).then(() => {
            expect(runMethod).toHaveBeenCalledTimes(1);
          });
        });
        it('calls generator _postConstruct method', async function () {
          return env.run(['esm:app']).then(() => {
            expect(postConstruct).toHaveBeenCalledTimes(1);
          });
        });
        it('should not call generator _postConstruct method with help option', async function () {
          return env.run(['esm:app'], { help: true }).then(() => {
            expect(postConstruct).not.toHaveBeenCalled();
          });
        });
      });
      describe('with mjs extension', () => {
        beforeEach(async function () {
          await env.register(path.join(__dirname, './fixtures/generator-esm/generators/mjs/index.mjs'), { namespace: 'esm:mjs' });
          const esmClass = await env.get('esm:mjs');
          runMethod = esmocha.spyOn(esmClass.prototype as any, 'default' as any);
        });

        afterEach(function () {
          runMethod.mockRestore();
        });

        it('runs a registered generator', async function () {
          return env.run(['esm:mjs']).then(() => {
            expect(runMethod).toHaveBeenCalledTimes(1);
          });
        });
      });
      describe('with createGenerator', () => {
        beforeEach(async function () {
          env.register(MockedGenerator, { namespace: 'mocked-generator' });
          await env.register(path.join(__dirname, './fixtures/generator-esm/generators/create/index.js'), { namespace: 'esm:create' });
        });

        it('runs a registered generator', async function () {
          return env.run(['esm:create']).then(() => {
            expect(mockedDefault).toHaveBeenCalledTimes(1);
          });
        });
      });
      describe('with inherited createGenerator', () => {
        beforeEach(async function () {
          env.register(MockedGenerator, { namespace: 'mocked-generator' });
          await env.register(path.join(__dirname, './fixtures/generator-esm/generators/create/index.js'), { namespace: 'esm:create' });
          await env.register(path.join(__dirname, './fixtures/generator-esm/generators/create-inherited/index.js'), 'esm:create-inherited');
        });

        it('runs a registered generator', async function () {
          return env.run(['esm:create-inherited']).then(() => {
            expect(mockedDefault).toHaveBeenCalledTimes(1);
          });
        });
      });
    });

    describe('#resolveModulePath()', async () => {
      it('resolves to a directory if no file type specified', async function () {
        const modulePath = path.join(__dirname, 'fixtures/generator-scoped/package');
        const specifiedJS = path.join(__dirname, 'fixtures/generator-scoped/package/index.js');
        const specifiedJSON = path.join(__dirname, 'fixtures/generator-scoped/package.json');
        const specifiedNode = path.join(__dirname, 'fixtures/generator-scoped/package/nodefile.node');

        expect(specifiedJS).toEqual(await resolveModulePath(modulePath));
        expect(specifiedJS).toEqual(await resolveModulePath(specifiedJS));
        expect(specifiedJSON).toEqual(await resolveModulePath(specifiedJSON));
        expect(specifiedNode).toEqual(await resolveModulePath(specifiedNode));

        const aModulePath = path.join(__dirname, 'fixtures/generator-scoped/app');
        const aSpecifiedJS = path.join(__dirname, 'fixtures/generator-scoped/app/index.js');
        expect(aSpecifiedJS).toEqual(await resolveModulePath(aModulePath));
      });
    });

    describe('#register()', () => {
      beforeEach(async function () {
        simplePath = path.join(__dirname, 'fixtures/generator-simple');
        extendPath = path.join(__dirname, './fixtures/generator-extend/support');
        expect(env.namespaces().length).toEqual(0);
        env.register(simplePath, 'fixtures:generator-simple', simplePath);
        env.register(extendPath, 'scaffold');
      });

      it('store registered generators', async function () {
        expect(env.namespaces().length).toEqual(2);
      });

      it('determine registered Generator namespace and resolved path', async function () {
        const simple = await env.get('fixtures:generator-simple');
        expect(typeof simple).toEqual('function');
        expect(simple.namespace).toBeTruthy();
        expect(simple.resolved).toBeTruthy();
        expect(simple.packagePath).toBeTruthy();

        const extend = await env.get('scaffold');
        expect(typeof extend).toEqual('function');
        expect(extend.namespace).toBeTruthy();
        expect(extend.resolved).toBeTruthy();
      });

      it('throw when String is not passed as first parameter', () => {
        expect(() => env.register(() => {}, 'blop')).not.toThrow();
        expect(() => env.register([], 'blop')).toThrow();
        expect(() => env.register(false, 'blop')).toThrow();
      });
    });

    describe('#getPackagePath and #getPackagePaths()', () => {
      beforeEach(async function () {
        env.alias(/^prefix-(.*)$/, '$1');
        simpleDummy = esmocha.fn();
        simplePath = path.join(__dirname, 'fixtures/generator-simple');
        expect(env.namespaces().length).toEqual(0);
        await env.register(simplePath, { namespace: 'fixtures:generator-simple', packagePath: simplePath });
        await env.register(simplePath, { namespace: 'fixtures2', packagePath: simplePath });
        env.register(simpleDummy, { namespace: 'fixtures:dummy-simple', resolved: 'dummy/path', packagePath: 'dummy/packagePath' });
        await env.register(simplePath, { namespace: 'fixtures:generator-simple2', packagePath: 'new-path' });
      });

      it('determine registered Generator namespace and resolved path', async function () {
        expect(await env.getPackagePath('fixtures:generator-simple')).toEqual(simplePath);
        expect(await env.getPackagePath('fixtures')).toEqual('new-path');
        expect(await env.getPackagePaths('fixtures')).toEqual(['new-path', join('dummy/packagePath'), simplePath]);

        // With alias
        expect(await env.getPackagePath('prefix-fixtures:generator-simple')).toEqual(await env.getPackagePath('fixtures:generator-simple'));
        expect(await env.getPackagePath('prefix-fixtures')).toEqual(await env.getPackagePath('fixtures'));
        expect(await env.getPackagePaths('prefix-fixtures')).toEqual(await env.getPackagePaths('fixtures'));
      });
    });

    describe('#register()', () => {
      beforeEach(async function () {
        simpleDummy = esmocha.fn();
        resolvedDummy = esmocha.fn();
        completeDummy = function () {};
        util.inherits(completeDummy, Generator);
        env.register(simpleDummy, { namespace: 'dummy:simple' });
        env.register(completeDummy, { namespace: 'dummy:complete' });
        env.register(resolvedDummy, { namespace: 'dummy:resolved', resolved: 'dummy/path', packagePath: 'dummy/packagePath' });
      });

      it('register a function under a namespace', async function () {
        expect(completeDummy).toEqual(await env.get('dummy:complete'));
      });

      it('registers the resolved path and package path', async function () {
        expect(join('dummy/path/index.js')).toEqual((await env.get('dummy:resolved')).resolved);
        expect(join('dummy/packagePath')).toEqual((await env.get('dummy:resolved')).packagePath);
      });

      it('throws if invalid generator', async function () {
        expect(env.register.bind(env, [], { namespace: 'dummy' })).toThrow(/stub\sfunction/);
      });

      it('throws if invalid namespace', async function () {
        expect(env.register.bind(env, simpleDummy, {})).toThrow(/namespace/);
      });
    });

    describe('#namespaces()', () => {
      beforeEach(async function () {
        await env.register(path.join(__dirname, './fixtures/generator-simple'));
        await env.register(path.join(__dirname, './fixtures/generator-extend/support'));
        await env.register(path.join(__dirname, './fixtures/generator-extend/support'), { namespace: 'support:scaffold' });
      });

      it('get the list of namespaces', async function () {
        expect(env.namespaces()).toEqual(['simple', 'extend:support', 'support:scaffold']);
      });
    });

    describe('#getGeneratorsMeta()', () => {
      beforeEach(async function () {
        generatorPath = path.join(__dirname, './fixtures/generator-simple');
        await env.register(generatorPath);
      });

      it('get the registered Generators metadatas', async function () {
        const meta = env.getGeneratorsMeta().simple;
        expect(meta.resolved).toEqual(require.resolve(generatorPath));
        expect(meta.namespace).toEqual('simple');
      });
    });

    describe('#getGeneratorNames', () => {
      beforeEach(async function () {
        generatorPath = path.join(__dirname, './fixtures/generator-simple');
        await env.register(generatorPath);
      });

      it('get the registered generators names', async function () {
        expect(env.getGeneratorNames()).toEqual(['simple']);
      });
    });

    describe('#namespace()', () => {
      it('create namespace from path', async function () {
        expect(env.namespace('backbone/all/index.js')).toEqual('backbone:all');
        expect(env.namespace('backbone/all/main.js')).toEqual('backbone:all');
        expect(env.namespace('backbone/all')).toEqual('backbone:all');
        expect(env.namespace('backbone/all.js')).toEqual('backbone:all');
        expect(env.namespace('backbone/app/index.js')).toEqual('backbone:app');
        expect(env.namespace('backbone.js')).toEqual('backbone');

        expect(env.namespace('generator-backbone/all.js')).toEqual('backbone:all');
        expect(env.namespace('generator-mocha/backbone/model/index.js')).toEqual('mocha:backbone:model');
        expect(env.namespace('generator-mocha/backbone/model.js')).toEqual('mocha:backbone:model');
        expect(env.namespace('node_modules/generator-mocha/backbone/model.js')).toEqual('mocha:backbone:model');
        expect(env.namespace('../node_modules/generator-mocha/backbone/model.js')).toEqual('mocha:backbone:model');
        expect(env.namespace('../generator-mocha/backbone/model.js')).toEqual('mocha:backbone:model');
      });

      it('create namespace from scoped path', async function () {
        expect(env.namespace('@dummyscope/generator-backbone/all.js')).toEqual('@dummyscope/backbone:all');
        expect(env.namespace('@dummyscope/generator-mocha/backbone/model/index.js')).toEqual('@dummyscope/mocha:backbone:model');
        expect(env.namespace('@dummyscope/generator-mocha/backbone/model.js')).toEqual('@dummyscope/mocha:backbone:model');
        expect(env.namespace('/node_modules/@dummyscope/generator-mocha/backbone/model.js')).toEqual('@dummyscope/mocha:backbone:model');
      });

      it('handle relative paths', async function () {
        expect(env.namespace('../local/stuff')).toEqual('local:stuff');
        expect(env.namespace('./local/stuff')).toEqual('local:stuff');
        expect(env.namespace('././local/stuff')).toEqual('local:stuff');
        expect(env.namespace('../../local/stuff')).toEqual('local:stuff');
      });

      it('handles weird paths', async function () {
        expect(env.namespace('////gen/all')).toEqual('gen:all');
        expect(env.namespace('generator-backbone///all.js')).toEqual('backbone:all');
        expect(env.namespace('generator-backbone/././all.js')).toEqual('backbone:all');
        expect(env.namespace('generator-backbone/generator-backbone/all.js')).toEqual('backbone:all');
      });

      it("works with Windows' paths", async function () {
        expect(env.namespace('backbone\\all\\main.js')).toEqual('backbone:all');
        expect(env.namespace('backbone\\all')).toEqual('backbone:all');
        expect(env.namespace('backbone\\all.js')).toEqual('backbone:all');
      });

      it('remove lookups from namespace', async function () {
        expect(env.namespace('backbone/generators/all/index.js')).toEqual('backbone:all');
        expect(env.namespace('backbone/lib/generators/all/index.js')).toEqual('backbone:all');
        expect(env.namespace('some-lib/generators/all/index.js')).toEqual('some-lib:all');
        expect(env.namespace('my.thing/generators/app/index.js')).toEqual('my.thing:app');
        expect(env.namespace('meta/generators/generators-thing/index.js')).toEqual('meta:generators-thing');
      });

      it('remove path before the generator name', async function () {
        expect(env.namespace('/Users/yeoman/.nvm/v0.10.22/lib/node_modules/generator-backbone/all/index.js')).toEqual('backbone:all');
        expect(env.namespace('/Users/yeoman with space and ./.nvm/v0.10.22/lib/node_modules/generator-backbone/all/index.js')).toEqual(
          'backbone:all',
        );
        expect(env.namespace('/usr/lib/node_modules/generator-backbone/all/index.js')).toEqual('backbone:all');
        expect(env.namespace('c:\\projects\\m. projects\\generators\\generator-example\\generators\\app\\index.js')).toEqual('example:app');
      });

      it('Handles non generator-* packages inside node_modules', async function () {
        expect(env.namespace('/Users/yeoman with space and ./.nvm/v0.10.22/lib/node_modules/example/all/index.js')).toEqual('example:all');
        expect(env.namespace('c:\\projects\\node_modules\\example\\generators\\app\\index.js')).toEqual('example:app');
      });

      it('handle paths when multiples lookups are in it', async function () {
        expect(env.namespace('c:\\projects\\yeoman\\generators\\generator-example\\generators\\app\\index.js')).toEqual('example:app');
      });

      it('handles namespaces', async function () {
        expect(env.namespace('backbone:app')).toEqual('backbone:app');
        expect(env.namespace('foo')).toEqual('foo');
      });
    });

    describe('#get()', () => {
      beforeEach(async function () {
        generator = require('./fixtures/generator-mocha/index.js');
        await env.register(path.join(__dirname, './fixtures/generator-mocha'), 'fixtures:generator-mocha');
        await env.register(path.join(__dirname, './fixtures/generator-mocha'), 'mocha:generator');
      });

      it('get a specific generator', async function () {
        expect(await env.get('mocha:generator')).toEqual(generator);
        expect(await env.get('fixtures:generator-mocha')).toEqual(generator);
      });

      it('fallback to requiring generator from a file path', async function () {
        expect(await env.get(path.join(__dirname, './fixtures/generator-mocha'))).toEqual(generator);
      });

      it('returns undefined if namespace is not found', async function () {
        expect(await env.get('not:there')).toEqual(undefined);
        expect(await env.get()).toEqual(undefined);
      });

      it('works with modules', async function () {
        const generator = require('./fixtures/generator-module/generators/app/index.js');
        await env.register(path.join(__dirname, './fixtures/generator-module/generators/app'), 'fixtures:generator-module');
        expect(await env.get('fixtures:generator-module')).toEqual(generator.default);
      });
    });

    describe('#alias()', () => {
      it('apply regex and replace with alternative value', async function () {
        env.alias(/^([^:]+)$/, '$1:app');
        expect(env.alias('foo')).toEqual('foo:app');
      });

      it('apply multiple regex', async function () {
        env.alias(/^([\d*:A-Za-z]+)$/, 'generator-$1');
        env.alias(/^([^:]+)$/, '$1:app');
        expect(env.alias('foo')).toEqual('generator-foo:app');
      });

      it('apply latest aliases first', async function () {
        env.alias(/^([^:]+)$/, '$1:all');
        env.alias(/^([^:]+)$/, '$1:app');
        expect(env.alias('foo')).toEqual('foo:app');
      });

      it('alias empty namespace to `:app` by default', async function () {
        expect(env.alias('foo')).toEqual('foo:app');
      });

      it('alias removing prefix- from namespaces', async function () {
        env.alias(/^(@.*\/)?prefix-(.*)$/, '$1$2');
        expect(env.alias('prefix-foo')).toEqual('foo:app');
        expect(env.alias('prefix-mocha:generator')).toEqual('mocha:generator');
        expect(env.alias('prefix-fixtures:generator-mocha')).toEqual('fixtures:generator-mocha');
        expect(env.alias('@scoped/prefix-fixtures:generator-mocha')).toEqual('@scoped/fixtures:generator-mocha');
      });
    });

    describe('#get() with #alias()', () => {
      beforeEach(async function () {
        generator = require('./fixtures/generator-mocha/index.js');
        env.alias(/^prefix-(.*)$/, '$1');
        await env.register(path.join(__dirname, './fixtures/generator-mocha'), 'fixtures:generator-mocha');
        await env.register(path.join(__dirname, './fixtures/generator-mocha'), 'mocha:generator');
      });

      it('get a specific generator', async function () {
        expect(await env.get('prefix-mocha:generator')).toEqual(generator);
        expect(await env.get('mocha:generator')).toEqual(generator);
        expect(await env.get('prefix-fixtures:generator-mocha')).toEqual(generator);
        expect(await env.get('fixtures:generator-mocha')).toEqual(generator);
      });
    });

    describe('.createEnv()', () => {
      it('create an environment', () => {
        const environment = createEnvironment();
        expect(environment).toBeTruthy();
      });
    });

    describe('getContextMap', () => {
      it('creates an context', () => {
        expect(env.getContextMap('foo') instanceof Map).toBeTruthy();
      });

      it('returns an existing context', () => {
        expect(env.getContextMap('foo')).toEqual(env.getContextMap('foo'));
      });

      it('supports factory', () => {
        const map = new Map();
        expect(env.getContextMap('foo', () => map)).toEqual(map);
      });
    });
  });
}
