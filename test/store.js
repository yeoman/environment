import assert from 'assert';
import { createRequire } from 'module';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import Store from '../lib/store.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Store', () => {
  beforeEach(function () {
    this.store = new Store();
  });

  describe('#add() / #get()', () => {
    beforeEach(function () {
      this.modulePath = path.join(__dirname, 'fixtures/generator-mocha');
      this.module = require(this.modulePath);
    });

    describe('storing as module', () => {
      beforeEach(function () {
        this.store.add('foo:module', this.module, '/foo/path');
        this.outcome = this.store.get('foo:module');
      });

      it('store and return the module', function () {
        assert.equal(this.outcome, this.module);
      });

      it('assign meta data to the module', function () {
        assert.equal(this.outcome.namespace, 'foo:module');
        assert.equal(this.outcome.resolved, '/foo/path');
      });
    });

    describe('storing as module path', () => {
      beforeEach(function () {
        this.store.add('foo:path', this.modulePath);
        this.outcome = this.store.get('foo:path');
      });

      it('store and returns the required module', function () {
        assert.notEqual(this.outcome, this.modulePath);
        assert.equal(this.outcome.usage, 'Usage can be used to customize the help output');
      });

      it('assign meta data to the module', function () {
        assert.equal(this.outcome.resolved, this.modulePath);
        assert.equal(this.outcome.namespace, 'foo:path');
      });
    });
  });

  describe('#namespaces()', () => {
    beforeEach(function () {
      this.store.add('foo', {});
      this.store.add('lab', {});
    });

    it('return stored module namespaces', function () {
      assert.deepEqual(this.store.namespaces(), ['foo', 'lab']);
    });
  });
});
