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

  describe('without an environment', async () => {
    const esmPackage = path.join(__dirname, 'fixtures/generator-esm');

    beforeEach(async () => {
      store = new Store();
    });

    it('#lookupSync() registers the generators found', async () => {
      const generators = store.lookupSync({ packagePaths: [esmPackage] });
      expect(generators.every(generator => generator.registered)).toBe(true);
      expect(store.namespaces()).toEqual(expect.arrayContaining(['esm:app', 'esm:create']));
      expect(store.getMeta('esm:app')?.packagePath).toBe(esmPackage);
    });

    it('#lookupSync() customizes the namespace and registers to a scope', async () => {
      store.lookupSync({
        packagePaths: [esmPackage],
        customizeNamespace: ns => ns?.replace('esm:', 'custom:'),
        registerToScope: 'scope',
      });
      expect(store.namespaces()).toEqual(expect.arrayContaining(['@scope/custom:app']));
    });

    it('#lookupSync() keeps only the generators passing the filter, with the path they were found at', () => {
      const generators = store.lookupSync({ packagePaths: [esmPackage], filter: ({ namespace }) => namespace === 'esm:app' });
      expect(generators.map(({ namespace }) => namespace)).toEqual(['esm:app']);
      expect(store.namespaces()).toEqual(['esm:app']);
      // The path as globby found it, with forward slashes on Windows.
      expect(path.normalize(generators[0].filePath)).toBe(path.join(esmPackage, 'generators/app/index.js'));
      expect(generators[0].packagePath).toBe(esmPackage);
    });

    it('#lookupSync() stops at the first generator kept with singleResult', () => {
      const generators = store.lookupSync({
        packagePaths: [esmPackage],
        singleResult: true,
        filter: ({ namespace }) => namespace === 'esm:create',
      });
      expect(generators.map(({ namespace }) => namespace)).toEqual(['esm:create']);
      expect(store.namespaces()).toEqual(['esm:create']);
    });

    it('imports a generator exported as a class, the same for every environment', async () => {
      store.lookupSync({ packagePaths: [esmPackage] });
      const meta = store.getMeta('esm:app')!;
      expect(await meta.importGenerator()).toBe(await meta.importGenerator({ env: {} as any }));
    });

    it('requires the environment to create a generator from a factory, and keeps the result by environment', async () => {
      const created: unknown[] = [];
      store.add(
        { namespace: 'factory:app', resolved: '/factory/path' },
        {
          createGenerator(environment: unknown) {
            created.push(environment);
            return class {};
          },
        },
      );
      const meta = store.getMeta('factory:app')!;
      await expect(async () => meta.importGenerator()).rejects.toThrow(/An environment is required to create the generator factory:app/);

      const environmentA = {} as any;
      const environmentB = {} as any;
      const generatorA = await meta.importGenerator({ env: environmentA });
      expect(await meta.importGenerator({ env: environmentA })).toBe(generatorA);
      expect(await meta.importGenerator({ env: environmentB })).not.toBe(generatorA);
      expect(created).toEqual([environmentA, environmentB]);
    });

    it('#instantiate() uses the environment it is given', async () => {
      store.add({ namespace: 'foo:app', resolved: '/foo/path' }, class {});
      const meta = store.getMeta('foo:app')!;
      await expect(meta.instantiate()).rejects.toThrow(/An environment is required to instantiate the generator foo:app/);

      const instantiated: unknown[] = [];
      const environment = { instantiate: async (generator: unknown, options: unknown) => instantiated.push([generator, options]) } as any;
      await meta.instantiate(['arg'], { option: true }, { env: environment });
      expect(instantiated).toEqual([[await meta.importGenerator(), { generatorArgs: ['arg'], generatorOptions: { option: true } }]]);
    });

    describe('with { env }', () => {
      const createEnvironment = () => {
        const instantiated: unknown[] = [];
        const environment = { instantiated, instantiate: async (generator: unknown) => instantiated.push(generator) } as any;
        return environment;
      };

      it('#getMeta() binds the meta to the environment, once, delegating to the meta of the store', async () => {
        store.add({ namespace: 'foo:app', resolved: '/foo/path' }, class {});
        const environment = createEnvironment();
        const bound = store.getMeta('foo:app', { env: environment })!;
        expect(store.getMeta('foo:app', { env: environment })).toBe(bound);
        expect(store.getMeta('foo:app')).not.toBe(bound);
        expect(bound.namespace).toBe('foo:app');

        await bound.instantiate();
        await bound.instantiateHelp();
        expect(environment.instantiated).toHaveLength(2);

        const other = createEnvironment();
        await bound.instantiate([], {}, { env: other });
        expect(other.instantiated).toHaveLength(1);
      });

      it('#add() returns the meta bound to the environment', async () => {
        const environment = createEnvironment();
        const meta = store.add({ namespace: 'foo:app', resolved: '/foo/path' }, class {}, { env: environment });
        expect(meta).toBe(store.getMeta('foo:app', { env: environment }));
        await meta.instantiate();
        expect(environment.instantiated).toHaveLength(1);
      });

      it('#get() imports the generator in the environment', async () => {
        store.add({ namespace: 'factory:app', resolved: '/factory/path' }, { createGenerator: () => class {} });
        await expect(store.get('factory:app')).rejects.toThrow(/An environment is required/);
        expect(await store.get('factory:app', { env: createEnvironment() })).toBeDefined();
      });

      it('#lookupSync() returns the generators bound to the environment', async () => {
        const environment = createEnvironment();
        const generators = store.lookupSync({ packagePaths: [esmPackage], env: environment });
        await (generators.find(({ namespace }) => namespace === 'esm:app') as any).instantiate();
        expect(environment.instantiated).toHaveLength(1);
      });

      it('#getGeneratorsMeta() is a view of the store bound to the environment', async () => {
        store.add({ namespace: 'foo:app', resolved: '/foo/path' }, class {});
        const environment = createEnvironment();
        const generatorsMeta = store.getGeneratorsMeta({ env: environment });
        expect(generatorsMeta['foo:app']).toBe(store.getMeta('foo:app', { env: environment }));
        expect(store.getGeneratorsMeta()).not.toBe(generatorsMeta);
      });

      it('returns the meta itself for the environment of the store', () => {
        const environment = createEnvironment();
        const ownStore = new Store(environment);
        ownStore.add({ namespace: 'foo:app', resolved: '/foo/path' }, class {});
        expect(ownStore.getMeta('foo:app', { env: environment })).toBe(ownStore.getMeta('foo:app'));
        expect(ownStore.getGeneratorsMeta({ env: environment })).toBe(ownStore.getGeneratorsMeta());
      });
    });
  });
});
