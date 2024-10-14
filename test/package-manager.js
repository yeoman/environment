import { Module } from 'node:module';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sinon from 'sinon';
import { after, afterEach, beforeEach, describe, esmocha, expect, it } from 'esmocha';
import quibble from 'quibble';

if (!Module.register) {
  throw new Error('Node greater than v18.19.0 or v20.6.0 is required to test this module.');
}

const execa = esmocha.fn();
await quibble.esm('execa', { execa });
const whichPackageManager = esmocha.fn();
await quibble.esm('which-package-manager', { whichPackageManager });

const { packageManagerInstallTask } = await import('../src/package-manager.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const changesToPackageJson = `
Changes to package.json were detected.`;
const skippingInstall = `Skipping package manager install.
`;
const runningPackageManager = pm => `
Running ${pm} install for you to install the required dependencies.`;

describe('environment (package-manager)', () => {
  let adapter;
  let memFs;
  let packageJsonLocation;

  beforeEach(() => {
    adapter = { log: esmocha.fn() };
    execa.mockReturnValue();
    memFs = { get: esmocha.fn() };
    packageJsonLocation = path.join(__dirname, 'fixtures', 'package-manager', 'npm');
    whichPackageManager.mockResolvedValue('npm');
  });

  afterEach(() => {
    esmocha.resetAllMocks();
  });
  after(() => {
    quibble.reset();
  });

  describe('#packageManagerInstallTask()', () => {
    describe('without a package.json', async () => {
      beforeEach(() => packageManagerInstallTask({ adapter, memFs, packageJsonLocation }));

      it('should not log', () => {
        expect(adapter.log).not.toBeCalled();
      });

      it('should not call spawnCommand', () => {
        expect(execa).not.toBeCalled();
      });
    });

    describe('with a package.json', async () => {
      describe('when package.json was not committed', () => {
        beforeEach(async () => {
          memFs.get.mockReturnValue({ committed: false });
          await packageManagerInstallTask({ adapter, memFs, packageJsonLocation });
        });

        it('should log', () => {
          expect(adapter.log).toBeCalledTimes(1);
          expect(adapter.log).toHaveBeenNthCalledWith(
            1,
            `
No change to package.json was detected. No package manager install will be executed.`,
          );
        });

        it('should not call spawnCommand', () => {
          expect(execa).not.toBeCalled();
        });
      });

      describe('when package.json was committed', () => {
        beforeEach(async () => {
          memFs.get = sinon.stub().returns({ committed: true });
        });

        describe('with skipInstall', () => {
          beforeEach(async () => {
            await packageManagerInstallTask({ adapter, memFs, packageJsonLocation, skipInstall: true });
          });

          it('should log', async () => {
            expect(adapter.log).toBeCalledTimes(2);
            expect(adapter.log).toHaveBeenNthCalledWith(1, changesToPackageJson);
            expect(adapter.log).toHaveBeenNthCalledWith(2, skippingInstall);
          });

          it('should not call spawnCommand', () => {
            expect(execa).not.toBeCalled();
          });
        });

        describe('with npm', () => {
          beforeEach(async () => {
            await packageManagerInstallTask({ adapter, memFs, packageJsonLocation });
          });

          it('should log', async () => {
            expect(adapter.log).toBeCalledTimes(2);
            expect(adapter.log).toHaveBeenNthCalledWith(1, changesToPackageJson);
            expect(adapter.log).toHaveBeenNthCalledWith(2, runningPackageManager('npm'));
          });

          it('should execute npm', () => {
            expect(execa).toBeCalled();
            expect(execa).toBeCalledWith('npm', ['install'], expect.any(Object));
          });
        });

        describe('with yarn', () => {
          beforeEach(async () => {
            whichPackageManager.mockResolvedValue('yarn');
            await packageManagerInstallTask({ adapter, memFs, packageJsonLocation });
          });

          it('should log', async () => {
            expect(adapter.log).toBeCalledTimes(2);
            expect(adapter.log).toHaveBeenNthCalledWith(1, changesToPackageJson);
            expect(adapter.log).toHaveBeenNthCalledWith(2, runningPackageManager('yarn'));
          });

          it('should execute yarn', () => {
            expect(execa).toBeCalled();
            expect(execa).toBeCalledWith('yarn', ['install'], expect.any(Object));
          });
        });

        describe('with pnpm', () => {
          beforeEach(async () => {
            whichPackageManager.mockResolvedValue('pnpm');
            await packageManagerInstallTask({ adapter, memFs, packageJsonLocation });
          });

          it('should log', async () => {
            expect(adapter.log).toBeCalledTimes(2);
            expect(adapter.log).toHaveBeenNthCalledWith(1, changesToPackageJson);
            expect(adapter.log).toHaveBeenNthCalledWith(2, runningPackageManager('pnpm'));
          });

          it('should execute pnpm', () => {
            expect(execa).toBeCalled();
            expect(execa).toBeCalledWith('pnpm', ['install'], expect.any(Object));
          });
        });

        describe('with bun', () => {
          beforeEach(async () => {
            whichPackageManager.mockResolvedValue('bun');
            await packageManagerInstallTask({ adapter, memFs, packageJsonLocation });
          });

          it('should log', async () => {
            expect(adapter.log).toBeCalledTimes(2);
            expect(adapter.log).toHaveBeenNthCalledWith(1, changesToPackageJson);
            expect(adapter.log).toHaveBeenNthCalledWith(2, runningPackageManager('bun'));
          });

          it('should execute bun', () => {
            expect(execa).toBeCalled();
            expect(execa).toBeCalledWith('bun', ['install'], expect.any(Object));
          });
        });

        describe('with an unsupported package manager', () => {
          beforeEach(async () => {
            await packageManagerInstallTask({ adapter, memFs, packageJsonLocation, nodePackageManager: 'foo' });
          });

          it('should log', async () => {
            expect(adapter.log).toBeCalledTimes(2);
            expect(adapter.log).toHaveBeenNthCalledWith(1, changesToPackageJson);
            expect(adapter.log).toHaveBeenNthCalledWith(2, 'foo is not a supported package manager. Run it by yourself.');
          });

          it('should not call spawnCommand', () => {
            expect(execa).not.toBeCalled();
          });
        });

        describe('error detecting package manager', () => {
          beforeEach(async () => {
            whichPackageManager.mockResolvedValue();
            await packageManagerInstallTask({ adapter, memFs, packageJsonLocation });
          });

          it('should log', async () => {
            expect(adapter.log).toBeCalledTimes(3);
            expect(adapter.log).toHaveBeenNthCalledWith(1, changesToPackageJson);
            expect(adapter.log).toHaveBeenNthCalledWith(2, 'Error detecting the package manager. Falling back to npm.');
            expect(adapter.log).toHaveBeenNthCalledWith(3, runningPackageManager('npm'));
          });

          it('should not call spawnCommand', () => {
            expect(execa).toBeCalledWith('npm', ['install'], expect.any(Object));
          });
        });
      });
    });
  });
});
