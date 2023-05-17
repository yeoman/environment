/** @module env/util */
import { execaSync } from 'execa';

const execaOutput = (cmg, args, options) => {
  try {
    const result = execaSync(cmg, args, options);
    if (!result.failed) {
      return result.stdout;
    }
  } catch {}

  return undefined;
};

export { execaOutput };
