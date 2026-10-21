import { type EnvironmentOptions } from './environment/environment-base.ts';
import Environment from './environment/environment-full.ts';

export { default } from './environment/environment-full.ts';
export { default as EnvironmentBase, type EnvironmentOptions } from './environment/environment-base.ts';
// Experimental: the Store API is not stable yet.
export {
  Store,
  type StoreEnvironmentOptions,
  type StoreGeneratorMeta,
  type StoreLookupGeneratorMeta,
  type StoreLookupOptions,
  type StoreSharedLookupOptions,
} from './store/index.ts';

export const createEnv = (options?: EnvironmentOptions) => new Environment(options);

// Backward compatibility
export const enforceUpdate = () => {};

export { type CommandPreparation, prepareCommand, prepareGeneratorCommand } from './cli/commands.ts';
export { addEnvironmentOptions } from './cli/command.ts';
export { type InstallTask, type PackageManagerInstallTaskOptions, packageManagerInstallTask } from './environment/package-manager.ts';
export { commitSharedFsTask } from './environment/commit.ts';
export { lookupGenerator } from './store/index.ts';
