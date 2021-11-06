const path = require('path');
const assert = require('assert');
const fs = require('fs');
const {isBinary} = require('../lib/util/binary-diff');

describe('binary-diff', () => {
  it('regular file that contains ut8 chars is not binary file', done => {
    const filePath = path.join(__dirname, 'fixtures/binary-diff/file-contains-utf8.yml');
    fs.readFile(filePath, {encoding: 'utf8'}, (error, data) => {
      if (error) {
        return done(error);
      }
      assert.equal(isBinary(filePath, data), false);
      done();
    });
  });
});
