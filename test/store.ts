import assert from 'node:assert';
import { createRequire } from 'node:module';
import path, { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, it } from 'esmocha';
import Store from '../src/store.ts';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Store', async () => {
  beforeEach(async function () {
    this.store = new Store();
  });

  describe('#add() / #get()', async () => {
    beforeEach(async function () {
      this.modulePath = path.join(__dirname, 'fixtures/generator-mocha');
      this.module = require(this.modulePath);
    });

    describe('storing as module', async () => {
      beforeEach(async function () {
        this.store.add({ namespace: 'foo:module', resolved: '/foo/path' }, this.module);
        this.outcome = await this.store.get('foo:module');
      });

      it('store and return the module', async function () {
        assert.equal(this.outcome, this.module);
      });

      it('assign meta data to the module', async function () {
        assert.equal(this.outcome.namespace, 'foo:module');
        assert.equal(this.outcome.resolved, join('/foo/path/index.js'));
      });
    });

    describe('storing as module path', async () => {
      beforeEach(async function () {
        this.store.add({ namespace: 'foo:path', resolved: this.modulePath });
        this.outcome = await this.store.get('foo:path');
      });

      it('store and returns the required module', async function () {
        assert.notEqual(this.outcome, this.modulePath);
        assert.equal(this.outcome.usage, 'Usage can be used to customize the help output');
      });

      it('assign meta data to the module', async function () {
        assert.equal(this.outcome.resolved, join(this.modulePath, 'index.js'));
        assert.equal(this.outcome.namespace, 'foo:path');
      });
    });
  });

  describe('#namespaces()', async () => {
    beforeEach(async function () {
      this.store.add({ namespace: 'foo' }, {});
      this.store.add({ namespace: 'lab' }, {});
    });

    it('return stored module namespaces', async function () {
      assert.deepEqual(this.store.namespaces(), ['foo', 'lab']);
    });
  });
});
