/*global it, describe, before, beforeEach, afterEach */
/*jshint scripturl: true */
'use strict';
var events = require('events');
var fs = require('fs');
var path = require('path');
var util = require('util');
var sinon = require('sinon');
var generators = require('yeoman-generator');
var assert = require('yeoman-assert');
var TerminalAdapter = require('../lib/adapter');
var Environment = require('../lib/environment');

describe('Environment', function () {
  beforeEach(function () {
    this.env = new Environment([], { 'skip-install': true });
  });

  afterEach(function () {
    this.env.removeAllListeners();
  });

  it('is an instance of EventEmitter', function () {
    assert.ok(new Environment() instanceof events.EventEmitter);
  });

  describe('constructor', function () {
    it('take arguments option', function () {
      var args = ['foo'];
      assert.equal(new Environment(args).arguments, args);
    });

    it('take arguments parameter option as string', function () {
      var args = 'foo bar';
      assert.deepEqual(new Environment(args).arguments, args.split(' '));
    });

    it('take options parameter', function () {
      var opts = { foo: 'bar' };
      assert.equal(new Environment(null, opts).options, opts);
    });

    it('instantiates a TerminalAdapter if none provided', function () {
      assert.ok(this.env.adapter instanceof TerminalAdapter);
    });

    it('uses the provided object as adapter if any', function () {
      var dummyAdapter = {};
      var env = new Environment(null, null, dummyAdapter);
      assert.equal(env.adapter, dummyAdapter, 'Not the adapter provided');
    });

    it('instantiates a mem-fs instance', function () {
      assert.ok(this.env.sharedFs);
    });
  });

  describe('#help()', function () {
    beforeEach(function () {
      this.env
        .register(path.join(__dirname, 'fixtures/custom-generator-simple'))
        .register(path.join(__dirname, 'fixtures/custom-generator-extend'));

      this.expected = fs.readFileSync(path.join(__dirname, 'fixtures/help.txt'), 'utf8').trim();

      // lazy "update the help fixtures because something changed" statement
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

  describe('#create()', function () {
    beforeEach(function () {
      this.Generator = generators.Base.extend();
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

    it('pass options.arguments', function () {
      var args = ['foo', 'bar'];
      var generator = this.env.create('stub', { arguments: args });
      assert.deepEqual(generator.arguments, args);
    });

    it('pass options.arguments as string', function () {
      var args = 'foo bar';
      var generator = this.env.create('stub', { arguments: args });
      assert.deepEqual(generator.arguments, args.split(' '));
    });

    it('pass options.args (as `arguments` alias)', function () {
      var args = ['foo', 'bar'];
      var generator = this.env.create('stub', { args: args });
      assert.deepEqual(generator.arguments, args);
    });

    it('prefer options.arguments over options.args', function () {
      var args1 = ['yo', 'unicorn'];
      var args = ['foo', 'bar'];
      var generator = this.env.create('stub', { arguments: args1, args: args });
      assert.deepEqual(generator.arguments, args1);
    });

    it('default arguments to `env.arguments`', function () {
      var args = ['foo', 'bar'];
      this.env.arguments = args;
      var generator = this.env.create('stub');
      assert.notEqual(generator.arguments, args, 'expect arguments to not be passed by reference');
    });

    it('pass options.options', function () {
      var opts = { foo: 'bar' };
      var generator = this.env.create('stub', { options: opts });
      assert.equal(generator.options, opts);
    });

    it('default options to `env.options` content', function () {
      this.env.options = { foo: 'bar' };
      assert.equal(this.env.create('stub').options.foo, 'bar');
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
  });

  describe('#run()', function () {
    beforeEach(function () {
      var self = this;
      this.Stub = generators.Base.extend({
        constructor: function () {
          self.args = arguments;
          generators.Base.apply(this, arguments);
        },
        exec: function () {}
      });
      this.runMethod = sinon.spy(generators.Base.prototype, 'run');
      this.env.registerStub(this.Stub, 'stub:run');
    });

    afterEach(function () {
      this.runMethod.restore();
    });

    it('runs a registered generator', function (done) {
      this.env.run(['stub:run'], function () {
        assert.ok(this.runMethod.calledOnce);
        done();
      }.bind(this));
    });

    it('pass args and options to the runned generator', function (done) {
      var args = ['stub:run', 'module'];
      var options = { 'skip-install': true };
      this.env.run(args, options, function () {
        assert.ok(this.runMethod.calledOnce);
        assert.equal(this.args[0], 'module');
        assert.equal(this.args[1], options);
        done();
      }.bind(this));
    });

    it('without options, it default to env.options', function (done) {
      var args = ['stub:run', 'foo'];
      this.env.options = { some: 'stuff', 'skip-install': true };
      this.env.run(args, function () {
        assert.ok(this.runMethod.calledOnce);
        assert.equal(this.args[0], 'foo');
        assert.equal(this.args[1], this.env.options);
        done();
      }.bind(this));
    });

    it('without args, it default to env.arguments', function (done) {
      this.env.arguments = ['stub:run', 'my-args'];
      this.env.options = { 'skip-install': true };
      this.env.run(function () {
        assert.ok(this.runMethod.calledOnce);
        assert.equal(this.args[0], 'my-args');
        assert.equal(this.args[1], this.env.options);
        done();
      }.bind(this));
    });

    it('can take string as args', function (done) {
      var args = 'stub:run module';
      this.env.run(args, function () {
        assert.ok(this.runMethod.calledOnce);
        assert.equal(this.args[0], 'module');
        done();
      }.bind(this));
    });

    it('can take no arguments', function () {
      this.env.arguments = ['stub:run'];
      this.env.run();
      assert.ok(this.runMethod.calledOnce);
    });

    it('launch error if generator is not found', function (done) {
      this.env.on('error', function (err) {
        assert.ok(err.message.indexOf('some:unknown:generator') >= 0);
        done();
      });
      this.env.run('some:unknown:generator');
    });

    it('returns the generator', function () {
      assert.ok(this.env.run('stub:run') instanceof generators.Base);
    });
  });

  describe('#registerModulePath()', function () {
    it('resolves to a directory if no file type specified', function () {
      var modulePath = path.join(__dirname, 'fixtures/custom-generator-scoped/package');
      var specifiedJS = path.join(__dirname, 'fixtures/custom-generator-scoped/package/index.js');
      var specifiedJSON = path.join(__dirname, 'fixtures/custom-generator-scoped/package.json');
      var specifiedNode = path.join(__dirname, 'fixtures/custom-generator-scoped/package/nodefile.node');

      assert.equal(specifiedJS, this.env.resolveModulePath(modulePath));
      assert.equal(specifiedJS, this.env.resolveModulePath(specifiedJS));
      assert.equal(specifiedJSON, this.env.resolveModulePath(specifiedJSON));
      assert.equal(specifiedNode, this.env.resolveModulePath(specifiedNode));
    });
  });

  describe('#register()', function () {
    beforeEach(function () {
      this.simplePath = path.join(__dirname, 'fixtures/custom-generator-simple');
      this.extendPath = path.join(__dirname, './fixtures/custom-generator-extend');
      assert.equal(this.env.namespaces().length, 0, 'env should be empty');
      this.env
        .register(this.simplePath, 'fixtures:custom-generator-simple')
        .register(this.extendPath, 'scaffold');
    });

    it('store registered generators', function () {
      assert.equal(this.env.namespaces().length, 2);
    });

    it('determine registered Generator namespace and resolved path', function () {
      var simple = this.env.get('fixtures:custom-generator-simple');
      assert.equal(typeof simple, 'function');
      assert.ok(simple.namespace, 'fixtures:custom-generator-simple');
      assert.ok(simple.resolved, path.resolve(this.simplePath));

      var extend = this.env.get('scaffold');
      assert.equal(typeof extend, 'function');
      assert.ok(extend.namespace, 'scaffold');
      assert.ok(extend.resolved, path.resolve(this.extendPath));
    });

    it('throw when String is not passed as first parameter', function () {
      assert.throws(function () { this.env.register(function () {}, 'blop'); });
      assert.throws(function () { this.env.register([], 'blop'); });
      assert.throws(function () { this.env.register(false, 'blop'); });
    });
  });

  describe('#registerStub()', function () {
    beforeEach(function () {
      this.simpleDummy = sinon.spy();
      this.completeDummy = function () {};
      util.inherits(this.completeDummy, generators.Base);
      this.env
        .registerStub(this.simpleDummy, 'dummy:simple')
        .registerStub(this.completeDummy, 'dummy:complete');
    });

    it('register a function under a namespace', function () {
      assert.equal(this.completeDummy, this.env.get('dummy:complete'));
    });

    it('throws if invalid generator', function () {
      assert.throws(this.env.registerStub.bind(this.env, [], 'dummy'), /stub\sfunction/);
    });

    it('throws if invalid namespace', function () {
      assert.throws(this.env.registerStub.bind(this.env, this.simpleDummy), /namespace/);
    });
  });

  describe('#namespaces()', function () {
    beforeEach(function () {
      this.env
        .register(path.join(__dirname, './fixtures/custom-generator-simple'))
        .register(path.join(__dirname, './fixtures/custom-generator-extend'))
        .register(path.join(__dirname, './fixtures/custom-generator-extend'), 'support:scaffold');
    });

    it('get the list of namespaces', function () {
      assert.deepEqual(this.env.namespaces(), ['simple', 'extend:support:scaffold', 'support:scaffold']);
    });
  });

  describe('#getGeneratorsMeta()', function () {
    beforeEach(function () {
      this.generatorPath = path.join(__dirname, './fixtures/custom-generator-simple');
      this.env.register(this.generatorPath);
    });

    it('get the registered Generators metadatas', function () {
      var meta = this.env.getGeneratorsMeta().simple;
      assert.deepEqual(meta.resolved, require.resolve(this.generatorPath));
      assert.deepEqual(meta.namespace, 'simple');
    });
  });

  describe('#getGeneratorNames', function () {
    beforeEach(function () {
      this.generatorPath = path.join(__dirname, './fixtures/custom-generator-simple');
      this.env.register(this.generatorPath);
    });

    it('get the registered generators names', function () {
      assert.deepEqual(this.env.getGeneratorNames(), ['simple']);
    });
  });

  describe('#namespace()', function () {
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
      assert.equal(this.env.namespace('/usr/lib/node_modules/generator-backbone/all/index.js'), 'backbone:all');
    });

    it('handle paths when multiples lookups are in it', function () {
      assert.equal(
        this.env.namespace('c:\\projects\\yeoman\\generators\\generator-example\\generators\\app\\index.js'),
        'example:app'
      );
    });
  });

  describe('#get()', function () {
    beforeEach(function () {
      this.generator = require('./fixtures/mocha-generator');
      this.env
        .register(path.join(__dirname, './fixtures/mocha-generator'), 'fixtures:mocha-generator')
        .register(path.join(__dirname, './fixtures/mocha-generator'), 'mocha:generator');
    });

    it('get a specific generator', function () {
      assert.equal(this.env.get('mocha:generator'), this.generator);
      assert.equal(this.env.get('fixtures:mocha-generator'), this.generator);
    });

    it('walks recursively the namespace to get the closest match', function () {
      assert.equal(this.env.get('mocha:generator:too:many'), this.generator);
    });

    it('fallback to requiring generator from a file path', function () {
      assert.equal(
        this.env.get(path.join(__dirname, './fixtures/mocha-generator')),
        this.generator
      );
    });

    it('returns undefined if namespace is not found', function () {
      assert.equal(this.env.get('not:there'), undefined);
      assert.equal(this.env.get(), undefined);
    });
  });

  describe('#error()', function () {
    it('delegate error handling to the listener', function (done) {
      var error = new Error('foo bar');
      this.env.on('error', function (err) {
        assert.equal(error, err);
        done();
      });
      this.env.error(error);
    });

    it('throws error if no listener is set', function () {
      assert.throws(this.env.error.bind(this.env, new Error()));
    });

    it('returns the error', function () {
      var error = new Error('foo bar');
      this.env.on('error', function () {});
      assert.equal(this.env.error(error), error);
    });
  });

  describe('#alias()', function () {
    it('apply regex and replace with alternative value', function () {
      this.env.alias(/^([^:]+)$/, '$1:app');
      assert.equal(this.env.alias('foo'), 'foo:app');
    });

    it('apply multiple regex', function () {
      this.env.alias(/^([a-zA-Z0-9:\*]+)$/, 'generator-$1');
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
  });

  describe('.enforceUpdate()', function () {
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
  });

  describe('.createEnv()', function () {
    it('create an environment', function () {
      var env = Environment.createEnv();
      assert(env instanceof Environment);
    });
  });

  describe('.namespaceToName()', function () {
    it('convert a namespace to a name', function () {
      var name = Environment.namespaceToName('mocha:generator');
      assert.equal(name, 'mocha');
    });
  });
});
