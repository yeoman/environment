import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * The output of a command, `undefined` when it fails. execa is loaded at the first command only: a lookup given the
 * paths of its packages runs none, and the store does not load it.
 */
export const execaOutput = (cmg: string, arguments_: string[]): string | undefined => {
  try {
    const { execaSync } = require('execa') as typeof import('execa');
    const { failed, stdout } = execaSync(cmg, arguments_, { encoding: 'utf8' });
    if (!failed) {
      return stdout;
    }
  } catch {
    // ignore error
  }

  return;
};
