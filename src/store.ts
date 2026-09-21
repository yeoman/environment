import { pathToFileURL } from 'node:url';
import { basename, extname, join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { toNamespace } from '@yeoman/namespace';
import type {
  BaseEnvironment,
  BaseGenerator,
  BaseGeneratorConstructorMeta,
  BaseGeneratorMeta,
  GeneratorMeta,
  GetGeneratorConstructor,
} from '@yeoman/types';
import createDebug from 'debug';
import { type LookupOptions, lookupGenerators } from './generator-lookup.ts';
import { asNamespace, defaultLookups } from './util/namespace.ts';

const debug = createDebug('yeoman:environment:store');
const require = createRequire(import.meta.url);

export type StoreLookupOptions = LookupOptions & {
  registerToScope?: string;
  customizeNamespace?: (ns?: string) => string | undefined;
};

/** A generator found by a lookup, `registered` tells if it was added to the store. */
export type StoreLookupGeneratorMeta = (StoreGeneratorMeta & { registered: true }) | (Required<BaseGeneratorMeta> & { registered: false });

/**
 * Generator meta as the store keeps it: not bound to an environment. `importGenerator`, `instantiate` and
 * `instantiateHelp` take the environment to use, falling back to the one the store was created with, if any.
 */
export type StoreGeneratorMeta = Omit<GeneratorMeta, 'importGenerator' | 'instantiate' | 'instantiateHelp'> & {
  importGenerator: <G extends BaseGenerator = BaseGenerator>(
    environment?: BaseEnvironment,
  ) => Promise<GetGeneratorConstructor<G> & BaseGeneratorConstructorMeta> | (GetGeneratorConstructor<G> & BaseGeneratorConstructorMeta);
  instantiate: <G extends BaseGenerator = BaseGenerator>(arguments_?: string[], options?: any, environment?: BaseEnvironment) => Promise<G>;
  instantiateHelp: <G extends BaseGenerator = BaseGenerator>(environment?: BaseEnvironment) => Promise<G>;
};

/**
 * The Generator store
 * This is used to store generator (npm packages) reference and instantiate them when
 * requested.
 *
 * A store does not need an environment: generators are looked up and registered on their own, and the environment
 * that imports or instantiates one is passed at that time. The same store can then serve several environments.
 */
export default class Store {
  private readonly _meta: Record<string, StoreGeneratorMeta> = {};
  // Cache parsed package.json by packagePath
  private readonly _packagesJson = new Map<string, unknown>();
  // Store packages paths by ns
  private readonly _packagesPaths: Record<string, string[]> = {};
  // Store packages ns
  private readonly _packagesNS: string[] = [];

  /** The environment used when none is passed to `importGenerator` or `instantiate`. */
  readonly environment?: BaseEnvironment;

  constructor(environment?: BaseEnvironment) {
    this.environment = environment;
  }

  /**
   * Store a module under the namespace key
   * @param meta
   * @param generator - A generator module or a module path
   */
  add<M extends BaseGeneratorMeta>(meta: M, Generator?: unknown): StoreGeneratorMeta & M {
    if (typeof meta.resolved === 'string') {
      if (extname(meta.resolved)) {
        meta.resolved = join(meta.resolved);
      } else {
        try {
          // Resolve if meta.resolved is a package path.
          meta.resolved = require.resolve(meta.resolved);
        } catch {
          // Import must be a file, append index.js to directories
          meta.resolved = join(meta.resolved, 'index.js');
        }
      }
    }

    if (meta.packagePath) {
      meta.packagePath = join(meta.packagePath);
    }

    let importModule: (() => Promise<unknown>) | undefined;
    if (!Generator) {
      if (!meta.resolved) {
        throw new Error(`Generator Stub or resolved path is required for ${meta.namespace}`);
      }

      importModule = () => {
        try {
          return require(meta.resolved!);
        } catch (error: any) {
          if (error.code === 'ERR_REQUIRE_ESM' || error.code === 'ERR_REQUIRE_ASYNC_MODULE') {
            return import(pathToFileURL(meta.resolved!).href);
          }
          throw error;
        }
      };
    }

    let moduleImport: Promise<void> | undefined;
    const importGeneratorModule = (): Promise<void> | undefined => {
      if (!importModule || Generator) {
        return undefined;
      }

      if (moduleImport) {
        return moduleImport;
      }

      const maybeModule = importModule();
      if ((maybeModule as any).then) {
        moduleImport = maybeModule
          .then((module_: any) => {
            Generator = module_;
          })
          .finally(() => {
            moduleImport = undefined;
          });
        return moduleImport;
      }

      Generator = maybeModule;
      return undefined;
    };

    type GeneratorConstructor = GetGeneratorConstructor<any> & BaseGeneratorConstructorMeta;
    // eslint-disable-next-line prefer-const
    let generatorMeta: (StoreGeneratorMeta & M) | undefined;
    // A generator exported as a class is the same for every environment.
    let generatorConstructor: GeneratorConstructor | undefined;
    // A `createGenerator(environment)` factory builds the generator for an environment, so its result is kept by environment.
    const createdGenerators = new WeakMap<BaseEnvironment, GeneratorConstructor | Promise<GeneratorConstructor>>();

    const getGenerator = (environment?: BaseEnvironment): GeneratorConstructor | Promise<GeneratorConstructor> => {
      if (generatorConstructor) {
        return generatorConstructor;
      }

      const factory = this.getFactory(Generator);
      if (typeof factory !== 'function') {
        generatorConstructor = this._getGenerator(Generator, meta, generatorMeta);
        return generatorConstructor;
      }

      if (!environment) {
        throw new Error(`An environment is required to create the generator ${meta.namespace}`);
      }

      const created = createdGenerators.get(environment);
      if (created) {
        return created;
      }

      const creating = Promise.resolve(factory(environment)).then((module_: any) => {
        const generator = this._getGenerator(module_, meta, generatorMeta);
        createdGenerators.set(environment, generator);
        return generator;
      });
      createdGenerators.set(environment, creating);
      return creating;
    };

    const importGenerator = ((environment: BaseEnvironment | undefined = this.environment) => {
      const importing = importGeneratorModule();
      return importing ? importing.then(() => getGenerator(environment)) : getGenerator(environment);
    }) as StoreGeneratorMeta['importGenerator'];

    const instantiate: StoreGeneratorMeta['instantiate'] = async <G extends BaseGenerator>(
      arguments_: string[] = [],
      options: any = {},
      environment: BaseEnvironment | undefined = this.environment,
    ) => {
      if (!environment) {
        throw new Error(`An environment is required to instantiate the generator ${meta.namespace}`);
      }

      return environment.instantiate<G>(await importGenerator<G>(environment), { generatorArgs: arguments_, generatorOptions: options });
    };

    const instantiateHelp: StoreGeneratorMeta['instantiateHelp'] = async <G extends BaseGenerator>(environment?: BaseEnvironment) =>
      instantiate<G>([], { help: true }, environment);

    const getPackageJson: GeneratorMeta['getPackageJson'] = <T = Record<string, any>>(): T | undefined =>
      this.getPackageJson<T>(meta.packagePath);

    const { packageNamespace } = toNamespace(meta.namespace) ?? {};

    generatorMeta = {
      ...meta,
      importGenerator,
      importModule,
      instantiate,
      instantiateHelp,
      getPackageJson,
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
   * Search for generators and their sub generators, and add them to the store.
   *
   * A generator is a `:lookup/:name/index.js` file placed inside an npm package.
   *
   * Defaults lookups are:
   *   - ./
   *   - generators/
   *   - lib/generators/
   *
   * So this index file `node_modules/generator-dummy/lib/generators/yo/index.js` would be
   * registered as `dummy:yo` generator.
   */
  async lookup(options?: StoreLookupOptions): Promise<StoreLookupGeneratorMeta[]> {
    const {
      registerToScope,
      customizeNamespace = (ns?: string) => ns,
      lookups = defaultLookups,
      ...remainingOptions
    } = options ?? {
      localOnly: false,
    };
    const lookupOptions: LookupOptions = { ...remainingOptions, lookups };

    const generators: StoreLookupGeneratorMeta[] = [];
    await lookupGenerators(lookupOptions, ({ packagePath, filePath, lookups }) => {
      let repositoryPath = join(packagePath, '..');
      if (basename(repositoryPath).startsWith('@')) {
        // Scoped package
        repositoryPath = join(repositoryPath, '..');
      }

      let namespace = customizeNamespace(asNamespace(relative(repositoryPath, filePath), { lookups }));
      try {
        const resolved = realpathSync(filePath);
        if (!namespace) {
          namespace = customizeNamespace(asNamespace(resolved, { lookups }));
        }

        namespace = namespace!;
        if (registerToScope && !namespace.startsWith('@')) {
          namespace = `@${registerToScope}/${namespace}`;
        }

        const meta = this.add({ namespace, packagePath, resolved });
        if (meta) {
          generators.push({ ...meta, registered: true });
          return Boolean(lookupOptions.singleResult);
        }
      } catch (error) {
        console.error('Unable to register %s (Error: %s)', filePath, error);
      }

      generators.push({ resolved: filePath, namespace: namespace!, packagePath, registered: false });
      return false;
    });

    return generators;
  }

  /**
   * Get the module registered under the given namespace
   * @param  {String} namespace
   * @return {Module}
   */
  async get(namespace: string, environment?: BaseEnvironment): Promise<GetGeneratorConstructor | undefined> {
    return this.getMeta(namespace)?.importGenerator(environment);
  }

  /**
   * Get the module registered under the given namespace
   * @param  {String} namespace
   * @return {Module}
   */
  getMeta(namespace: string): StoreGeneratorMeta | undefined {
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
        if (index !== -1) {
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

  getPackagesNS(): string[] {
    return this._packagesNS;
  }

  /**
   * Read a package.json from packagePath. Parsed results are cached by packagePath.
   */
  private getPackageJson<T = Record<string, any>>(packagePath?: string): T | undefined {
    if (!packagePath) {
      return undefined;
    }

    if (!this._packagesJson.has(packagePath)) {
      let packageJson: unknown;
      try {
        packageJson = JSON.parse(readFileSync(join(packagePath, 'package.json'), 'utf8'));
      } catch {
        packageJson = undefined;
      }

      this._packagesJson.set(packagePath, packageJson);
    }

    return this._packagesJson.get(packagePath) as T | undefined;
  }

  private getFactory(module: any) {
    // CJS is imported in default, for backward compatibility we support a Generator exported as `module.exports = { default }`
    return module.createGenerator ?? module.default?.createGenerator ?? module.default?.default?.createGenerator;
  }

  private _getGenerator<G extends BaseGenerator>(
    module: any,
    meta: BaseGeneratorMeta,
    generatorMeta: BaseGeneratorMeta | undefined,
  ): GetGeneratorConstructor<G> & BaseGeneratorConstructorMeta {
    const Generator = module.default?.default ?? module.default ?? module;
    if (typeof Generator !== 'function') {
      throw new TypeError("The generator doesn't provide a constructor.");
    }

    Object.assign(Generator, meta);
    Generator._meta = generatorMeta;
    return Generator;
  }
}
