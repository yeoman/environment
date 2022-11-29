import assert from 'assert';
import path from 'path';
import fs from 'fs-extra';

import Environment from '../lib/index.mjs';

import YeomanRepository from '../lib/util/repository.js';

describe('repository', () => {
  let repository;

  beforeEach(function () {
    this.timeout(40_000);
    repository = new YeomanRepository();
    if (fs.existsSync(repository.repositoryPath)) {
      fs.removeSync(repository.repositoryPath);
    }
  });

  afterEach(function () {
    this.timeout(40_000);
    repository.cleanupPackageCache('yeoman-environment', true);
    if (fs.existsSync(repository.repositoryPath)) {
      fs.removeSync(repository.repositoryPath);
    }

    delete repository.arb;
  });

  describe('Environment#installLocalGenerators', () => {
    beforeEach(async function () {
      this.timeout(500_000);
      this.env = Environment.createEnv();
      return this.env.installLocalGenerators({
        'generator-dummytest': '0.1.3',
      });
    });

    afterEach(() => {
      repository.cleanupPackageCache('generator-dummytest', true);
    });

    it('installs and register the generator', function () {
      this.timeout(10_000);
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
      beforeEach(async function () {
        this.timeout(500_000);
        env = await Environment.createEnvWithVersion('~2.3.0');
      });

      it('returns env and #cleanup without force fails', () => {
        assert.ok(env);
        assert.ok(!(env instanceof Environment));
        assert.throws(() => repository.cleanupPackageCache('yeoman-environment'));
      });
    });

    describe('with git repository', () => {
      it('returns env', async function () {
        this.timeout(500_000);
        const env = await Environment.createEnvWithVersion('yeoman/environment#v2.8.1');
        assert.equal(repository.getPackageVersion('yeoman-environment'), '2.8.1');
        assert.ok(env);
        assert.ok(!(env instanceof Environment));
      });
    });
  });

  describe('repository workflow', () => {
    it('run the workflow correctly', async function () {
      this.timeout(500_000);
      await repository.installPackage('yeoman-environment', '2.8.1');
      assert.equal(repository.getPackageVersion('yeoman-environment'), '2.8.1');

      // Instantiate the installed version
      assert.ok(await repository.requireModule('yeoman-environment'));
      assert.equal(repository.getPackageVersion('yeoman-environment'), '2.8.1');
    });
  });
});
