'use strict';
var assert = require('assert');
var Environment = require('../lib/environment');
var yeomanEnvironment = require('..');

describe('yeoman-environment module', function () {
  it('expose the Environment class', function () {
    assert.equal(yeomanEnvironment.Environment, Environment);
  });

  describe('.createEnv()', function () {
    it('create an environment', function () {
      var env = yeomanEnvironment.createEnv();
      assert(env instanceof Environment);
    });
  });
});
