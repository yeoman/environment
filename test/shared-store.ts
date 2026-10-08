import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'esmocha';
import Environment from '../src/index.ts';
import Store from '../src/store.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const esmPackage = path.join(__dirname, 'fixtures/generator-esm');

describe('Environment with a store', () => {
  let store: Store;

  beforeEach(async () => {
    store = new Store();
    store.lookupSync({ packagePaths: [esmPackage] });
  });

  it('uses the generators already in the store, without a lookup of its own', () => {
    const environment = new Environment({ store });
    expect(environment.getGeneratorMeta('esm:app')?.resolved).toBe(store.getMeta('esm:app')!.resolved);
    expect(Object.keys(environment.getGeneratorsMeta())).toEqual(store.namespaces());
  });

  it('works on a clone of the store: what it registers goes neither to the store nor to the other environments', () => {
    const environmentA = new Environment({ store });
    const environmentB = new Environment({ store });
    environmentA.register(class {} as any, { namespace: 'own:app' });
    expect(environmentA.getGeneratorMeta('own:app')).toBeDefined();
    expect(environmentB.getGeneratorMeta('own:app')).toBeUndefined();
    expect(store.getMeta('own:app')).toBeUndefined();
  });

  it('shares the generators already imported', async () => {
    const environmentA = new Environment({ store });
    const environmentB = new Environment({ store });
    expect(await environmentA.getGeneratorMeta('esm:app')!.importGenerator()).toBe(
      await environmentB.getGeneratorMeta('esm:app')!.importGenerator(),
    );
  });

  it('instantiates a generator in the environment it was asked from', async () => {
    const environmentA = new Environment({ store });
    const environmentB = new Environment({ store });
    const generatorA = await environmentA.getGeneratorMeta('esm:app')!.instantiate();
    const generatorB = await environmentB.getGeneratorMeta('esm:app')!.instantiate();
    expect((generatorA as any).env).toBe(environmentA);
    expect((generatorB as any).env).toBe(environmentB);

    const created = await environmentB.create('esm:app');
    expect((created as any).env).toBe(environmentB);
    expect((created as any)._meta.namespace).toBe('esm:app');
    // The generator class keeps the meta of the store, the generator gets the one of the clone, instantiating in its environment.
    expect(((await (created as any)._meta.instantiate()) as any).env).toBe(environmentB);
  });

  it('#getGeneratorsMeta() is a view of its store, bound as it is read', async () => {
    const environment = new Environment({ store });
    const generatorsMeta = environment.getGeneratorsMeta();
    expect(Object.keys(generatorsMeta)).toEqual(store.namespaces());
    const generator = await Object.values(generatorsMeta)
      .find(({ namespace }) => namespace === 'esm:app')!
      .instantiate();
    expect((generator as any).env).toBe(environment);

    // What is set in it is registered in the clone of the environment, not in the store passed.
    const importGenerator = async () => class {} as any;
    generatorsMeta['written:app'] = { namespace: 'written:app', importGenerator } as any;
    expect(environment.getGeneratorMeta('written:app')).toBeDefined();
    expect(store.getMeta('written:app')).toBeUndefined();
  });

  it('uses the lookups of the store, storeOptions taking precedence', () => {
    const filePath = 'generator-foo/custom/app/index.js';
    const storeWithLookups = new Store(undefined, { lookups: ['custom'], localOnly: true });
    expect(new Environment({ store: storeWithLookups }).namespace(filePath)).toBe('foo:app');
    expect(new Environment({ store: storeWithLookups, storeOptions: { lookups: ['.'] } }).namespace(filePath)).toBe('foo:custom:app');
    expect(new Environment({ store: new Store() }).namespace(filePath)).toBe('foo:custom:app');
    expect(storeWithLookups.lookupOptions).toEqual({ lookups: ['custom'], localOnly: true });
  });

  it('creates its store with storeOptions, over the deprecated generatorLookupOptions', async () => {
    const filePath = 'generator-foo/custom/app/index.js';
    expect(new Environment({ storeOptions: { lookups: ['custom'] } }).namespace(filePath)).toBe('foo:app');
    expect(new Environment({ generatorLookupOptions: { lookups: ['custom'] } }).namespace(filePath)).toBe('foo:app');
    expect(new Environment({ generatorLookupOptions: { lookups: ['custom'] }, storeOptions: { lookups: ['.'] } }).namespace(filePath)).toBe(
      'foo:custom:app',
    );

    const environment = new Environment({ storeOptions: { customizeNamespace: ns => ns?.replace('esm:', 'custom:') } });
    await environment.lookup({ packagePaths: [esmPackage] });
    expect(environment.getGeneratorMeta('custom:app')).toBeDefined();
  });

  it('binds the generators found by a lookup', async () => {
    const environment = new Environment({ store: new Store() });
    const generators = await environment.lookup({ packagePaths: [esmPackage] });
    const generator = generators.find(({ namespace }) => namespace === 'esm:app')!;
    expect(generator.registered).toBe(true);
    expect(((await (generator as any).instantiate()) as any).env).toBe(environment);
  });
});
