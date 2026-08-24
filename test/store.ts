import { createRequire } from 'node:module';
import path, { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'esmocha';
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
        expect(outcome).toBe(module);
      });

      it('assign meta data to the module', async () => {
        expect(outcome.namespace).toEqual('foo:module');
        expect(outcome.resolved).toEqual(join('/foo/path/index.js'));
      });
    });

    describe('storing as module path', async () => {
      let outcome: StoredModule;

      beforeEach(async () => {
        store.add({ namespace: 'foo:path', resolved: modulePath });
        outcome = (await store.get('foo:path')) as StoredModule;
      });

      it('store and returns the required module', async () => {
        expect(outcome).not.toBe(modulePath);
        expect(outcome.usage).toEqual('Usage can be used to customize the help output');
      });

      it('assign meta data to the module', async () => {
        expect(outcome.resolved).toEqual(join(modulePath, 'index.js'));
        expect(outcome.namespace).toEqual('foo:path');
      });
    });
  });

  describe('#getPackageJson()', () => {
    it('reads the package.json from packagePath', () => {
      const meta = store.add(
        { namespace: 'foo:module', resolved: '/foo/path', packagePath: path.join(__dirname, 'fixtures/generator-mocha') },
        {},
      );
      const packageJson = meta?.getPackageJson?.();
      expect(packageJson).toMatchObject({ name: 'generator-mocha', version: '0.0.0' });
    });

    it('caches the package.json', () => {
      const meta = store.add(
        { namespace: 'foo:module', resolved: '/foo/path', packagePath: path.join(__dirname, 'fixtures/generator-mocha') },
        {},
      );
      expect(meta?.getPackageJson?.()).toBe(meta?.getPackageJson?.());
    });

    it('shares the cache between metas with the same packagePath', () => {
      const packagePath = path.join(__dirname, 'fixtures/generator-mocha');
      const meta1 = store.add({ namespace: 'foo:module', resolved: '/foo/path', packagePath }, {});
      const meta2 = store.add({ namespace: 'foo:other', resolved: '/foo/other', packagePath }, {});
      expect(meta1?.getPackageJson?.()).toBe(meta2?.getPackageJson?.());
    });

    it('returns undefined if packagePath is not set', () => {
      const meta = store.add({ namespace: 'foo:module', resolved: '/foo/path' }, {});
      expect(meta?.getPackageJson?.()).toBeUndefined();
    });

    it('returns undefined if package.json does not exist', () => {
      const meta = store.add({ namespace: 'foo:module', resolved: '/foo/path', packagePath: '/foo/path' }, {});
      expect(meta?.getPackageJson?.()).toBeUndefined();
    });
  });

  describe('#namespaces()', async () => {
    beforeEach(async () => {
      store.add({ namespace: 'foo' }, {});
      store.add({ namespace: 'lab' }, {});
    });

    it('return stored module namespaces', async () => {
      expect(store.namespaces()).toEqual(['foo', 'lab']);
    });
  });
});
