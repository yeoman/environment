import { type LookupOptions as LookupOptionsApi } from '@yeoman/types';
import { type ModuleLookupOptions, moduleLookupSync } from './module-lookup.js';
import { defaultLookups } from './util/namespace.js';

export type LookupOptions = LookupOptionsApi &
  ModuleLookupOptions & {
    lookups?: string[];
  };

type LookupMeta = { filePath: string; packagePath: string; lookups: string[] };

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
  const { lookups = defaultLookups } = options;
  options = {
    // Js generators should be after, last will override registered one.
    filePatterns: lookups.flatMap(prefix => [
      `${prefix}/*/index.ts`,
      `${prefix}/*/index.cts`,
      `${prefix}/*/index.mts`,
      `${prefix}/*/index.js`,
      `${prefix}/*/index.cjs`,
      `${prefix}/*/index.mjs`,
    ]),
    filterPaths: false,
    packagePatterns: ['generator-*'],
    reverse: !options.singleResult,
    ...options,
  };

  return moduleLookupSync(options, module => {
    const { packagePath, filePath } = module;
    const registered = register?.({ filePath, packagePath, lookups });
    return options.singleResult && registered;
  });
}
