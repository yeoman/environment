'use strict';

const path = require('path');
const assert = require('assert');
const {isBinary} = require('../lib/util/binary-diff');
const fs = require('fs');

describe('binary-diff', () => {
  it('regular file that contains ut8 chars is not binary file', done => {
    const filePath = path.join(__dirname, 'fixtures/binary-diff/file-contains-utf8.yml');
    fs.readFile(filePath, {encoding: 'utf8'}, (err, data) => {
      if (err) {
        return done(err);
      }
      assert.equal(isBinary(filePath, data), false);
      done();
    });
  });
});
