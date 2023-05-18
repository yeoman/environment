import path, { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { QueuedAdapter } from '@yeoman/adapter';
import { toNamespace } from '@yeoman/namespace';
import { defaults, pick, uniq } from 'lodash-es';
import GroupedQueue from 'grouped-queue';
import { create as createMemFs } from 'mem-fs';
import { create as createMemFsEditor } from 'mem-fs-editor';
import createdLogger from 'debug';
import { flyImport } from 'fly-import';
import YeomanCommand, { addEnvironmentOptions } from './util/command.js';
import { findPackagesIn, getNpmPaths, moduleLookupSync } from './module-lookup.js';
import EnvironmentBase from './environment-base.js';
import { asNamespace, defaultLookups } from './util/namespace.js';
import { defaultQueues } from './constants.js';

const debug = createdLogger('yeoman:environment');

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

export default class Environment extends EnvironmentBase {
  static get UNKNOWN_NAMESPACE() {
    return 'unknownnamespace';
  }

  static get UNKNOWN_RESOLVED() {
    return 'unknown';
  }

  static get queues() {
    return [...defaultQueues];
  }

  static get lookups() {
    return [...defaultLookups];
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
    options.packagePatterns = options.packagePatterns || toNamespace(name)?.generatorHint;

    options.npmPaths = options.npmPaths || getNpmPaths({ localOnly: options.localOnly, filePaths: false }).reverse();
    options.packagePatterns = options.packagePatterns || 'generator-*';
    options.packagePaths = options.packagePaths || findPackagesIn(options.npmPaths, options.packagePatterns);

    let paths = options.singleResult ? undefined : [];
    moduleLookupSync(options, ({ files, packagePath }) => {
      for (const filename of files) {
        const fileNS = asNamespace(filename, { lookups: Environment.lookups });
        if (namespace === fileNS || (options.packagePath && namespace === Environment.namespaceToName(fileNS))) {
          // Version 2.6.0 returned pattern instead of modulePath for options.packagePath
          const returnPath = options.packagePath ? packagePath : options.generatorPath ? path.posix.join(filename, '../../') : filename;
          if (options.singleResult) {
            paths = returnPath;
            return filename;
          }

          paths.push(returnPath);
        }
      }
      return undefined;
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
    if (adapter) {
      options.adapter = adapter;
    }
    super(options);

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
   * Returns the list of registered namespace.
   * @return {Array}
   */
  namespaces() {
    return this.store.namespaces();
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
    return uniq(Object.keys(this.getGeneratorsMeta()).map(namespace => Environment.namespaceToName(namespace)));
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
   * Compose with the generator.
   *
   * @param {String} namespaceOrPath
   * @param {Array} [args]
   * @param {Object} [options]
   * @param {Boolean} [schedule]
   * @return {Generator} The instantiated generator or the singleton instance.
   */
  async composeWith(generator, args, options, composeOptions) {
    let schedule;
    if (typeof args === 'boolean') {
      schedule = args;
      args = undefined;
      options = undefined;
    } else if (typeof options === 'boolean') {
      schedule = options;
      options = undefined;
    }
    schedule = typeof composeOptions === 'boolean' ? composeOptions : composeOptions?.schedule ?? true;

    const generatorInstance = await this.create(generator, args, options);
    return this.queueGenerator(generatorInstance, { schedule });
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
  async run(args, options) {
    args = Array.isArray(args) ? args : splitArgsFromString(args);
    options = { ...options };

    const name = args.shift();
    if (!name) {
      throw new Error('Must provide at least one argument, the generator namespace to invoke.');
    }

    this.loadEnvironmentOptions(options);

    if (this.experimental && !this.get(name)) {
      debug(`Generator ${name} was not found, trying to install it`);
      try {
        await this.prepareEnvironment(name);
      } catch {}
    }

    const generator = await this.create(name, {
      generatorArgs: args,
      generatorOptions: {
        ...options,
        initialGenerator: true,
      },
    });

    if (options.help) {
      console.log(generator.help());
      return undefined;
    }

    return this.runGenerator(generator);
  }
}
