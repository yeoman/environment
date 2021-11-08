const events = require('events');
const fs = require('fs');
const path = require('path');
const util = require('util');
const sinon = require('sinon');
const sinonTestFactory = require('sinon-test');
const Generator = require('yeoman-generator');
const generatorPackageJson = require('yeoman-generator/package.json');
const assert = require('yeoman-assert');

const semver = require('semver');
const TerminalAdapter = require('../lib/adapter');
const Environment = require('../lib/environment');

const ENVIRONMENT_VERSION = require('../package.json').version;
const INQUIRER_VERSION = require('inquirer/package.json').version;
const GROUPED_QUEUE_VERSION = require('grouped-queue/package.json').version;

const sinonTest = sinonTestFactory(sinon);

describe('Environment', () => {
  let mockedDefault;
  let MockedGenerator;

  beforeEach(function () {
    this.env = new Environment({skipInstall: true, sharedOptions: {sharedConstructorData: {}}});

    MockedGenerator = class MockedGenerator extends Generator {};
    mockedDefault = sinon.stub();
    MockedGenerator.prototype.mockedDefault = mockedDefault;
  });

  afterEach(function () {
    this.env.removeAllListeners();
  });

  it('is an instance of EventEmitter', () => {
    assert.ok(new Environment() instanceof events.EventEmitter);
  });

  describe('constructor', () => {
    it('take options parameter', () => {
      const options = {foo: 'bar'};
      assert.equal(new Environment(options).options, options);
    });

    it('instantiates a TerminalAdapter if none provided', function () {
      assert.ok(this.env.adapter instanceof TerminalAdapter);
    });

    it('uses the provided object as adapter if any', () => {
      const dummyAdapter = {};
      const env = new Environment(null, dummyAdapter);
      assert.equal(env.adapter, dummyAdapter, 'Not the adapter provided');
    });

    it('instantiates a mem-fs instance', function () {
      assert.ok(this.env.sharedFs);
    });
  });

  describe('#getVersion()', () => {
    it('output the version number', function () {
      const version = this.env.getVersion();
      assert.ok(version);
      assert.textEqual(version, ENVIRONMENT_VERSION);
    });

    it('output the inquirer version number', function () {
      const version = this.env.getVersion('inquirer');
      assert.ok(version);
      assert.textEqual(version, INQUIRER_VERSION);
    });

    it('output the grouped-queue version number', function () {
      const version = this.env.getVersion('grouped-queue');
      assert.ok(version);
      assert.textEqual(version, GROUPED_QUEUE_VERSION);
    });
  });

  describe('#help()', () => {
    beforeEach(function () {
      this.env
        .register(path.join(__dirname, 'fixtures/generator-simple'))
        .register(path.join(__dirname, 'fixtures/generator-extend/support'));

      this.expected = fs.readFileSync(path.join(__dirname, 'fixtures/help.txt'), 'utf8').trim();

      // Lazy "update the help fixtures because something changed" statement
      // fs.writeFileSync(path.join(__dirname, 'fixtures/help.txt'), env.help().trim());
    });

    it('output the general help', function () {
      assert.textEqual(this.env.help().trim(), this.expected);
    });

    it('output the help with a custom bin name', function () {
      this.expected = this.expected.replace('Usage: init', 'Usage: gg');
      assert.textEqual(this.env.help('gg').trim(), this.expected);
    });
  });

  describe('#create()', () => {
    beforeEach(function () {
      class NewGenerator extends Generator {}
      this.Generator = NewGenerator;
      this.env.registerStub(this.Generator, 'stub');
      this.env.registerStub(this.Generator, 'stub:foo:bar');
      this.env.registerStub(this.Generator, '@scope/stub');
    });

    it('instantiate a generator', function () {
      assert.ok(this.env.create('stub') instanceof this.Generator);
    });

    it('instantiate a scoped generator', function () {
      assert.ok(this.env.create('@scope/stub') instanceof this.Generator);
    });

    it('pass args parameter', function () {
      const args = ['foo', 'bar'];
      const generator = this.env.create('stub', args);
      assert.deepEqual(generator.arguments, args);
    });

    it('pass options parameter', function () {
      const args = [];
      const options = {foo: 'bar'};
      const generator = this.env.create('stub', args, options);
      assert.equal(generator.options.foo, 'bar');
    });

    it('pass options.arguments', function () {
      const args = ['foo', 'bar'];
      const generator = this.env.create('stub', {arguments: args});
      assert.deepEqual(generator.arguments, args);
    });

    it('pass options.arguments as string', function () {
      const args = 'foo bar';
      const generator = this.env.create('stub', {arguments: args});
      assert.deepEqual(generator.arguments, args.split(' '));
    });

    it('pass options.args (as `arguments` alias)', function () {
      const args = ['foo', 'bar'];
      const generator = this.env.create('stub', {args});
      assert.deepEqual(generator.arguments, args);
    });

    it('prefer options.arguments over options.args', function () {
      const args1 = ['yo', 'unicorn'];
      const args = ['foo', 'bar'];
      const generator = this.env.create('stub', {arguments: args1, args});
      assert.deepEqual(generator.arguments, args1);
    });

    it('default arguments to `env.arguments`', function () {
      const args = ['foo', 'bar'];
      this.env.arguments = args;
      const generator = this.env.create('stub');
      assert.notEqual(generator.arguments, args, 'expect arguments to not be passed by reference');
    });

    it('pass options.options', function () {
      const options = {foo: 'bar'};
      const generator = this.env.create('stub', {options});
      assert.equal(generator.options.foo, 'bar');
    });

    it('spread sharedOptions', function () {
      const options = {foo: 'bar'};
      const generator = this.env.create('stub', {options});
      const generator2 = this.env.create('stub');
      assert.equal(generator.options.foo, 'bar');
      assert.equal(generator.options.sharedData, generator2.options.sharedData);

      generator.options.sharedData.foo = 'bar';
      assert.equal(generator2.options.sharedData.foo, 'bar');

      assert.equal(generator.options.sharedConstructorData, generator2.options.sharedConstructorData);
      generator.options.sharedConstructorData.bar = 'foo';
      assert.equal(generator2.options.sharedConstructorData.bar, 'foo');
    });

    it('throws if Generator is not registered', function () {
      assert.throws(this.env.create.bind(this.end, 'i:do:not:exist'));
    });

    it('add the env as property on the options', function () {
      assert.equal(this.env.create('stub').options.env, this.env);
    });

    it('add the Generator resolved path on the options', function () {
      assert.equal(this.env.create('stub').options.resolved, this.env.get('stub').resolved);
    });

    it('adds the namespace on the options', function () {
      assert.equal(this.env.create('stub').options.namespace, 'stub');
    });

    it('adds the namespace as called on the options', function () {
      assert.equal(this.env.create('stub:foo:bar').options.namespace, 'stub:foo:bar');
    });

    it('adds the namespace from a module generator on the options', function () {
      this.env
        .register(path.join(__dirname, './fixtures/generator-module/generators/app'), 'fixtures:generator-module');
      assert.equal(this.env.create('fixtures:generator-module').options.namespace, 'fixtures:generator-module');
    });

    it('adds the Generator resolved path from a module generator on the options', function () {
      this.env
        .register(path.join(__dirname, './fixtures/generator-module/generators/app'), 'fixtures:generator-module');
      assert.equal(this.env.create('fixtures:generator-module').options.resolved, this.env.get('fixtures:generator-module').resolved);
    });
  });

  describe('#composeWith()', () => {
    beforeEach(function () {
      class NewGenerator extends Generator {
        getFeatures() {
          return {uniqueBy: this.options.namespace};
        }
      }
      this.Generator = NewGenerator;
      this.env.registerStub(this.Generator, 'stub');
      this.env.registerStub(this.Generator, 'stub:foo:bar');
      this.env.registerStub(this.Generator, '@scope/stub');
    });

    it('should instantiate a generator', function () {
      assert.ok(this.env.composeWith('stub') instanceof this.Generator);
    });

    it('should schedule generator queue', function () {
      this.env.runLoop.add = sinon.spy();
      this.env.composeWith('stub');
      assert(this.env.runLoop.add.calledOnce);
      assert(this.env.runLoop.add.getCall(0).firstArg === 'environment:run');
    });

    describe('passing false schedule parameter', () => {
      it('should queue generator tasks', function () {
        this.env.runLoop.add = sinon.spy();
        this.env.composeWith('stub', [], {}, false);
        assert(this.env.runLoop.add.getCall(0).firstArg !== 'environment:run');
      });
    });

    it('should emit a compose event', function (done) {
      this.env.once('compose', (namespace, generator) => {
        assert.ok(namespace === 'stub');
        assert.ok(generator instanceof this.Generator);
        done();
      });
      this.env.composeWith('stub');
    });

    it('should emit a compose namespace event with scoped generators', function (done) {
      this.env.once('compose:@scope/stub', generator => {
        assert.ok(generator instanceof this.Generator);
        done();
      });
      this.env.composeWith('@scope/stub');
    });

    it('should emit a compose namespace event', function (done) {
      this.env.once('compose:stub', generator => {
        assert.ok(generator instanceof this.Generator);
        done();
      });
      this.env.composeWith('stub');
    });

    describe('when the generator should be a singleton and is already composed', () => {
      let composed;
      beforeEach(function (done) {
        this.env.once('compose', (namespace, generator) => {
          assert.ok(namespace === 'stub');
          assert.ok(generator instanceof this.Generator);
          composed = generator;
          done();
        });
        this.env.composeWith('stub');
      });

      it('should not emit events', function () {
        this.env.once('compose', () => {
          throw new Error('should not happen');
        });
        this.env.once('compose:stub', () => {
          throw new Error('should not happen');
        });
        this.env.composeWith('stub');
      });

      it('should return already composed instance', function () {
        assert.strictEqual(composed, this.env.composeWith('stub'));
      });
    });
  });

  describe('#run()', () => {
    beforeEach(function () {
      const self = this;

      this.Stub = class extends Generator {
        constructor(args, options) {
          super(args, options);
          self.args = [args, options];
        }

        exec() {}
      };

      this.WritingStub = class extends Generator {
        constructor(args, options) {
          super(args, options);
          self.args = [args, options];
        }

        writing() {
          this.fs.write('foo.js', 'foo');
        }
      };

      this.PromiseFailingStub = class extends Generator {
        install() {
          return Promise.reject(new Error('some error'));
        }
      };

      this.EventFailingStub = class extends Generator {
        install() {
          return this.emit('error', new Error('some error'));
        }
      };

      const runName = semver.satisfies(generatorPackageJson.version, '>=5.0.0-beta.1') ? 'queueTasks' : 'run';
      this.runMethod = sinon.spy(Generator.prototype, runName);
      this.env.registerStub(this.Stub, 'stub:run');
      this.env.registerStub(this.WritingStub, 'writingstub:run');
      this.env.registerStub(this.PromiseFailingStub, 'promisefailingstub:run');
      this.env.registerStub(this.EventFailingStub, 'eventfailingstub:run');
      this.env.register(path.join(__dirname, './fixtures', 'generator-no-constructor', 'generators', 'app'));
    });

    afterEach(function () {
      this.runMethod.restore();
    });

    it('runs a registered generator', function () {
      return this.env.run(['stub:run']).then(() => {
        assert.ok(this.runMethod.calledOnce);
      });
    });

    it('runs a registered writing generator with bail option', function () {
      if (!semver.satisfies(require('../node_modules/yeoman-generator/package.json').version, '>=5.0.0-beta.1')) {
        this.skip();
      }
      return this.env.run(['writingstub:run'], {bail: true}).then(() => {
        throw new Error('should not happen');
      }).catch(error => {
        assert.equal(error.message, 'Process aborted by conflict: foo.js');
      });
    });

    it('pass args and options to the runned generator', function () {
      const args = ['stub:run', 'module'];
      const options = {skipInstall: true};
      return this.env.run(args, options).then(() => {
        assert.ok(this.runMethod.calledOnce);
        assert.equal(this.args[0], 'module');
        assert.equal(this.args[1].skipInstall, true);
      });
    });

    it('can take string as args', function () {
      const args = 'stub:run module';
      return this.env.run(args).then(() => {
        assert.ok(this.runMethod.calledOnce);
        assert.equal(this.args[0], 'module');
      });
    });

    it('cannot take no arguments', function () {
      this.env.arguments = ['stub:run'];
      return this.env.run().then(() => {
        throw new Error('not supposed to happen');
      }, error => {
        assert.ok(this.runMethod.notCalled);
        assert.ok(error.message.includes('Must provide at least one argument, the generator namespace to invoke.'));
      });
    });

    it('launch error if generator is not found', function () {
      return this.env.run('some:unknown:generator').then(() => assert.fail(), error => {
        assert.ok(error.message.includes('some:unknown:generator'));
      });
    });

    it('launch error if generator doesn\'t have a constructor', function () {
      return this.env.run('no-constructor:app').then(() => assert.fail(), error => {
        assert.ok(error.message.includes('provides a constructor'));
      });
    });

    it('generator error event emits error event when no callback passed', function (done) {
      const generator = this.env.create('eventfailingstub:run');
      assert.equal(generator.listenerCount('error'), 0);
      this.env.on('error', error => {
        assert.ok(this.runMethod.calledOnce);
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'some error');
        done();
      });
      this.env.runGenerator(generator).catch(() => {});
    });

    it('generator failing task emits error', function (done) {
      const generator = this.env.create('promisefailingstub:run');
      assert.equal(generator.listenerCount('error'), 0);
      this.env.on('error', error => {
        assert.ok(this.runMethod.calledOnce);
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'some error');
        done();
      });
      this.env.runGenerator(generator).catch(() => {});
    });

    it('returns the generator', function () {
      const runReturnValue = this.env.run('stub:run');
      assert.ok(runReturnValue instanceof Generator || runReturnValue instanceof Promise);
    });

    it('correctly rejects promise on generator not found error', function (done) {
      this.env.run('@dummyscope/package').catch(() => {
        done();
      });
    });

    it('correctly rejects promise on missing args error', function (done) {
      this.env.run().catch(() => {
        done();
      });
    });

    it('correctly append scope in generator hint', function () {
      return this.env.run('@dummyscope/package').then(() => assert.fail(), error => {
        assert.ok(error.message.includes('@dummyscope/generator-package'));
      });
    });

    it('runs a module generator', function () {
      this.env
        .register(path.join(__dirname, './fixtures/generator-module/generators/app'), 'fixtures:generator-module');
      return this.env.run('fixtures:generator-module');
    });
  });

  describe('#run() a ts generator', () => {
    beforeEach(function () {
      this.env
        .register(path.join(__dirname, './fixtures/generator-ts/generators/app/index.ts'), 'ts:app');
      this.runMethod = sinon.spy(this.env.get('ts:app').prototype, 'exec');
    });

    afterEach(function () {
      this.runMethod.restore();
    });

    it('runs a registered generator', function () {
      return this.env.run(['ts:app']).then(() => {
        assert.ok(this.runMethod.calledOnce);
      });
    });
  });

  describe('#run() a cjs generator', () => {
    beforeEach(function () {
      this.env
        .register(path.join(__dirname, './fixtures/generator-common-js/generators/cjs/index.cjs'), 'common-js:cjs');
      const Generator = this.env.get('common-js:cjs');
      this.runMethod = sinon.spy(Generator.prototype, 'default');
      this.postConstruct = sinon.spy(Generator.prototype, '_postConstruct');
    });

    afterEach(function () {
      this.runMethod.restore();
      this.postConstruct.restore();
    });

    it('runs a registered generator', function () {
      return this.env.run(['common-js:cjs']).then(() => {
        assert.ok(this.runMethod.calledOnce);
      });
    });
    it('calls generator _postConstruct method', function () {
      return this.env.run(['common-js:cjs']).then(() => {
        assert.ok(this.postConstruct.calledOnce);
      });
    });
    it('should not call generator _postConstruct method with help option', function () {
      return this.env.run(['common-js:cjs'], {help: true}).then(() => {
        assert.ok(this.postConstruct.notCalled);
      });
    });
  });

  describe('#run() an esm generator', () => {
    describe('with js extension', () => {
      beforeEach(async function () {
        this.env
          .register(path.join(__dirname, './fixtures/generator-esm/generators/app/index.js'), 'esm:app');
        const esmClass = await this.env.get('esm:app');
        this.runMethod = sinon.spy(esmClass.prototype, 'default');
        this.postConstruct = sinon.spy(esmClass.prototype, '_postConstruct');
      });

      afterEach(function () {
        this.runMethod.restore();
        this.postConstruct.restore();
      });

      it('runs a registered generator', function () {
        return this.env.run(['esm:app']).then(() => {
          assert.ok(this.runMethod.calledOnce);
        });
      });
      it('calls generator _postConstruct method', function () {
        return this.env.run(['esm:app']).then(() => {
          assert.ok(this.postConstruct.calledOnce);
        });
      });
      it('should not call generator _postConstruct method with help option', function () {
        return this.env.run(['esm:app'], {help: true}).then(() => {
          assert.ok(this.postConstruct.notCalled);
        });
      });
    });
    describe('with mjs extension', () => {
      beforeEach(async function () {
        this.env
          .register(path.join(__dirname, './fixtures/generator-esm/generators/mjs/index.mjs'), 'esm:mjs');
        const esmClass = await this.env.get('esm:mjs');
        this.runMethod = sinon.spy(esmClass.prototype, 'default');
      });

      afterEach(function () {
        this.runMethod.restore();
      });

      it('runs a registered generator', function () {
        return this.env.run(['esm:mjs']).then(() => {
          assert.ok(this.runMethod.calledOnce);
        });
      });
    });
    describe('with createGenerator', () => {
      beforeEach(async function () {
        this.env.registerStub(MockedGenerator, 'mocked-generator');
        this.env
          .register(path.join(__dirname, './fixtures/generator-esm/generators/create/index.js'), 'esm:create');
      });

      it('runs a registered generator', function () {
        return this.env.run(['esm:create']).then(() => {
          assert.ok(mockedDefault.calledOnce);
        });
      });
    });
    describe('with inherited createGenerator', () => {
      beforeEach(async function () {
        this.env.registerStub(MockedGenerator, 'mocked-generator');
        this.env
          .register(path.join(__dirname, './fixtures/generator-esm/generators/create/index.js'), 'esm:create');
        this.env
          .register(path.join(__dirname, './fixtures/generator-esm/generators/create-inherited/index.js'), 'esm:create-inherited');
      });

      it('runs a registered generator', function () {
        return this.env.run(['esm:create-inherited']).then(() => {
          assert.ok(mockedDefault.calledOnce);
        });
      });
    });
  });

  describe('#registerModulePath()', () => {
    it('resolves to a directory if no file type specified', function () {
      const modulePath = path.join(__dirname, 'fixtures/generator-scoped/package');
      const specifiedJS = path.join(__dirname, 'fixtures/generator-scoped/package/index.js');
      const specifiedJSON = path.join(__dirname, 'fixtures/generator-scoped/package.json');
      const specifiedNode = path.join(__dirname, 'fixtures/generator-scoped/package/nodefile.node');

      assert.equal(specifiedJS, this.env.resolveModulePath(modulePath));
      assert.equal(specifiedJS, this.env.resolveModulePath(specifiedJS));
      assert.equal(specifiedJSON, this.env.resolveModulePath(specifiedJSON));
      assert.equal(specifiedNode, this.env.resolveModulePath(specifiedNode));

      const aModulePath = path.join(__dirname, 'fixtures/generator-scoped/app');
      const aSpecifiedJS = path.join(__dirname, 'fixtures/generator-scoped/app/index.js');
      assert.equal(aSpecifiedJS, this.env.resolveModulePath(aModulePath));
    });
  });

  describe('#register()', () => {
    beforeEach(function () {
      this.simplePath = path.join(__dirname, 'fixtures/generator-simple');
      this.extendPath = path.join(__dirname, './fixtures/generator-extend/support');
      assert.equal(this.env.namespaces().length, 0, 'env should be empty');
      this.env
        .register(this.simplePath, 'fixtures:generator-simple', this.simplePath)
        .register(this.extendPath, 'scaffold');
    });

    it('store registered generators', function () {
      assert.equal(this.env.namespaces().length, 2);
    });

    it('determine registered Generator namespace and resolved path', function () {
      const simple = this.env.get('fixtures:generator-simple');
      assert.equal(typeof simple, 'function');
      assert.ok(simple.namespace, 'fixtures:generator-simple');
      assert.ok(simple.resolved, path.resolve(this.simplePath));
      assert.ok(simple.packagePath, this.simplePath);

      const extend = this.env.get('scaffold');
      assert.equal(typeof extend, 'function');
      assert.ok(extend.namespace, 'scaffold');
      assert.ok(extend.resolved, path.resolve(this.extendPath));
    });

    it('throw when String is not passed as first parameter', () => {
      assert.throws(function () {
        this.env.register(() => {}, 'blop');
      });
      assert.throws(function () {
        this.env.register([], 'blop');
      });
      assert.throws(function () {
        this.env.register(false, 'blop');
      });
    });
  });

  describe('#getPackagePath and #getPackagePaths()', () => {
    beforeEach(function () {
      this.env.alias(/^prefix-(.*)$/, '$1');
      this.simpleDummy = sinon.spy();
      this.simplePath = path.join(__dirname, 'fixtures/generator-simple');
      assert.equal(this.env.namespaces().length, 0, 'env should be empty');
      this.env
        .register(this.simplePath, 'fixtures:generator-simple', this.simplePath)
        .register(this.simplePath, 'fixtures2', this.simplePath)
        .registerStub(this.simpleDummy, 'fixtures:dummy-simple', 'dummy/path', 'dummy/packagePath')
        .register(this.simplePath, 'fixtures:generator-simple2', 'new-path');
    });

    it('determine registered Generator namespace and resolved path', function () {
      assert.equal(this.env.getPackagePath('fixtures:generator-simple'), this.simplePath);
      assert.equal(this.env.getPackagePath('fixtures'), 'new-path');
      assert.deepEqual(this.env.getPackagePaths('fixtures'), ['new-path', 'dummy/packagePath', this.simplePath]);

      // With alias
      assert.equal(this.env.getPackagePath('prefix-fixtures:generator-simple'), this.env.getPackagePath('fixtures:generator-simple'));
      assert.equal(this.env.getPackagePath('prefix-fixtures'), this.env.getPackagePath('fixtures'));
      assert.deepEqual(this.env.getPackagePaths('prefix-fixtures'), this.env.getPackagePaths('fixtures'));
    });
  });

  describe('#registerStub()', () => {
    beforeEach(function () {
      this.simpleDummy = sinon.spy();
      this.resolvedDummy = sinon.spy();
      this.completeDummy = function () {};
      util.inherits(this.completeDummy, Generator);
      this.env
        .registerStub(this.simpleDummy, 'dummy:simple')
        .registerStub(this.completeDummy, 'dummy:complete')
        .registerStub(this.resolvedDummy, 'dummy:resolved', 'dummy/path', 'dummy/packagePath');
    });

    it('register a function under a namespace', function () {
      assert.equal(this.completeDummy, this.env.get('dummy:complete'));
    });

    it('registers the resolved path and package path', function () {
      assert.equal('dummy/path', this.env.get('dummy:resolved').resolved);
      assert.equal('dummy/packagePath', this.env.get('dummy:resolved').packagePath);
    });

    it('throws if invalid generator', function () {
      assert.throws(this.env.registerStub.bind(this.env, [], 'dummy'), /stub\sfunction/);
    });

    it('throws if invalid namespace', function () {
      assert.throws(this.env.registerStub.bind(this.env, this.simpleDummy), /namespace/);
    });
  });

  describe('#namespaces()', () => {
    beforeEach(function () {
      this.env
        .register(path.join(__dirname, './fixtures/generator-simple'))
        .register(path.join(__dirname, './fixtures/generator-extend/support'))
        .register(path.join(__dirname, './fixtures/generator-extend/support'), 'support:scaffold');
    });

    it('get the list of namespaces', function () {
      assert.deepEqual(this.env.namespaces(), ['simple', 'extend:support', 'support:scaffold']);
    });
  });

  describe('#getGeneratorsMeta()', () => {
    beforeEach(function () {
      this.generatorPath = path.join(__dirname, './fixtures/generator-simple');
      this.env.register(this.generatorPath);
    });

    it('get the registered Generators metadatas', function () {
      const meta = this.env.getGeneratorsMeta().simple;
      assert.deepEqual(meta.resolved, require.resolve(this.generatorPath));
      assert.deepEqual(meta.namespace, 'simple');
    });
  });

  describe('#getGeneratorNames', () => {
    beforeEach(function () {
      this.generatorPath = path.join(__dirname, './fixtures/generator-simple');
      this.env.register(this.generatorPath);
    });

    it('get the registered generators names', function () {
      assert.deepEqual(this.env.getGeneratorNames(), ['simple']);
    });
  });

  describe('#namespace()', () => {
    it('create namespace from path', function () {
      assert.equal(this.env.namespace('backbone/all/index.js'), 'backbone:all');
      assert.equal(this.env.namespace('backbone/all/main.js'), 'backbone:all');
      assert.equal(this.env.namespace('backbone/all'), 'backbone:all');
      assert.equal(this.env.namespace('backbone/all.js'), 'backbone:all');
      assert.equal(this.env.namespace('backbone/app/index.js'), 'backbone:app');
      assert.equal(this.env.namespace('backbone.js'), 'backbone');

      assert.equal(this.env.namespace('generator-backbone/all.js'), 'backbone:all');
      assert.equal(this.env.namespace('generator-mocha/backbone/model/index.js'), 'mocha:backbone:model');
      assert.equal(this.env.namespace('generator-mocha/backbone/model.js'), 'mocha:backbone:model');
      assert.equal(this.env.namespace('node_modules/generator-mocha/backbone/model.js'), 'mocha:backbone:model');
      assert.equal(this.env.namespace('../node_modules/generator-mocha/backbone/model.js'), 'mocha:backbone:model');
      assert.equal(this.env.namespace('../generator-mocha/backbone/model.js'), 'mocha:backbone:model');
    });

    it('create namespace from scoped path', function () {
      assert.equal(this.env.namespace('@dummyscope/generator-backbone/all.js'), '@dummyscope/backbone:all');
      assert.equal(this.env.namespace('@dummyscope/generator-mocha/backbone/model/index.js'), '@dummyscope/mocha:backbone:model');
      assert.equal(this.env.namespace('@dummyscope/generator-mocha/backbone/model.js'), '@dummyscope/mocha:backbone:model');
      assert.equal(this.env.namespace('/node_modules/@dummyscope/generator-mocha/backbone/model.js'), '@dummyscope/mocha:backbone:model');
    });

    it('handle relative paths', function () {
      assert.equal(this.env.namespace('../local/stuff'), 'local:stuff');
      assert.equal(this.env.namespace('./local/stuff'), 'local:stuff');
      assert.equal(this.env.namespace('././local/stuff'), 'local:stuff');
      assert.equal(this.env.namespace('../../local/stuff'), 'local:stuff');
    });

    it('handles weird paths', function () {
      assert.equal(this.env.namespace('////gen/all'), 'gen:all');
      assert.equal(this.env.namespace('generator-backbone///all.js'), 'backbone:all');
      assert.equal(this.env.namespace('generator-backbone/././all.js'), 'backbone:all');
      assert.equal(this.env.namespace('generator-backbone/generator-backbone/all.js'), 'backbone:all');
    });

    it('works with Windows\' paths', function () {
      assert.equal(this.env.namespace('backbone\\all\\main.js'), 'backbone:all');
      assert.equal(this.env.namespace('backbone\\all'), 'backbone:all');
      assert.equal(this.env.namespace('backbone\\all.js'), 'backbone:all');
    });

    it('remove lookups from namespace', function () {
      assert.equal(this.env.namespace('backbone/generators/all/index.js'), 'backbone:all');
      assert.equal(this.env.namespace('backbone/lib/generators/all/index.js'), 'backbone:all');
      assert.equal(this.env.namespace('some-lib/generators/all/index.js'), 'some-lib:all');
      assert.equal(this.env.namespace('my.thing/generators/app/index.js'), 'my.thing:app');
      assert.equal(this.env.namespace('meta/generators/generators-thing/index.js'), 'meta:generators-thing');
    });

    it('remove path before the generator name', function () {
      assert.equal(this.env.namespace('/Users/yeoman/.nvm/v0.10.22/lib/node_modules/generator-backbone/all/index.js'), 'backbone:all');
      assert.equal(this.env.namespace('/Users/yeoman with space and ./.nvm/v0.10.22/lib/node_modules/generator-backbone/all/index.js'), 'backbone:all');
      assert.equal(this.env.namespace('/usr/lib/node_modules/generator-backbone/all/index.js'), 'backbone:all');
      assert.equal(
        this.env.namespace('c:\\projects\\m. projects\\generators\\generator-example\\generators\\app\\index.js'),
        'example:app'
      );
    });

    it('Handles non generator-* packages inside node_modules', function () {
      assert.equal(
        this.env.namespace('c:\\projects\\node_modules\\example\\generators\\app\\index.js'),
        'example:app'
      );
    });

    it('handle paths when multiples lookups are in it', function () {
      assert.equal(
        this.env.namespace('c:\\projects\\yeoman\\generators\\generator-example\\generators\\app\\index.js'),
        'example:app'
      );
    });

    it('handles namespaces', function () {
      assert.equal(this.env.namespace('backbone:app'), 'backbone:app');
      assert.equal(this.env.namespace('foo'), 'foo');
    });
  });

  describe('#get()', () => {
    beforeEach(function () {
      this.generator = require('./fixtures/generator-mocha');
      this.env
        .register(path.join(__dirname, './fixtures/generator-mocha'), 'fixtures:generator-mocha')
        .register(path.join(__dirname, './fixtures/generator-mocha'), 'mocha:generator');
    });

    it('get a specific generator', function () {
      assert.equal(this.env.get('mocha:generator'), this.generator);
      assert.equal(this.env.get('fixtures:generator-mocha'), this.generator);
    });

    it('remove paths from namespace at resolution (for backward compatibility)', function () {
      assert.equal(this.env.get('mocha:generator:/a/dummy/path/'), this.generator);
      assert.equal(this.env.get('mocha:generator:C:\\foo\\bar'), this.generator);
    });

    it('works with Windows\' absolute paths', sinonTest(function () {
      const absolutePath = 'C:\\foo\\bar';

      const envMock = this.mock(this.env);

      envMock
        .expects('getByPath')
        .once()
        .withExactArgs(absolutePath)
        .returns(null);

      this.env.get(absolutePath);

      envMock.verify();
    }));

    it('fallback to requiring generator from a file path', function () {
      assert.equal(
        this.env.get(path.join(__dirname, './fixtures/generator-mocha')),
        this.generator
      );
    });

    it('returns undefined if namespace is not found', function () {
      assert.equal(this.env.get('not:there'), undefined);
      assert.equal(this.env.get(), undefined);
    });

    it('works with modules', function () {
      const generator = require('./fixtures/generator-module/generators/app');
      this.env
        .register(path.join(__dirname, './fixtures/generator-module/generators/app'), 'fixtures:generator-module');
      assert.equal(this.env.get('fixtures:generator-module'), generator.default);
    });
  });

  describe('#error()', () => {
    it('always throws error', function () {
      assert.throws(() => this.env.error(new Error('Some error')));
    });
  });

  describe('#alias()', () => {
    it('apply regex and replace with alternative value', function () {
      this.env.alias(/^([^:]+)$/, '$1:app');
      assert.equal(this.env.alias('foo'), 'foo:app');
    });

    it('apply multiple regex', function () {
      this.env.alias(/^([a-zA-Z\d:*]+)$/, 'generator-$1');
      this.env.alias(/^([^:]+)$/, '$1:app');
      assert.equal(this.env.alias('foo'), 'generator-foo:app');
    });

    it('apply latest aliases first', function () {
      this.env.alias(/^([^:]+)$/, '$1:all');
      this.env.alias(/^([^:]+)$/, '$1:app');
      assert.equal(this.env.alias('foo'), 'foo:app');
    });

    it('alias empty namespace to `:app` by default', function () {
      assert.equal(this.env.alias('foo'), 'foo:app');
    });

    it('alias removing prefix- from namespaces', function () {
      this.env.alias(/^(@.*\/)?prefix-(.*)$/, '$1$2');
      assert.equal(this.env.alias('prefix-foo'), 'foo:app');
      assert.equal(this.env.alias('prefix-mocha:generator'), 'mocha:generator');
      assert.equal(this.env.alias('prefix-fixtures:generator-mocha'), 'fixtures:generator-mocha');
      assert.equal(this.env.alias('@scoped/prefix-fixtures:generator-mocha'), '@scoped/fixtures:generator-mocha');
    });
  });

  describe('#get() with #alias()', () => {
    beforeEach(function () {
      this.generator = require('./fixtures/generator-mocha');
      this.env.alias(/^prefix-(.*)$/, '$1');
      this.env
        .register(path.join(__dirname, './fixtures/generator-mocha'), 'fixtures:generator-mocha')
        .register(path.join(__dirname, './fixtures/generator-mocha'), 'mocha:generator');
    });

    it('get a specific generator', function () {
      assert.equal(this.env.get('prefix-mocha:generator'), this.generator);
      assert.equal(this.env.get('mocha:generator'), this.generator);
      assert.equal(this.env.get('prefix-fixtures:generator-mocha'), this.generator);
      assert.equal(this.env.get('fixtures:generator-mocha'), this.generator);
    });
  });

  describe('.enforceUpdate()', () => {
    beforeEach(function () {
      this.env = new Environment();
      delete this.env.adapter;
      delete this.env.runLoop;
      delete this.env.sharedFs;
    });

    it('add an adapter', function () {
      Environment.enforceUpdate(this.env);
      assert(this.env.adapter);
    });

    it('add a runLoop', function () {
      Environment.enforceUpdate(this.env);
      assert(this.env.runLoop);
    });

    it('add a shared mem-fs instance', function () {
      Environment.enforceUpdate(this.env);
      assert(this.env.sharedFs);
    });

    it('add a shared fs instance', function () {
      Environment.enforceUpdate(this.env);
      assert(this.env.fs);
    });
  });

  describe('.createEnv()', () => {
    it('create an environment', () => {
      const env = Environment.createEnv();
      assert(env instanceof Environment);
    });
  });

  describe('.namespaceToName()', () => {
    it('convert a namespace to a name', () => {
      const name = Environment.namespaceToName('mocha:generator');
      assert.equal(name, 'mocha');
    });
  });
});
