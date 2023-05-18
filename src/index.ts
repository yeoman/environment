import { type EnvironmentOptions } from './environment-base.js';
import Environment from './environment-full.js';

export const createEnv = (options?: EnvironmentOptions) => new Environment(options);

export { default } from './environment-full.js';
