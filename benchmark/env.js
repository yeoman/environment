/* global bench */
const yeoman = require('..');

suite('Environment', () => {
  bench('#lookup()', done => {
    yeoman.createEnv().lookup(done);
  });
});
