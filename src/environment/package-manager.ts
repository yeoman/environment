import { join, resolve } from 'node:path';
import createdLogger from 'debug';
import { whichPackageManager } from 'which-package-manager';
import { execa } from 'execa';
import type { MemFsEditorFile } from 'mem-fs-editor';
import type { InputOutputAdapter } from '@yeoman/types';
import type { Store } from 'mem-fs';

const debug = createdLogger('yeoman:environment:package-manager');

export type InstallTask = (nodePackageManager: string | undefined, defaultTask: () => Promise<boolean>) => void | Promise<void>;

export type PackageManagerInstallTaskOptions = {
  memFs: Store<MemFsEditorFile>;
  packageJsonLocation: string;
  adapter: InputOutputAdapter;
  nodePackageManager?: string;
  customInstallTask?: boolean | InstallTask | 'ask';
  skipInstall?: boolean;
};

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
export async function packageManagerInstallTask({
  memFs,
  packageJsonLocation,
  customInstallTask,
  adapter,
  nodePackageManager,
  skipInstall,
}: PackageManagerInstallTaskOptions) {
  debug('Running packageManagerInstallTask');
  packageJsonLocation = resolve(packageJsonLocation);
  /**
   * @private
   * Get the destination package.json file.
   * @return {Vinyl | undefined} a Vinyl file.
   */
  function getDestinationPackageJson() {
    const packageJsonFile = join(packageJsonLocation, 'package.json');

    if (memFs.existsInMemory(packageJsonFile)) {
      return memFs.get(packageJsonFile);
    }
  }

  /**
   * @private
   * Get the destination package.json commit status.
   * @return {boolean} package.json commit status.
   */
  function isDestinationPackageJsonCommitted() {
    const file = getDestinationPackageJson();
    return file?.committed;
  }

  if (!getDestinationPackageJson()) {
    return false;
  }

  if (customInstallTask && typeof customInstallTask !== 'function' && customInstallTask !== 'ask') {
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

  let packageManagerName = nodePackageManager ?? (await whichPackageManager({ cwd: packageJsonLocation }));

  const execPackageManager = async () => {
    if (!packageManagerName) {
      packageManagerName = 'npm';
      adapter.log('Error detecting the package manager. Falling back to npm.');
    }

    if (!['npm', 'yarn', 'pnpm', 'bun'].includes(packageManagerName)) {
      adapter.log(`${packageManagerName} is not a supported package manager. Run it by yourself.`);
      return false;
    }

    adapter.log(`
Running ${packageManagerName} install for you to install the required dependencies.`);
    await execa(packageManagerName, ['install'], { stdio: 'inherit', cwd: packageJsonLocation });
    return true;
  };

  if (typeof customInstallTask === 'function') {
    return customInstallTask(packageManagerName, execPackageManager);
  }
  if (customInstallTask === 'ask') {
    const { runInstall } = await adapter.prompt({
      type: 'confirm',
      name: 'runInstall',
      message: `Do you want to run ${packageManagerName} install now?`,
    });
    if (!runInstall) {
      return false;
    }
  }

  return execPackageManager();
}
