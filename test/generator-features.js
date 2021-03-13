'use strict';
/* eslint-disable max-nested-callbacks */
const assert = require('assert');
const sinon = require('sinon');
const semver = require('semver');
const Generator = require('yeoman-generator');
const {version} = require('yeoman-generator/package.json');
const helpers = require('./helpers');

class FeaturesGenerator extends Generator {
  getFeatures() {
    return this.features;
  }
}

describe('environment (generator-features)', () => {
  before(function () {
    if (semver.lt(version, '5.0.0')) {
      this.skip();
    }
  });

  describe('customCommitTask feature', () => {
    describe('without customInstallTask', () => {
      let runContext;
      before(async () => {
        runContext = helpers
          .create('custom-commit')
          .withOptions({skipInstall: true})
          .withGenerators([
            [
              helpers.createMockedGenerator(),
              'custom-commit:app'
            ]
          ])
          .withEnvironment(env => {
            env.commitSharedFs = sinon.stub().returns(Promise.resolve());
          });
        await runContext.run();
      });

      it('should call commitSharedFs', () => {
        assert.equal(runContext.env.commitSharedFs.callCount, 1, 'should have been called once');
      });
    });

    describe('with true customCommitTask', () => {
      let runContext;
      before(async () => {
        runContext = helpers
          .create('custom-commit')
          .withOptions({skipInstall: true})
          .withGenerators([
            [
              helpers.createMockedGenerator(
                class extends FeaturesGenerator {
                  constructor(args, options) {
                    super(args, options, {customCommitTask: true});
                  }
                }
              ),
              'custom-commit:app'
            ]
          ])
          .withEnvironment(env => {
            env.commitSharedFs = sinon.stub().returns(Promise.resolve());
          });
        await runContext.run();
      });

      it('should not call commitSharedFs', () => {
        assert.equal(runContext.env.commitSharedFs.callCount, 0, 'should not have been called');
      });
    });

    describe('with function customCommitTask', () => {
      let runContext;
      let customCommitTask;
      before(async () => {
        customCommitTask = sinon.stub();
        runContext = helpers
          .create('custom-commit')
          .withOptions({skipInstall: true})
          .withGenerators([
            [
              helpers.createMockedGenerator(
                class extends FeaturesGenerator {
                  constructor(args, options) {
                    super(args, options, {customCommitTask});
                  }
                }
              ),
              'custom-commit:app'
            ]
          ])
          .withEnvironment(env => {
            env.commitSharedFs = sinon.stub().returns(Promise.resolve());
          });
        await runContext.run();
      });

      it('should not call commitSharedFs', () => {
        assert.equal(runContext.env.commitSharedFs.callCount, 0, 'should not have been called');
      });

      it('should call customCommitTask', () => {
        assert.equal(customCommitTask.callCount, 1, 'should have been called');
      });
    });
  });

  describe('customInstallTask feature', () => {
    describe('without customInstallTask', () => {
      let runContext;
      before(async () => {
        runContext = helpers
          .create('custom-install')
          .withOptions({skipInstall: false})
          .withGenerators([
            [
              class extends FeaturesGenerator {
                packageJsonTask() {
                  this.packageJson.set({name: 'foo'});
                }
              },
              'custom-install:app'
            ]
          ])
          .withEnvironment(env => {
            env.isDestinationPackageJsonCommitted = sinon.stub().returns(true);
            env.spawnCommand = sinon.stub().returns(Promise.resolve());
          });
        await runContext.run();
      });

      it('should call spawnCommand', () => {
        assert.equal(runContext.env.spawnCommand.callCount, 1, 'should have been called once');
      });
    });

    describe('with true customInstallTask', () => {
      let runContext;
      before(async () => {
        runContext = helpers
          .create('custom-install')
          .withOptions({skipInstall: false})
          .withGenerators([
            [
              class extends FeaturesGenerator {
                constructor(args, options) {
                  super(args, options, {customInstallTask: true});
                }

                packageJsonTask() {
                  this.packageJson.set({name: 'foo'});
                }
              },
              'custom-install:app'
            ]
          ])
          .withEnvironment(env => {
            env.isDestinationPackageJsonCommitted = sinon.stub().returns(true);
            env.spawnCommand = sinon.stub().returns(Promise.resolve());
          });
        await runContext.run();
      });

      it('should not call spawnCommand', () => {
        assert.equal(runContext.env.spawnCommand.callCount, 0, 'should not have been called');
      });
    });

    describe('with function customInstallTask', () => {
      let runContext;
      let customInstallTask;
      before(async () => {
        customInstallTask = sinon.stub();
        runContext = helpers
          .create('custom-install')
          .withOptions({skipInstall: false})
          .withGenerators([
            [
              class extends FeaturesGenerator {
                constructor(args, options) {
                  super(args, options, {customInstallTask});
                }

                packageJsonTask() {
                  this.packageJson.set({name: 'foo'});
                }
              },
              'custom-install:app'
            ]
          ])
          .withEnvironment(env => {
            env.isDestinationPackageJsonCommitted = sinon.stub().returns(true);
            env.spawnCommand = sinon.stub().returns(Promise.resolve());
          });
        await runContext.run();
      });

      it('should not call spawnCommand', () => {
        assert.equal(runContext.env.spawnCommand.callCount, 0, 'should not have been called');
      });

      it('should call customInstallTask', () => {
        assert.equal(customInstallTask.callCount, 1, 'should have been called');
      });

      it('should forward preferred pm', () => {
        assert.equal(customInstallTask.getCall(0).args[0], null);
      });

      it('should forward default execution callback', () => {
        assert.equal(typeof customInstallTask.getCall(0).args[1], 'function');
      });
    });
  });
});
/* eslint-enable max-nested-callbacks */
