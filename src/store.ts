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
import { type LookupOptions, lookupGeneratorsSync } from './generator-lookup.ts';
import { asNamespace, defaultLookups } from './util/namespace.ts';

const debug = createDebug('yeoman:environment:store');
const require = createRequire(import.meta.url);

type FoundGenerator = {
  namespace: string;
  /** Path of the generator as it was found, `resolved` is its real path. */
  filePath: string;
  packagePath: string;
};

/** The environment to import or instantiate a generator in. */
export type StoreEnvironmentOptions = {
  env?: BaseEnvironment;
};

export type StoreLookupOptions = LookupOptions &
  StoreEnvironmentOptions & {
    registerToScope?: string;
    customizeNamespace?: (ns?: string) => string | undefined;
    /** Generators to keep, the others are neither registered nor returned. */
    filter?: (generator: FoundGenerator) => boolean;
  };

/** A generator found by a lookup, `registered` tells if it was added to the store. */
export type StoreLookupGeneratorMeta = FoundGenerator &
  ((StoreGeneratorMeta & { registered: true }) | (Required<BaseGeneratorMeta> & { registered: false }));

/**
 * Generator meta as the store keeps it. `importGenerator`, `instantiate` and `instantiateHelp` take the environment
 * to use as `{ env }`, falling back to the one the meta is bound to: the environment the store was created with, if
 * any, or the one passed to the store method that returned the meta.
 */
export type StoreGeneratorMeta = Omit<GeneratorMeta, 'importGenerator' | 'instantiate' | 'instantiateHelp'> & {
  /** Require the module `require(meta.resolved)`, throws if the module cannot be required synchronously. */
  requireModule?: () => unknown;
  importGenerator: <G extends BaseGenerator = BaseGenerator>(
    options?: StoreEnvironmentOptions,
  ) => Promise<GetGeneratorConstructor<G> & BaseGeneratorConstructorMeta> | (GetGeneratorConstructor<G> & BaseGeneratorConstructorMeta);
  instantiate: <G extends BaseGenerator = BaseGenerator>(
    arguments_?: string[],
    options?: any,
    environmentOptions?: StoreEnvironmentOptions,
  ) => Promise<G>;
  instantiateHelp: <G extends BaseGenerator = BaseGenerator>(options?: StoreEnvironmentOptions) => Promise<G>;
};

type BoundFunctions = Pick<StoreGeneratorMeta, 'importGenerator' | 'instantiate' | 'instantiateHelp'>;

/**
 * The Generator store
 * This is used to store generator (npm packages) reference and instantiate them when
 * requested.
 *
 * A store does not need an environment: generators are looked up and registered on their own, and the environment
 * that imports or instantiates one is passed at that time. The same store can then serve several environments: the
 * methods returning metas take `{ env }` and return metas bound to it.
 *
 * @experimental The Store API is not stable yet and may change in a minor release.
 */
export default class Store {
  private readonly _meta: Record<string, StoreGeneratorMeta> = {};
  // Cache parsed package.json by packagePath
  private readonly _packagesJson = new Map<string, unknown>();
  // Store packages paths by ns
  private readonly _packagesPaths: Record<string, string[]> = {};
  // Store packages ns
  private readonly _packagesNS: string[] = [];
  // Metas bound to an environment, by the meta of the store.
  private readonly _boundMetas = new WeakMap<StoreGeneratorMeta, WeakMap<BaseEnvironment, StoreGeneratorMeta>>();

  /** The environment used when none is passed to `importGenerator` or `instantiate`. */
  readonly environment?: BaseEnvironment;

  constructor(environment?: BaseEnvironment) {
    this.environment = environment;
  }

  /**
   * Store a module under the namespace key
   * @param meta
   * @param generator - A generator module or a module path
   * @param options.env - The environment to bind the returned meta to
   */
  add<M extends BaseGeneratorMeta>(meta: M, Generator?: unknown, { env }: StoreEnvironmentOptions = {}): StoreGeneratorMeta & M {
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

    let requireModule: (() => unknown) | undefined;
    let importModule: (() => Promise<unknown>) | undefined;
    if (!Generator) {
      if (!meta.resolved) {
        throw new Error(`Generator Stub or resolved path is required for ${meta.namespace}`);
      }

      requireModule = () => require(meta.resolved!);
      importModule = () => {
        try {
          return requireModule!() as Promise<unknown>;
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

    const importGenerator = (({ env: environment = this.environment }: StoreEnvironmentOptions = {}) => {
      const importing = importGeneratorModule();
      return importing ? importing.then(() => getGenerator(environment)) : getGenerator(environment);
    }) as StoreGeneratorMeta['importGenerator'];

    const instantiate: StoreGeneratorMeta['instantiate'] = async <G extends BaseGenerator>(
      arguments_: string[] = [],
      options: any = {},
      { env: environment = this.environment }: StoreEnvironmentOptions = {},
    ) => {
      if (!environment) {
        throw new Error(`An environment is required to instantiate the generator ${meta.namespace}`);
      }

      return environment.instantiate<G>(await importGenerator<G>({ env: environment }), {
        generatorArgs: arguments_,
        generatorOptions: options,
      });
    };

    const instantiateHelp: StoreGeneratorMeta['instantiateHelp'] = async <G extends BaseGenerator>(options?: StoreEnvironmentOptions) =>
      instantiate<G>([], { help: true }, options);

    const getPackageJson: GeneratorMeta['getPackageJson'] = <T = Record<string, any>>(): T | undefined =>
      this.getPackageJson<T>(meta.packagePath);

    const { packageNamespace } = toNamespace(meta.namespace) ?? {};

    generatorMeta = {
      ...meta,
      importGenerator,
      requireModule,
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

    return this.bindMeta(generatorMeta, { env });
  }

  /**
   * The meta bound to an environment: its functions default to it. The meta of the environment the store was created
   * with is the meta itself, as it already defaults to it. A meta is bound once by environment, and delegates to the
   * meta of the store instead of copying it, so it keeps showing what the store has.
   */
  bindMeta<M extends StoreGeneratorMeta>(meta: M, options?: StoreEnvironmentOptions): M;
  bindMeta<M extends StoreGeneratorMeta>(meta: M | undefined, options?: StoreEnvironmentOptions): M | undefined;
  bindMeta<M extends StoreGeneratorMeta>(meta: M | undefined, { env }: StoreEnvironmentOptions = {}): M | undefined {
    if (!meta || !env || env === this.environment) {
      return meta;
    }

    let boundMetas = this._boundMetas.get(meta);
    if (!boundMetas) {
      boundMetas = new WeakMap();
      this._boundMetas.set(meta, boundMetas);
    }

    let boundMeta = boundMetas.get(env);
    if (!boundMeta) {
      boundMeta = Object.assign(Object.create(meta) as StoreGeneratorMeta, this.bindMetaFunctions(meta, env));
      boundMetas.set(env, boundMeta);
    }

    return boundMeta as M;
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
  lookupSync(options?: StoreLookupOptions): StoreLookupGeneratorMeta[] {
    const {
      registerToScope,
      customizeNamespace = (ns?: string) => ns,
      filter,
      env,
      lookups = defaultLookups,
      ...remainingOptions
    } = options ?? { localOnly: false };
    const lookupOptions: LookupOptions = { ...remainingOptions, lookups };

    const generators: StoreLookupGeneratorMeta[] = [];
    lookupGeneratorsSync(lookupOptions, ({ packagePath, filePath, lookups }) => {
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

        if (filter && !filter({ namespace, filePath, packagePath })) {
          return false;
        }

        const meta = this.add({ namespace, packagePath, resolved });
        if (meta) {
          const boundFunctions = env && env !== this.environment ? this.bindMetaFunctions(meta, env) : {};
          generators.push({ ...meta, ...boundFunctions, filePath, packagePath, registered: true });
          return Boolean(lookupOptions.singleResult);
        }
      } catch (error) {
        console.error('Unable to register %s (Error: %s)', filePath, error);
      }

      generators.push({ resolved: filePath, namespace: namespace!, filePath, packagePath, registered: false });
      return false;
    });

    return generators;
  }

  /**
   * Get the module registered under the given namespace
   * @param  {String} namespace
   * @param  options.env - The environment to import the generator in
   * @return {Module}
   */
  async get(namespace: string, options?: StoreEnvironmentOptions): Promise<GetGeneratorConstructor | undefined> {
    return this.getMeta(namespace)?.importGenerator(options);
  }

  /**
   * Get the meta registered under the given namespace
   * @param  {String} namespace
   * @param  options.env - The environment to bind the meta to
   */
  getMeta(namespace: string, options?: StoreEnvironmentOptions): StoreGeneratorMeta | undefined {
    return this.bindMeta(this._meta[namespace], options);
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
   * @param  options.env - The environment to bind the metas to
   * @return {Object} Generators metadata
   */
  getGeneratorsMeta(options?: StoreEnvironmentOptions): Record<string, StoreGeneratorMeta> {
    const env = options?.env;
    if (!env || env === this.environment) {
      return this._meta;
    }

    // Bound as they are read. It is a view of the record of the store, as the record itself is what is returned
    // otherwise: what is set goes to the store.
    return new Proxy(this._meta, {
      get: (target, property, receiver) => {
        const meta = Reflect.get(target, property, receiver);
        return typeof property === 'string' && meta ? this.bindMeta(meta, { env }) : meta;
      },
    });
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

  /**
   * The functions of a meta that need an environment, defaulting to the given one.
   */
  private bindMetaFunctions(meta: StoreGeneratorMeta, env: BaseEnvironment): BoundFunctions {
    return {
      importGenerator: (({ env: environment = env }: StoreEnvironmentOptions = {}) =>
        meta.importGenerator({ env: environment })) as BoundFunctions['importGenerator'],
      instantiate: (arguments_, options, { env: environment = env } = {}) => meta.instantiate(arguments_, options, { env: environment }),
      instantiateHelp: ({ env: environment = env } = {}) => meta.instantiateHelp({ env: environment }),
    };
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
