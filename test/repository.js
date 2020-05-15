'use strict';
const assert = require('assert');
const fs = require('fs-extra');
const path = require('path');

const YeomanRepository = require('../lib/util/repository');
const Env = require('..');
const execa = require('execa');
const sinon = require('sinon');

/* eslint-disable max-nested-callbacks */
describe('repository', () => {
  const repository = Env.repository;

  before(function () {
    this.timeout(20000);
    if (fs.existsSync(repository.repositoryPath)) {
      fs.removeSync(repository.repositoryPath);
    }
  });

  afterEach(function () {
    this.timeout(20000);
    if (fs.existsSync(repository.repositoryPath)) {
      fs.removeSync(repository.repositoryPath);
    }
    repository.cleanupPackageCache('yeoman-environment', true);
  });

  it('is exposed on the Environment object', () => {
    assert(Env.repository instanceof YeomanRepository);
  });

  describe('#runPackageManager', () => {
    describe('install command', () => {
      const options = {};
      before(function () {
        sinon.stub(execa, 'sync');
        this.env = Env.createEnv();
        this.env.repository.runPackageManager('install', ['foo', 'bar'], options);
      });
      after(() => {
        execa.sync.restore();
      });
      it('calls npm with correct parameters', () => {
        assert(execa.sync.calledOnce);
        assert(execa.sync.getCalls()[0].args[0] === 'npm');
        assert(execa.sync.getCalls()[0].args[1][0] === 'install');
        assert(execa.sync.getCalls()[0].args[1][1] === '-g');
        assert(execa.sync.getCalls()[0].args[1][2] === '--prefix');
        assert(execa.sync.getCalls()[0].args[1][4] === '--loglevel');
        assert(execa.sync.getCalls()[0].args[1][5] === 'error');
        assert(execa.sync.getCalls()[0].args[1][6] === '--no-optional');
        assert(execa.sync.getCalls()[0].args[1][7] === 'foo');
        assert(execa.sync.getCalls()[0].args[1][8] === 'bar');
        assert(execa.sync.getCalls()[0].args[2] === options);
      });
    });
    describe('root command', () => {
      const options = {};
      before(function () {
        sinon.stub(execa, 'sync');
        this.env = Env.createEnv();
        this.env.repository.runPackageManager('root', undefined, options);
      });
      after(() => {
        execa.sync.restore();
      });
      it('calls npm with correct parameters', () => {
        assert(execa.sync.calledOnce);
        assert(execa.sync.getCalls()[0].args[0] === 'npm');
        assert(execa.sync.getCalls()[0].args[1][0] === 'root');
        assert(execa.sync.getCalls()[0].args[1][1] === '-g');
        assert(execa.sync.getCalls()[0].args[1][2] === '--prefix');
        assert(execa.sync.getCalls()[0].args[1][4] === '--loglevel');
        assert(execa.sync.getCalls()[0].args[1][5] === 'error');
        assert(execa.sync.getCalls()[0].args[2] === options);
      });
    });
  });

  describe('Environment#installLocalGenerators', () => {
    before(function () {
      this.timeout(200000);
      this.env = Env.createEnv();
      this.env.installLocalGenerators({'generator-dummytest': '0.1.3'});
    });

    after(() => {
      repository.cleanupPackageCache('generator-dummytest', true);
    });

    it('installs and register the generator', function () {
      this.timeout(10000);
      assert(this.env.get('dummytest:app'));
    });
  });

  describe('#repositoryPath', () => {
    it('returns the repository path', () => {
      assert.equal(repository.repositoryPath, path.resolve('.yo-repository'));
    });
  });

  describe('#resolvePackagePath', () => {
    describe('without args', () => {
      it('returns the node_modules path', () => {
        assert.equal(repository.nodeModulesPath, repository.resolvePackagePath());
      });
    });

    describe('with args', () => {
      it('returns the module path', () => {
        assert.equal(path.join(repository.nodeModulesPath, 'package', 'module'), repository.resolvePackagePath('package', 'module'));
      });
    });
  });

  describe('#createEnvWithVersion()', () => {
    describe('with semver valid range', () => {
      let env;
      beforeEach(function () {
        this.timeout(500000);
        env = Env.createEnvWithVersion('~2.3.0');
      });

      it('returns env and #cleanup without force fails', () => {
        assert.ok(env);
        assert.ok(!(env instanceof Env));
        assert.throws(() => repository.cleanupPackageCache('yeoman-environment'));
      });
    });

    describe('with git repository', () => {
      it('returns env', function () {
        this.timeout(500000);
        const env = Env.createEnvWithVersion('yeoman/environment#v2.8.1');
        assert.equal(repository.getPackageVersion('yeoman-environment'), '2.8.1');
        assert.ok(env);
        assert.ok(!(env instanceof Env));
      });
    });
  });

  describe('repository workflow', () => {
    it('run the workflow correctly', function () {
      this.timeout(500000);
      repository.installPackage('yeoman-environment', '2.3.0');
      assert.equal(repository.getPackageVersion('yeoman-environment'), '2.3.0');

      // Force install another version
      repository.installPackage('yeoman-environment', '2.8.1');
      assert.equal(repository.getPackageVersion('yeoman-environment'), '2.8.1');

      // Instantiate the installed version
      assert.ok(repository.requireModule('yeoman-environment'));
      assert.equal(repository.getPackageVersion('yeoman-environment'), '2.8.1');
    });
  });
});
/* eslint-enable max-nested-callbacks */

