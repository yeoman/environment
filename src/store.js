import { pathToFileURL } from 'node:url';
import { extname, join } from 'node:path';
import createDebug from 'debug';

const debug = createDebug('yeoman:environment:store');

/**
 * The Generator store
 * This is used to store generator (npm packages) reference and instantiate them when
 * requested.
 * @constructor
 * @private
 */
class Store {
  constructor(env) {
    this.env = env;
    this._meta = {};
    // Store packages paths by ns
    this._packagesPaths = {};
    // Store packages ns
    this._packagesNS = [];
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
      resolved = generator;
      if (!extname(resolved)) {
        resolved = join(resolved, 'index.js');
      }
      this._store({ namespace, resolved, packagePath });
      return;
    }

    this._store({ namespace, resolved, packagePath }, generator);
  }

  _store(meta, Generator) {
    let importModule;
    if (!Generator) {
      importModule = async () => import(pathToFileURL(meta.resolved).href);
    }
    const importGenerator = async () => this._getGenerator(importModule ? await importModule() : Generator, meta);
    const instantiate = async (args, options) => this.env.instantiate(await importGenerator(), args, options);
    const instantiateHelp = async () => instantiate([], { help: true });

    this._meta[meta.namespace] = {
      ...meta,
      importGenerator,
      importModule,
      instantiate,
      instantiateHelp,
    };
  }

  /**
   * Get the module registered under the given namespace
   * @param  {String} namespace
   * @return {Module}
   */
  async get(namespace) {
    const meta = this.getMeta(namespace);

    if (!meta) {
      return;
    }

    return meta.importGenerator();
  }

  /**
   * Get the module registered under the given namespace
   * @param  {String} namespace
   * @return {Module}
   */
  getMeta(namespace) {
    return this._meta[namespace];
  }

  /**
   * Returns the list of registered namespace.
   * @return {Array} Namespaces array
   */
  namespaces() {
    return Object.keys(this._meta);
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
   * @param {String}     packageNS - The key under which the generator can be retrieved
   * @param {String}   packagePath - The package path
   */
  addPackage(packageNS, packagePath) {
    if (this._packagesPaths[packageNS]) {
      // Yo environment allows overriding, so the last added has preference.
      if (this._packagesPaths[packageNS][0] !== packagePath) {
        const packagePaths = this._packagesPaths[packageNS];
        debug(
          'Overriding a package with namespace %s and path %s, with path %s',
          packageNS,
          this._packagesPaths[packageNS][0],
          packagePath,
        );
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

  /**
   * Store a package ns
   * @param {String} packageNS - The key under which the generator can be retrieved
   */
  addPackageNS(packageNS) {
    if (!this._packagesNS.includes(packageNS)) {
      this._packagesNS.push(packageNS);
    }
  }

  /**
   * Get the stored packages namespaces.
   * @return {Array} Stored packages namespaces.
   */
  getPackagesNS() {
    return this._packagesNS;
  }

  _getGenerator = async (module, meta) => {
    // CJS is imported in default, for backward compatibility we support a Generator exported as `module.exports = { default }`
    const generatorFactory = module.createGenerator ?? module.default?.createGenerator ?? module.default?.default?.createGenerator;
    const Generator = (await generatorFactory?.(this.env)) ?? module.default?.default ?? module.default ?? module;
    if (typeof Generator !== 'function') {
      throw new TypeError("The generator doesn't provides a constructor.");
    }

    Object.assign(Generator, meta);
    return Generator;
  };
}

export default Store;
