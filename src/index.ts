import { type EnvironmentOptions } from './environment-base.ts';
import Environment from './environment-full.ts';

export { default } from './environment-full.ts';
export { default as EnvironmentBase, type EnvironmentOptions } from './environment-base.ts';
// Experimental: the Store API is not stable yet.
export {
  default as Store,
  type StoreEnvironmentOptions,
  type StoreGeneratorMeta,
  type StoreLookupGeneratorMeta,
  type StoreLookupOptions,
} from './store.ts';

export const createEnv = (options?: EnvironmentOptions) => new Environment(options);

// Backward compatibility
export const enforceUpdate = () => {};

export * from './commands.ts';
export * from './util/command.ts';
export * from './package-manager.ts';
export * from './commit.ts';
export { lookupGenerator } from './generator-lookup.ts';
