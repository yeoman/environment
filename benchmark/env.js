/* global suite, bench */
'use strict';
const yeoman = require('..');

suite('Environment', () => {
  bench('#lookup()', done => {
    yeoman.createEnv().lookup(done);
  });
});
