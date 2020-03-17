'use strict';
const assert = require('assert');
const fs = require('fs-extra');
const path = require('path');

const repository = require('../lib/util/repository');
const Env = require('..');

describe('repository', () => {
  afterEach(function () {
    this.timeout(20000);
    if (fs.existsSync(repository.repositoryPath)) {
      fs.removeSync(repository.repositoryPath);
    }
    repository.cleanupPackageCache('yeoman-environment', true);
  });

  it('is exposed on the Environment object', () => {
    assert.equal(Env.repository, repository);
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
      it('returns env', function () {
        this.timeout(500000);
        const env = Env.createEnvWithVersion('~2.3.0');
        assert.ok(env);
        assert.ok(!(env instanceof Env));
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
