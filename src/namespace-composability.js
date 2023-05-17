import path from 'node:path';
import { requireNamespace } from '@yeoman/namespace';
import createLogger from 'debug';

const debug = createLogger('yeoman:environment:compose');

/**
 * @mixin
 * @alias env/namespace-composability
 */
const composability = {};
export default composability;

/**
 * Lookup and register generators from the custom local repository.
 *
 * @private
 * @param  {YeomanNamespace[]} namespacesToLookup - namespaces to lookup.
 * @return {Promise<Object[]>} List of generators
 */
composability.lookupLocalNamespaces = function (namespacesToLookup) {
  if (!namespacesToLookup) {
    return [];
  }

  namespacesToLookup = Array.isArray(namespacesToLookup) ? namespacesToLookup : [namespacesToLookup];
  namespacesToLookup = namespacesToLookup.map(ns => requireNamespace(ns));
  // Keep only those packages that has a compatible version.
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
composability.lookupNamespaces = async function (namespaces, options = {}) {
  if (!namespaces) {
    return [];
  }

  namespaces = Array.isArray(namespaces) ? namespaces : [namespaces];
  namespaces = namespaces.map(ns => requireNamespace(ns));
  const options_ = namespaces.map(ns => {
    const nsOptions = { packagePatterns: ns.generatorHint };
    if (ns.generator) {
      // Build filePatterns to look specifically for the namespace.
      const genPath = ns.generator.split(':').join('/');
      let filePatterns = [`${genPath}/index.?s`, `${genPath}.?s`];
      const lookups = options.lookups || this.lookups;
      filePatterns = lookups.flatMap(prefix => filePatterns.map(pattern => path.join(prefix, pattern)));
      nsOptions.filePatterns = filePatterns;
      nsOptions.singleResult = true;
    }

    return nsOptions;
  });
  return Promise.all(options_.flatMap(opt => this.lookup({ ...opt, ...options })));
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
  let missing = namespaces.map(ns => requireNamespace(ns));

  const updateMissing = () => {
    // Remove already loaded namespaces
    missing = missing.filter(ns => !this.getByNamespace(ns));
    return missing;
  };

  const assertMissing = missing => {
    if (missing.length > 0) {
      throw new Error(`Error preparing environment for ${missing.map(ns => ns.complete).join(',')}`);
    }
  };

  updateMissing();

  // Install missing
  const toInstall = Object.fromEntries(missing.map(ns => [ns.generatorHint, ns.semver]));

  debug('Installing %o', toInstall);
  this.installLocalGenerators(toInstall);
  debug('done %o', toInstall);
  if (updateMissing().length === 0) {
    return true;
  }

  assertMissing(updateMissing());
  return true;
};
