import path, { dirname } from 'node:path';
import createdLogger from 'debug';
import preferredPm from 'preferred-pm';
import { execa } from 'execa';

const debug = createdLogger('yeoman:environment:package-manager');

/**
 * Executes package manager install.
 * - checks if package.json was committed.
 * - uses a preferred package manager or try to detect.
 * @return {Promise<boolean>} Promise true if the install execution suceeded.
 */
/*
  const { customInstallTask } = this.composedStore;
  packageJsonFile: join(this.cwd, 'package.json');

*/
export async function packageManagerInstallTask({ memFs, packageJsonFile, customInstallTask, adapter, nodePackageManager, skipInstall }) {
  /**
   * @private
   * Get the destination package.json file.
   * @return {Vinyl | undefined} a Vinyl file.
   */
  function getDestinationPackageJson() {
    return memFs.get(path.resolve(packageJsonFile));
  }

  /**
   * @private
   * Get the destination package.json commit status.
   * @return {boolean} package.json commit status.
   */
  function isDestinationPackageJsonCommitted() {
    const file = getDestinationPackageJson();
    return file.committed;
  }

  if (!getDestinationPackageJson()) {
    return false;
  }

  if (customInstallTask && typeof customInstallTask !== 'function') {
    debug('Install disabled by customInstallTask');
    return false;
  }

  if (!isDestinationPackageJsonCommitted()) {
    adapter.log(`
No change to package.json was detected. No package manager install will be executed.`);
    return false;
  }

  adapter.log(`
Changes to package.json were detected.`);

  if (skipInstall) {
    adapter.log(`Skipping package manager install.
`);
    return false;
  }

  // eslint-disable-next-line unicorn/no-await-expression-member
  let packageManagerName = nodePackageManager ?? (await preferredPm(dirname(packageJsonFile)))?.name;

  const execPackageManager = async () => {
    if (!packageManagerName) {
      packageManagerName = 'npm';
      adapter.log('Error detecting the package manager. Falling back to npm.');
    }

    if (!['npm', 'yarn', 'pnpm'].includes(packageManagerName)) {
      adapter.log(`${packageManagerName} is not a supported package manager. Run it by yourself.`);
      return false;
    }

    adapter.log(`
Running ${packageManagerName} install for you to install the required dependencies.`);
    await execa(packageManagerName, ['install'], { stdio: 'inherit', cwd: dirname(packageJsonFile) });
    return true;
  };

  if (customInstallTask) {
    const result = customInstallTask(packageManagerName, execPackageManager);
    if (!result || !result.then) {
      return true;
    }

    return result;
  }

  return execPackageManager();
}
