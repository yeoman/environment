import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export function requireOrImport(fileToImport) {
  if (['.cjs', 'cts'].includes(path.extname(fileToImport))) {
    return require(fileToImport);
  }

  if (['.mjs', '.mts'].includes(path.extname(fileToImport))) {
    return import(pathToFileURL(fileToImport).href);
  }

  try {
    return require(fileToImport);
  } catch (error) {
    if (error.code !== 'ERR_REQUIRE_ESM') {
      throw error;
    }

    return import(pathToFileURL(fileToImport).href);
  }
}
