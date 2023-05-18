import { type EnvironmentOptions } from './environment-base.js';
import Environment from './environment-full.js';

export { default } from './environment-full.js';
export { default as EnvironmentBase } from './environment-base.js';

export const createEnv = (options?: EnvironmentOptions) => new Environment(options);

export * from './commands.js';
export * from './util/command.js';
export * from './package-manager.js';
export * from './commit.js';
export { lookupGenerator } from './generator-lookup.js';
