import { pathToFileURL } from 'node:url';
import { extname, join } from 'node:path';
import { toNamespace } from '@yeoman/namespace';
import type { BaseEnvironment, BaseGenerator, GetGeneratorConstructor } from '@yeoman/types';
import createDebug from 'debug';

const debug = createDebug('yeoman:environment:store');

type BaseMeta = {
  /** The key under which the generator can be retrieved */
  namespace: string;
  /** The file path to the generator (used only if generator is a module) */
  resolved?: string;
  /** PackagePath to the generator npm package */
  packagePath?: string;
};

type GeneratorMeta = BaseMeta & {
  packageNamespace?: string;
  /** Import and find the Generator Class */
  importGenerator: () => Promise<GetGeneratorConstructor>;
  /** Import the module `import(meta.resolved)` */
  importModule?: () => Promise<unknown>;
  /** Intantiate the Generator `env.instantiate(await meta.importGenerator())` */
  instantiate: (args?: string[], options?: any) => Promise<BaseGenerator>;
  /** Intantiate the Generator passing help option */
  instantiateHelp: () => Promise<BaseGenerator>;
};

/**
 * The Generator store
 * This is used to store generator (npm packages) reference and instantiate them when
 * requested.
 * @constructor
 * @private
 */
class Store {
  private readonly _meta: Record<string, GeneratorMeta> = {};
  // Store packages paths by ns
  private readonly _packagesPaths: Record<string, string[]> = {};
  // Store packages ns
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private readonly _packagesNS: string[] = [];

  constructor(private readonly env: BaseEnvironment) {}

  /**
   * Store a module under the namespace key
   * @param meta
   * @param generator - A generator module or a module path
   */
  add(meta: BaseMeta, Generator?: unknown): GeneratorMeta {
    if (typeof meta.resolved === 'string' && !extname(meta.resolved)) {
      meta.resolved = join(meta.resolved, 'index.js');
    }

    let importModule: (() => Promise<unknown>) | undefined;
    if (!Generator) {
      if (!meta.resolved) {
        throw new Error(`Generator Stub or resolved path is required for ${meta.namespace}`);
      }

      importModule = async () => import(pathToFileURL(meta.resolved!).href);
    }

    const importGenerator = async () => this._getGenerator(importModule ? await importModule() : Generator, meta);
    const instantiate = async (args: string[] = [], options: any = {}) => this.env.instantiate(await importGenerator(), args, options);
    const instantiateHelp = async () => instantiate([], { help: true });
    const { packageNamespace } = toNamespace(meta.namespace) ?? {};

    const generatorMeta = {
      ...meta,
      importGenerator,
      importModule,
      instantiate,
      instantiateHelp,
      packageNamespace,
    };
    this._meta[meta.namespace] = generatorMeta;

    if (packageNamespace) {
      this.addPackageNamespace(packageNamespace);
      if (meta.packagePath) {
        this.addPackage(packageNamespace, meta.packagePath);
      }
    }

    return generatorMeta;
  }

  /**
   * Get the module registered under the given namespace
   * @param  {String} namespace
   * @return {Module}
   */
  async get(namespace: string): Promise<GetGeneratorConstructor> {
    return this.getMeta(namespace)?.importGenerator();
  }

  /**
   * Get the module registered under the given namespace
   * @param  {String} namespace
   * @return {Module}
   */
  getMeta(namespace: string) {
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
  addPackage(packageNS: string, packagePath: string) {
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
  addPackageNamespace(packageNS: string) {
    if (!this._packagesNS.includes(packageNS)) {
      this._packagesNS.push(packageNS);
    }
  }

  /**
   * Get the stored packages namespaces.
   * @return {Array} Stored packages namespaces.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  getPackagesNS(): string[] {
    return this._packagesNS;
  }

  _getGenerator = async (module: any, meta: BaseMeta) => {
    // CJS is imported in default, for backward compatibility we support a Generator exported as `module.exports = { default }`
    const generatorFactory = module.createGenerator ?? module.default?.createGenerator ?? module.default?.default?.createGenerator;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const Generator = (await generatorFactory?.(this.env)) ?? module.default?.default ?? module.default ?? module;
    if (typeof Generator !== 'function') {
      throw new TypeError("The generator doesn't provides a constructor.");
    }

    Object.assign(Generator, meta);
    return Generator;
  };
}

export default Store;
