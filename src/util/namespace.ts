import { parse, posix } from 'node:path';
import slash from 'slash';
import { escapeRegExp, findLast } from 'lodash-es';

type AsNamespaceOptions = {
  lookups?: string[];
  /** Generators nested in the `generators` folder of a generator: `app/generators/sub` is `app:sub`. */
  nestedGenerators?: boolean;
};

/** The folder holding the generators nested in a generator. */
export const nestedGeneratorsFolder = 'generators';

/**
 * The lookups of the generators, with the lookups of the generators nested in them if `nestedGenerators`:
 * `generators` and `generators/*\/generators`.
 */
export const withNestedLookups = (lookups: string[], nestedGenerators?: boolean): string[] =>
  nestedGenerators ? lookups.flatMap(lookup => [lookup, posix.join(lookup, '*', nestedGeneratorsFolder)]) : lookups;

export const defaultLookups = ['.', 'generators', 'lib/generators', 'dist/generators'];

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
 * @param filepath
 * @param lookups paths
 * @throws if the path is in a scoped package that is not a `generator-` one
 */
export const asNamespace = (filepath: string, { lookups = defaultLookups, nestedGenerators }: AsNamespaceOptions): string => {
  if (!filepath) {
    throw new Error('Missing file path');
  }

  // Normalize path
  let ns = slash(filepath);

  // Ignore path before latest node_modules
  const nodeModulesPath = '/node_modules/';
  if (ns.includes(nodeModulesPath)) {
    ns = ns.slice(ns.lastIndexOf(nodeModulesPath) + nodeModulesPath.length);
  }

  // Cleanup extension and normalize path for differents OS
  const parsed = parse(ns);
  ns = parsed.dir ? `${parsed.dir}/${parsed.name}` : parsed.name;

  // Sort lookups by length so biggest are removed first
  // The folder of the nested generators is removed like a lookup.
  const nsLookups = [...lookups, ...(nestedGenerators ? [nestedGeneratorsFolder] : []), '..']
    .map(found => slash(found))
    .toSorted((a, b) => a.split('/').length - b.split('/').length)
    .toReversed();

  // If `ns` contains a lookup dir in its path, remove it.
  for (const lookup of nsLookups) {
    // Only match full directory (begin with leading slash or start of input, end with trailing slash)
    ns = ns.replaceAll(new RegExp(`(?:/|^)${escapeRegExp(lookup)}(?=/)`, 'g'), '');
  }

  const folders = ns.split('/');
  const scope = findLast(folders, folder => folder.startsWith('@'));

  // Cleanup `ns` from unwanted parts and then normalize slashes to `:`
  ns = ns
    .replaceAll('//', '') // Remove double `/`
    // Remove the path before the package, the last folder starting with `generator-`, and its `generator-` prefix:
    // a `generator-` inside the name of the package or of a generator is kept.
    .replace(/^(?:.*\/)?generator-/, '')
    .replace(/\/(index|main)$/, '') // Remove `/index` or `/main`
    .replace(/^\//, '') // Remove leading `/`
    .replaceAll(/\/+/g, ':'); // Replace slashes by `:`

  if (scope) {
    // The path up to the scope is left when the package is not a `generator-` one.
    if (new RegExp(`(?:^|:)${escapeRegExp(scope)}:`).test(ns)) {
      throw new Error(`The scoped package of ${filepath} is not a generator- package, it has no namespace.`);
    }

    ns = `${scope}/${ns}`;
  }

  return ns;
};
