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
import assert from 'yeoman-assert';
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
      assert.ok(new Environment() instanceof events.EventEmitter);
    });

    describe('constructor', () => {
      it('take options parameter', () => {
        const options = { foo: 'bar' };
        expect(new Environment(options).options).toMatchObject(options);
      });

      it('instantiates a QueuedAdapter if none provided', async function () {
        assert.ok(env.adapter instanceof QueuedAdapter);
      });

      it('uses the provided object as adapter if any', () => {
        const dummyAdapter = {};
        const environment = new Environment({ adapter: dummyAdapter });
        assert.equal(environment.adapter, dummyAdapter, 'Not the adapter provided');
      });

      it('instantiates a mem-fs instance', async function () {
        assert.ok(env.sharedFs);
      });
    });

    describe('#getVersion()', () => {
      it('output the version number', async function () {
        const version = env.getVersion();
        assert.ok(version);
        assert.textEqual(version, ENVIRONMENT_VERSION);
      });

      it('output the grouped-queue version number', async function () {
        const version = env.getVersion('grouped-queue');
        assert.ok(version);
        assert.textEqual(version, GROUPED_QUEUE_VERSION);
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
        assert.textEqual(env.help().trim(), expected);
      });

      it('output the help with a custom bin name', async function () {
        expected = expected.replace('Usage: init', 'Usage: gg');
        assert.textEqual(env.help('gg').trim(), expected);
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
        assert.ok((await env.create('stub')) instanceof registeredGenerator);
      });

      it('instantiate a scoped generator', async function () {
        assert.ok((await env.create('@scope/stub')) instanceof registeredGenerator);
      });

      it('pass args parameter', async function () {
        const arguments_ = ['foo', 'bar'];
        const generator = await env.create('stub', arguments_);
        assert.deepEqual(generator.arguments, arguments_);
      });

      it('pass options parameter', async function () {
        const arguments_ = [];
        const options = { foo: 'bar' };
        const generator = await env.create('stub', arguments_, options);
        assert.equal(generator.options.foo, 'bar');
      });

      it('pass options.arguments', async function () {
        const arguments_ = ['foo', 'bar'];
        const generator = await env.create('stub', { arguments: arguments_ });
        assert.deepEqual(generator.arguments, arguments_);
      });

      it('pass options.arguments as string', async function () {
        const arguments_ = 'foo bar';
        const generator = await env.create('stub', { arguments: arguments_ });
        assert.deepEqual(generator.arguments, arguments_.split(' '));
      });

      it('pass options.args (as `arguments` alias)', async function () {
        const arguments_ = ['foo', 'bar'];
        const generator = await env.create('stub', { args: arguments_ });
        assert.deepEqual(generator.arguments, arguments_);
      });

      it('prefer options.arguments over options.args', async function () {
        const arguments1 = ['yo', 'unicorn'];
        const arguments_ = ['foo', 'bar'];
        const generator = await env.create('stub', { arguments: arguments1, args: arguments_ });
        assert.deepEqual(generator.arguments, arguments1);
      });

      it('default arguments to `env.arguments`', async function () {
        const arguments_ = ['foo', 'bar'];
        env.arguments = arguments_;
        const generator = await env.create('stub');
        assert.notEqual(generator.arguments, arguments_, 'expect arguments to not be passed by reference');
      });

      it('pass options.options', async function () {
        const options = { foo: 'bar' };
        const generator = await env.create('stub', { options });
        assert.equal(generator.options.foo, 'bar');
      });

      it('spread sharedOptions', async function () {
        const options = { foo: 'bar' };
        const generator = await env.create('stub', { options });
        const generator2 = await env.create('stub');
        assert.equal(generator.options.foo, 'bar');
        assert.equal(generator.options.sharedData, generator2.options.sharedData);

        generator.options.sharedData.foo = 'bar';
        assert.equal(generator2.options.sharedData.foo, 'bar');

        assert.equal(generator.options.sharedConstructorData, generator2.options.sharedConstructorData);
        generator.options.sharedConstructorData.bar = 'foo';
        assert.equal(generator2.options.sharedConstructorData.bar, 'foo');
      });

      it('throws if Generator is not registered', async function () {
        assert.rejects(env.create.bind(env, 'i:do:not:exist'));
      });

      it('add the env as property on the generator', async function () {
        assert.equal((await env.create('stub')).env, env);
      });

      it('add the Generator resolved path on the options', async function () {
        assert.equal((await env.create('stub')).options.resolved, (await env.get('stub')).resolved);
      });

      it('adds the namespace on the options', async function () {
        assert.equal((await env.create('stub')).options.namespace, 'stub');
      });

      it('adds the namespace as called on the options', async function () {
        assert.equal((await env.create('stub:foo:bar')).options.namespace, 'stub:foo:bar');
      });

      it('adds the namespace from a module generator on the options', async function () {
        await env.register(path.join(__dirname, './fixtures/generator-module/generators/app'), { namespace: 'fixtures:generator-module' });
        assert.equal((await env.create('fixtures:generator-module')).options.namespace, 'fixtures:generator-module');
      });

      it('adds the Generator resolved path from a module generator on the options', async function () {
        await env.register(path.join(__dirname, './fixtures/generator-module/generators/app'), { namespace: 'fixtures:generator-module' });
        assert.equal(
          (await env.create('fixtures:generator-module')).options.resolved,
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
        assert.ok((await env.composeWith('stub')) instanceof registeredGenerator);
      });

      it('should instantiate a genarator and set _meta', async function () {
        assert.ok((await env.composeWith('stub'))._meta);
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
          assert.ok(namespace === 'stub');
          assert.ok(generator instanceof registeredGenerator);
          done();
        });
        env.composeWith('stub');
      });

      it('should emit a compose namespace event with scoped generators', function (done) {
        env.once('compose:@scope/stub', generator => {
          assert.ok(generator instanceof registeredGenerator);
          done();
        });
        env.composeWith('@scope/stub');
      });

      it('should emit a compose namespace event', function (done) {
        env.once('compose:stub', generator => {
          assert.ok(generator instanceof registeredGenerator);
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
            assert.ok(namespace === 'stub');
            assert.ok(generator instanceof registeredGenerator);
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
          assert.strictEqual(composed, await env.composeWith('stub'));
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
            assert.equal(error.message, 'Process aborted by conflict: foo.js');
          });
      });

      it('pass args and options to the runned generator', async function () {
        const arguments_ = ['stub:run', 'module'];
        const options = { skipInstall: true };
        return env.run(arguments_, options).then(() => {
          expect(runMethod).toHaveBeenCalledTimes(1);
          assert.equal(capturedArgs[0], 'module');
          assert.equal(capturedArgs[1].skipInstall, true);
        });
      });

      it('can take string as args', async function () {
        const arguments_ = 'stub:run module';
        return env.run(arguments_).then(() => {
          expect(runMethod).toHaveBeenCalledTimes(1);
          assert.equal(capturedArgs[0], 'module');
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
            assert.ok(error.message.includes('Must provide at least one argument, the generator namespace to invoke.'));
          },
        );
      });

      it('launch error if generator is not found', async function () {
        return env.run('some:unknown:generator').then(
          () => assert.fail(),
          error => {
            expect(error.message).toMatch('“generator-some”');
          },
        );
      });

      it("launch error if generator doesn't have a constructor", async function () {
        return env.run('no-constructor:app').then(
          () => assert.fail(),
          error => {
            expect(error.message).toMatch('provide a constructor');
          },
        );
      });

      it('generator error event emits error event when no callback passed', function (done) {
        env.on('error', error => {
          expect(runMethod).toHaveBeenCalledTimes(1);
          assert.ok(error instanceof Error);
          assert.equal(error.message, 'some error');
          done();
        });
        const generator = env.create('eventfailingstub:run');
        assert.equal(generator.listenerCount('error'), 0);
        env.runGenerator(generator).catch(() => {});
      });

      it('generator failing task emits error', function (done) {
        env.on('error', error => {
          expect(runMethod).toHaveBeenCalledTimes(1);
          assert.ok(error instanceof Error);
          assert.equal(error.message, 'some error');
          done();
        });
        const generator = env.create('promisefailingstub:run');
        assert.equal(generator.listenerCount('error'), 0);
        env.runGenerator(generator).catch(() => {});
      });

      it('returns the generator', async function () {
        const runReturnValue = env.run('stub:run');
        assert.ok(runReturnValue instanceof Promise);
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
          () => assert.fail(),
          error => {
            assert.ok(error.message.includes('@dummyscope/generator-package'));
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
        assert.equal(typeof (await meta.importGenerator()), 'function');
      });
      it('importModule should return the generator module', async function () {
        env.register(path.join(__dirname, './fixtures/generator-module/generators/app'), 'fixtures:generator-module');
        const meta = env.getGeneratorMeta('fixtures:generator-module');
        const Generator = await meta.importGenerator();
        const module = await meta.importModule();
        assert.strictEqual(Generator, module.default);
      });
      it('intantiate should return an instance', async function () {
        env.register(path.join(__dirname, './fixtures/generator-module/generators/app'), 'fixtures:generator-module');
        const meta = env.getGeneratorMeta('fixtures:generator-module');
        const Generator = await meta.importGenerator();
        const generator = await meta.instantiate();
        assert.ok(generator instanceof Generator);
      });
      it('intantiateHelp should return an instance with help option', async function () {
        env.register(path.join(__dirname, './fixtures/generator-module/generators/app'), 'fixtures:generator-module');
        const meta = env.getGeneratorMeta('fixtures:generator-module');
        const generator = await meta.instantiateHelp();
        assert.strictEqual(generator.options.help, true);
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

        assert.equal(specifiedJS, await resolveModulePath(modulePath));
        assert.equal(specifiedJS, await resolveModulePath(specifiedJS));
        assert.equal(specifiedJSON, await resolveModulePath(specifiedJSON));
        assert.equal(specifiedNode, await resolveModulePath(specifiedNode));

        const aModulePath = path.join(__dirname, 'fixtures/generator-scoped/app');
        const aSpecifiedJS = path.join(__dirname, 'fixtures/generator-scoped/app/index.js');
        assert.equal(aSpecifiedJS, await resolveModulePath(aModulePath));
      });
    });

    describe('#register()', () => {
      beforeEach(async function () {
        simplePath = path.join(__dirname, 'fixtures/generator-simple');
        extendPath = path.join(__dirname, './fixtures/generator-extend/support');
        assert.equal(env.namespaces().length, 0, 'env should be empty');
        env.register(simplePath, 'fixtures:generator-simple', simplePath);
        env.register(extendPath, 'scaffold');
      });

      it('store registered generators', async function () {
        assert.equal(env.namespaces().length, 2);
      });

      it('determine registered Generator namespace and resolved path', async function () {
        const simple = await env.get('fixtures:generator-simple');
        assert.equal(typeof simple, 'function');
        assert.ok(simple.namespace, 'fixtures:generator-simple');
        assert.ok(simple.resolved, path.resolve(simplePath));
        assert.ok(simple.packagePath, simplePath);

        const extend = await env.get('scaffold');
        assert.equal(typeof extend, 'function');
        assert.ok(extend.namespace, 'scaffold');
        assert.ok(extend.resolved, path.resolve(extendPath));
      });

      it('throw when String is not passed as first parameter', () => {
        assert.rejects(function () {
          env.register(() => {}, 'blop');
        });
        assert.rejects(function () {
          env.register([], 'blop');
        });
        assert.rejects(function () {
          env.register(false, 'blop');
        });
      });
    });

    describe('#getPackagePath and #getPackagePaths()', () => {
      beforeEach(async function () {
        env.alias(/^prefix-(.*)$/, '$1');
        simpleDummy = esmocha.fn();
        simplePath = path.join(__dirname, 'fixtures/generator-simple');
        assert.equal(env.namespaces().length, 0, 'env should be empty');
        await env.register(simplePath, { namespace: 'fixtures:generator-simple', packagePath: simplePath });
        await env.register(simplePath, { namespace: 'fixtures2', packagePath: simplePath });
        env.register(simpleDummy, { namespace: 'fixtures:dummy-simple', resolved: 'dummy/path', packagePath: 'dummy/packagePath' });
        await env.register(simplePath, { namespace: 'fixtures:generator-simple2', packagePath: 'new-path' });
      });

      it('determine registered Generator namespace and resolved path', async function () {
        assert.equal(await env.getPackagePath('fixtures:generator-simple'), simplePath);
        assert.equal(await env.getPackagePath('fixtures'), 'new-path');
        assert.deepEqual(await env.getPackagePaths('fixtures'), ['new-path', join('dummy/packagePath'), simplePath]);

        // With alias
        assert.equal(await env.getPackagePath('prefix-fixtures:generator-simple'), await env.getPackagePath('fixtures:generator-simple'));
        assert.equal(await env.getPackagePath('prefix-fixtures'), await env.getPackagePath('fixtures'));
        assert.deepEqual(await env.getPackagePaths('prefix-fixtures'), await env.getPackagePaths('fixtures'));
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
        assert.equal(completeDummy, await env.get('dummy:complete'));
      });

      it('registers the resolved path and package path', async function () {
        assert.equal(join('dummy/path/index.js'), (await env.get('dummy:resolved')).resolved);
        assert.equal(join('dummy/packagePath'), (await env.get('dummy:resolved')).packagePath);
      });

      it('throws if invalid generator', async function () {
        assert.throws(env.register.bind(env, [], { namespace: 'dummy' }), /stub\sfunction/);
      });

      it('throws if invalid namespace', async function () {
        assert.throws(env.register.bind(env, simpleDummy, {}), /namespace/);
      });
    });

    describe('#namespaces()', () => {
      beforeEach(async function () {
        await env.register(path.join(__dirname, './fixtures/generator-simple'));
        await env.register(path.join(__dirname, './fixtures/generator-extend/support'));
        await env.register(path.join(__dirname, './fixtures/generator-extend/support'), { namespace: 'support:scaffold' });
      });

      it('get the list of namespaces', async function () {
        assert.deepEqual(env.namespaces(), ['simple', 'extend:support', 'support:scaffold']);
      });
    });

    describe('#getGeneratorsMeta()', () => {
      beforeEach(async function () {
        generatorPath = path.join(__dirname, './fixtures/generator-simple');
        await env.register(generatorPath);
      });

      it('get the registered Generators metadatas', async function () {
        const meta = env.getGeneratorsMeta().simple;
        assert.deepEqual(meta.resolved, require.resolve(generatorPath));
        assert.deepEqual(meta.namespace, 'simple');
      });
    });

    describe('#getGeneratorNames', () => {
      beforeEach(async function () {
        generatorPath = path.join(__dirname, './fixtures/generator-simple');
        await env.register(generatorPath);
      });

      it('get the registered generators names', async function () {
        assert.deepEqual(env.getGeneratorNames(), ['simple']);
      });
    });

    describe('#namespace()', () => {
      it('create namespace from path', async function () {
        assert.equal(env.namespace('backbone/all/index.js'), 'backbone:all');
        assert.equal(env.namespace('backbone/all/main.js'), 'backbone:all');
        assert.equal(env.namespace('backbone/all'), 'backbone:all');
        assert.equal(env.namespace('backbone/all.js'), 'backbone:all');
        assert.equal(env.namespace('backbone/app/index.js'), 'backbone:app');
        assert.equal(env.namespace('backbone.js'), 'backbone');

        assert.equal(env.namespace('generator-backbone/all.js'), 'backbone:all');
        assert.equal(env.namespace('generator-mocha/backbone/model/index.js'), 'mocha:backbone:model');
        assert.equal(env.namespace('generator-mocha/backbone/model.js'), 'mocha:backbone:model');
        assert.equal(env.namespace('node_modules/generator-mocha/backbone/model.js'), 'mocha:backbone:model');
        assert.equal(env.namespace('../node_modules/generator-mocha/backbone/model.js'), 'mocha:backbone:model');
        assert.equal(env.namespace('../generator-mocha/backbone/model.js'), 'mocha:backbone:model');
      });

      it('create namespace from scoped path', async function () {
        assert.equal(env.namespace('@dummyscope/generator-backbone/all.js'), '@dummyscope/backbone:all');
        assert.equal(env.namespace('@dummyscope/generator-mocha/backbone/model/index.js'), '@dummyscope/mocha:backbone:model');
        assert.equal(env.namespace('@dummyscope/generator-mocha/backbone/model.js'), '@dummyscope/mocha:backbone:model');
        assert.equal(env.namespace('/node_modules/@dummyscope/generator-mocha/backbone/model.js'), '@dummyscope/mocha:backbone:model');
      });

      it('handle relative paths', async function () {
        assert.equal(env.namespace('../local/stuff'), 'local:stuff');
        assert.equal(env.namespace('./local/stuff'), 'local:stuff');
        assert.equal(env.namespace('././local/stuff'), 'local:stuff');
        assert.equal(env.namespace('../../local/stuff'), 'local:stuff');
      });

      it('handles weird paths', async function () {
        assert.equal(env.namespace('////gen/all'), 'gen:all');
        assert.equal(env.namespace('generator-backbone///all.js'), 'backbone:all');
        assert.equal(env.namespace('generator-backbone/././all.js'), 'backbone:all');
        assert.equal(env.namespace('generator-backbone/generator-backbone/all.js'), 'backbone:all');
      });

      it("works with Windows' paths", async function () {
        assert.equal(env.namespace('backbone\\all\\main.js'), 'backbone:all');
        assert.equal(env.namespace('backbone\\all'), 'backbone:all');
        assert.equal(env.namespace('backbone\\all.js'), 'backbone:all');
      });

      it('remove lookups from namespace', async function () {
        assert.equal(env.namespace('backbone/generators/all/index.js'), 'backbone:all');
        assert.equal(env.namespace('backbone/lib/generators/all/index.js'), 'backbone:all');
        assert.equal(env.namespace('some-lib/generators/all/index.js'), 'some-lib:all');
        assert.equal(env.namespace('my.thing/generators/app/index.js'), 'my.thing:app');
        assert.equal(env.namespace('meta/generators/generators-thing/index.js'), 'meta:generators-thing');
      });

      it('remove path before the generator name', async function () {
        assert.equal(env.namespace('/Users/yeoman/.nvm/v0.10.22/lib/node_modules/generator-backbone/all/index.js'), 'backbone:all');
        assert.equal(
          env.namespace('/Users/yeoman with space and ./.nvm/v0.10.22/lib/node_modules/generator-backbone/all/index.js'),
          'backbone:all',
        );
        assert.equal(env.namespace('/usr/lib/node_modules/generator-backbone/all/index.js'), 'backbone:all');
        assert.equal(env.namespace('c:\\projects\\m. projects\\generators\\generator-example\\generators\\app\\index.js'), 'example:app');
      });

      it('Handles non generator-* packages inside node_modules', async function () {
        assert.equal(env.namespace('/Users/yeoman with space and ./.nvm/v0.10.22/lib/node_modules/example/all/index.js'), 'example:all');
        assert.equal(env.namespace('c:\\projects\\node_modules\\example\\generators\\app\\index.js'), 'example:app');
      });

      it('handle paths when multiples lookups are in it', async function () {
        assert.equal(env.namespace('c:\\projects\\yeoman\\generators\\generator-example\\generators\\app\\index.js'), 'example:app');
      });

      it('handles namespaces', async function () {
        assert.equal(env.namespace('backbone:app'), 'backbone:app');
        assert.equal(env.namespace('foo'), 'foo');
      });
    });

    describe('#get()', () => {
      beforeEach(async function () {
        generator = require('./fixtures/generator-mocha/index.js');
        await env.register(path.join(__dirname, './fixtures/generator-mocha'), 'fixtures:generator-mocha');
        await env.register(path.join(__dirname, './fixtures/generator-mocha'), 'mocha:generator');
      });

      it('get a specific generator', async function () {
        assert.equal(await env.get('mocha:generator'), generator);
        assert.equal(await env.get('fixtures:generator-mocha'), generator);
      });

      it('fallback to requiring generator from a file path', async function () {
        assert.equal(await env.get(path.join(__dirname, './fixtures/generator-mocha')), generator);
      });

      it('returns undefined if namespace is not found', async function () {
        assert.equal(await env.get('not:there'), undefined);
        assert.equal(await env.get(), undefined);
      });

      it('works with modules', async function () {
        const generator = require('./fixtures/generator-module/generators/app/index.js');
        await env.register(path.join(__dirname, './fixtures/generator-module/generators/app'), 'fixtures:generator-module');
        assert.equal(await env.get('fixtures:generator-module'), generator.default);
      });
    });

    describe('#alias()', () => {
      it('apply regex and replace with alternative value', async function () {
        env.alias(/^([^:]+)$/, '$1:app');
        assert.equal(env.alias('foo'), 'foo:app');
      });

      it('apply multiple regex', async function () {
        env.alias(/^([\d*:A-Za-z]+)$/, 'generator-$1');
        env.alias(/^([^:]+)$/, '$1:app');
        assert.equal(env.alias('foo'), 'generator-foo:app');
      });

      it('apply latest aliases first', async function () {
        env.alias(/^([^:]+)$/, '$1:all');
        env.alias(/^([^:]+)$/, '$1:app');
        assert.equal(env.alias('foo'), 'foo:app');
      });

      it('alias empty namespace to `:app` by default', async function () {
        assert.equal(env.alias('foo'), 'foo:app');
      });

      it('alias removing prefix- from namespaces', async function () {
        env.alias(/^(@.*\/)?prefix-(.*)$/, '$1$2');
        assert.equal(env.alias('prefix-foo'), 'foo:app');
        assert.equal(env.alias('prefix-mocha:generator'), 'mocha:generator');
        assert.equal(env.alias('prefix-fixtures:generator-mocha'), 'fixtures:generator-mocha');
        assert.equal(env.alias('@scoped/prefix-fixtures:generator-mocha'), '@scoped/fixtures:generator-mocha');
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
        assert.equal(await env.get('prefix-mocha:generator'), generator);
        assert.equal(await env.get('mocha:generator'), generator);
        assert.equal(await env.get('prefix-fixtures:generator-mocha'), generator);
        assert.equal(await env.get('fixtures:generator-mocha'), generator);
      });
    });

    describe('.createEnv()', () => {
      it('create an environment', () => {
        const environment = createEnvironment();
        assert(environment);
      });
    });

    describe('getContextMap', () => {
      it('creates an context', () => {
        assert(env.getContextMap('foo') instanceof Map);
      });

      it('returns an existing context', () => {
        assert.equal(env.getContextMap('foo'), env.getContextMap('foo'));
      });

      it('supports factory', () => {
        const map = new Map();
        assert.equal(
          env.getContextMap('foo', () => map),
          map,
        );
      });
    });
  });
}
