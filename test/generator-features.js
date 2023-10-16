import assert from 'node:assert';
import sinon from 'sinon';
import { esmocha, expect, mock } from 'esmocha';
import helpers, { getCreateEnv } from './helpers.js';

const { commitSharedFsTask } = await mock('../src/commit.ts');
const { packageManagerInstallTask } = await mock('../src/package-manager.ts');
const { default: BasicEnvironment } = await import('../src/environment-base.js');

for (const generatorVersion of ['yeoman-generator-5', 'yeoman-generator-6']) {
  // eslint-disable-next-line no-await-in-loop
  const { default: Generator } = await import(generatorVersion);
  class FeaturesGenerator extends Generator {}

  describe(`environment (generator-features) using ${generatorVersion}`, () => {
    beforeEach(() => {
      esmocha.resetAllMocks();
    });

    describe('customCommitTask feature', () => {
      describe('without customInstallTask', () => {
        beforeEach(async () => {
          await helpers
            .run('custom-commit', undefined, { createEnv: getCreateEnv(BasicEnvironment) })
            .withOptions({ skipInstall: true })
            .withGenerators([[helpers.createMockedGenerator(), { namespace: 'custom-commit:app' }]]);
        });

        it('should call commitSharedFs', () => {
          expect(commitSharedFsTask).toHaveBeenCalledTimes(1);
        });
      });

      describe('with true customCommitTask', () => {
        let runContext;
        before(async () => {
          runContext = helpers
            .create('custom-commit', undefined, { createEnv: getCreateEnv(BasicEnvironment) })
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
                { namespace: 'custom-commit:app' },
              ],
            ]);
          await runContext.run();
        });

        it('should not call commitSharedFs', () => {
          expect(commitSharedFsTask).not.toHaveBeenCalled();
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
                { namespace: 'custom-commit:app' },
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
            .create('custom-install', undefined, { createEnv: getCreateEnv(BasicEnvironment) })
            .withOptions({ skipInstall: false })
            .withGenerators([
              [
                class extends FeaturesGenerator {
                  packageJsonTask() {
                    this.packageJson.set({ name: 'foo' });
                  }
                },
                { namespace: 'custom-install:app' },
              ],
            ]);
          await runContext.run();
        });

        it('should call packageManagerInstallTask', () => {
          expect(packageManagerInstallTask).toHaveBeenCalledTimes(1);
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
            .create('custom-install', undefined, { createEnv: getCreateEnv(BasicEnvironment) })
            .withOptions({ skipInstall: false })
            .withGenerators([
              [
                class extends FeaturesGenerator {
                  packageJsonTask() {
                    this.env.compatibilityMode = 'v4';
                    this.packageJson.set({ name: 'foo' });
                  }
                },
                { namespace: 'custom-install:app' },
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
            .create('custom-install', undefined, { createEnv: getCreateEnv(BasicEnvironment) })
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
                { namespace: 'custom-install:app' },
              ],
            ]);
          await runContext.run();
        });

        it('should not call packageManagerInstallTask', () => {
          expect(packageManagerInstallTask).not.toHaveBeenCalled();
        });
      });

      describe('with function customInstallTask', () => {
        let customInstallTask;
        before(async () => {
          customInstallTask = sinon.stub();
          await helpers
            .run('custom-install')
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
                { namespace: 'custom-install:app' },
              ],
            ]);
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

      describe('with function customInstallTask and custom path', () => {
        let runContext;
        let customInstallTask;
        let installTask;
        beforeEach(async () => {
          customInstallTask = sinon.stub();
          installTask = (pm, defaultTask) => defaultTask(pm);
          runContext = helpers
            .create('custom-install', undefined, { createEnv: getCreateEnv(BasicEnvironment) })
            .withOptions({ skipInstall: false })
            .withGenerators([
              [
                class extends FeaturesGenerator {
                  constructor(args, options) {
                    super(args, options, { customInstallTask });
                    this.destinationRoot(this.destinationPath('foo'));
                    this.env.watchForPackageManagerInstall({
                      cwd: this.destinationPath(),
                      installTask,
                    });
                  }

                  packageJsonTask() {
                    this.packageJson.set({ name: 'foo' });
                  }
                },
                { namespace: 'custom-install:app' },
              ],
            ]);
          await runContext.run();
        });

        it('should not call customInstallTask', () => {
          assert.equal(customInstallTask.callCount, 0, 'should not have been called');
        });

        it('should call packageManagerInstallTask twice', () => {
          expect(packageManagerInstallTask).toHaveBeenCalledTimes(2);
          expect(packageManagerInstallTask).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
              customInstallTask,
            }),
          );
          expect(packageManagerInstallTask).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
              customInstallTask: installTask,
            }),
          );
        });
      });
    });
  });
}
