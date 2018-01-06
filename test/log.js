'use strict';
const assert = require('assert');
const log = require('../lib/util/log');

describe('log', () => {
  const funcs = ['write', 'writeln', 'ok', 'error', 'table'];
  const defaultColors = ['skip', 'force', 'create', 'invoke', 'conflict', 'identical', 'info'];
  it('logger has functions', () => {
    const logger = log();
    funcs.concat(defaultColors).forEach(k => {
      assert.equal(typeof logger[k], 'function');
    });
  });
  it('logger can be added custom status', () => {
    const logger = log({colors: {merge: 'yellow'}});
    funcs.concat(defaultColors, ['merge']).forEach(k => {
      assert.equal(typeof logger[k], 'function');
    });
  });
  it('if params.ignoreDefaultColors is true, default colors are ignored', () => {
    const logger = log({colors: {merge: 'yellow'}, ignoreDefaultColors: true});
    defaultColors.forEach(k => {
      assert.equal(typeof logger[k], 'undefined');
    });
    ['merge'].forEach(k => {
      assert.equal(typeof logger[k], 'function');
    });
  });
});
