/** @module env/repository */
'use strict';
const fs = require('fs');
const path = require('path');
const semver = require('semver');
const debug = require('debug')('yeoman:environment:repository');
const execa = require('execa');

const REPOSITORY_FOLDER = '.yo-repository';

module.exports = {
  /**
   * @private
   * @property
   * Repository absolute path (npm --prefix).
   */
  repositoryPath: path.resolve(REPOSITORY_FOLDER),

  /**
   * @private
   * @property nodeModulesPath
   * Path to the repository's node_modules.
   */
  get nodeModulesPath() {
    if (!this._nodeModulesPath) {
      this._nodeModulesPath = this.runPackageManager('root').stdout;
    }
    return this._nodeModulesPath;
  },

  /**
   * @private
   * @method
   * Create the repositoryPath if it doesn't exists.
   */
  createRepositoryFolder() {
    if (!fs.existsSync(this.repositoryPath)) {
      fs.mkdirSync(this.repositoryPath);
    }
  },

  /**
   * @private
   * @method
   * Resolve the package name module path inside the [repository path]{@link repository.repositoryPath}
   * @param {String} packageName - Package name. If packageName is a absolute path then modulePath is joined to it.
   * @param {String} [modulePath] - Path to a module inside the package path.
   * @returns {String} Absolute module path.
   */
  resolvePackagePath(packageName = '', modulePath = '') {
    if (path.isAbsolute(packageName)) {
      return path.join(packageName, modulePath);
    }
    return path.join(this.nodeModulesPath, packageName, modulePath);
  },

  /**
   * @private
   * @method
   * Remove the package from node's cache, necessary for a reinstallation.
   * Removes only package.json by default, it's used to version verification.
   * Removes only cache of the repository's packages.
   * @param {String} packageName - Package name.
   * @param {Boolean} [force=false] - If true removes every cache the package.
   * @throw Error if force === false and any file other the package.json is loaded.
   */
  cleanupPackageCache(packageName, force = false) {
    if (!packageName) {
      throw new Error('You must provide a packageName');
    }
    debug('Cleaning cache of %s', packageName);
    const packagePath = this.resolvePackagePath(packageName);
    const toCleanup = Object.keys(require.cache).filter(cache => cache.startsWith(packagePath));
    if (!force && toCleanup.find(cache => !cache.endsWith('package.json'))) {
      throw new Error(`Package ${packageName} already loaded`);
    }

    toCleanup.forEach(cache => {
      delete require.cache[cache];
    });
  },

  /**
   * @private
   * @method
   * Run the packageManager.
   * @param {String} cmd - The command.
   * @param {String[]} [args] - Additional arguments.
   * @param {Object} [options] - Config to be passed to execa.
   */
  runPackageManager(cmd, args, options) {
    const allArgs = [cmd, '-g', '--prefix', this.repositoryPath];
    if (args) {
      allArgs.push(...args);
    }
    debug('Running npm with args %o', allArgs);
    return execa.sync('npm', allArgs, options);
  },

  /**
   * @private
   * @method
   * Install a package into the repository.
   * @param {String} packageName - Package name.
   * @param {String} version - Version of the package.
   * @returns {String} Package path.
   * @throws Error.
   */
  installPackage(packageName, version) {
    const packagePath = this.resolvePackagePath(packageName);
    const installedVersion = this.getPackageVersion(packagePath);
    // Installs the package if no version is installed or the version is provided and don't match the installed version.
    if (installedVersion === undefined || (version && (!semver.validRange(version) || !semver.satisfies(installedVersion, version)))) {
      debug(`Found ${packageName} version ${installedVersion} but requires version ${version}`);
      this.cleanupPackageCache(packagePath, packageName);

      const pkgs = {};
      if (packageName === 'yeoman-environment' && version && (!semver.validRange(version) || semver.lt(semver.minVersion(version), '2.9.0'))) {
        // Workaround buggy dependencies.
        pkgs['rxjs-compat'] = '^6.0.0';
      }

      pkgs[packageName] = version;
      const success = this.installPackages(pkgs) === true;
      if (!success) {
        throw new Error(`Error installing package ${packageName}, version ${version}.`);
      }
      debug(`Package ${packageName} sucessfully installed`);
    } else {
      debug(`Using ${packageName} installed version ${installedVersion}`);
    }
    return packagePath;
  },

  /**
   * @private
   * @method
   * Install packages.
   * @param {Object} packages - Packages to be installed.
   * @returns {Boolean}
   * @example
   * repository.installPackages({ 'yeoman-environment': '2.3.0' });
   */
  installPackages(packages) {
    this.createRepositoryFolder();
    debug('Installing packages %o', packages);
    const packagesArgs = Object.entries(packages).map(([key, value]) => value ? (semver.validRange(value) ? `${key}@${value}` : value) : key);
    const result = this.runPackageManager('install', [...packagesArgs], {stdio: 'inherit'});
    return result.exitCode === 0;
  },

  /**
   * @private
   * @method
   * Get the installed package version.
   * @param {String} packageName - Package name.
   * @returns {String|undefined} Package version or undefined.
   */
  getPackageVersion(packageName) {
    try {
      const packageJson = this.resolvePackagePath(packageName, 'package.json');
      return require(packageJson).version;
    } catch (_) {
      return undefined;
    }
  },

  /**
   * @private
   * @method
   * Require a module from the repository.
   * @param {String} packageName - Package name.
   * @param {String} version - Version of the package. Verify version and force installation.
   * @param {String} modulePath - Package name.
   * @returns {Object} Module.
   * @throws Error.
   */
  requireModule(packageName, version, modulePath = '') {
    const packagePath = this.installPackage(packageName, version);
    const absolutePath = this.resolvePackagePath(packagePath, modulePath);
    debug('Loading module at %s', absolutePath);
    return require(absolutePath);
  }
};
