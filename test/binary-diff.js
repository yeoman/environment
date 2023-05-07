import path, { dirname } from 'node:path';
import assert from 'node:assert';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isBinary } from '../src/util/binary-diff.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('binary-diff', () => {
  it('regular file that contains ut8 chars is not binary file', done => {
    const filePath = path.join(__dirname, 'fixtures/binary-diff/file-contains-utf8.yml');
    fs.readFile(filePath, { encoding: 'utf8' }, (error, data) => {
      if (error) {
        return done(error);
      }

      assert.equal(isBinary(filePath, data), false);
      done();
    });
  });
});
