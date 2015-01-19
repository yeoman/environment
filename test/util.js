'use strict';
var assert = require('assert');
var util = require('../lib/util/util');
var Env = require('../');

describe('util', function () {
  it('is exposed on the Environment object', function () {
    assert.equal(Env.util, util);
  });

  describe('.duplicateEnv()', function () {
    it('copy environment', function () {
      var env = new Env();
      var clone = util.duplicateEnv(env);
      assert(env.isPrototypeOf(clone));
      assert.notEqual(clone.runLoop, env.runLoop);
    });
  });
});
