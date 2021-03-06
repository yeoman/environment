'use strict';
/* eslint-disable max-nested-callbacks */
const assert = require('assert');
const path = require('path');
const sinon = require('sinon');

const PackageManager = require('../lib/package-manager')(class {});

describe('environment (package-manager)', () => {
  let packageManager;

  beforeEach(() => {
    packageManager = new PackageManager();
    packageManager.adapter = {
      log: sinon.stub()
    };
    packageManager.spawnCommand = sinon.stub().returns(Promise.resolve());
    packageManager.options = {};
    packageManager.sharedFs = {get: sinon.stub().returns()};
    packageManager.cwd = path.join(__dirname, 'fixtures', 'package-manager', 'npm');
  });

  afterEach(() => {
    delete packageManager.compatibilityMode;
  });

  describe('#packageManagerInstallTask()', () => {
    describe('without a package.json', async () => {
      beforeEach(() => {
        return packageManager.packageManagerInstallTask();
      });

      it('should not log', () => {
        assert(packageManager.adapter.log.notCalled);
      });

      it('should not call spawnCommand', () => {
        assert(packageManager.spawnCommand.notCalled);
      });
    });

    describe('with a package.json', async () => {
      beforeEach(() => {
        packageManager.sharedFs.get = sinon.stub().returns({});
      });
      describe('running generator < 5', async () => {
        beforeEach(() => {
          packageManager.compatibilityMode = 'v4';
          return packageManager.packageManagerInstallTask();
        });

        it('should not call spawnCommand', () => {
          assert(packageManager.spawnCommand.notCalled);
        });
      });

      describe('when package.json was not committed', () => {
        beforeEach(async () => {
          return packageManager.packageManagerInstallTask();
        });

        it('should log', () => {
          assert(packageManager.adapter.log.calledOnce);
          assert(packageManager.adapter.log.getCall(0).calledWith(`
No change to package.json was detected. No package manager install will be executed.`));
        });

        it('should not call spawnCommand', () => {
          assert(packageManager.spawnCommand.notCalled);
        });
      });

      describe('when package.json was committed', () => {
        beforeEach(async () => {
          packageManager.sharedFs.get = sinon.stub().returns({committed: true});
        });

        describe('with skipInstall', () => {
          beforeEach(async () => {
            packageManager.options = {skipInstall: true};
            await packageManager.packageManagerInstallTask();
          });

          it('should log', async () => {
            assert(packageManager.adapter.log.calledTwice);
            assert(packageManager.adapter.log.getCall(0).calledWith(`
Changes to package.json were detected.`));
            assert(packageManager.adapter.log.getCall(1).calledWith(`Skipping package manager install.
`));
          });

          it('should not call spawnCommand', () => {
            assert(packageManager.spawnCommand.notCalled);
          });
        });

        describe('with npm', () => {
          beforeEach(async () => {
            packageManager.cwd = path.join(__dirname, 'fixtures', 'package-manager', 'npm');
            await packageManager.packageManagerInstallTask();
          });

          it('should log', async () => {
            assert(packageManager.adapter.log.calledTwice);
            assert(packageManager.adapter.log.getCall(0).calledWith(`
Changes to package.json were detected.`));
            assert(packageManager.adapter.log.getCall(1).calledWith(`
Running npm install for you to install the required dependencies.`));
          });

          it('should execute npm', () => {
            assert(packageManager.spawnCommand.calledOnce);
            assert(packageManager.spawnCommand.getCall(0).calledWith('npm', ['install']));
          });
        });

        describe('with yarn', () => {
          beforeEach(async () => {
            packageManager.cwd = path.join(__dirname, 'fixtures', 'package-manager', 'yarn');
            await packageManager.packageManagerInstallTask();
          });

          it('should log', async () => {
            assert(packageManager.adapter.log.calledTwice);
            assert(packageManager.adapter.log.getCall(0).calledWith(`
Changes to package.json were detected.`));
            assert(packageManager.adapter.log.getCall(1).calledWith(`
Running yarn install for you to install the required dependencies.`));
          });

          it('should execute yarn', () => {
            assert(packageManager.spawnCommand.calledOnce);
            assert(packageManager.spawnCommand.getCall(0).calledWith('yarn', ['install']));
          });
        });

        describe('with pnpm', () => {
          beforeEach(async () => {
            packageManager.cwd = path.join(__dirname, 'fixtures', 'package-manager', 'pnpm');
            await packageManager.packageManagerInstallTask();
          });

          it('should log', async () => {
            assert(packageManager.adapter.log.calledTwice);
            assert(packageManager.adapter.log.getCall(0).calledWith(`
Changes to package.json were detected.`));
            assert(packageManager.adapter.log.getCall(1).calledWith(`
Running pnpm install for you to install the required dependencies.`));
          });

          it('should execute pnpm', () => {
            assert(packageManager.spawnCommand.calledOnce);
            assert(packageManager.spawnCommand.getCall(0).calledWith('pnpm', ['install']));
          });
        });

        describe('with an unsupported package manager', () => {
          beforeEach(async () => {
            packageManager.cwd = path.join(__dirname, 'fixtures', 'package-manager', 'npm');
            packageManager.options = {nodePackageManager: 'foo'};
            await packageManager.packageManagerInstallTask();
          });

          it('should log', async () => {
            assert(packageManager.adapter.log.calledTwice);
            assert(packageManager.adapter.log.getCall(0).calledWith(`
Changes to package.json were detected.`));
            assert(packageManager.adapter.log.getCall(1).calledWith('foo is not a supported package manager. Run it by yourself.'));
          });

          it('should not call spawnCommand', () => {
            assert(packageManager.spawnCommand.notCalled);
          });
        });

        describe('error detecting package manager', () => {
          beforeEach(async () => {
            packageManager.cwd = path.join(__dirname, 'fixtures', 'package-manager', 'npm');
            packageManager.detectPackageManager = sinon.stub().returns(null);
            await packageManager.packageManagerInstallTask();
          });

          it('should log', async () => {
            assert.equal(packageManager.adapter.log.callCount, 3);
            assert(packageManager.adapter.log.getCall(0).calledWith(`
Changes to package.json were detected.`));
            assert(packageManager.adapter.log.getCall(1).calledWith('Error detecting the package manager. Falling back to npm.'));
            assert(packageManager.adapter.log.getCall(2).calledWith(`
Running npm install for you to install the required dependencies.`));
          });

          it('should not call spawnCommand', () => {
            assert(packageManager.spawnCommand.getCall(0).calledWith('npm', ['install']));
          });
        });
      });
    });
  });
});
/* eslint-enable max-nested-callbacks */
