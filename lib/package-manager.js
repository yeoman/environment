'use strict';
const path = require('path');
const debug = require('debug')('yeoman:environment:package-manager');
const preferredPm = require('preferred-pm');

module.exports = cls => class extends cls {
  /**
   * @private
   * Get the destination package.json file.
   * @return {Vinyl | undefined} a Vinyl file.
   */
  getDestinationPackageJson() {
    return this.sharedFs.get(path.resolve(this.cwd, 'package.json'));
  }

  /**
   * @private
   * Detect the package manager based on files or use the passed one.
   * @return {string} package manager.
   */
  async detectPackageManager() {
    if (this.options.nodePackageManager) {
      return this.options.nodePackageManager;
    }
    const pm = await preferredPm(this.cwd);
    return pm && pm.name;
  }

  /**
   * Executes package manager install.
   * - checks if package.json was committed.
   * - uses a preferred package manager or try to detect.
   * @return {Promise<boolean>} Promise true if the install execution suceeded.
   */
  async packageManagerInstallTask() {
    const file = this.getDestinationPackageJson();
    if (!file) {
      return false;
    }
    if (this.compatibilityMode === 'v4') {
      debug('Running in generator < 5 compatibility. Package manager install is done by the generator.');
      return false;
    }
    if (!file.committed) {
      this.adapter.log(`
No change to package.json was detected. No package manager install will be executed.`);
      return false;
    }

    this.adapter.log(`
Changes to package.json were detected.`);

    if (this.options.skipInstall) {
      this.adapter.log(`Skipping package manager install.
`);
      return false;
    }

    const packageManagerName = await this.detectPackageManager();
    if (!packageManagerName) {
      this.adapter.log('Error detecting the package manager. Run it by yourself.');
      return false;
    }

    if (!['npm', 'yarn', 'pnpm'].includes(packageManagerName)) {
      this.adapter.log(`${packageManagerName} is not a supported package manager. Run it by yourself.`);
      return false;
    }

    this.adapter.log(`
Running ${packageManagerName} install for you to install the required dependencies.`);
    return this.spawnCommand(packageManagerName, ['install']).then(() => true);
  }
};
