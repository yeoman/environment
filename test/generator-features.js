import assert from 'node:assert';
import { createRequire } from 'node:module';
import sinon from 'sinon';
import semver from 'semver';
import Generator from 'yeoman-generator';
import { esmocha, expect, mock } from 'esmocha';
import helpers from './helpers.js';

const { packageManagerInstallTask } = await mock('../src/package-manager.ts');
const { default: Environment } = await import('../src/environment.js');

const require = createRequire(import.meta.url);
const { version } = require('yeoman-generator/package.json');

class FeaturesGenerator extends Generator {}

describe('environment (generator-features)', () => {
  before(function () {
    if (semver.lt(version, '5.0.0')) {
      this.skip();
    }
  });

  beforeEach(() => {
    esmocha.resetAllMocks();
  });

  describe('customCommitTask feature', () => {
    describe('without customInstallTask', () => {
      let runContext;
      before(async () => {
        runContext = helpers
          .create('custom-commit')
          .withOptions({ skipInstall: true })
          .withGenerators([[helpers.createMockedGenerator(), 'custom-commit:app']])
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
          .withOptions({ skipInstall: true })
          .withGenerators([
            [
              helpers.createMockedGenerator(
                class extends FeaturesGenerator {
                  constructor(args, options) {
                    super(args, options, { customCommitTask: true });
                  }
                },
              ),
              'custom-commit:app',
            ],
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
          .withOptions({ skipInstall: true })
          .withGenerators([
            [
              helpers.createMockedGenerator(
                class extends FeaturesGenerator {
                  constructor(args, options) {
                    super(args, options, { customCommitTask });
                  }
                },
              ),
              'custom-commit:app',
            ],
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
      beforeEach(async () => {
        runContext = helpers
          .create('custom-install', undefined, { createEnv: Environment.createEnv.bind(Environment) })
          .withOptions({ skipInstall: false })
          .withGenerators([
            [
              class extends FeaturesGenerator {
                packageJsonTask() {
                  this.packageJson.set({ name: 'foo' });
                }
              },
              'custom-install:app',
            ],
          ]);
        await runContext.run();
      });

      it('should call packageManagerInstallTask', () => {
        expect(packageManagerInstallTask).toHaveBeenCalledWith(
          expect.not.objectContaining({
            customInstallTask: expect.any(Function),
          }),
        );
      });
    });

    describe('v4 compatibility', () => {
      let runContext;
      beforeEach(async () => {
        runContext = helpers
          .create('custom-install', undefined, { createEnv: Environment.createEnv.bind(Environment) })
          .withOptions({ skipInstall: false })
          .withGenerators([
            [
              class extends FeaturesGenerator {
                packageJsonTask() {
                  this.env.compatibilityMode = 'v4';
                  this.packageJson.set({ name: 'foo' });
                }
              },
              'custom-install:app',
            ],
          ]);
        await runContext.run();
      });

      it('should not call packageManagerInstallTask', () => {
        expect(packageManagerInstallTask).not.toHaveBeenCalled();
      });
    });

    describe('with true customInstallTask', () => {
      let runContext;
      before(async () => {
        runContext = helpers
          .create('custom-install', undefined, { createEnv: Environment.createEnv.bind(Environment) })
          .withOptions({ skipInstall: false })
          .withGenerators([
            [
              class extends FeaturesGenerator {
                constructor(args, options) {
                  super(args, options, { customInstallTask: true });
                }

                packageJsonTask() {
                  this.packageJson.set({ name: 'foo' });
                }
              },
              'custom-install:app',
            ],
          ]);
        await runContext.run();
      });

      it('should not call packageManagerInstallTask', () => {
        expect(packageManagerInstallTask).not.toHaveBeenCalled();
      });
    });

    describe('with function customInstallTask', () => {
      let runContext;
      let customInstallTask;
      before(async () => {
        customInstallTask = sinon.stub();
        runContext = helpers
          .create('custom-install')
          .withOptions({ skipInstall: false })
          .withGenerators([
            [
              class extends FeaturesGenerator {
                constructor(args, options) {
                  super(args, options, { customInstallTask });
                }

                packageJsonTask() {
                  this.packageJson.set({ name: 'foo' });
                }
              },
              'custom-install:app',
            ],
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
