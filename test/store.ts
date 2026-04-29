import assert from 'node:assert';
import { createRequire } from 'node:module';
import path, { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, it } from 'esmocha';
import Store from '../src/store.ts';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type StoredModule = {
  usage?: string;
  namespace?: string;
  resolved?: string;
};

describe('Store', async () => {
  let store: Store;

  beforeEach(async () => {
    store = new Store({} as any);
  });

  describe('#add() / #get()', async () => {
    let modulePath: string;
    let module: StoredModule;

    beforeEach(async () => {
      modulePath = path.join(__dirname, 'fixtures/generator-mocha');
      module = require(modulePath) as StoredModule;
    });

    describe('storing as module', async () => {
      let outcome: StoredModule;

      beforeEach(async () => {
        store.add({ namespace: 'foo:module', resolved: '/foo/path' }, module);
        outcome = (await store.get('foo:module')) as StoredModule;
      });

      it('store and return the module', async () => {
        assert.equal(outcome, module);
      });

      it('assign meta data to the module', async () => {
        assert.equal(outcome.namespace, 'foo:module');
        assert.equal(outcome.resolved, join('/foo/path/index.js'));
      });
    });

    describe('storing as module path', async () => {
      let outcome: StoredModule;

      beforeEach(async () => {
        store.add({ namespace: 'foo:path', resolved: modulePath });
        outcome = (await store.get('foo:path')) as StoredModule;
      });

      it('store and returns the required module', async () => {
        assert.notEqual(outcome, modulePath);
        assert.equal(outcome.usage, 'Usage can be used to customize the help output');
      });

      it('assign meta data to the module', async () => {
        assert.equal(outcome.resolved, join(modulePath, 'index.js'));
        assert.equal(outcome.namespace, 'foo:path');
      });
    });
  });

  describe('#namespaces()', async () => {
    beforeEach(async () => {
      store.add({ namespace: 'foo' }, {});
      store.add({ namespace: 'lab' }, {});
    });

    it('return stored module namespaces', async () => {
      assert.deepEqual(store.namespaces(), ['foo', 'lab']);
    });
  });
});
