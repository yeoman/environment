const assert = require('assert');
const util = require('../lib/util/util');
const Env = require('..');

describe('util', () => {
  it('is exposed on the Environment object', () => {
    assert.equal(Env.util, util);
  });

  describe('.duplicateEnv()', () => {
    it('copy environment', () => {
      const env = new Env();
      const clone = util.duplicateEnv(env);
      assert(Object.prototype.isPrototypeOf.call(env, clone));
      assert.notEqual(clone.runLoop, env.runLoop);
    });
  });
});
