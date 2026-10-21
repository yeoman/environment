import { isAbsolute, join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { requireNamespace, toNamespace } from '@yeoman/namespace';
import { type ModuleLookupOptions, findPackagesIn, getNpmPaths } from './module-lookup.ts';
import { defaultLookups, withNestedLookups } from './namespace.ts';
import type { LookupOptions } from './lookup.ts';
import Store from './store.ts';

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
export function lookupGenerator(
  namespace: string,
  options?: ModuleLookupOptions &
    Pick<LookupOptions, 'nestedGenerators'> & { packagePath?: boolean; generatorPath?: boolean } & { singleResult?: true },
): string;
export function lookupGenerator(
  namespace: string,
  options?: ModuleLookupOptions &
    Pick<LookupOptions, 'nestedGenerators'> & { packagePath?: boolean; generatorPath?: boolean } & { singleResult: false },
): string[];
export function lookupGenerator(
  namespace: string,
  options?: ModuleLookupOptions & Pick<LookupOptions, 'nestedGenerators'> & { packagePath?: boolean; generatorPath?: boolean },
): string | string[] {
  options = typeof options === 'boolean' ? { localOnly: options } : (options ?? {});
  const { packagePath: returnPackagePath, generatorPath: returnGeneratorPath, singleResult = true, ...lookupOptions } = options;

  const ns = requireNamespace(namespace);
  lookupOptions.packagePatterns = lookupOptions.packagePatterns ?? [ns.generatorHint];
  if (!lookupOptions.packagePaths) {
    // Looking the npm paths up runs the package managers, skip it when the packages are given.
    lookupOptions.npmPaths = lookupOptions.npmPaths ?? getNpmPaths({ localOnly: lookupOptions.localOnly }).toReversed();
    lookupOptions.packagePaths = findPackagesIn(lookupOptions.npmPaths, lookupOptions.packagePatterns);
  }

  // The generators are looked up by a store of their own, which keeps the ones asked for.
  const generators = new Store().lookupSync({
    filePatterns: withNestedLookups(defaultLookups, lookupOptions.nestedGenerators).map(prefix => join(prefix, '*/index.{js,ts}')),
    reverse: false,
    ...lookupOptions,
    lookups: defaultLookups,
    singleResult,
    filter: generator =>
      generator.namespace === namespace || Boolean(returnPackagePath && toNamespace(generator.namespace)?.packageNamespace === namespace),
  });

  const paths = generators.map(({ filePath, packagePath }) => {
    // Version 2.6.0 returned pattern instead of modulePath for options.packagePath
    const returnPath = returnPackagePath ? packagePath : returnGeneratorPath ? posix.join(filePath, '../../') : filePath;
    return isAbsolute(returnPath) ? pathToFileURL(returnPath).toString() : returnPath;
  });

  return singleResult ? paths[0] : paths;
}
