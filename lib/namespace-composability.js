'use strict';
const debug = require('debug')('yeoman:environment:compose');
const EventEmitter = require('events');
const _ = require('lodash');
const NpmApi = require('npm-api');
const path = require('path');
const semver = require('semver');

const npm = new NpmApi();

/**
 * @mixin
 * @alias env/namespace-composability
 */
const composability = module.exports;

/**
 * Get a generator only by namespace.
 * @private
 * @param  {YeomanNamespace|String} namespace
 * @return {Generator|null} - the generator found at the location
 */
composability.getByNamespace = function (namespace) {
  const ns = this.requireNamespace(namespace).namespace;
  const Generator = this.store.get(ns) || this.store.get(this.alias(ns));
  return this._findGeneratorClass(Generator);
};

/**
 * Lookup and register generators from the custom local repository.
 *
 * @private
 * @param  {YeomanNamespace[]} namespacesToLookup - namespaces to lookup.
 * @return {Object[]} List of generators
 */
composability.lookupLocalNamespaces = function (namespacesToLookup) {
  if (!namespacesToLookup) {
    return [];
  }
  namespacesToLookup = Array.isArray(namespacesToLookup) ? namespacesToLookup : [namespacesToLookup];
  namespacesToLookup = namespacesToLookup.map(ns => this.requireNamespace(ns));
  // Keep only those packages that has a compatible version.
  namespacesToLookup = namespacesToLookup.filter(ns => {
    return this.repository.verifyInstalledVersion(ns.generatorHint, ns.semver) !== undefined;
  });
  return this.lookupLocalPackages(namespacesToLookup.map(ns => ns.generatorHint));
};

/**
 * Search for generators or sub generators by namespace.
 *
 * @private
 * @param {boolean|Object} [options] options passed to lookup. Options singleResult,
 *                                   filePatterns and packagePatterns can be overridden
 * @return {Array|Object} List of generators
 */
composability.lookupNamespaces = function (namespaces, options = {}) {
  if (!namespaces) {
    return [];
  }
  namespaces = Array.isArray(namespaces) ? namespaces : [namespaces];
  namespaces = namespaces.map(ns => this.requireNamespace(ns));
  const opts = namespaces.map(ns => {
    const nsOpts = {packagePatterns: ns.generatorHint};
    if (ns.generator) {
      // Build filePatterns to look specifically for the namespace.
      const genPath = ns.generator.split(':').join('/');
      let filePatterns = [`${genPath}/index.?s`, `${genPath}.?s`];
      const lookups = options.lookups || this.lookups;
      filePatterns = lookups.map(prefix => {
        return filePatterns.map(pattern => path.join(prefix, pattern));
      }).reduce(
        (accumulator, currentValue) => accumulator.concat(currentValue),
        []
      );
      nsOpts.filePatterns = filePatterns;
      nsOpts.singleResult = true;
    }
    return nsOpts;
  });
  return opts.map(opt => this.lookup({...opt, ...options})).reduce((acc, cur) => acc.concat(cur), []);
};

/**
 * Load or install namespaces based on the namespace flag
 *
 * @private
 * @param  {String|Array} - namespaces
 * @return  {boolean} - true if every required namespace was found.
 */
composability.prepareEnvironment = async function (namespaces) {
  debug('prepareEnvironment %o', namespaces);
  namespaces = Array.isArray(namespaces) ? namespaces : [namespaces];
  let missing = namespaces.map(ns => this.requireNamespace(ns));

  const updateMissing = () => {
    // Remove already loaded namespaces
    missing = missing.filter(ns => !this.getByNamespace(ns));
    return missing;
  };

  const assertMissing = missing => {
    if (missing.length !== 0) {
      throw new Error(`Error preparing environment for ${missing.map(ns => ns.complete).join()}`);
    }
  };

  updateMissing();

  // Install missing
  const toInstall = {};

  const addPeerGenerators = async (packageName, packageRange = '*') => {
    const npmRepo = npm.repo(packageName);
    let packages;
    try {
      packages = await npmRepo.package('all');
      if (packages.error) {
        throw new Error(packages.error);
      }
    } catch (error) {
      debug(`Could not find npm package for ${packageName}`, error);
      return false;
    }

    let version = semver.maxSatisfying(Object.keys(packages.versions), packageRange);
    if (version === null) {
      version = semver.maxSatisfying(Object.keys(packages.versions), '*');
      console.error(`Error looking for ${packageName} version ${packageRange}, using ${version}`);
    }
    toInstall[packageName] = version;

    const peerDependencies = packages.versions[version].peerDependencies;
    if (peerDependencies) {
      for (const peerPackageName in peerDependencies) {
        if (!Object.prototype.hasOwnProperty.call(peerDependencies, peerPackageName)) {
          continue;
        }
        const peerNS = this.parseNamespace(peerPackageName);
        if (!peerNS) {
          continue;
        }
        if (peerNS.unscoped.startsWith('generator-') && toInstall[peerPackageName] === undefined) {
          const packageRange = peerDependencies[peerPackageName];
          if (this.repository.verifyInstalledVersion(peerPackageName, packageRange)) {
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          await addPeerGenerators(peerPackageName, packageRange);
        }
      }
    }
    return true;
  };

  debug('Looking for peer dependecies %o', namespaces);
  const toLookup = [];
  // eslint-disable-next-line guard-for-in
  for (const i in missing) {
    const ns = missing[i];
    const packageName = ns.generatorHint;
    const packageRange = ns.semver;
    if (packageRange && !semver.validRange(packageRange)) {
      continue;
    }
    if (this.repository.verifyInstalledVersion(packageName, packageRange)) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    if (!await addPeerGenerators(packageName, packageRange)) {
      toLookup.push(ns);
    }
  }

  debug('Installing %o', toInstall);
  this.installLocalGenerators(toInstall);
  debug('done %o', toInstall);
  if (updateMissing().length === 0) {
    return true;
  }
  // At last, try to lookup if install failed.
  this.lookupLocalNamespaces(missing.concat(toLookup));

  assertMissing(updateMissing());
  return true;
};

class YeomanGeneratorApi {
  constructor(generator) {
    this._generator = generator;

    const propertyNames = Object.getOwnPropertyNames(Object.getPrototypeOf(generator));
    this.methods = propertyNames.map(property => {
      if (!property.startsWith('#')) {
        return undefined;
      }
      return property.slice(1);
    }).filter(property => property);

    this.methods.forEach(property => {
      const propertyValue = generator[`#${property}`];
      this[property] = propertyValue.bind(generator);
    });
  }

  get config() {
    return this._generator.config;
  }

  get generatorConfig() {
    return this._generator.generatorConfig;
  }

  get instanceConfig() {
    return this._generator.instanceConfig;
  }
}

class YeomanWith {
  constructor(generatorApis, compose) {
    this.generatorApis = Array.isArray(generatorApis) ? generatorApis : [generatorApis];
    this.compose = compose;

    this.generatorApis.forEach(generatorApi => {
      generatorApi.methods.forEach(method => {
        if (!this[method]) {
          this[method] = this.call.bind(this, method);
        }
      });
    });
  }

  call(methods, ...methodArgs) {
    methods = Array.isArray(methods) ? methods : [methods];
    const runMethods = generatorApi => {
      const promises = methods.map(methodName => {
        return generatorApi[methodName](...methodArgs);
      });
      return promises.length === 1 ? promises[0] : Promise.all(promises);
    };

    this.generatorApis.forEach(runMethods);
    return this;
  }
}

class YeomanCompose {
  constructor(env, options, sharedOptions) {
    if (typeof options === 'string') {
      options = {destinationRoot: options};
    }
    this.env = env;
    // Destination root for this context.
    this._destinationRoot = options.destinationRoot;
    // Parent YeomanCompose if exists.
    this._parent = options.parent;
    // Store compose childs.
    this._childs = {};

    // Store the generators by namespaceId.
    this._generators = {};
    // Store the generators apis by namespaceId.
    this._generatorsApi = [];
    // Options by namespace.
    this._namespaceOptions = {};
    // Default options to be passed to all generators.
    this._sharedOptions = {...sharedOptions, compose: this};

    // Store generators apis hierarchically .
    this.api = {};

    this.events = new EventEmitter();

    // Shared options between contexts.
    this.shared = this._parent ? this._parent.shared : {};

    // Load rootGenerator if passes.
    if (options.rootGenerator) {
      this._loadGenerator(options.rootGenerator);
    }
  }

  /**
   * @private
   * Get parent context
   */
  atParent() {
    return this._parent;
  }

  /**
   * @private
   * Get YeomanCompose child.
   *
   * @param {String} id - Identification to register into.
   * @param {String} destinationRoot - The relative path for the context.
   * @param {Object} sharedOptions - Configuration to be passed to every generator.
   * @return {YeomanCompose} Child YeomanCompose
   */
  createChild(id, destinationRoot, sharedOptions) {
    const namespace = this.env.requireNamespace(id);
    if (!this._childs[namespace.id]) {
      this._childs[namespace.id] = new YeomanCompose(this.env, {destinationRoot, parent: this}, sharedOptions);
    }
    return this._childs[namespace.id];
  }

  /**
   * @private
   * Get config from a namespace.
   *
   * @param {String} namespace - Namespace the get the configuration.
   * @param {Boolean} [generatorConfig] - Set true to get the generator config
   *                                      instead of package config
   * @return {Object} Config
   */
  getConfig(namespace, generatorConfig = false) {
    namespace = this.env.requireNamespace(namespace);
    const yoRc = path.join(this._destinationRoot, '.yo-rc.json');
    let configToReturn = this.env.fs.readJSON(yoRc, {})[namespace.generatorHint] || {};
    if (generatorConfig || namespace.instanceId) {
      configToReturn = configToReturn[namespace.generatorName] || {};
    }
    if (namespace.instanceId) {
      configToReturn = configToReturn[namespace.instanceName] || {};
    }
    return configToReturn;
  }

  /**
   * @private
   * Register the callback to be execute once the generator is instantiated.
   *
   * @param {String|YeomanNamespace} namespace - Namespace
   * @param {Function} callback - Function to be executed once the generator is instantiated.
   * @return {Promise|undefined} Promise the generator api or undefined.
   */
  async once(namespace, callback) {
    namespace = this.env.requireNamespace(namespace);
    if (namespace.instanceId === '*') {
      throw new Error('Wildcard not supported');
    }
    return this.if(namespace, callback, () => {
      this.events.once(`load_${namespace.id}`, callback);
    });
  }

  /**
   * @private
   * If namespace is loaded then execute the callback else throws an error.
   *
   * @param {String|YeomanNamespace} namespace - Namespace
   * @return {Promise} Promise the generator api.
   */
  async get(namespace) {
    namespace = this.env.requireNamespace(namespace);
    if (namespace.instanceId === '*') {
      throw new Error(`Namespace must not be globby: ${namespace.complete}`);
    }
    if (namespace.complete !== namespace.id) {
      throw new Error(`Namespace ${namespace.complete} should be ${namespace.id}`);
    }
    const generatorApi = this._generatorsApi[namespace.id];
    if (generatorApi) {
      return generatorApi;
    }
    throw new Error(`Generator ${namespace.complete} isn't loaded`);
  }

  /**
   * @private
   * Loads the generator if it isn't loaded.
   *
   * @param {String|YeomanNamespace} namespace - Namespace
   * @param {Object} generatorOptions - Options to be passed to the generator
   * @return {Promise} Promise the generator api.
   */
  async require(namespace, generatorOptions) {
    return this.get(namespace).catch(() => this._queue(namespace, generatorOptions));
  }

  /**
   * @private
   * If namespace is loaded then execute the callback.
   *
   * @param {String|YeomanNamespace} namespace - Namespace
   * @param {Function} callback - Callback executed when the generator exists
   * @param {Function} [elseCallback] - Callback executed when the generator don't exists
   * @return {Promise|undefined} Promise the generator api.
   */
  async if(namespace, callback, elseCallback = () => {}) {
    return this.get(namespace).then(callback, () => elseCallback());
  }

  /**
   * @private
   * Parse the namespace and route to the corresponding method.
   *
   * @param {String|YeomanNamespace} namespace - Namespace
   * @param {Object} [generatorOptions] - Options to be passed to the generator
   * @param {Object} [callArgs] - Arguments to be passed to the methods.
   * @return {Promise} Promise YeomanWith
   */
  async with(namespace, generatorOptions, ...methodArgs) {
    debug(`Compose with generator ${namespace} at ${this._destinationRoot}`);
    namespace = this.env.requireNamespace(namespace);
    if (!namespace.generator) {
      throw new Error(`Namespace with generator is required: ${namespace.id}`);
    }
    let namespacesId;
    if (namespace.instanceId && namespace.instanceId === '*') {
      namespacesId = this._getInstanceNames(namespace.namespace).map(instanceId => {
        return namespace.with({instanceId}).id;
      });
    } else {
      namespacesId = [namespace.id];
    }

    const withPromise = Promise.all(namespacesId.map(nsId => this.require(nsId, generatorOptions))).then(generatorsApi => new YeomanWith(generatorsApi, this));
    if (namespace.methods && namespace.methods.length > 0) {
      return withPromise.then(withInstance => {
        withInstance.call(namespace.methods, ...methodArgs);
        return withInstance;
      });
    }
    return withPromise;
  }

  /**
   * @private
   * Get the generator instances from config.
   *
   * @param {String} generatorNamespace - Namespace of the generator
   * @return {String[]} instances names.
   */
  _getInstanceNames(generatorNamespace) {
    const generatorConfig = this.getConfig(generatorNamespace, true);
    return Object.keys(generatorConfig)
      .filter(instanceName => instanceName.startsWith('#'))
      .map(instanceName => instanceName.slice(1));
  }

  /**
   * @private
   * Load the the generator into the YeomanCompose.
   *
   * @param {YeomanNamespace} namespace - Namespace object
   * @param {Object} generatorOptions - Options to be passed to the generator.
   * @return {Object} Generator api
   */
  _load(namespace, generatorOptions) {
    if (!namespace.generator) {
      throw new Error(`Namespace with generator is required: ${namespace.id}`);
    }
    if (namespace.complete !== namespace.id) {
      throw new Error(`Namespace ${namespace.complete} should be ${namespace.id}`);
    }
    const generatorApi = this._generatorsApi[namespace.id];
    if (generatorApi) {
      return generatorApi;
    }

    debug(`Creating generator ${namespace} at ${this._destinationRoot}`);
    const generator = this._createGenerator(namespace, {...generatorOptions});
    return this._loadGenerator(generator);
  }

  /**
   * @private
   * Instantiate the generator
   *
   * @param {String|YeomanNamespace} namespace - Namespace
   * @param {Object} generatorOptions - Options to be passed to the generator
   * @return {Generator} the instance of the generator.
   */
  _createGenerator(namespace, generatorOptions) {
    return this.env.create(namespace, {
      arguments: [namespace.instanceId],
      options: {
        destinationRoot: this._destinationRoot,
        ...this._sharedOptions,
        ...this._namespaceOptions[namespace.id],
        ...generatorOptions
      }
    });
  }

  /**
   * @private
   * Prepare the composed api for the generator.
   *
   * @param {Generator} generator - Generator
   * @return {Object} Generator composed api
   */
  _loadGenerator(generator) {
    const generatorApi = new YeomanGeneratorApi(generator);

    generator.options.generatorApi = generatorApi;
    const namespace = generator.options.namespaceId;
    const generatorObjectName = `${_.camelCase(namespace.unscoped)}`;
    if (namespace.instanceId) {
      this.api[generatorObjectName] = this[generatorObjectName] || {};
      this.api[generatorObjectName][namespace.instanceId] = generatorApi;
    } else {
      this.api[generatorObjectName] = generatorApi;
    }

    this._generatorsApi[namespace.id] = generatorApi;
    this._generators[namespace.id] = generator;
    this.events.emit(`load_${namespace.id}`, generatorApi);

    return generatorApi;
  }

  /**
   * @private
   * Instantiate the generator and queue it's methods.
   *
   * @param {String|YeomanNamespace} namespace - Namespace
   * @param {Object} generatorOptions - Options to be passed to the generator.
   * @return {Object} generator composed api.
   */
  _queue(namespace, generatorOptions) {
    debug(`Queueing generator ${namespace} at ${this._destinationRoot}`);
    namespace = this.env.requireNamespace(namespace);
    const generatorApi = this._load(namespace, generatorOptions);
    generatorApi._generator.queueOwnTasks();
    return generatorApi;
  }
}

composability.createCompose = function (destinationRoot, options = {}) {
  const rootGenerator = this._rootGenerator;
  return new YeomanCompose(this, {destinationRoot, rootGenerator}, options);
};
