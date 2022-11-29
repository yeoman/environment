import path, {dirname} from 'path';
import assert from 'assert';
import fs from 'fs';
import {isBinary} from '../lib/util/binary-diff.js';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
