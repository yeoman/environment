import fs from 'node:fs';
import path, { isAbsolute } from 'node:path';
import EventEmitter from 'node:events';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import process from 'node:process';
import { createConflicterTransform, createYoResolveTransform } from '@yeoman/conflicter';
import { QueuedAdapter } from '@yeoman/adapter';
import { requireNamespace, toNamespace } from '@yeoman/namespace';
import { pipeline, passthrough } from '@yeoman/transform';
import chalk from 'chalk';
import _, { defaults, findLast, last, pick, uniq } from 'lodash-es';
import GroupedQueue from 'grouped-queue';
import escapeStrRe from 'escape-string-regexp';
import untildify from 'untildify';
import { create as createMemFs } from 'mem-fs';
import { create as createMemFsEditor } from 'mem-fs-editor';
import createdLogger from 'debug';
import isScoped from 'is-scoped';
import slash from 'slash';
// eslint-disable-next-line n/file-extension-in-import
import { isFilePending } from 'mem-fs-editor/state';
// eslint-disable-next-line n/file-extension-in-import
import { createCommitTransform } from 'mem-fs-editor/transform';
import Store from './store.js';
import composability from './composability.js';
import resolver from './resolver.js';
import YeomanRepository from './util/repository.js';
import YeomanCommand, { addEnvironmentOptions } from './util/command.js';
import commandMixin from './command.js';
import { packageManagerInstallTask } from './package-manager.js';
import { ComposedStore } from './composed-store.js';
// eslint-disable-next-line import/order
import namespaceCompasibilityMixin from './namespace-composability.js';

const debug = createdLogger('yeoman:environment');
const require = createRequire(import.meta.url);

const ENVIRONMENT_VERSION = require('../package.json').version;

/**
 * Two-step argument splitting function that first splits arguments in quotes,
 * and then splits up the remaining arguments if they are not part of a quote.
 */
function splitArgsFromString(argsString) {
  let result = [];
  if (!argsString) {
    return result;
  }

  const quoteSeparatedArgs = argsString.split(/("[^"]*")/).filter(Boolean);
  for (const arg of quoteSeparatedArgs) {
    if (arg.match('\u0022')) {
      result.push(arg.replace(/"/g, ''));
    } else {
      result = result.concat(arg.trim().split(' '));
    }
  }

  return result;
}

/**
 * Hint of generator module name
 */
function getGeneratorHint(namespace) {
  if (isScoped(namespace)) {
    const splitName = namespace.split('/');
    return `${splitName[0]}/generator-${splitName[1]}`;
  }

  return `generator-${namespace}`;
}

const mixins = [commandMixin];

const Base = mixins.reduce((a, b) => b(a), EventEmitter);

class Environment extends Base {
  static get UNKNOWN_NAMESPACE() {
    return 'unknownnamespace';
  }

  static get UNKNOWN_RESOLVED() {
    return 'unknown';
  }

  static get queues() {
    return [
      'environment:run',
      'initializing',
      'prompting',
      'configuring',
      'default',
      'writing',
      'transform',
      'conflicts',
      'environment:conflicts',
      'install',
      'end',
    ];
  }

  static get lookups() {
    return ['.', 'generators', 'lib/generators', 'dist/generators'];
  }

  /**
   * Make sure the Environment present expected methods if an old version is
   * passed to a Generator.
   * @param  {Environment} env
   * @return {Environment} The updated env
   */
  static enforceUpdate(env) {
    if (!env.adapter) {
      env.adapter = new QueuedAdapter();
    }

    if (!env.runLoop) {
      env.runLoop = new GroupedQueue(Environment.queues, false);
    }

    if (!env.sharedFs) {
      env.sharedFs = createMemFs();
    }

    if (!env.fs) {
      env.fs = createMemFsEditor(env.sharedFs);
    }

    return env;
  }

  /**
   * Prepare a commander instance for cli support.
   *
   * @param {Class} GeneratorClass - Generator to create Command
   * @return {Command} Return a Command instance
   */
  static prepareCommand(GeneratorClass, command = new YeomanCommand()) {
    command = addEnvironmentOptions(command);
    return Environment.prepareGeneratorCommand(command, GeneratorClass);
  }

  /**
   * Prepare a commander instance for cli support.
   *
   * @param {Command} command - Command to be prepared
   * @param {Class} GeneratorClass - Generator to create Command
   * @return {Command} return command
   */
  static prepareGeneratorCommand(command, GeneratorClass, namespace) {
    const generator = new GeneratorClass([], { help: true, env: {} });
    command.registerGenerator(generator);

    command.action(async function () {
      let rootCommand = this;
      while (rootCommand.parent) {
        rootCommand = rootCommand.parent;
      }

      command.env = await Environment.createEnv(rootCommand.opts());

      rootCommand.emit('yeoman:environment', command.env);

      if (namespace) {
        await command.env.run([namespace, ...(this.args || [])], this.opts());
        return command.env;
      }

      const generator = await command.env.instantiate(GeneratorClass, this.args, this.opts());
      await command.env.queueGenerator(generator);
      await command.env.start();
      return command.env;
    });
    return command;
  }

  /**
   * Factory method to create an environment instance. Take same parameters as the
   * Environment constructor.
   *
   * @deprecated
   * @param {string[]} [args] - arguments.
   * @param {object} [options] - Environment options.
   * @param {Adapter} [adapter] - Terminal adapter.
   *
   * @return {Environment} a new Environment instance
   */
  static createEnv(args, options, adapter) {
    if (args && !Array.isArray(args)) {
      options = args;
    }

    options = options || {};
    return new Environment(options, adapter);
  }

  /**
   * Factory method to create an environment instance. Take same parameters as the
   * Environment constructor.
   *
   * @param {String} version - Version of the Environment
   * @param {...any} args - Same arguments as {@link Environment}#createEnv.
   * @return {Environment} a new Environment instance
   */
  static async createEnvWithVersion(version, ...args) {
    const repository = new YeomanRepository({ adapter: this.adapter });
    const installedVersion = repository.verifyInstalledVersion('yeoman-environment', version);
    if (!installedVersion) {
      await repository.installPackage('yeoman-environment', version);
    }

    const VersionedEnvironment = repository.requireModule('yeoman-environment', version);
    return VersionedEnvironment.createEnv(...args);
  }

  /**
   * Convert a generators namespace to its name
   *
   * @param  {String} namespace
   * @return {String}
   */
  static namespaceToName(namespace) {
    return namespace.split(':')[0];
  }

  /**
   * Lookup for a specific generator.
   *
   * @param  {String} namespace
   * @param  {Object} [options]
   * @param {Boolean} [options.localOnly=false] - Set true to skip lookups of
   *                                                     globally-installed generators.
   * @param {Boolean} [options.packagePath=false] - Set true to return the package
   *                                                       path instead of generators file.
   * @param {Boolean} [options.singleResult=true] - Set false to return multiple values.
   * @return {String} generator
   */
  static lookupGenerator(namespace, options) {
    options =
      typeof options === 'boolean'
        ? { singleResult: true, localOnly: options }
        : { singleResult: !(options && options.multiple), ...options };

    options.filePatterns = options.filePatterns || Environment.lookups.map(prefix => path.join(prefix, '*/index.{js,ts}'));

    const name = Environment.namespaceToName(namespace);
    options.packagePatterns = options.packagePatterns || getGeneratorHint(name);
    const envProt = Environment.prototype;

    options.npmPaths = options.npmPaths || envProt.getNpmPaths(options.localOnly).reverse();
    options.packagePatterns = options.packagePatterns || 'generator-*';
    options.packagePaths = options.packagePaths || resolver.packageLookup.findPackagesIn(options.npmPaths, options.packagePatterns);

    let paths = options.singleResult ? undefined : [];
    resolver.packageLookup.sync(options, module => {
      const filename = module.filePath;
      const fileNS = envProt.namespace(filename, Environment.lookups);
      if (namespace === fileNS || (options.packagePath && namespace === Environment.namespaceToName(fileNS))) {
        // Version 2.6.0 returned pattern instead of modulePath for options.packagePath
        const returnPath = options.packagePath
          ? module.packagePath
          : options.generatorPath
          ? path.posix.join(filename, '../../')
          : filename;
        if (options.singleResult) {
          paths = returnPath;
          return true;
        }

        paths.push(returnPath);
      }

      return false;
    });

    if (options.singleResult) {
      return paths && isAbsolute(paths) ? pathToFileURL(paths).toString() : paths;
    }

    return paths.map(gen => (isAbsolute(gen) ? pathToFileURL(gen).toString() : gen));
  }

  /**
   * @classdesc `Environment` object is responsible of handling the lifecyle and bootstrap
   * of generators in a specific environment (your app).
   *
   * It provides a high-level API to create and run generators, as well as further
   * tuning where and how a generator is resolved.
   *
   * An environment is created using a list of `arguments` and a Hash of
   * `options`. Usually, this is the list of arguments you get back from your CLI
   * options parser.
   *
   * An optional adapter can be passed to provide interaction in non-CLI environment
   * (e.g. IDE plugins), otherwise a `QueuedAdapter` is instantiated by default
   *
   * @constructor
   * @implements {import('@yeoman/types').BaseEnvironment}
   * @mixes env/resolver
   * @mixes env/composability
   * @param {String|Array}          args
   * @param {Object}                opts
   * @param {Boolean} [opts.experimental]
   * @param {Object} [opts.sharedOptions]
   * @param {Console}      [opts.console]
   * @param {Stream}         [opts.stdin]
   * @param {Stream}        [opts.stdout]
   * @param {Stream}        [opts.stderr]
   * @param {QueuedAdapter} [adapter] - A QueuedAdapter instance or another object
   *                                     implementing this adapter interface. This is how
   *                                     you'd interface Yeoman with a GUI or an editor.
   */
  constructor(options, adapter) {
    super();

    this.setMaxListeners(100);

    this.options = options || {};
    this.adapter =
      adapter ||
      new QueuedAdapter({
        console: this.options.console,
        stdin: this.options.stdin,
        stderr: this.options.stderr,
      });
    this.cwd = this.options.cwd || process.cwd();
    this.cwd = path.resolve(this.cwd);
    this.logCwd = this.options.logCwd || this.cwd;
    this.store = new Store(this);
    this.command = this.options.command;

    this.runLoop = new GroupedQueue(Environment.queues, false);
    this.composedStore = new ComposedStore({ log: this.adapter.log });
    this.sharedFs = this.options.sharedFs || createMemFs();

    // Each composed generator might set listeners on these shared resources. Let's make sure
    // Node won't complain about event listeners leaks.
    this.runLoop.setMaxListeners(0);
    this.sharedFs.setMaxListeners(0);

    this.fs = createMemFsEditor(this.sharedFs);

    this.lookups = Environment.lookups;
    this.aliases = [];

    this.alias(/^([^:]+)$/, '$1:app');

    // Used sharedOptions from options if exists.
    this.sharedOptions = this.options.sharedOptions || {};
    // Remove Unecessary sharedOptions from options
    delete this.options.sharedOptions;

    // Create a default sharedData.
    this.sharedOptions.sharedData = this.sharedOptions.sharedData || {};

    // Pass forwardErrorToEnvironment to generators.
    this.sharedOptions.forwardErrorToEnvironment = false;

    this.repository = new YeomanRepository({
      adapter: this.adapter,
      repositoryPath: this.options.yeomanRepository,
      arboristRegistry: this.options.arboristRegistry,
    });

    if (!this.options.experimental) {
      for (const value of process.argv) {
        if (value === '--experimental') {
          this.options.experimental = true;
          debug('Set environment as experimental');
        }
      }
    }

    this.loadSharedOptions(this.options);
    if (this.sharedOptions.skipLocalCache === undefined) {
      this.sharedOptions.skipLocalCache = true;
    }
  }

  /**
   * Load options passed to the Generator that should be used by the Environment.
   *
   * @param {Object} options
   */
  loadEnvironmentOptions(options) {
    const environmentOptions = pick(options, ['skipInstall', 'nodePackageManager']);
    defaults(this.options, environmentOptions);
    return environmentOptions;
  }

  /**
   * Load options passed to the Environment that should be forwarded to the Generator.
   *
   * @param {Object} options
   */
  loadSharedOptions(options) {
    const optionsToShare = pick(options, [
      'skipInstall',
      'forceInstall',
      'skipCache',
      'skipLocalCache',
      'skipParseOptions',
      'localConfigOnly',
      'askAnswered',
    ]);
    Object.assign(this.sharedOptions, optionsToShare);
    return optionsToShare;
  }

  /**
   * @deprecated
   * Error handler taking `err` instance of Error.
   *
   * The `error` event is emitted with the error object, if no `error` listener
   * is registered, then we throw the error.
   *
   * @param  {Object} err
   * @return {Error}  err
   */
  error(error) {
    throw error instanceof Error ? error : new Error(error);
  }

  /**
   * Outputs the general help and usage. Optionally, if generators have been
   * registered, the list of available generators is also displayed.
   *
   * @param {String} name
   */
  help(name = 'init') {
    const out = [
      'Usage: :binary: GENERATOR [args] [options]',
      '',
      'General options:',
      "  --help       # Print generator's options and usage",
      '  -f, --force  # Overwrite files that already exist',
      '',
      'Please choose a generator below.',
      '',
    ];

    const ns = this.namespaces();

    const groups = {};
    for (const namespace of ns) {
      const base = namespace.split(':')[0];

      if (!groups[base]) {
        groups[base] = [];
      }

      groups[base].push(namespace);
    }

    for (const key of Object.keys(groups).sort()) {
      const group = groups[key];

      if (group.length > 0) {
        out.push('', key.charAt(0).toUpperCase() + key.slice(1));
      }

      for (const ns of groups[key]) {
        out.push(`  ${ns}`);
      }
    }

    return out.join('\n').replace(/:binary:/g, name);
  }

  /**
   * Registers a specific `generator` to this environment. This generator is stored under
   * provided namespace, or a default namespace format if none if available.
   *
   * @param  {String} name      - Filepath to the a generator or a npm package name
   * @param  {String} namespace - Namespace under which register the generator (optional)
   * @param  {String} packagePath - PackagePath to the generator npm package (optional)
   * @return {Object} environment - This environment
   */
  register(pathOrStub, meta, ...args) {
    if (typeof pathOrStub === 'string') {
      if (typeof meta === 'object') {
        return this._registerGeneratorPath(pathOrStub, meta.namespace, meta.packagePath);
      }
      return this._registerGeneratorPath(pathOrStub, meta, ...args);
    }
    if (pathOrStub) {
      if (typeof meta === 'object') {
        return this.registerStub(pathOrStub, meta.namespace, meta.resolved, meta.packagePath);
      }
      return this.registerStub(pathOrStub, meta, ...args);
    }
    throw new TypeError('You must provide a generator name to register.');
  }

  /**
   * Registers a specific `generator` to this environment. This generator is stored under
   * provided namespace, or a default namespace format if none if available.
   *
   * @param  {String} name      - Filepath to the a generator or a npm package name
   * @param  {String} namespace - Namespace under which register the generator (optional)
   * @param  {String} packagePath - PackagePath to the generator npm package (optional)
   * @return {Object} environment - This environment
   */
  _registerGeneratorPath(name, namespace, packagePath) {
    if (typeof name !== 'string') {
      throw new TypeError('You must provide a generator name to register.');
    }

    const modulePath = this.resolveModulePath(name);
    namespace = namespace || this.namespace(modulePath);

    if (!namespace) {
      throw new Error('Unable to determine namespace.');
    }

    // Generator is already registered and matches the current namespace.
    const generatorMeta = this.store.getMeta(namespace);
    if (generatorMeta && generatorMeta.resolved === modulePath) {
      return this;
    }

    const meta = this.store.add({ namespace, resolved: modulePath, packagePath });

    debug('Registered %s (%s) on package %s (%s)', namespace, modulePath, meta.packageNamespace, packagePath);
    return this;
  }

  /**
   * Register a stubbed generator to this environment. This method allow to register raw
   * functions under the provided namespace. `registerStub` will enforce the function passed
   * to extend the Base generator automatically.
   *
   * @param  {Function} Generator  - A Generator constructor or a simple function
   * @param  {String}   namespace  - Namespace under which register the generator
   * @param  {String}   [resolved] - The file path to the generator
   * @param  {String} [packagePath] - The generator's package path
   * @return {this}
   */
  registerStub(Generator, namespace, resolved = Environment.UNKNOWN_RESOLVED, packagePath = undefined) {
    if (typeof Generator !== 'function' && typeof Generator.createGenerator !== 'function') {
      throw new TypeError('You must provide a stub function to register.');
    }

    if (typeof namespace !== 'string') {
      throw new TypeError('You must provide a namespace to register.');
    }

    this.store.add({ namespace, resolved, packagePath }, Generator);

    debug('Registered %s (%s) on package (%s)', namespace, resolved, packagePath);
    return this;
  }

  /**
   * Returns the list of registered namespace.
   * @return {Array}
   */
  namespaces() {
    return this.store.namespaces();
  }

  /**
   * Returns the environment or dependency version.
   * @param  {String} packageName - Module to get version.
   * @return {String} Environment version.
   */
  getVersion(packageName) {
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
   * Returns stored generators meta
   * @return {Object}
   */
  getGeneratorsMeta() {
    return this.store.getGeneratorsMeta();
  }

  /**
   * Returns stored generators meta
   * @param {string} namespace
   * @return {any}
   */
  getGeneratorMeta(namespace) {
    const meta = this.store.getMeta(namespace) || this.store.getMeta(this.alias(namespace));
    if (!meta) {
      return;
    }

    return { ...meta };
  }

  /**
   * Get registered generators names
   *
   * @return {Array}
   */
  getGeneratorNames() {
    return uniq(Object.keys(this.getGeneratorsMeta()).map(namespace => Environment.namespaceToName(namespace)));
  }

  /**
   * Verify if a package namespace already have been registered.
   *
   * @param  {String} [packageNS] - namespace of the package.
   * @return {boolean} - true if any generator of the package has been registered
   */
  isPackageRegistered(packageNS) {
    const registeredPackages = this.getRegisteredPackages();
    return registeredPackages.includes(packageNS) || registeredPackages.includes(this.alias(packageNS).split(':', 2)[0]);
  }

  /**
   * Get all registered packages namespaces.
   *
   * @return {Array} - array of namespaces.
   */
  getRegisteredPackages() {
    return this.store.getPackagesNS();
  }

  /**
   * Get last added path for a namespace
   *
   * @param  {String} - namespace
   * @return {String} - path of the package
   */
  async getPackagePath(namespace) {
    if (namespace.includes(':')) {
      const generator = (await this.get(namespace)) || {};
      return generator.packagePath;
    }

    const packagePaths = this.getPackagePaths(namespace) || [];
    return packagePaths[0];
  }

  /**
   * Get paths for a namespace
   *
   * @param  {String} - namespace
   * @return  {Array} - array of paths.
   */
  getPackagePaths(namespace) {
    return this.store.getPackagesPaths()[namespace] || this.store.getPackagesPaths()[Environment.namespaceToName(this.alias(namespace))];
  }

  /**
   * Get a single generator from the registered list of generators. The lookup is
   * based on generator's namespace, "walking up" the namespaces until a matching
   * is found. Eg. if an `angular:common` namespace is registered, and we try to
   * get `angular:common:all` then we get `angular:common` as a fallback (unless
   * an `angular:common:all` generator is registered).
   *
   * @param  {String} namespaceOrPath
   * @return {import('@yeoman/api').BaseGenerator|Promise<import('@yeoman/api').BaseGenerator>|null} - the generator registered under the namespace
   */
  async get(namespaceOrPath) {
    // Stop the recursive search if nothing is left
    if (!namespaceOrPath) {
      return;
    }

    const parsed = toNamespace(namespaceOrPath);
    if (parsed && this.getByNamespace) {
      return this.getByNamespace(parsed);
    }

    let namespace = namespaceOrPath;

    // Legacy yeoman-generator `#hookFor()` function is passing the generator path as part
    // of the namespace. If we find a path delimiter in the namespace, then ignore the
    // last part of the namespace.
    const parts = namespaceOrPath.split(':');
    const maybePath = last(parts);
    if (parts.length > 1 && /[/\\]/.test(maybePath)) {
      parts.pop();

      // We also want to remove the drive letter on windows
      if (maybePath.includes('\\') && last(parts).length === 1) {
        parts.pop();
      }

      namespace = parts.join(':');
    }

    return (
      (await this.store.get(namespace)) ??
      (await this.store.get(this.alias(namespace))) ??
      // Namespace is empty if namespaceOrPath contains a win32 absolute path of the form 'C:\path\to\generator'.
      // for this reason we pass namespaceOrPath to the getByPath function.
      this.getByPath(namespaceOrPath)
    );
  }

  /**
   * Get a generator only by namespace.
   * @private
   * @param  {YeomanNamespace|String} namespace
   * @return {Generator|null} - the generator found at the location
   */
  async getByNamespace(namespace) {
    const ns = requireNamespace(namespace).namespace;
    return (await this.store.get(ns)) ?? this.store.get(this.alias(ns));
  }

  /**
   * Get a generator by path instead of namespace.
   * @param  {String} path
   * @return {Generator|null} - the generator found at the location
   */
  async getByPath(path) {
    if (fs.existsSync(path)) {
      const namespace = this.namespace(path);
      this.register(path, namespace);

      return this.get(namespace);
    }
  }

  /**
   * Create is the Generator factory. It takes a namespace to lookup and optional
   * hash of options, that lets you define `arguments` and `options` to
   * instantiate the generator with.
   *
   * An error is raised on invalid namespace.
   *
   * @param {String} namespaceOrPath
   * @param {Array} [args]
   * @param {Object} [options]
   * @return {Generator} The instantiated generator
   */
  async create(namespaceOrPath, args, options) {
    if (!Array.isArray(args) && typeof args === 'object') {
      options = args.options || args;
      args = args.arguments || args.args || [];
    } else {
      args = Array.isArray(args) ? args : splitArgsFromString(args);
      options = options || {};
    }

    const namespace = toNamespace(namespaceOrPath);

    let maybeGenerator;
    if (namespace && this.getByNamespace) {
      maybeGenerator = await this.getByNamespace(namespace);
      if (!maybeGenerator) {
        await this.lookupLocalNamespaces(namespace);
        maybeGenerator = await this.getByNamespace(namespace);
      }
    }

    const checkGenerator = Generator => {
      if (
        namespace &&
        Generator &&
        Generator.namespace &&
        Generator.namespace !== namespace.namespace &&
        Generator.namespace !== Environment.UNKNOWN_NAMESPACE
      ) {
        // Update namespace object in case of aliased namespace.
        try {
          namespace.namespace = Generator.namespace;
        } catch {
          // Invalid namespace can be aliased to a valid one.
        }
      }

      if (typeof Generator !== 'function') {
        const generatorHint = namespace ? namespace.generatorHint : getGeneratorHint(namespaceOrPath);

        throw new Error(
          chalk.red("You don't seem to have a generator with the name “" + namespaceOrPath + '” installed.') +
            '\n' +
            'But help is on the way:\n\n' +
            'You can see available generators via ' +
            chalk.yellow('npm search yeoman-generator') +
            ' or via ' +
            chalk.yellow('http://yeoman.io/generators/') +
            '. \n' +
            'Install them with ' +
            chalk.yellow(`npm install ${generatorHint}`) +
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

    maybeGenerator = maybeGenerator || this.get(namespaceOrPath);

    return this.instantiate(checkGenerator(await maybeGenerator), args, options);
  }

  /**
   * Instantiate a Generator with metadatas
   *
   * @param {Class<Generator>} generator   Generator class
   * @param {Array}            [args]      Arguments to pass the instance
   * @param {Object}           [options]   Options to pass the instance
   * @return {Generator}       The instantiated generator
   */
  async instantiate(Generator, args, options) {
    if (!Array.isArray(args) && typeof args === 'object') {
      options = args.options || args;
      args = args.arguments || args.args || [];
    } else {
      args = Array.isArray(args) ? args : splitArgsFromString(args);
      options = options || {};
    }

    const { namespace = Environment.UNKNOWN_NAMESPACE } = Generator;

    const environmentOptions = {
      env: this,
      resolved: Generator.resolved || Environment.UNKNOWN_RESOLVED,
      namespace,
    };

    const generator = new Generator(args, {
      ...this.sharedOptions,
      ...options,
      ...environmentOptions,
    });

    generator._environmentOptions = {
      ...this.options,
      ...this.sharedOptions,
      ...environmentOptions,
    };

    if (!options.help && generator._postConstruct) {
      await generator._postConstruct();
    }

    return generator;
  }

  /**
   * Compose with the generator.
   *
   * @param {String} namespaceOrPath
   * @param {Array} [args]
   * @param {Object} [options]
   * @param {Boolean} [schedule]
   * @return {Generator} The instantiated generator or the singleton instance.
   */
  async composeWith(generator, args, options, schedule = true) {
    if (typeof args === 'boolean') {
      schedule = args;
      args = undefined;
      options = undefined;
    } else if (typeof options === 'boolean') {
      schedule = options;
      options = undefined;
    }

    const generatorInstance = await this.create(generator, args, options);
    return this.queueGenerator(generatorInstance, schedule);
  }

  /**
   * Queue generator run (queue itself tasks).
   *
   * @param {Generator} generator Generator instance
   * @param {boolean} [schedule=false] Whether to schedule the generator run.
   * @return {Generator} The generator or singleton instance.
   */
  async queueGenerator(generator, schedule = false) {
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

      if (!generator.options.forwardErrorToEnvironment) {
        generator.on('error', error => this.emit('error', error));
      }

      generator.promise = generator.run();
    };

    if (schedule) {
      this.queueTask('environment:run', () => runGenerator());
    } else {
      await runGenerator();
    }

    return generator;
  }

  /**
   * Tries to locate and run a specific generator. The lookup is done depending
   * on the provided arguments, options and the list of registered generators.
   *
   * When the environment was unable to resolve a generator, an error is raised.
   *
   * @param {String|Array} args
   * @param {Object}       [options]
   */
  async run(args, options, done) {
    if (done || typeof options === 'function' || typeof args === 'function') {
      throw new Error('Callback support have been removed.');
    }

    args = Array.isArray(args) ? args : splitArgsFromString(args);
    options = { ...options };

    const name = args.shift();
    if (!name) {
      throw new Error('Must provide at least one argument, the generator namespace to invoke.');
    }

    this.loadEnvironmentOptions(options);

    const instantiateAndRun = async () => {
      const generator = await this.create(name, args, {
        ...options,
        initialGenerator: true,
      });
      if (options.help) {
        console.log(generator.help());
        return undefined;
      }

      return this.runGenerator(generator);
    };

    if (this.options.experimental && !this.get(name)) {
      debug(`Generator ${name} was not found, trying to install it`);
      try {
        await this.prepareEnvironment(name);
      } catch {}
    }

    return instantiateAndRun();
  }

  /**
   * Start Environment queue
   * @param {Object} options - Conflicter options.
   */
  start(options) {
    return new Promise((resolve, reject) => {
      if (this.conflicter === undefined) {
        this.conflicterOptions = pick(defaults({}, this.options, options), [
          'force',
          'bail',
          'ignoreWhitespace',
          'dryRun',
          'skipYoResolve',
          'logCwd',
        ]);
        this.conflicterOptions.cwd = this.conflicterOptions.logCwd;

        this.queueCommit();
        this.queuePackageManagerInstall();
      }

      /*
       * Listen to errors and reject if emmited.
       * Some cases the generator relied at the behavior that the running process
       * would be killed if an error is thrown to environment.
       * Make sure to not rely on that behavior.
       */
      this.on('error', error => {
        reject(error);
      });

      /*
       * For backward compatibility
       */
      this.on('generator:reject', error => {
        reject(error);
      });

      this.on('generator:resolve', error => {
        resolve(error);
      });

      this.runLoop.on('error', error => {
        this.emit('error', error);
        this.adapter.close();
      });

      this.runLoop.on('paused', () => {
        this.emit('paused');
      });

      this.once('end', () => {
        resolve();
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
   * Convenience method to run the generator with callbackWrapper.
   * See https://github.com/yeoman/environment/pull/101
   *
   * @param {Object}       generator
   */
  async runGenerator(generator) {
    generator = await generator;
    generator = await this.queueGenerator(generator);

    this.compatibilityMode = generator.queueTasks ? false : 'v4';
    this._rootGenerator = this._rootGenerator || generator;

    return this.start(generator.options);
  }

  /**
   * Get the first generator that was queued to run in this environment.
   *
   * @return {Generator} generator queued to run in this environment.
   */
  rootGenerator() {
    return this._rootGenerator;
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
  namespace(filepath, lookups = this.lookups) {
    if (!filepath) {
      throw new Error('Missing namespace');
    }

    // Normalize path
    let ns = slash(filepath);

    // Ignore path before latest node_modules
    const REPOSITORY_PATH = '/node_modules/';
    if (ns.includes(REPOSITORY_PATH)) {
      ns = ns.slice(ns.lastIndexOf(REPOSITORY_PATH) + REPOSITORY_PATH.length, ns.length);
    }

    // Cleanup extension and normalize path for differents OS
    const parsed = path.parse(ns);
    ns = parsed.dir ? `${parsed.dir}/${parsed.name}` : parsed.name;

    // Sort lookups by length so biggest are removed first
    const nsLookups = _([...lookups, '..'])
      .map(found => slash(found))
      .sortBy('length')
      .value()
      .reverse();

    // If `ns` contains a lookup dir in its path, remove it.
    for (let lookup of nsLookups) {
      // Only match full directory (begin with leading slash or start of input, end with trailing slash)
      lookup = new RegExp(`(?:/|^)${escapeStrRe(lookup)}(?=/)`, 'g');
      ns = ns.replace(lookup, '');
    }

    const folders = ns.split('/');
    const scope = findLast(folders, folder => folder.indexOf('@') === 0);

    // Cleanup `ns` from unwanted parts and then normalize slashes to `:`
    ns = ns
      .replace(/\/\//g, '') // Remove double `/`
      .replace(/(.*generator-)/, '') // Remove before `generator-`
      .replace(/\/(index|main)$/, '') // Remove `/index` or `/main`
      .replace(/^\//, '') // Remove leading `/`
      .replace(/\/+/g, ':'); // Replace slashes by `:`

    if (scope) {
      ns = `${scope}/${ns}`;
    }

    debug('Resolve namespaces for %s: %s', filepath, ns);

    return ns;
  }

  /**
   * Resolve a module path
   * @param  {String} moduleId - Filepath or module name
   * @return {String}          - The resolved path leading to the module
   */
  resolveModulePath(moduleId) {
    if (moduleId[0] === '.') {
      moduleId = path.resolve(moduleId);
    }

    moduleId = untildify(moduleId);
    moduleId = path.normalize(moduleId);

    if (path.extname(moduleId) === '') {
      moduleId += path.sep;
    }

    let resolved;
    // Win32: moduleId is resolving as moduleId.js or moduleId.json instead of moduleId/index.js, workaround it.
    if (process.platform === 'win32' && path.extname(moduleId) === '') {
      try {
        resolved = require.resolve(path.join(moduleId, 'index'));
      } catch {}
    }

    return resolved || require.resolve(moduleId);
  }

  /**
   * Apply transform streams to file in MemFs.
   * @param {Transform[]} transformStreams - transform streams to be applied.
   * @param {Stream} [stream] - files stream, defaults to this.sharedFs.stream().
   * @return {Promise<void>}
   */
  async applyTransforms(transformStreams, options = {}) {
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
        await pipeline(
          stream,
          ...transformStreams,
          passthrough(file => {
            step('Completed', path.relative(this.logCwd, file.path));
          }),
        );
      },
      { name, disabled: !(options?.log ?? true) },
    );
  }

  /**
   * Commits the MemFs to the disc.
   * @param {Stream} [stream] - files stream, defaults to this.sharedFs.stream().
   * @return {Promise}
   */
  commitSharedFs(stream = this.sharedFs.stream({ filter: file => isFilePending(file) })) {
    debug('committing files');

    return this.fs.commit(
      [
        passthrough(
          file => {
            file.conflicter = 'force';
          },
          { pattern: '**/{.yo-rc.json,.yo-resolve,.yo-rc-global.json}' },
        ),
        createYoResolveTransform(),
        createConflicterTransform(this.adapter, this.conflicterOptions),
        // Use custom commit transform due to out of order transform.
        createCommitTransform(this.fs),
      ],
      stream,
    );
  }

  /**
   * Queue environment's commit task.
   */
  queueCommit() {
    const queueCommit = () => {
      debug('Queueing conflicts task');
      this.queueTask(
        'environment:conflicts',
        async () => {
          const { customCommitTask = this.commitSharedFs.bind(this) } = this.composedStore;
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
  queuePackageManagerInstall() {
    const { adapter, sharedFs: memFs } = this;
    const { skipInstall, nodePackageManager } = this.options;
    const { customInstallTask } = this.composedStore;
    this.queueTask(
      'install',
      () => {
        if (this.compatibilityMode === 'v4') {
          debug('Running in generator < 5 compatibility. Package manager install is done by the generator.');
          return false;
        }

        return packageManagerInstallTask({
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
   * Queue tasks
   * @param {string} priority
   * @param {(...args: any[]) => void | Promise<void>} task
   * @param {{ once?: string, startQueue?: boolean }} [options]
   */
  queueTask(priority, task, options) {
    return new Promise((resolve, reject) => {
      this.runLoop.add(
        priority,
        async (done, stop) => {
          try {
            const result = await task();
            done(result);
            resolve(result);
          } catch (error) {
            stop(error);
            reject(error);
          }
        },
        {
          once: options.once,
          run: options.startQueue ?? false,
        },
      );
    });
  }

  /**
   * Add priority
   * @param {string} priority
   * @param {string} [before]
   */
  addPriority(priority, before) {
    if (this.runLoop.queueNames.includes(priority)) {
      return;
    }
    this.runLoop.addSubQueue(priority, before);
  }
}

Object.assign(Environment.prototype, resolver);
Object.assign(Environment.prototype, composability);
Object.assign(Environment.prototype, namespaceCompasibilityMixin);

export default Environment;
