import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'esmocha';
import Environment from '../src/index.ts';
import Store from '../src/store.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const esmPackage = path.join(__dirname, 'fixtures/generator-esm');

describe('Environment with a shared store', () => {
  let store: Store;

  beforeEach(async () => {
    store = new Store();
    await store.lookup({ packagePaths: [esmPackage] });
  });

  it('uses the generators already in the store, without a lookup of its own', () => {
    const environment = new Environment({ store });
    expect(environment.getGeneratorMeta('esm:app')?.resolved).toBe(store.getMeta('esm:app')!.resolved);
    expect(Object.keys(environment.getGeneratorsMeta())).toEqual(store.namespaces());
  });

  it('shares what an environment registers with the others', () => {
    const environmentA = new Environment({ store });
    const environmentB = new Environment({ store });
    environmentA.register(class {} as any, { namespace: 'shared:app' });
    expect(environmentB.getGeneratorMeta('shared:app')).toBeDefined();
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
    // The meta the generator gets instantiates in its own environment too.
    expect(((await (created as any)._meta.instantiate()) as any).env).toBe(environmentB);
  });

  it('keeps showing what the store has in a meta it already bound', () => {
    const environment = new Environment({ store });
    const bound = environment.findMeta('esm:app')!;
    const importModule = async () => ({});
    store.getMeta('esm:app')!.importModule = importModule;
    expect(environment.findMeta('esm:app')).toBe(bound);
    expect(bound.importModule).toBe(importModule);
    expect(environment.getGeneratorMeta('esm:app')!.importModule).toBe(importModule);
    expect(environment.getGeneratorsMeta()['esm:app'].importModule).toBe(importModule);
  });

  it('#getGeneratorsMeta() is a view of the store, bound as it is read', async () => {
    const environment = new Environment({ store });
    const generatorsMeta = environment.getGeneratorsMeta();
    expect(Object.keys(generatorsMeta)).toEqual(store.namespaces());
    const generator = await Object.values(generatorsMeta)
      .find(({ namespace }) => namespace === 'esm:app')!
      .instantiate();
    expect((generator as any).env).toBe(environment);

    // What is set in it is registered in the store, like it is with the store of the environment itself.
    const importGenerator = async () => class {} as any;
    generatorsMeta['written:app'] = { namespace: 'written:app', importGenerator } as any;
    expect(store.getMeta('written:app')).toBeDefined();
    expect(environment.getGeneratorMeta('written:app')).toBeDefined();
  });

  it('binds the generators found by a lookup', async () => {
    const environment = new Environment({ store: new Store() });
    const generators = await environment.lookup({ packagePaths: [esmPackage] });
    const generator = generators.find(({ namespace }) => namespace === 'esm:app')!;
    expect(generator.registered).toBe(true);
    expect(((await (generator as any).instantiate()) as any).env).toBe(environment);
  });
});
