'use strict';
const path = require('path');
const debug = require('debug')('yeoman:environment');

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
 * Install generators at the custom local repository and register.
 *
 * @private
 * @param  {Object} packages - packages to install key(packageName): value(versionRange).
 * @return  {Boolean} - true if the install succeeded.
 */
composability.installLocalGenerators = function (packages) {
  const entries = Object.entries(packages).filter(([packageName, version]) => !this.repository.verifyInstalledVersion(packageName, version));
  if (entries.length === 0) {
    return true;
  }
  const toInstall = {};
  entries.forEach(([packageName, version]) => {
    toInstall[packageName] = version;
  });
  if (this.repository.installPackages(toInstall)) {
    const packagesToLookup = entries.map(([packageName, _]) => packageName);
    this.lookupLocalPackages(packagesToLookup);
    return true;
  }
  return false;
};

/**
 * Lookup and register generators from the custom local repository.
 *
 * @private
 * @param  {String[]} [packagesToLookup='generator-*'] - packages to lookup.
 */
composability.lookupLocalPackages = function (packagesToLookup = 'generator-*') {
  this.lookup({packagePatterns: packagesToLookup, npmPaths: this.repository.nodeModulesPath});
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
composability.prepareEnvironment = function (namespaces) {
  debug('Preparing %o', namespaces);
  namespaces = Array.isArray(namespaces) ? namespaces : [namespaces];
  let missing = namespaces.map(ns => this.requireNamespace(ns));

  const updateMissing = () => {
    // Remove already loaded namespaces
    missing = namespaces.filter(ns => !this.getByNamespace(ns));
    return missing;
  };

  const assertMissing = missing => {
    if (missing.length !== 0) {
      throw new Error(`Error preparing environment for ${missing.map(ns => ns.complete).join()}`);
    }
  };

  updateMissing();

  // Remove optionals
  missing = missing.filter(ns => !ns.optional);

  // Keep only ns with load and install flags
  const failed = missing.filter(ns => !ns.load && !ns.install);

  // Fail for required ns without load or install flags
  assertMissing(failed);

  // Lookup at custom repository
  this.lookupLocalNamespaces(missing);
  if (updateMissing().length === 0) {
    return true;
  }

  // Lookup local and global for load flag.
  this.lookupNamespaces(missing.filter(ns => ns.load));
  if (updateMissing().length === 0) {
    return true;
  }

  // Fail if ns with load flag failed to load.
  assertMissing(missing.filter(ns => ns.load));

  // Install missing
  const toInstall = {};
  missing.forEach(ns => {
    toInstall[ns.generatorHint] = ns.semver;
  });
  debug('Installing %o', toInstall);
  this.installLocalGenerators(toInstall);
  if (updateMissing().length === 0) {
    return true;
  }
  // At last, try to lookup if install failed.
  this.lookupNamespaces(missing);

  assertMissing(updateMissing());
  return true;
};
