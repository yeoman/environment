import { extname } from 'node:path';
import type { LookupOptions as LookupOptionsApi } from '@yeoman/types';
import { type ModuleLookupOptions, moduleLookupSync } from './module-lookup.ts';
import { defaultLookups, withNestedLookups } from './namespace.ts';

export type LookupOptions = LookupOptionsApi &
  ModuleLookupOptions & {
    lookups?: string[];
    /**
     * Look up the generators nested in the `generators` folder of a generator too:
     * `generators/server/generators/cache` is registered as `server:cache`.
     */
    nestedGenerators?: boolean;
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
 * @return {Object[]} List of generators
 */
export function lookupGeneratorsSync(options: LookupOptions = {}, register?: (meta: LookupMeta) => boolean) {
  const { lookups = defaultLookups, nestedGenerators } = options;
  options = {
    // Js generators should be after, last will override registered one.
    filePatterns: withNestedLookups(lookups, nestedGenerators).flatMap(prefix =>
      defaultExtensions.map(extension => `${prefix}/*/index${extension}`),
    ),
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
