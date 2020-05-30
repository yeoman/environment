'use strict';
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const chalk = require('chalk');
const _ = require('lodash');
const GroupedQueue = require('grouped-queue');
const escapeStrRe = require('escape-string-regexp');
const untildify = require('untildify');
const memFs = require('mem-fs');
const FileEditor = require('mem-fs-editor');
const debug = require('debug')('yeoman:environment');
const isScoped = require('is-scoped');

const ENVIRONMENT_VERSION = require('../package.json').version;
const Store = require('./store');
const composability = require('./composability');
const resolver = require('./resolver');
const TerminalAdapter = require('./adapter');
const YeomanRepository = require('./util/repository');

/**
 * Two-step argument splitting function that first splits arguments in quotes,
 * and then splits up the remaining arguments if they are not part of a quote.
 */
function splitArgsFromString(argsString) {
  let result = [];
  const quoteSeparatedArgs = argsString.split(/(\x22[^\x22]*\x22)/).filter(x => x);
  quoteSeparatedArgs.forEach(arg => {
    if (arg.match('\x22')) {
      result.push(arg.replace(/\x22/g, ''));
    } else {
      result = result.concat(arg.trim().split(' '));
    }
  });
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

class Environment extends EventEmitter {
  static get UNKNOWN_NAMESPACE() {
    return 'unknownnamespace';
  }

  static get UNKNOWN_RESOLVED() {
    return 'unknown';
  }

  static get queues() {
    return [
      'initializing',
      'prompting',
      'configuring',
      'default',
      'writing',
      'conflicts',
      'install',
      'end'
    ];
  }

  static get lookups() {
    return ['.', 'generators', 'lib/generators'];
  }

  /**
   * Make sure the Environment present expected methods if an old version is
   * passed to a Generator.
   * @param  {Environment} env
   * @return {Environment} The updated env
   */
  static enforceUpdate(env) {
    if (!env.adapter) {
      env.adapter = new TerminalAdapter();
    }

    if (!env.runLoop) {
      env.runLoop = new GroupedQueue(Environment.queues);
    }

    if (!env.sharedFs) {
      env.sharedFs = memFs.create();
    }

    if (!env.fs) {
      env.fs = FileEditor.create(env.sharedFs);
    }

    return env;
  }

  /**
   * Factory method to create an environment instance. Take same parameters as the
   * Environment constructor.
   *
   * @see This method take the same arguments as {@link Environment} constructor
   *
   * @return {Environment} a new Environment instance
   */
  static createEnv(args, opts, adapter) {
    return new Environment(args, opts, adapter);
  }

  /**
   * Factory method to create an environment instance. Take same parameters as the
   * Environment constructor.
   *
   * @param {String} version - Version of the Environment
   * @param {...any} args - Same arguments as {@link Environment} constructor.
   * @return {Environment} a new Environment instance
   */
  static createEnvWithVersion(version, ...args) {
    const VersionedEnvironment = Environment.repository.requireModule('yeoman-environment', version);
    return new VersionedEnvironment(...args);
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
  static lookupGenerator(namespace, options = {singleResult: true}) {
    if (typeof options === 'boolean') {
      options = {singleResult: true, localOnly: options};
    } else {
      // Keep compatibility with options.multiple
      options = {singleResult: !options.multiple, ...options};
    }

    options.filePatterns = options.filePatterns || Environment.lookups.map(prefix => path.join(prefix, '*/index.{js,ts}'));

    const name = Environment.namespaceToName(namespace);
    options.packagePatterns = options.packagePatterns || getGeneratorHint(name);
    const envProt = Environment.prototype;

    options.npmPaths = options.npmPaths || envProt.getNpmPaths(options.localOnly).reverse();
    options.packagePatterns = options.packagePatterns || 'generator-*';
    options.packagePaths = options.packagePaths || resolver.packageLookup.findPackagesIn(options.npmPaths, options);
    options.globbyDeep = options.globbyDeep === undefined ? 1 : options.globbyDeep;

    let paths = options.singleResult ? undefined : [];
    resolver.packageLookup.sync(options, module => {
      const filename = module.filePath;
      const fileNS = envProt.namespace(filename, Environment.lookups);
      if (namespace === fileNS || (options.packagePath && namespace === Environment.namespaceToName(fileNS))) {
        // Version 2.6.0 returned pattern instead of modulePath for options.packagePath
        const returnPath = options.packagePath ? module.packagePath : (options.generatorPath ? path.posix.join(filename, '../../') : filename);
        if (options.singleResult) {
          paths = returnPath;
          return true;
        }
        paths.push(returnPath);
      }
      return false;
    });

    return paths;
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
   * (e.g. IDE plugins), otherwise a `TerminalAdapter` is instantiated by default
   *
   * @constructor
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
   * @param {TerminalAdapter} [adaper] - A TerminalAdapter instance or another object
   *                                     implementing this adapter interface. This is how
   *                                     you'd interface Yeoman with a GUI or an editor.
   */
  constructor(args, opts, adapter) {
    super();

    args = args || [];
    this.arguments = Array.isArray(args) ? args : splitArgsFromString(args);
    this.options = opts || {};
    this.adapter = adapter || new TerminalAdapter({console: this.options.console, stdin: this.options.stdin, stderr: this.options.stderr});
    this.cwd = this.options.cwd || process.cwd();
    this.store = new Store();

    this.runLoop = new GroupedQueue(Environment.queues);
    this.sharedFs = memFs.create();

    // Each composed generator might set listeners on these shared resources. Let's make sure
    // Node won't complain about event listeners leaks.
    this.runLoop.setMaxListeners(0);
    this.sharedFs.setMaxListeners(0);

    // Create a shared mem-fs-editor instance.
    this.fs = FileEditor.create(this.sharedFs);

    this.lookups = Environment.lookups;
    this.aliases = [];

    this.alias(/^([^:]+)$/, '$1:app');

    // Used sharedOptions from options if exists.
    this.sharedOptions = this.options.sharedOptions || {};
    // Remove Unecessary sharedOptions from options
    delete this.options.sharedOptions;

    // Create a default sharedData.
    this.sharedOptions.sharedData = this.sharedOptions.sharedData || {};

    const {newErrorHandler = false} = this.options;
    // Pass forwardErrorToEnvironment to generators.
    this.sharedOptions.forwardErrorToEnvironment =
      this.sharedOptions.forwardErrorToEnvironment === undefined ? newErrorHandler : this.sharedOptions.forwardErrorToEnvironment;

    this.repository = new YeomanRepository(this.options.yeomanRepository);

    if (!this.options.experimental) {
      process.argv.forEach(val => {
        if (val === '--experimental') {
          this.options.experimental = true;
          debug('Set environment as experimental');
        }
      });
    }

    if (this.options.experimental) {
      if (this.sharedOptions.skipLocalCache === undefined) {
        this.sharedOptions.skipLocalCache = true;
      }
      Object.assign(this, require('./namespace'));
      Object.assign(this, require('./namespace-composability'));
    }

    this._generators = {};
  }

  /**
   * Error handler taking `err` instance of Error.
   *
   * The `error` event is emitted with the error object, if no `error` listener
   * is registered, then we throw the error.
   *
   * @param  {Object} err
   * @param  {Boolean} [verifyListener] - Only emit error if a listener is registered.
   * @return {Error}  err
   */
  error(err, verifyListener) {
    err = err instanceof Error ? err : new Error(err);

    // If error listener is not registered, the error is thrown.
    // https://nodejs.org/api/events.html#events_error_events
    if (!verifyListener || this.listenerCount('error')) {
      this.emit('error', err);
    }

    return err;
  }

  /**
   * Outputs the general help and usage. Optionally, if generators have been
   * registered, the list of available generators is also displayed.
   *
   * @param {String} name
   */
  help(name) {
    name = name || 'init';

    const out = [
      'Usage: :binary: GENERATOR [args] [options]',
      '',
      'General options:',
      '  --help       # Print generator\'s options and usage',
      '  -f, --force  # Overwrite files that already exist',
      '',
      'Please choose a generator below.',
      ''
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

      if (group.length >= 1) {
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
  register(name, namespace, packagePath) {
    if (typeof name !== 'string') {
      return this.error(new Error('You must provide a generator name to register.'));
    }

    const modulePath = this.resolveModulePath(name);
    namespace = namespace || this.namespace(modulePath);

    if (!namespace) {
      return this.error(new Error('Unable to determine namespace.'));
    }

    // Generator is already registered and matches the current namespace.
    if (this.store._meta[namespace] && this.store._meta[namespace].resolved === modulePath) {
      return this;
    }

    this.store.add(namespace, modulePath, modulePath, packagePath);
    const packageNS = Environment.namespaceToName(namespace);
    this.store.addPackageNS(packageNS);
    if (packagePath) {
      this.store.addPackage(packageNS, packagePath);
    }

    debug('Registered %s (%s) on package %s (%s)', namespace, modulePath, packageNS, packagePath);
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
      return this.error(new Error('You must provide a stub function to register.'));
    }

    if (typeof namespace !== 'string') {
      return this.error(new Error('You must provide a namespace to register.'));
    }

    this.store.add(namespace, Generator, resolved, packagePath);
    const packageNS = Environment.namespaceToName(namespace);
    this.store.addPackageNS(packageNS);
    if (packagePath) {
      this.store.addPackage(packageNS, packagePath);
    }

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
      } catch (_) {
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
   * Get registered generators names
   *
   * @return {Array}
   */
  getGeneratorNames() {
    return _.uniq(Object.keys(this.getGeneratorsMeta()).map(Environment.namespaceToName));
  }

  /**
   * Verify if a package namespace already have been registered.
   *
   * @param  {String} [packageNS] - namespace of the package.
   * @return {boolean} - true if any generator of the package has been registered
   */
  isPackageRegistered(packageNS) {
    return this.getRegisteredPackages().includes(packageNS);
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
  getPackagePath(namespace) {
    if (namespace.includes(':')) {
      const generator = this.get(namespace) || {};
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
    return this.store.getPackagesPaths()[namespace] ||
      this.store.getPackagesPaths()[Environment.namespaceToName(this.alias(namespace))];
  }

  /**
   * Get a single generator from the registered list of generators. The lookup is
   * based on generator's namespace, "walking up" the namespaces until a matching
   * is found. Eg. if an `angular:common` namespace is registered, and we try to
   * get `angular:common:all` then we get `angular:common` as a fallback (unless
   * an `angular:common:all` generator is registered).
   *
   * @param  {String} namespaceOrPath
   * @return {Generator|null} - the generator registered under the namespace
   */
  get(namespaceOrPath) {
    // Stop the recursive search if nothing is left
    if (!namespaceOrPath) {
      return;
    }

    const parsed = this.toNamespace ? this.toNamespace(namespaceOrPath) : undefined;
    if (parsed && this.getByNamespace) {
      return this.getByNamespace(parsed);
    }

    let namespace = namespaceOrPath;

    // Legacy yeoman-generator `#hookFor()` function is passing the generator path as part
    // of the namespace. If we find a path delimiter in the namespace, then ignore the
    // last part of the namespace.
    const parts = namespaceOrPath.split(':');
    const maybePath = _.last(parts);
    if (parts.length > 1 && /[/\\]/.test(maybePath)) {
      parts.pop();

      // We also want to remove the drive letter on windows
      if (maybePath.includes('\\') && _.last(parts).length === 1) {
        parts.pop();
      }

      namespace = parts.join(':');
    }

    return this._findGeneratorClass(this.store.get(namespace) ||
      this.store.get(this.alias(namespace)) ||
      // Namespace is empty if namespaceOrPath contains a win32 absolute path of the form 'C:\path\to\generator'.
      // for this reason we pass namespaceOrPath to the getByPath function.
      this.getByPath(namespaceOrPath));
  }

  /**
   * Get a generator by path instead of namespace.
   * @param  {String} path
   * @return {Generator|null} - the generator found at the location
   */
  getByPath(path) {
    if (fs.existsSync(path)) {
      const namespace = this.namespace(path);
      this.register(path, namespace);

      return this.get(namespace);
    }
  }

  /**
   * Find generator's class constructor.
   * @private
   * @param  {Object} Generator - Object containing the class.
   * @return {Function} Generator's constructor.
   */
  _findGeneratorClass(Generator) {
    if (!Generator) {
      return Generator;
    }
    if (typeof Generator.default === 'function') {
      Generator.default.resolved = Generator.resolved;
      Generator.default.namespace = Generator.namespace;
      return Generator.default;
    }
    if (typeof Generator.createGenerator === 'function') {
      const Gen = Generator.createGenerator(this);
      Gen.resolved = Generator.resolved;
      Gen.namespace = Generator.namespace;
      return Gen;
    }
    if (typeof Generator !== 'function') {
      throw new TypeError('The generator doesn\'t provides a constructor.');
    }
    return Generator;
  }

  /**
   * Create is the Generator factory. It takes a namespace to lookup and optional
   * hash of options, that lets you define `arguments` and `options` to
   * instantiate the generator with.
   *
   * An error is raised on invalid namespace.
   *
   * @param {String} namespaceOrPath
   * @param {Object} options
   */
  create(namespaceOrPath, options) {
    options = options || {};
    const namespace = this.toNamespace ? this.toNamespace(namespaceOrPath) : undefined;

    let Generator;
    if (namespace && this.getByNamespace) {
      options.namespaceId = namespace;
      Generator = this.getByNamespace(namespace);
      if (!Generator) {
        this.lookupLocalNamespaces(namespace);
        Generator = this.getByNamespace(namespace);
      }
    }

    try {
      Generator = Generator || this.get(namespaceOrPath);
    } catch (error) {
      return this.error(error);
    }

    if (namespace && Generator && Generator.namespace && Generator.namespace !== Environment.UNKNOWN_NAMESPACE) {
      // Update namespace object in case of aliased namespace.
      namespace.namespace = Generator.namespace;
    }

    if (typeof Generator !== 'function') {
      if (namespace && namespace.optional) {
        return undefined;
      }
      const generatorHint = namespace ? namespace.generatorHint : getGeneratorHint(namespaceOrPath);

      return this.error(
        new Error(
          chalk.red('You don\'t seem to have a generator with the name “' + namespaceOrPath + '” installed.') + '\n' +
          'But help is on the way:\n\n' +
          'You can see available generators via ' +
          chalk.yellow('npm search yeoman-generator') + ' or via ' + chalk.yellow('http://yeoman.io/generators/') + '. \n' +
          'Install them with ' + chalk.yellow(`npm install ${generatorHint}`) + '.\n\n' +
          'To see all your installed generators run ' + chalk.yellow('yo') + ' without any arguments. ' +
          'Adding the ' + chalk.yellow('--help') + ' option will also show subgenerators. \n\n' +
          'If ' + chalk.yellow('yo') + ' cannot find the generator, run ' + chalk.yellow('yo doctor') + ' to troubleshoot your system.'
        ),
        options.verifyListener
      );
    }

    try {
      return this.instantiate(Generator, options);
    } catch (error) {
      return this.error(error);
    }
  }

  /**
   * Instantiate a Generator with metadatas
   *
   * @param {Class<Generator>} generator      Generator class
   * @param {Object}       [options]
   * @param {Array|String} [options.arguments] Arguments to pass the instance
   * @param {Object}       [options.options]   Options to pass the instance
   */
  instantiate(Generator, options) {
    options = options || {};

    let args = options.arguments || options.args || _.clone(this.arguments);
    args = Array.isArray(args) ? args : splitArgsFromString(args);

    const opts = options.options || this.options;

    const environmentOptions = {
      env: this,
      resolved: Generator.resolved || Environment.UNKNOWN_RESOLVED,
      namespace: Generator.namespace,
      namespaceId: options.namespaceId
    };
    const generator = new Generator(args, {
      ...this.sharedOptions,
      ...opts,
      ...environmentOptions
    });
    generator._environmentOptions = {
      ...this.options,
      ...this.sharedOptions,
      ...environmentOptions
    };

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
   * @param {Function}     [done]
   */
  run(args, options, done) {
    args = args || this.arguments;

    if (typeof options === 'object' && this.options.experimental) {
      const {skipInstall, skipCache, forceInstall, skipLocalCache} = options;
      _.defaults(this.sharedOptions, {
        skipInstall, skipCache, forceInstall, skipLocalCache
      });
    }

    if (typeof options === 'function') {
      done = options;
      options = this.options;
    }

    if (typeof args === 'function') {
      done = args;
      options = this.options;
      args = this.arguments;
    }

    args = Array.isArray(args) ? args : splitArgsFromString(args);
    options = {...options} || {...this.options};

    const name = args.shift();
    if (!name) {
      return Promise.reject(
        this.error(new Error('Must provide at least one argument, the generator namespace to invoke.'), true)
      );
    }

    const instantiateAndRun = () => {
      const generator = this.create(name, {
        args,
        options,
        verifyListener: true
      });

      if (generator instanceof Error) {
        return Promise.reject(generator);
      }

      if (options.help) {
        return console.log(generator.help());
      }

      return this.runGenerator(generator, done);
    };

    if (this.options.experimental) {
      this.compose = this.createCompose(this.cwd);
      options.compose = this.compose;
    }

    if (this.options.experimental && !this.get(name)) {
      debug(`Generator ${name} was not found, trying to install it`);
      return this.prepareEnvironment(name).then(() => {
        return instantiateAndRun();
      }).catch(() => instantiateAndRun());
    }

    return instantiateAndRun();
  }

  /**
   * Convenience method to run the generator with callbackWrapper.
   * See https://github.com/yeoman/environment/pull/101
   *
   * @param {Object}       generator
   * @param {Function}     [done]
   */
  runGenerator(generator, done) {
    const {newErrorHandler} = this.options;
    const promise = new Promise((resolve, reject) => {
      // Old behavior throws an exception directly to node.js due to scheduled throw.
      // https://nodejs.org/api/events.html#events_error_events
      if (newErrorHandler) {
        // Listen to errors and reject if emmited.
        this.on('error', error => {
          /* Pause disabled due to grouped-queue default behavior.
           * Multiple runLoop.run is scheduled by default, this causes a paused queue
           * to continue right after it have been paused.
           */
          // this.runLoop.pause();
          reject(error);
        });
      }

      // Root generator always forwarded to reject.
      generator.on('error', reject);

      // If runLoop has ended, the environment has ended too.
      this.runLoop.on('end', () => {
        resolve();
        this.emit('end');
      });

      /*
       * On success cb() is called.
       * On reject cb(err) is called.
       * yeoman-generator 2.0.5 returns self.
       * yeoman-generator > 3.0.0 returns a Promise.
       * Returned promise doesn't rejects on 'error' event, so listen to it.
       */
      const generatorCallback = err => {
        return err === undefined ? resolve() : reject(err);
      };

      const genPromise = generator.run(generatorCallback);
      if (genPromise instanceof Promise) {
        genPromise.then(resolve, reject);
      }
    });

    this._rootGenerator = this._rootGenerator || generator;
    if (done) {
      return promise.then(done, done);
    }

    return promise;
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

    // Cleanup extension and normalize path for differents OS
    let ns = path.normalize(filepath.replace(new RegExp(escapeStrRe(path.extname(filepath)) + '$'), ''));

    // Sort lookups by length so biggest are removed first
    const nsLookups = _(lookups.concat(['..'])).map(path.normalize).sortBy('length').value().reverse();

    // If `ns` contains a lookup dir in its path, remove it.
    ns = nsLookups.reduce((ns, lookup) => {
      // Only match full directory (begin with leading slash or start of input, end with trailing slash)
      lookup = new RegExp(`(?:\\\\|/|^)${escapeStrRe(lookup)}(?=\\\\|/)`, 'g');
      return ns.replace(lookup, '');
    }, ns);

    const folders = ns.split(path.sep);
    const scope = _.findLast(folders, folder => folder.indexOf('@') === 0);

    // Cleanup `ns` from unwanted parts and then normalize slashes to `:`
    ns = ns
      .replace(/(.*generator-)/, '') // Remove before `generator-`
      .replace(/[/\\](index|main)$/, '') // Remove `/index` or `/main`
      .replace(/^[/\\]+/, '') // Remove leading `/`
      .replace(/[/\\]+/g, ':'); // Replace slashes by `:`

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
      } catch (_) {
      }
    }

    return resolved || require.resolve(moduleId);
  }
}

Object.assign(Environment.prototype, resolver);
Object.assign(Environment.prototype, composability);

/**
 * Expose the utilities on the module
 * @see {@link env/util}
 */
Environment.util = require('./util/util');

/**
 * Expose the repository on the module
 * @see {@link env/repository}
 * @private
 */
Environment.repository = new YeomanRepository();

module.exports = Environment;
