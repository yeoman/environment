'use strict';
const debug = require('debug')('yeoman:environment:compose');
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
  debug('Preparing %o', namespaces);
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

  const addPeerGenerators = async (packageName, packageRange) => {
    const npmRepo = npm.repo(packageName);
    let packageJson;
    try {
      packageJson = await npmRepo.package('all');
      if (packageJson.error) {
        throw new Error(packageJson.error);
      }
    } catch (error) {
      debug(`Could not find npm package for ${packageJson}`, error);
      return false;
    }

    const version = semver.maxSatisfying(Object.keys(packageJson.versions), packageRange);
    if (packageJson.versions[version].peerDependencies) {
      for (const peerPackageName in packageJson.peerDependecies) {
        if (peerPackageName.startsWith('generator-') && !toInstall[peerPackageName]) {
          const packageRange = packageJson.peerDependecies[peerPackageName];
          toInstall[peerPackageName] = packageRange;
          if (this.repository.verifyInstalledVersion(packageName, packageRange)) {
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          await addPeerGenerators(peerPackageName, packageRange);
        }
      }
    }
    return true;
  };

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
    if (await addPeerGenerators(packageName, packageRange)) {
      toInstall[ns.generatorHint] = ns.semver;
    } else {
      toLookup.push(ns);
    }
  }

  debug('Installing %o', toInstall);
  this.installLocalGenerators(toInstall);
  if (updateMissing().length === 0) {
    return true;
  }
  // At last, try to lookup if install failed.
  this.lookupNamespaces(missing.concat(toLookup));

  assertMissing(updateMissing());
  return true;
};

class YeomanCompose {
  constructor(env, destinationRoot, options) {
    this.env = env;
    this._destinationRoot = destinationRoot;
    this._options = {...options, compose: this};
    this._generators = {};
    this._childs = {};
    this._namespaceOptions = {};
  }

  getChild(id, destinationPath, options) {
    this._childs[id] = new YeomanCompose(this.env, destinationPath, options);
    return this._childs[id];
  }

  _getGenerator(namespace) {
    namespace = this.env.requireNamespace(namespace);
    const generator = this._generators[namespace.id];
    if (!generator && !namespace.optional) {
      throw new Error(`Generator with namespace ${namespace.id} was not found`);
    }
    return generator;
  }

  setOptions(namespace, options) {
    namespace = this.env.requireNamespace(namespace);
    if (!namespace.generator) {
      throw new Error(`Namespace with generator is required: ${namespace.id}`);
    }
    if (this._getGenerator[namespace.id]) {
      throw new Error(`Generator ${namespace.id} has already started`);
    }
    this._namespaceOptions[namespace] = options;
  }

  bootstrapConfig(namespace, config = {}) {
    namespace = this.env.requireNamespace(namespace);
    const yoRc = path.join(this._destinationRoot, '.yo-rc.json');
    if (namespace.instanceId) {
      config = {[namespace.instanceName]: config};
      config = {[namespace.generatorName]: config};
    }
    this.env.fs.extendJSON(yoRc, {[namespace.generatorHint]: config});
  }

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

  getInstanceNames(namespace) {
    const generatorConfig = this.getConfig(namespace, true);
    return Object.keys(generatorConfig).filter(instanceName => instanceName);
  }

  with(namespace, generatorOptions) {
    debug(`Loading generator ${namespace} at ${this._destinationRoot}`);
    if (Array.isArray(namespace)) {
      namespace.forEach(each => this.with(each));
      return;
    }
    namespace = this.env.requireNamespace(namespace);
    if (!namespace.generator) {
      throw new Error(`Namespace with generator is required: ${namespace.id}`);
    }
    if (namespace.instanceId && namespace.instanceId === '*') {
      this.getInstanceNames(namespace.namespace).forEach(idName => {
        const childNamespace = namespace.with({instanceId: idName.slice(1)});
        this.with(childNamespace, generatorOptions);
      });
      return;
    }

    const runMethods = generator => {
      if (namespace.methods && namespace.methods.length > 0) {
        namespace.methods.forEach(methodName => {
          methodName = `#${methodName}`;
          generator[methodName](generatorOptions);
        });
        return true;
      }
      return false;
    };

    let generator = this._generators[namespace.id];
    if (generator) {
      runMethods(generator);
      return;
    }

    generator = this.env.create(namespace, {
      arguments: [namespace.instanceId],
      options: {
        destinationRoot: this._destinationRoot,
        ...this._options,
        ...this._namespaceOptions[namespace.id],
        ...generatorOptions
      }
    });

    this._generators[namespace.id] = generator;
    const propertyNames = Object.getOwnPropertyNames(Object.getPrototypeOf(generator));

    const generatorApi = {config: generator.config};
    const generatorObjectName = `${_.camelCase(namespace.unscoped)}`;
    if (namespace.instanceId) {
      this[generatorObjectName] = this[generatorObjectName] || {};
      this[generatorObjectName][namespace.instanceId] = generatorApi;
    } else {
      this[generatorObjectName] = generatorApi;
    }
    propertyNames.forEach(property => {
      if (!property.startsWith('#')) {
        return;
      }
      const propertyValue = generator[property];
      generatorApi[property.slice(1)] = propertyValue.bind(generator);
    });
    generator.queueOwnTasks();
    runMethods(generator);
  }
}

composability.createCompose = function (destinationRoot, options = {}) {
  return new YeomanCompose(this, destinationRoot, options);
};
