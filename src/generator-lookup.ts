import { extname, isAbsolute, join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LookupOptions as LookupOptionsApi } from '@yeoman/types';
import { requireNamespace, toNamespace } from '@yeoman/namespace';
import { type ModuleLookupOptions, findPackagesIn, getNpmPaths, moduleLookupSync } from './module-lookup.ts';
import { defaultLookups } from './util/namespace.ts';
import Store from './store.ts';

export type LookupOptions = LookupOptionsApi &
  ModuleLookupOptions & {
    lookups?: string[];
  };

type LookupMeta = { filePath: string; packagePath: string; lookups: string[] };

export const defaultExtensions = ['.ts', '.cts', '.mts', '.js', '.cjs', '.mjs'];

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
 *
 * @param {boolean|Object} [options]
 * @param {boolean} [options.localOnly = false] - Set true to skip lookups of
 *                                               globally-installed generators.
 * @param {string|Array} [options.packagePaths] - Paths to look for generators.
 * @param {string|Array} [options.npmPaths] - Repository paths to look for generators packages.
 * @param {string|Array} [options.filePatterns='*\/index.js'] - File pattern to look for.
 * @param {string|Array} [options.packagePatterns='generator-*'] - Package pattern to look for.
 * @param {boolean}      [options.singleResult=false] - Set true to stop lookup on the first match.
 * @param {Number}       [options.globbyDeep] - Deep option to be passed to globby.
 * @return {Promise<Object[]>} List of generators
 */
export async function lookupGenerators(options: LookupOptions = {}, register?: (meta: LookupMeta) => boolean) {
  return lookupGeneratorsSync(options, register);
}

/**
 * Synchronous {@link lookupGenerators}.
 */
export function lookupGeneratorsSync(options: LookupOptions = {}, register?: (meta: LookupMeta) => boolean) {
  const { lookups = defaultLookups } = options;
  options = {
    // Js generators should be after, last will override registered one.
    filePatterns: lookups.flatMap(prefix => defaultExtensions.map(extension => `${prefix}/*/index${extension}`)),
    filterPaths: false,
    packagePatterns: ['generator-*'],
    reverse: !options.singleResult,
    ...options,
  };

  return moduleLookupSync(options, ({ packagePath, files }) => {
    files = [...files].toSorted((a, b) => {
      return defaultExtensions.indexOf(extname(a)) - defaultExtensions.indexOf(extname(b));
    });
    for (const filePath of files) {
      const registered = register?.({ filePath, packagePath, lookups });
      if (options.singleResult && registered) {
        return filePath;
      }
    }

    return;
  });
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
export function lookupGenerator(
  namespace: string,
  options?: ModuleLookupOptions & { packagePath?: boolean; generatorPath?: boolean } & { singleResult?: true },
): string;
export function lookupGenerator(
  namespace: string,
  options?: ModuleLookupOptions & { packagePath?: boolean; generatorPath?: boolean } & { singleResult: false },
): string[];
export function lookupGenerator(
  namespace: string,
  options?: ModuleLookupOptions & { packagePath?: boolean; generatorPath?: boolean },
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
    filePatterns: defaultLookups.map(prefix => join(prefix, '*/index.{js,ts}')),
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
