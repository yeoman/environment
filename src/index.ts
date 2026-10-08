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
  type StoreSharedLookupOptions,
} from './store.ts';

export const createEnv = (options?: EnvironmentOptions) => new Environment(options);

// Backward compatibility
export const enforceUpdate = () => {};

export { type CommandPreparation, prepareCommand, prepareGeneratorCommand } from './commands.ts';
export { addEnvironmentOptions } from './util/command.ts';
export { type InstallTask, type PackageManagerInstallTaskOptions, packageManagerInstallTask } from './package-manager.ts';
export { commitSharedFsTask } from './commit.ts';
export { lookupGenerator } from './generator-lookup.ts';
