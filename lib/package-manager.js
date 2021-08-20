'use strict';
const path = require('path');
const debug = require('debug')('yeoman:environment:package-manager');
const preferredPm = require('preferred-pm');

module.exports = cls => class extends cls {
  /**
   * @private
   * Get the destination package.json file.
   *
   * @param {String} [packageJsonAbsolutePath]
   * @return {Vinyl | undefined} a Vinyl file.
   */
  getDestinationPackageJson(packageJsonAbsoluteFile = path.resolve(this.cwd, 'package.json')) {
    return this.sharedFs.get(packageJsonAbsoluteFile);
  }

  /**
   * @private
   * Get the destination package.json commit status.
   *
   * @param {String} [packageJsonAbsolutePath]
   * @return {boolean} package.json commit status.
   */
  isDestinationPackageJsonCommitted(packageJsonAbsoluteFile) {
    const file = this.getDestinationPackageJson(packageJsonAbsoluteFile);
    return file && file.committed;
  }

  /**
   * @private
   * Detect the package manager based on files or use the passed one.
   *
   * @param {String} [dirname]
   * @return {string} package manager.
   */
  async detectPackageManager(dirname = this.cwd) {
    if (this.options.nodePackageManager) {
      return this.options.nodePackageManager;
    }
    const pm = await preferredPm(dirname);
    return pm && pm.name;
  }

  /**
   * Executes package manager install.
   * - checks if package.json was committed.
   * - uses a preferred package manager or try to detect.
   *
   * @param {String} [packageJsonAbsolutePath]
   * @return {Promise<boolean>} Promise true if the install execution suceeded.
   */
  async packageManagerInstallTask(packageJsonAbsolutePath) {
    let dirname;
    let customInstallTask;

    if (packageJsonAbsolutePath) {
      packageJsonAbsolutePath = path.resolve(packageJsonAbsolutePath);
      dirname = path.dirname(packageJsonAbsolutePath);
    } else {
      if (!this.getDestinationPackageJson()) {
        return Promise.resolve(false);
      }

      if (this.compatibilityMode === 'v4') {
        debug('Running in generator < 5 compatibility. Package manager install is done by the generator.');
        return Promise.resolve(false);
      }
      customInstallTask = this.findGeneratorCustomInstallTask();
      if (customInstallTask && typeof customInstallTask !== 'function') {
        debug('Install disabled by customInstallTask');
        return Promise.resolve(false);
      }
      dirname = this.cwd;
    }

    if (!this.isDestinationPackageJsonCommitted(packageJsonAbsolutePath)) {
      this.adapter.log(`
No change to package.json was detected. No package manager install will be executed.`);
      return Promise.resolve(false);
    }

    this.adapter.log(`
Changes to package.json were detected.`);

    if (this.options.skipInstall) {
      this.adapter.log(`Skipping package manager install.
`);
      return Promise.resolve(false);
    }

    let packageManagerName = await this.detectPackageManager(dirname);

    const execPackageManager = () => {
      if (!packageManagerName) {
        packageManagerName = 'npm';
        this.adapter.log('Error detecting the package manager. Falling back to npm.');
      }

      if (!['npm', 'yarn', 'pnpm'].includes(packageManagerName)) {
        this.adapter.log(`${packageManagerName} is not a supported package manager. Run it by yourself.`);
        return Promise.resolve(false);
      }

      this.adapter.log(`
Running ${packageManagerName} install for you to install the required dependencies.`);
      return this.spawnCommand(packageManagerName, ['install'], {cwd: dirname}).then(() => true);
    };

    if (customInstallTask) {
      const result = customInstallTask(packageManagerName, execPackageManager);
      if (!result || !result.then) {
        return Promise.resolve(true);
      }
      return result;
    }

    return execPackageManager();
  }
};
