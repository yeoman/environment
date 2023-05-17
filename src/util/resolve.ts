import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import untildify from 'untildify';
import { locatePath } from 'locate-path';
import { defaultExtensions } from '../generator-lookup.js';

/**
 * Resolve a module path
 * @param  specifier - Filepath or module name
 * @return           - The resolved path leading to the module
 */
export async function resolveModulePath(specifier: string, resolvedOrigin?: string) {
  let maybeResolved = specifier;
  if (maybeResolved.startsWith('.')) {
    if (resolvedOrigin) {
      maybeResolved = resolve(dirname(resolvedOrigin), '..', maybeResolved);
    } else {
      throw new Error(`Specifier ${maybeResolved} could not be calculated`);
    }
  }

  maybeResolved = untildify(maybeResolved);
  maybeResolved = normalize(maybeResolved);

  if (extname(maybeResolved) === '') {
    maybeResolved += sep;
  }

  try {
    let specStat = await stat(maybeResolved);
    if (specStat.isSymbolicLink()) {
      specStat = await stat(await realpath(maybeResolved));
    }

    if (specStat.isFile()) {
      return maybeResolved;
    }

    if (specStat.isDirectory()) {
      return await locatePath(defaultExtensions.map(ext => `index${ext}`).map(file => join(maybeResolved, file)));
    }
  } catch {}

  throw new Error(`Error resolving ${specifier}`);
}
