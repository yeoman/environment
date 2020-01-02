'use strict';
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const Environment = require('../lib/environment');

const tmpdir = path.join(os.tmpdir(), 'yeoman-environment/auto-install');

describe('Generators', () => {
  before(function () {
    fs.mkdirpSync(tmpdir);
    this.cwd = process.cwd();
    process.chdir(tmpdir);
    if (fs.existsSync(Environment.repository.repositoryPath)) {
      fs.removeSync(Environment.repository.repositoryPath);
    }
  });

  after(function () {
    process.chdir(this.cwd);
    fs.removeSync(tmpdir);
  });

  beforeEach(function () {
    this.env = new Environment([], {'skip-install': true, experimental: true});
  });

  describe('#create()', () => {
    beforeEach(function () {
      this.env.register(path.join(__dirname, './fixtures/generator-mocha'), 'mocha:generator');
    });

    it('adds the id on the options', function () {
      assert.equal(this.env.create('mocha:generator').options.namespaceId, 'mocha:generator');
      assert.equal(this.env.create('mocha:generator').options.namespaceId, 'mocha:generator+1');
    });
  });

  describe('#rootGenerator()', () => {
    beforeEach(function () {
      this.env.register(path.join(__dirname, './fixtures/generator-mocha'), 'mocha:generator');
    });

    it('returns the generator', function () {
      this.env.run('mocha:generator');
      assert.ok(this.env.rootGenerator());
    });
  });

  describe('#getInstance() with #alias()', () => {
    beforeEach(function () {
      this.env.alias(/^prefix-(.*)$/, '$1');
      this.env.register(path.join(__dirname, './fixtures/generator-mocha'), 'mocha:generator');
      this.env._generators = [];
    });

    it('instantiate with original namespace', function () {
      this.env.run('mocha:generator');
      const instance = this.env.rootGenerator();
      assert.ok(instance === this.env.getInstance('prefix-mocha:generator'));
      assert.ok(instance === this.env.getInstance('mocha:generator'));
    });

    it('instantiate with alias namespace', function () {
      this.env.run('prefix-mocha:generator');
      const instance = this.env.rootGenerator();
      assert.ok(instance === this.env.getInstance('prefix-mocha:generator'));
      assert.ok(instance === this.env.getInstance('mocha:generator'));
    });
  });
});
