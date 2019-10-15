'use strict';

const debug = require('debug')('yeoman:environment:store');

/**
 * The Generator store
 * This is used to store generator (npm packages) reference and instantiate them when
 * requested.
 * @constructor
 * @private
 */
class Store {
  constructor() {
    this._generators = {};
    this._meta = {};
    // Store packages paths by ns
    this._packagesPaths = {};
  }

  /**
   * Store a module under the namespace key
   * @param {String}          namespace  - The key under which the generator can be retrieved
   * @param {String|Function} generator  - A generator module or a module path
   * @param {String}         packagePath - PackagePath to the generator npm package (optional)
   * @param {String}          [resolved] - The file path to the generator (used only if generator is a module)
   */
  add(namespace, generator, resolved, packagePath) {
    if (typeof generator === 'string') {
      this._storeAsPath(namespace, generator, packagePath);
      return;
    }

    this._storeAsModule(namespace, generator, resolved, packagePath);
  }

  _storeAsPath(namespace, path, packagePath) {
    this._meta[namespace] = {
      resolved: path,
      namespace,
      packagePath
    };

    Object.defineProperty(this._generators, namespace, {
      get() {
        const Generator = require(path);
        return Generator;
      },
      enumerable: true,
      configurable: true
    });
  }

  _storeAsModule(namespace, Generator, resolved = 'unknown', packagePath) {
    this._meta[namespace] = {
      resolved,
      namespace,
      packagePath
    };

    this._generators[namespace] = Generator;
  }

  /**
   * Get the module registered under the given namespace
   * @param  {String} namespace
   * @return {Module}
   */
  get(namespace) {
    const Generator = this._generators[namespace];

    if (!Generator) {
      return;
    }

    return Object.assign(Generator, this._meta[namespace]);
  }

  /**
   * Returns the list of registered namespace.
   * @return {Array} Namespaces array
   */
  namespaces() {
    return Object.keys(this._generators);
  }

  /**
   * Get the stored generators meta data
   * @return {Object} Generators metadata
   */
  getGeneratorsMeta() {
    return this._meta;
  }

  /**
   * Store a package under the namespace key
   * @param {String}     namespace - The key under which the generator can be retrieved
   * @param {String}          path - The package path
   * @param {String} [generatorNS] - Namespace of a generator to register.
   */
  addPackage(packageNS, packagePath) {
    if (this._packagesPaths[packageNS]) {
      // Yo environment allows overriding, so the last added has preference.
      if (this._packagesPaths[packageNS][0] !== packagePath) {
        const packagePaths = this._packagesPaths[packageNS];
        debug('Overriding a package with namespace %s and path %s, with path %s',
          packageNS, this._packagesPaths[packageNS][0], packagePath);
        // Remove old packagePath
        const index = packagePaths.indexOf(packagePath);
        if (index > -1) {
          packagePaths.splice(index, 1);
        }
        packagePaths.splice(0, 0, packagePath);
      }
    } else {
      this._packagesPaths[packageNS] = [packagePath];
    }
  }

  /**
   * Get the stored packages namespaces with paths.
   * @return {Object} Stored packages namespaces with paths.
   */
  getPackagesPaths() {
    return this._packagesPaths;
  }
}

module.exports = Store;
