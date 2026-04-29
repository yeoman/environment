import { after, afterEach, before, beforeEach, describe, esmocha, expect, it } from 'esmocha';
import type { BaseGeneratorConstructor, GeneratorFeatures, GeneratorOptions } from '@yeoman/types';
import helpers, { getCreateEnv, result } from './helpers.ts';
import { greaterThan5 } from './generator-versions.ts';
import { createHelpers } from 'yeoman-test';

const commitModule = await import('../src/commit.ts');
const { commitSharedFsTask: originalCommitSharedFsTask } = commitModule;
const { commitSharedFsTask } = await esmocha.mock('../src/commit.ts', Promise.resolve(commitModule));
const { execa } = await esmocha.mock('execa', import('execa'));
const packageManagerModule = await import('../src/package-manager.ts');
const { packageManagerInstallTask: originalPackageManagerInstallTask } = packageManagerModule;
const { packageManagerInstallTask } = await esmocha.mock('../src/package-manager.ts', Promise.resolve(packageManagerModule));
const { default: BasicEnvironment } = await import('../src/environment-base.ts');

const helperWithMockedFeatures = createHelpers({
  createEnv: getCreateEnv(BasicEnvironment),
});

for (const generatorVersion of greaterThan5) {
  const { default: Generator } = await import(generatorVersion);
  const FeaturesGenerator = Generator as BaseGeneratorConstructor;

  const createGeneratorClassWithFeatures = (customFeatures: GeneratorFeatures): typeof Generator =>
    class extends FeaturesGenerator {
      constructor(arguments_?: string[], options?: GeneratorOptions, features?: GeneratorFeatures) {
        super(arguments_, options, { ...features, ...customFeatures });
      }
    };

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
          await helperWithMockedFeatures
            .run('custom-commit')
            .withOptions({ skipInstall: true })
            .withGenerators([[helpers.createMockedGenerator(Generator), { namespace: 'custom-commit:app' }]]);
        });

        it('should call commitSharedFs', () => {
          expect(commitSharedFsTask).toHaveBeenCalledTimes(1);
        });
      });

      describe('with true customCommitTask', () => {
        before(async () => {
          await helperWithMockedFeatures
            .run('custom-commit')
            .withOptions({ skipInstall: true })
            .withGenerators([
              [
                helpers.createMockedGenerator(createGeneratorClassWithFeatures({ customCommitTask: true })),
                { namespace: 'custom-commit:app' },
              ],
            ]);
        });

        it('should not call commitSharedFs', () => {
          expect(commitSharedFsTask).not.toHaveBeenCalled();
        });
      });

      describe('with function customCommitTask', () => {
        let commitSharedFsMock: ReturnType<typeof esmocha.fn>;
        let customCommitTask: ReturnType<typeof esmocha.fn>;
        beforeEach(async () => {
          customCommitTask = esmocha.fn();
          await helpers
            .run('custom-commit')
            .withOptions({ skipInstall: true })
            .withGenerators([
              [
                helpers.createMockedGenerator(
                  class extends FeaturesGenerator {
                    constructor(arguments_?: string[], options?: GeneratorOptions, features?: GeneratorFeatures) {
                      super(arguments_, options, { ...features, customCommitTask });
                    }
                  },
                ),
                { namespace: 'custom-commit:app' },
              ],
            ])
            .withEnvironment((environment: any) => {
              commitSharedFsMock = esmocha.fn().mockReturnValue(Promise.resolve());
              environment.commitSharedFs = commitSharedFsMock;
            });
        });

        it('should not call commitSharedFs', () => {
          expect(commitSharedFsMock).not.toHaveBeenCalled();
        });

        it('should call customCommitTask', () => {
          expect(customCommitTask).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('customInstallTask feature', () => {
      describe('without customInstallTask', () => {
        beforeEach(async () => {
          await helperWithMockedFeatures
            .run('custom-install')
            .withOptions({ skipInstall: false })
            .withGenerators([
              [
                class extends Generator {
                  packageJsonTask() {
                    this.packageJson.set({ name: 'foo' });
                  }
                },
                { namespace: 'custom-install:app' },
              ],
            ]);
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
        beforeEach(async () => {
          await helperWithMockedFeatures
            .run('custom-install')
            .withOptions({ skipInstall: false })
            .withGenerators([
              [
                class extends Generator {
                  packageJsonTask() {
                    this.env.compatibilityMode = 'v4';
                    this.packageJson.set({ name: 'foo' });
                  }
                },
                { namespace: 'custom-install:app' },
              ],
            ]);
        });

        it('should not call packageManagerInstallTask', () => {
          expect(packageManagerInstallTask).not.toHaveBeenCalled();
        });
      });

      describe('with true customInstallTask', () => {
        before(async () => {
          await helperWithMockedFeatures
            .run('custom-install')
            .withOptions({ skipInstall: false })
            .withGenerators([
              [
                class extends Generator {
                  constructor(arguments_?: string[], options?: GeneratorOptions, features?: GeneratorFeatures) {
                    super(arguments_, options, { ...features, customInstallTask: true });
                  }

                  packageJsonTask() {
                    this.packageJson.set({ name: 'foo' });
                  }
                },
                { namespace: 'custom-install:app' },
              ],
            ]);
        });

        it('should not call execa', () => {
          expect(execa).not.toHaveBeenCalled();
        });
      });

      describe('with function customInstallTask', () => {
        let customInstallTask: ReturnType<typeof esmocha.fn>;
        beforeEach(async () => {
          customInstallTask = esmocha.fn();
          await helpers
            .run('custom-install')
            .withOptions({ skipInstall: false })
            .withGenerators([
              [
                class extends Generator {
                  constructor(arguments_?: string[], options?: GeneratorOptions, features?: GeneratorFeatures) {
                    super(arguments_, options, { ...features, customInstallTask });
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
            await helperWithMockedFeatures
              .run('custom-install')
              .withOptions({ skipInstall: false })
              .withAnswers({ runInstall: true })
              .withGenerators([
                [
                  class extends Generator {
                    constructor(arguments_?: string[], options?: GeneratorOptions, features?: GeneratorFeatures) {
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
            await helperWithMockedFeatures
              .run('custom-install')
              .withOptions({ skipInstall: false })
              .withAnswers({ runInstall: false })
              .withGenerators([
                [
                  class extends Generator {
                    constructor(arguments_?: string[], options?: GeneratorOptions, features?: GeneratorFeatures) {
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
        let customInstallTask: ReturnType<typeof esmocha.fn>;
        let installTask: (pm: any, defaultTask: (pm: any) => unknown) => unknown;
        beforeEach(async () => {
          customInstallTask = esmocha.fn();
          installTask = (pm, defaultTask) => defaultTask(pm);
          await helperWithMockedFeatures
            .run('custom-install')
            .withOptions({ skipInstall: false })
            .withGenerators([
              [
                class extends Generator {
                  constructor(arguments_?: string[], options?: GeneratorOptions, features?: GeneratorFeatures) {
                    super(arguments_, options, { ...features, customInstallTask });
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
