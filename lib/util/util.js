/** @module env/util */
import { execaSync } from 'execa';
import GroupedQueue from 'grouped-queue';
import Environment from '../environment.js';

/**
 * Create a "sloppy" copy of an initial Environment object. The focus of this method is on
 * performance rather than correctly deep copying every property or recreating a correct
 * instance. Use carefully and don't rely on `hasOwnProperty` of the copied environment.
 *
 * Every property are shared except the runLoop which is regenerated.
 *
 * @param {Environment} initialEnv - an Environment instance
 * @return {Environment} sloppy copy of the initial Environment
 */
const duplicateEnv = initialEnv => {
  // Hack: Create a clone of the environment with a new instance of `runLoop`
  const env = Object.create(initialEnv);
  env.runLoop = new GroupedQueue(Environment.queues, false);
  return env;
};

const execaOutput = (cmg, args, options) => {
  try {
    const result = execaSync(cmg, args, options);
    if (!result.failed) {
      return result.stdout;
    }
  } catch {}
  return undefined;
};

export { duplicateEnv, execaOutput };
export { default as log } from './log.js';
