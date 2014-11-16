/*global suite, bench */
'use strict';
var yeoman = require('..');

suite('Environment', function () {
  bench('#lookup()', function (done) {
    yeoman.createEnv().lookup(done);
  });
});
