import EventEmitter from 'node:events';
import { createRequire } from 'node:module';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { realpathSync } from 'node:fs';
import { QueuedAdapter, type TerminalAdapterOptions } from '@yeoman/adapter';
import type {
  ApplyTransformsOptions,
  BaseEnvironment,
  BaseEnvironmentOptions,
  BaseGenerator,
  BaseGeneratorConstructor,
  BaseGeneratorMeta,
  ComposeOptions,
  GeneratorMeta,
  GetGeneratorConstructor,
  GetGeneratorOptions,
  InputOutputAdapter,
  InstantiateOptions,
  LookupGeneratorMeta,
} from '@yeoman/types';
import { type Store as MemFs, create as createMemFs } from 'mem-fs';
import { type MemFsEditor, type MemFsEditorFile, create as createMemFsEditor } from 'mem-fs-editor';
import { FlyRepository } from 'fly-import';
import createdLogger from 'debug';
// @ts-expect-error grouped-queue don't have types
import GroupedQueue from 'grouped-queue';
// eslint-disable-next-line n/file-extension-in-import
import { isFilePending } from 'mem-fs-editor/state';
import { passthrough, filePipeline, type FilePipelineTransform } from '@yeoman/transform';
import { type YeomanNamespace, toNamespace } from '@yeoman/namespace';
import chalk from 'chalk';
import { type ConflicterOptions } from '@yeoman/conflicter';
import { defaults, pick } from 'lodash-es';
import { ComposedStore } from './composed-store.js';
import Store from './store.js';
import type YeomanCommand from './util/command.js';
import { asNamespace, defaultLookups } from './util/namespace.js';
import { type LookupOptions, lookupGenerators } from './generator-lookup.js';
import { UNKNOWN_NAMESPACE, UNKNOWN_RESOLVED, defaultQueues } from './constants.js';
import { resolveModulePath } from './util/resolve.js';
import { commitSharedFsTask } from './commit.js';
import { packageManagerInstallTask } from './package-manager.js';
// eslint-disable-next-line import/order
import { splitArgsFromString } from './util/util.js';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/naming-convention
const ENVIRONMENT_VERSION = require('../package.json').version;

const debug = createdLogger('yeoman:environment');

export type EnvironmentOptions = BaseEnvironmentOptions &
  Omit<TerminalAdapterOptions, 'promptModule'> & {
    adapter?: InputOutputAdapter;
    logCwd?: string;
    command?: YeomanCommand;
    yeomanRepository?: string;
    arboristRegistry?: string;
    nodePackageManager?: string;
  };

const getInstantiateOptions = (args?: any, options?: any): InstantiateOptions => {
  if (Array.isArray(args) || typeof args === 'string') {
    return { generatorArgs: splitArgsFromString(args), generatorOptions: options };
  }

  if (args !== undefined) {
    if ('generatorOptions' in args || 'generatorArgs' in args) {
      return args;
    }

    if ('options' in args || 'arguments' in args || 'args' in args) {
      const { args: insideArgs, arguments: generatorArgs = insideArgs, options: generatorOptions, ...remainingOptions } = args;
      return { generatorArgs: splitArgsFromString(generatorArgs), generatorOptions: generatorOptions ?? remainingOptions };
    }
  }

  return { generatorOptions: options };
};

const getComposeOptions = (...varargs: any[]): ComposeOptions => {
  if (varargs.filter(Boolean).length === 0) return {};

  const [args, options, composeOptions] = varargs;
  if (typeof args === 'boolean') {
    return { schedule: args };
  }

  let generatorArgs;
  let generatorOptions;
  if (args !== undefined) {
    if (Array.isArray(args)) {
      generatorArgs = args;
    } else if (typeof args === 'string') {
      generatorArgs = splitArgsFromString(String(args));
    } else if (typeof args === 'object') {
      if ('generatorOptions' in args || 'generatorArgs' in args || 'schedule' in args) {
        return args;
      }

      generatorOptions = args;
    }
  }

  if (typeof options === 'boolean') {
    return { generatorArgs, generatorOptions, schedule: options };
  }

  generatorOptions = generatorOptions ?? options;

  if (typeof composeOptions === 'boolean') {
    return { generatorArgs, generatorOptions, schedule: composeOptions };
  }

  return {};
};

/**
 * Copy and remove null and undefined values
 * @param object
 * @returns
 */

export function removePropertiesWithNullishValues(object: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(object).filter(([_key, value]) => value !== undefined && value !== null));
}

export default class EnvironmentBase extends EventEmitter implements BaseEnvironment {
  cwd: string;
  adapter: QueuedAdapter;
  sharedFs: MemFs<MemFsEditorFile>;
  conflicterOptions?: ConflicterOptions;

  protected logCwd: string;
  protected readonly options: EnvironmentOptions;
  protected readonly aliases: Array<{ match: RegExp; value: string }> = [];
  protected store: Store;
  protected command?: YeomanCommand;
  protected runLoop: GroupedQueue;
  protected composedStore: ComposedStore;
  protected fs: MemFsEditor;
  protected lookups: string[];
  protected sharedOptions: Record<string, any>;
  protected repository: FlyRepository;
  protected experimental: boolean;
  protected _rootGenerator?: BaseGenerator;
  protected compatibilityMode?: false | 'v4';

  constructor(options: EnvironmentOptions = {}) {
    super();

    this.setMaxListeners(100);

    const {
      cwd = process.cwd(),
      logCwd = cwd,
      sharedFs = createMemFs<MemFsEditorFile>(),
      command,
      yeomanRepository,
      arboristRegistry,
      sharedOptions = {},
      experimental,
      console,
      stdin,
      stderr,
      stdout,
      adapter = new QueuedAdapter({ console, stdin, stdout, stderr }),
      ...remainingOptions
    } = options;

    this.options = remainingOptions;
    this.adapter = adapter as QueuedAdapter;
    this.cwd = resolve(cwd);
    this.logCwd = logCwd;
    this.store = new Store(this as BaseEnvironment);
    this.command = command;

    this.runLoop = new GroupedQueue(defaultQueues, false);
    this.composedStore = new ComposedStore({ log: this.adapter.log });
    this.sharedFs = sharedFs as MemFs<MemFsEditorFile>;

    // Each composed generator might set listeners on these shared resources. Let's make sure
    // Node won't complain about event listeners leaks.
    this.runLoop.setMaxListeners(0);
    this.sharedFs.setMaxListeners(0);

    this.fs = createMemFsEditor(sharedFs);

    this.lookups = defaultLookups;

    this.sharedOptions = sharedOptions;

    // Create a default sharedData.
    this.sharedOptions.sharedData = this.sharedOptions.sharedData ?? {};

    // Pass forwardErrorToEnvironment to generators.
    this.sharedOptions.forwardErrorToEnvironment = false;

    this.repository = new FlyRepository({
      repositoryPath: yeomanRepository ?? `${this.cwd}/.yo-repository`,
      arboristConfig: {
        registry: arboristRegistry,
      },
    });

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    this.experimental = experimental || process.argv.includes('--experimental');

    this.alias(/^([^:]+)$/, '$1:app');
  }

  async applyTransforms(transformStreams: FilePipelineTransform[], options: ApplyTransformsOptions = {}): Promise<void> {
    const {
      streamOptions = { filter: file => isFilePending(file) },
      stream = this.sharedFs.stream(streamOptions),
      name = 'Transforming',
    } = options;

    if (!Array.isArray(transformStreams)) {
      transformStreams = [transformStreams];
    }

    await this.adapter.progress(
      async ({ step }) => {
        await filePipeline(stream, [
          ...transformStreams,
          passthrough(file => {
            step('Completed', relative(this.logCwd, file.path));
          }),
        ]);
      },
      { name, disabled: !(options?.log ?? true) },
    );
  }

  /**
   * Get a single generator from the registered list of generators. The lookup is
   * based on generator's namespace, "walking up" the namespaces until a matching
   * is found. Eg. if an `angular:common` namespace is registered, and we try to
   * get `angular:common:all` then we get `angular:common` as a fallback (unless
   * an `angular:common:all` generator is registered).
   *
   * @param   namespaceOrPath
   * @return the generator registered under the namespace
   */
  async get<C extends BaseGeneratorConstructor = BaseGeneratorConstructor>(
    namespaceOrPath: string | YeomanNamespace,
  ): Promise<C | undefined> {
    // Stop the recursive search if nothing is left
    if (!namespaceOrPath) {
      return;
    }

    const parsed = toNamespace(namespaceOrPath);
    if (typeof namespaceOrPath !== 'string' || parsed) {
      const ns = parsed!.namespace;
      const maybeGenerator = (await this.store.get(ns)) ?? this.store.get(this.alias(ns));
      return maybeGenerator as C;
    }

    const maybeGenerator = (await this.store.get(namespaceOrPath)) ?? (await this.store.get(this.alias(namespaceOrPath)));
    if (maybeGenerator) {
      return maybeGenerator as C;
    }

    try {
      const resolved = await resolveModulePath(namespaceOrPath);
      if (resolved) {
        const namespace = this.namespace(resolved);
        this.store.add({ resolved, namespace });
        return (await this.store.get(namespace)) as C;
      }
    } catch {}

    return undefined;
  }

  /**
   * Create is the Generator factory. It takes a namespace to lookup and optional
   * hash of options, that lets you define `arguments` and `options` to
   * instantiate the generator with.
   *
   * An error is raised on invalid namespace.
   *
   * @param namespaceOrPath
   * @param instantiateOptions
   * @return The instantiated generator
   */
  async create<G extends BaseGenerator = BaseGenerator>(
    namespaceOrPath: string | GetGeneratorConstructor<G>,
    instantiateOptions?: InstantiateOptions<G>,
  ): Promise<G>;
  async create<G extends BaseGenerator = BaseGenerator>(namespaceOrPath: string | GetGeneratorConstructor<G>, ...args: any[]): Promise<G> {
    let constructor;
    const namespace = typeof namespaceOrPath === 'string' ? toNamespace(namespaceOrPath) : undefined;

    const checkGenerator = (Generator: any) => {
      const generatorNamespace = Generator?.namespace;
      if (namespace && generatorNamespace !== namespace.namespace && generatorNamespace !== UNKNOWN_NAMESPACE) {
        // Update namespace object in case of aliased namespace.
        try {
          namespace.namespace = Generator.namespace;
        } catch {
          // Invalid namespace can be aliased to a valid one.
        }
      }

      if (typeof Generator !== 'function') {
        throw new TypeError(
          chalk.red(`You don't seem to have a generator with the name “${namespace?.generatorHint}” installed.`) +
            '\n' +
            'But help is on the way:\n\n' +
            'You can see available generators via ' +
            chalk.yellow('npm search yeoman-generator') +
            ' or via ' +
            chalk.yellow('http://yeoman.io/generators/') +
            '. \n' +
            'Install them with ' +
            chalk.yellow(`npm install ${namespace?.generatorHint}`) +
            '.\n\n' +
            'To see all your installed generators run ' +
            chalk.yellow('yo --generators') +
            '. ' +
            'Adding the ' +
            chalk.yellow('--help') +
            ' option will also show subgenerators. \n\n' +
            'If ' +
            chalk.yellow('yo') +
            ' cannot find the generator, run ' +
            chalk.yellow('yo doctor') +
            ' to troubleshoot your system.',
        );
      }

      return Generator;
    };

    if (typeof namespaceOrPath !== 'string') {
      return this.instantiate(checkGenerator(namespaceOrPath), ...args);
    }

    if (typeof namespaceOrPath === 'string') {
      constructor = await this.get(namespaceOrPath);
      if (namespace && !constructor) {
        // Await this.lookupLocalNamespaces(namespace);
        // constructor = await this.get(namespace);
      }
    } else {
      constructor = namespaceOrPath;
    }

    return this.instantiate(checkGenerator(constructor), ...args);
  }

  /**
   * Instantiate a Generator with metadatas
   *
   * @param  generator   Generator class
   * @param instantiateOptions
   * @return The instantiated generator
   */
  async instantiate<G extends BaseGenerator = BaseGenerator>(
    generator: GetGeneratorConstructor<G>,
    instantiateOptions?: InstantiateOptions<G>,
  ): Promise<G>;
  async instantiate<G extends BaseGenerator = BaseGenerator>(constructor: GetGeneratorConstructor<G>, ...args: any[]): Promise<G> {
    const composeOptions = args.length > 0 ? (getInstantiateOptions(...args) as InstantiateOptions<G>) : {};
    const { namespace = UNKNOWN_NAMESPACE, resolved = UNKNOWN_RESOLVED } = constructor as any;
    const environmentOptions = { env: this, resolved, namespace };
    const generator = new constructor(composeOptions.generatorArgs ?? [], {
      ...this.sharedOptions,
      ...composeOptions.generatorOptions,
      ...environmentOptions,
    } as unknown as GetGeneratorOptions<G>);

    (generator as any)._environmentOptions = {
      ...this.options,
      ...this.sharedOptions,
      ...environmentOptions,
    };

    if (!composeOptions.generatorOptions?.help && generator._postConstruct) {
      await generator._postConstruct();
    }

    return generator as unknown as G;
  }

  /**
   * @protected
   * Compose with the generator.
   *
   * @param {String} namespaceOrPath
   * @return {Generator} The instantiated generator or the singleton instance.
   */
  async composeWith<G extends BaseGenerator = BaseGenerator>(
    generator: string | GetGeneratorConstructor<G>,
    composeOptions?: ComposeOptions<G>,
  ): Promise<G>;
  async composeWith<G extends BaseGenerator = BaseGenerator>(generator: string | GetGeneratorConstructor<G>, ...args: any[]): Promise<G> {
    const options = getComposeOptions(...args) as ComposeOptions<G>;
    const { schedule = true, ...instantiateOptions } = options;

    const generatorInstance = await this.create(generator, instantiateOptions);
    return this.queueGenerator(generatorInstance, { schedule });
  }

  /**
   * Given a String `filepath`, tries to figure out the relative namespace.
   *
   * ### Examples:
   *
   *     this.namespace('backbone/all/index.js');
   *     // => backbone:all
   *
   *     this.namespace('generator-backbone/model');
   *     // => backbone:model
   *
   *     this.namespace('backbone.js');
   *     // => backbone
   *
   *     this.namespace('generator-mocha/backbone/model/index.js');
   *     // => mocha:backbone:model
   *
   * @param {String} filepath
   * @param {Array} lookups paths
   */
  namespace(filepath: string, lookups = this.lookups) {
    return asNamespace(filepath, { lookups });
  }

  /**
   * Returns the environment or dependency version.
   * @param  {String} packageName - Module to get version.
   * @return {String} Environment version.
   */
  getVersion(): string;
  getVersion(dependency: string): string | undefined;
  getVersion(packageName?: string): string | undefined {
    if (packageName && packageName !== 'yeoman-environment') {
      try {
        return require(`${packageName}/package.json`).version;
      } catch {
        return undefined;
      }
    }

    return ENVIRONMENT_VERSION;
  }

  /**
   * Queue generator run (queue itself tasks).
   *
   * @param {Generator} generator Generator instance
   * @param {boolean} [schedule=false] Whether to schedule the generator run.
   * @return {Generator} The generator or singleton instance.
   */
  async queueGenerator<G extends BaseGenerator = BaseGenerator>(generator: G, queueOptions?: { schedule?: boolean }): Promise<G> {
    const schedule = typeof queueOptions === 'boolean' ? queueOptions : queueOptions?.schedule ?? false;
    const { added, identifier, generator: composedGenerator } = this.composedStore.addGenerator(generator);
    if (!added) {
      debug(`Using existing generator for namespace ${identifier}`);
      return composedGenerator;
    }

    this.emit('compose', identifier, generator);
    this.emit(`compose:${identifier}`, generator);

    const runGenerator = async () => {
      if (generator.queueTasks) {
        // Generator > 5
        this.once('run', () => generator.emit('run'));
        this.once('end', () => generator.emit('end'));
        await generator.queueTasks();
        return;
      }

      if (!(generator.options as any).forwardErrorToEnvironment) {
        generator.on('error', (error: any) => this.emit('error', error));
      }

      (generator as any).promise = (generator as any).run();
    };

    if (schedule) {
      this.queueTask('environment:run', async () => runGenerator());
    } else {
      await runGenerator();
    }

    return generator;
  }

  /**
   * Get the first generator that was queued to run in this environment.
   *
   * @return {Generator} generator queued to run in this environment.
   */
  rootGenerator<G extends BaseGenerator = BaseGenerator>(): G {
    return this._rootGenerator as G;
  }

  async runGenerator(generator: BaseGenerator): Promise<void> {
    generator = await this.queueGenerator(generator);

    this.compatibilityMode = generator.queueTasks ? false : 'v4';
    this._rootGenerator = this._rootGenerator ?? generator;

    return this.start(generator.options);
  }

  /**
   * Registers a specific `generator` to this environment. This generator is stored under
   * provided namespace, or a default namespace format if none if available.
   *
   * @param  name      - Filepath to the a generator or a npm package name
   * @param  namespace - Namespace under which register the generator (optional)
   * @param  packagePath - PackagePath to the generator npm package (optional)
   * @return environment - This environment
   */
  register(filePath: string, meta?: Partial<BaseGeneratorMeta> | undefined): GeneratorMeta;
  register(generator: unknown, meta: BaseGeneratorMeta): GeneratorMeta;
  register(pathOrStub: unknown, meta?: Partial<BaseGeneratorMeta> | BaseGeneratorMeta, ...args: any[]): GeneratorMeta {
    if (typeof pathOrStub === 'string') {
      if (typeof meta === 'object') {
        return this.registerGeneratorPath(pathOrStub, meta.namespace, meta.packagePath);
      }

      // Backward compatibility
      return this.registerGeneratorPath(pathOrStub, meta, ...args);
    }

    if (pathOrStub) {
      if (typeof meta === 'object') {
        return this.registerStub(pathOrStub, meta.namespace!, meta.resolved, meta.packagePath);
      }

      // Backward compatibility
      return this.registerStub(pathOrStub, meta as unknown as string, ...args);
    }

    throw new TypeError('You must provide a generator name to register.');
  }

  /**
   * Queue tasks
   * @param {string} priority
   * @param {(...args: any[]) => void | Promise<void>} task
   * @param {{ once?: string, startQueue?: boolean }} [options]
   */
  queueTask(
    priority: string,
    task: () => void | Promise<void>,
    options?: { once?: string | undefined; startQueue?: boolean | undefined } | undefined,
  ): void {
    this.runLoop.add(
      priority,
      async (done: () => Record<string, unknown>, stop: (arg: any) => Record<string, unknown>) => {
        try {
          await task();
          done();
        } catch (error) {
          stop(error);
        }
      },
      {
        once: options?.once,
        run: options?.startQueue ?? false,
      },
    );
  }

  /**
   * Add priority
   * @param {string} priority
   * @param {string} [before]
   */
  addPriority(priority: string, before?: string | undefined): void {
    if (this.runLoop.queueNames.includes(priority)) {
      return;
    }

    this.runLoop.addSubQueue(priority, before);
  }

  /**
   * Search for generators and their sub generators.
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
  async lookup(options?: LookupOptions & { registerToScope?: string }): Promise<LookupGeneratorMeta[]> {
    const { registerToScope, lookups = this.lookups, ...remainingOptions } = options ?? { localOnly: false };
    options = {
      ...remainingOptions,
      lookups,
    };

    const generators: LookupGeneratorMeta[] = [];
    await lookupGenerators(options, ({ packagePath, filePath, lookups }) => {
      let repositoryPath = join(packagePath, '..');
      if (basename(repositoryPath).startsWith('@')) {
        // Scoped package
        repositoryPath = join(repositoryPath, '..');
      }

      let namespace = asNamespace(relative(repositoryPath, filePath), { lookups });
      try {
        const resolved = realpathSync(filePath);
        if (!namespace) {
          namespace = asNamespace(resolved, { lookups });
        }

        if (registerToScope && !namespace.startsWith('@')) {
          namespace = `@${registerToScope}/${namespace}`;
        }

        const meta = this.store.add({ namespace, packagePath, resolved });
        if (meta) {
          generators.push({
            ...meta,
            registered: true,
          });
          return Boolean(options?.singleResult);
        }
      } catch (error) {
        console.error('Unable to register %s (Error: %s)', filePath, error);
      }

      generators.push({
        resolved: filePath,
        namespace,
        packagePath,
        registered: false,
      });

      return false;
    });

    return generators;
  }

  /**
   * Verify if a package namespace already have been registered.
   *
   * @param  packageNS - namespace of the package.
   * @return true if any generator of the package has been registered
   */
  isPackageRegistered(packageNamespace: string): boolean {
    const registeredPackages = this.getRegisteredPackages();
    return registeredPackages.includes(packageNamespace) || registeredPackages.includes(this.alias(packageNamespace).split(':', 2)[0]);
  }

  /**
   * Get all registered packages namespaces.
   *
   * @return array of namespaces.
   */
  getRegisteredPackages(): string[] {
    return this.store.getPackagesNS();
  }

  /**
   * Returns stored generators meta
   * @param namespace
   */
  getGeneratorMeta(namespace: string): GeneratorMeta | undefined {
    const meta: GeneratorMeta = this.store.getMeta(namespace) ?? this.store.getMeta(this.alias(namespace));
    if (!meta) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return { ...meta } as GeneratorMeta;
  }

  /**
   * Get or create an alias.
   *
   * Alias allows the `get()` and `lookup()` methods to search in alternate
   * filepath for a given namespaces. It's used for example to map `generator-*`
   * npm package to their namespace equivalent (without the generator- prefix),
   * or to default a single namespace like `angular` to `angular:app` or
   * `angular:all`.
   *
   * Given a single argument, this method acts as a getter. When both name and
   * value are provided, acts as a setter and registers that new alias.
   *
   * If multiple alias are defined, then the replacement is recursive, replacing
   * each alias in reverse order.
   *
   * An alias can be a single String or a Regular Expression. The finding is done
   * based on .match().
   *
   * @param {String|RegExp} match
   * @param {String} value
   *
   * @example
   *
   *     env.alias(/^([a-zA-Z0-9:\*]+)$/, 'generator-$1');
   *     env.alias(/^([^:]+)$/, '$1:app');
   *     env.alias(/^([^:]+)$/, '$1:all');
   *     env.alias('foo');
   *     // => generator-foo:all
   */
  alias(match: string | RegExp, value: string): this;
  alias(value: string): string;
  alias(match: string | RegExp, value?: string): string | this {
    if (match && value) {
      this.aliases.push({
        match: match instanceof RegExp ? match : new RegExp(`^${match}$`),
        value,
      });
      return this;
    }

    if (typeof match !== 'string') {
      throw new TypeError('string is required');
    }

    const aliases = [...this.aliases].reverse();

    return aliases.reduce<string>((resolved, alias) => {
      if (!alias.match.test(resolved)) {
        return resolved;
      }

      return resolved.replace(alias.match, alias.value);
    }, match);
  }

  /**
   * Start Environment queue
   * @param {Object} options - Conflicter options.
   */
  protected async start(options: any) {
    return new Promise<void>((resolve, reject) => {
      Object.assign(this.options, removePropertiesWithNullishValues(pick(options, ['skipInstall', 'nodePackageManager'])));
      this.conflicterOptions = pick(defaults({}, this.options, options), ['force', 'bail', 'ignoreWhitespace', 'dryRun', 'skipYoResolve']);
      this.conflicterOptions.cwd = this.logCwd;

      this.queueCommit();
      this.queuePackageManagerInstall();

      /*
       * Listen to errors and reject if emmited.
       * Some cases the generator relied at the behavior that the running process
       * would be killed if an error is thrown to environment.
       * Make sure to not rely on that behavior.
       */
      this.on('error', error => {
        reject(error);
        this.adapter.close();
      });

      this.once('end', () => {
        resolve();
        this.adapter.close();
      });

      /*
       * For backward compatibility
       */
      this.on('generator:reject', error => {
        this.emit('error', error);
      });

      /*
       * For backward compatibility
       */
      this.on('generator:resolve', () => {
        this.emit('end');
      });

      this.runLoop.on('error', (error: any) => {
        this.emit('error', error);
      });

      this.runLoop.on('paused', () => {
        this.emit('paused');
      });

      /* If runLoop has ended, the environment has ended too. */
      this.runLoop.once('end', () => {
        this.emit('end');
      });

      this.emit('run');
      this.runLoop.start();
    });
  }

  /**
   * Queue environment's commit task.
   */
  protected queueCommit() {
    const queueCommit = () => {
      debug('Queueing conflicts task');
      this.queueTask(
        'environment:conflicts',
        async () => {
          const { customCommitTask = () => commitSharedFsTask(this) } = this.composedStore;
          if (typeof customCommitTask !== 'function') {
            // There is a custom commit task or just disabled
            return;
          }

          await customCommitTask();

          debug('Adding queueCommit event listener');
          this.sharedFs.once('change', queueCommit);
        },
        {
          once: 'write memory fs to disk',
        },
      );
    };

    queueCommit();
  }

  /**
   * Queue environment's package manager install task.
   */
  protected queuePackageManagerInstall() {
    const { adapter, sharedFs: memFs } = this;
    const { skipInstall, nodePackageManager } = this.options;
    const { customInstallTask } = this.composedStore;
    this.queueTask(
      'install',
      async () => {
        if (this.compatibilityMode === 'v4') {
          debug('Running in generator < 5 compatibility. Package manager install is done by the generator.');
          return;
        }

        await packageManagerInstallTask({
          adapter,
          memFs,
          packageJsonLocation: this.cwd,
          skipInstall,
          nodePackageManager,
          customInstallTask,
        });
      },
      { once: 'package manager install' },
    );
  }

  /**
   * Registers a specific `generator` to this environment. This generator is stored under
   * provided namespace, or a default namespace format if none if available.
   *
   * @param   name      - Filepath to the a generator or a npm package name
   * @param   namespace - Namespace under which register the generator (optional)
   * @param   packagePath - PackagePath to the generator npm package (optional)
   * @return  environment - This environment
   */
  protected registerGeneratorPath(generatorPath: string, namespace?: string, packagePath?: string): GeneratorMeta {
    if (typeof generatorPath !== 'string') {
      throw new TypeError('You must provide a generator name to register.');
    }

    if (!isAbsolute(generatorPath)) {
      throw new Error(`An absolute path is required to register`);
    }

    namespace = namespace ?? this.namespace(generatorPath);

    if (!namespace) {
      throw new Error('Unable to determine namespace.');
    }

    // Generator is already registered and matches the current namespace.
    const generatorMeta = this.store.getMeta(namespace);
    if (generatorMeta && generatorMeta.resolved === generatorPath) {
      return generatorMeta;
    }

    const meta = this.store.add({ namespace, resolved: generatorPath, packagePath });

    debug('Registered %s (%s) on package %s (%s)', namespace, generatorPath, meta.packageNamespace, packagePath);
    return meta;
  }

  /**
   * Register a stubbed generator to this environment. This method allow to register raw
   * functions under the provided namespace. `registerStub` will enforce the function passed
   * to extend the Base generator automatically.
   *
   * @param  Generator  - A Generator constructor or a simple function
   * @param  namespace  - Namespace under which register the generator
   * @param  resolved - The file path to the generator
   * @param  packagePath - The generator's package path
   */
  protected registerStub(Generator: any, namespace: string, resolved = UNKNOWN_RESOLVED, packagePath?: string): GeneratorMeta {
    if (typeof Generator !== 'function' && typeof Generator.createGenerator !== 'function') {
      throw new TypeError('You must provide a stub function to register.');
    }

    if (typeof namespace !== 'string') {
      throw new TypeError('You must provide a namespace to register.');
    }

    const meta = this.store.add({ namespace, resolved, packagePath }, Generator);

    debug('Registered %s (%s) on package (%s)', namespace, resolved, packagePath);
    return meta;
  }
}
