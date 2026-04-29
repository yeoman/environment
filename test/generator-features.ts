/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { after, afterEach, before, beforeEach, describe, esmocha, expect, it } from 'esmocha';
import helpers, { getCreateEnv as getCreateEnvironment, result } from './helpers.ts';
import { greaterThan5 } from './generator-versions.ts';

const commitModule = await import('../src/commit.ts');
const { commitSharedFsTask: originalCommitSharedFsTask } = commitModule;
const { commitSharedFsTask } = await esmocha.mock('../src/commit.ts', Promise.resolve(commitModule));
const { execa } = await esmocha.mock('execa', import('execa'));
const packageManagerModule = await import('../src/package-manager.ts');
const { packageManagerInstallTask: originalPackageManagerInstallTask } = packageManagerModule;
const { packageManagerInstallTask } = await esmocha.mock('../src/package-manager.ts', Promise.resolve(packageManagerModule));
const { default: BasicEnvironment } = await import('../src/environment-base.ts');

for (const generatorVersion of greaterThan5) {
  const { default: Generator } = await import(generatorVersion);
  class FeaturesGenerator extends Generator {}

  describe(`environment (generator-features) using ${generatorVersion}`, () => {
    afterEach(() => {
      esmocha.resetAllMocks();
    });
    after(() => {
      esmocha.reset(true);
    });

    describe('customCommitTask feature', () => {
      describe('without customInstallTask', () => {
        beforeEach(async () => {
          await helpers
            .run('custom-commit', undefined, { createEnv: getCreateEnvironment(BasicEnvironment) })
            .withOptions({ skipInstall: true })
            .withGenerators([[helpers.createMockedGenerator(Generator), { namespace: 'custom-commit:app' }]]);
        });

        it('should call commitSharedFs', () => {
          expect(commitSharedFsTask).toHaveBeenCalledTimes(1);
        });
      });

      describe('with true customCommitTask', () => {
        let runContext;
        before(async () => {
          runContext = helpers
            .create('custom-commit', undefined, { createEnv: getCreateEnvironment(BasicEnvironment) })
            .withOptions({ skipInstall: true })
            .withGenerators([
              [
                helpers.createMockedGenerator(
                  class extends FeaturesGenerator {
                    constructor(arguments_, options) {
                      super(arguments_, options, { customCommitTask: true });
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
        beforeEach(async () => {
          customCommitTask = esmocha.fn();
          runContext = helpers
            .create('custom-commit')
            .withOptions({ skipInstall: true })
            .withGenerators([
              [
                helpers.createMockedGenerator(
                  class extends FeaturesGenerator {
                    constructor(arguments_, options) {
                      super(arguments_, options, { customCommitTask });
                    }
                  },
                ),
                { namespace: 'custom-commit:app' },
              ],
            ])
            .withEnvironment(environment => {
              environment.commitSharedFs = esmocha.fn().mockReturnValue(Promise.resolve());
            });
          await runContext.run();
        });

        it('should not call commitSharedFs', () => {
          expect(runContext.env.commitSharedFs).not.toHaveBeenCalled();
        });

        it('should call customCommitTask', () => {
          expect(customCommitTask).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('customInstallTask feature', () => {
      describe('without customInstallTask', () => {
        let runContext;
        beforeEach(async () => {
          runContext = helpers
            .create('custom-install', undefined, { createEnv: getCreateEnvironment(BasicEnvironment) })
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
            .create('custom-install', undefined, { createEnv: getCreateEnvironment(BasicEnvironment) })
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
            .create('custom-install', undefined, { createEnv: getCreateEnvironment(BasicEnvironment) })
            .withOptions({ skipInstall: false })
            .withGenerators([
              [
                class extends FeaturesGenerator {
                  constructor(arguments_, options) {
                    super(arguments_, options, { customInstallTask: true });
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

        it('should not call execa', () => {
          expect(execa).not.toHaveBeenCalled();
        });
      });

      describe('with function customInstallTask', () => {
        let customInstallTask;
        beforeEach(async () => {
          customInstallTask = esmocha.fn();
          await helpers
            .run('custom-install')
            .withOptions({ skipInstall: false })
            .withGenerators([
              [
                class extends FeaturesGenerator {
                  constructor(arguments_, options) {
                    super(arguments_, options, { customInstallTask });
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
          expect(customInstallTask).toHaveBeenCalledTimes(1);
        });

        it('should forward preferred pm', () => {
          expect(customInstallTask).toHaveBeenNthCalledWith(1, undefined, expect.any(Function));
        });

        it('should forward default execution callback', () => {
          expect(customInstallTask).toHaveBeenNthCalledWith(1, undefined, expect.any(Function));
        });
      });

      describe('with ask customInstallTask', () => {
        describe('accepting to run install', () => {
          beforeEach(async () => {
            commitSharedFsTask.mockImplementation(originalCommitSharedFsTask);
            packageManagerInstallTask.mockImplementation(originalPackageManagerInstallTask);
            await helpers
              .run('custom-install', undefined, { createEnv: getCreateEnvironment(BasicEnvironment) })
              .withOptions({ skipInstall: false })
              .withAnswers({ runInstall: true })
              .withGenerators([
                [
                  class extends FeaturesGenerator {
                    constructor(arguments_, options, features) {
                      super(arguments_, options, { ...features, customInstallTask: 'ask' });
                    }

                    packageJsonTask() {
                      this.packageJson.set({ name: 'foo' });
                    }
                  },
                  { namespace: 'custom-install:app' },
                ],
              ]);
          });

          it('should write package.json', () => {
            result.assertFile('package.json');
          });

          it('should call packageManagerInstallTask', () => {
            expect(packageManagerInstallTask).toHaveBeenCalledTimes(1);
            expect(packageManagerInstallTask).toHaveBeenCalledWith(
              expect.objectContaining({
                customInstallTask: 'ask',
              }),
            );
          });

          it('should call execa', () => {
            expect(execa).toHaveBeenCalled();
          });
        });

        describe('declining to run install', () => {
          beforeEach(async () => {
            commitSharedFsTask.mockImplementation(originalCommitSharedFsTask);
            packageManagerInstallTask.mockImplementation(originalPackageManagerInstallTask);
            await helpers
              .run('custom-install', undefined, { createEnv: getCreateEnvironment(BasicEnvironment) })
              .withOptions({ skipInstall: false })
              .withAnswers({ runInstall: false })
              .withGenerators([
                [
                  class extends FeaturesGenerator {
                    constructor(arguments_, options, features) {
                      super(arguments_, options, { ...features, customInstallTask: 'ask' });
                    }

                    packageJsonTask() {
                      this.packageJson.set({ name: 'foo' });
                    }
                  },
                  { namespace: 'custom-install:app' },
                ],
              ]);
          });

          it('should write package.json', () => {
            result.assertFile('package.json');
          });

          it('should call packageManagerInstallTask', () => {
            expect(packageManagerInstallTask).toHaveBeenCalledTimes(1);
            expect(packageManagerInstallTask).toHaveBeenCalledWith(
              expect.objectContaining({
                customInstallTask: 'ask',
              }),
            );
          });

          it('should not call execa', () => {
            expect(execa).not.toHaveBeenCalled();
          });
        });
      });

      describe('with function customInstallTask and custom path', () => {
        let runContext;
        let customInstallTask;
        let installTask;
        beforeEach(async () => {
          customInstallTask = esmocha.fn();
          installTask = (pm, defaultTask) => defaultTask(pm);
          runContext = helpers
            .create('custom-install', undefined, { createEnv: getCreateEnvironment(BasicEnvironment) })
            .withOptions({ skipInstall: false })
            .withGenerators([
              [
                class extends FeaturesGenerator {
                  constructor(arguments_, options) {
                    super(arguments_, options, { customInstallTask });
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
          expect(customInstallTask).not.toHaveBeenCalled();
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
