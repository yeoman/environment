import assert from 'assert';
import Environment from '../lib/index.mjs';
import util from '../lib/util/util.js';

describe('util', () => {
  describe('.duplicateEnv()', () => {
    it('copy environment', () => {
      const env = new Environment();
      const clone = util.duplicateEnv(env);
      assert(Object.prototype.isPrototypeOf.call(env, clone));
      assert.notEqual(clone.runLoop, env.runLoop);
    });
  });
});
