import { CheckRepoActions, CleanOptions, type SimpleGit, type SimpleGitOptions } from 'simple-git';
import { BaseGenerator } from './generator.js';
import type { BaseFeatures, BaseOptions } from './types.js';
export type * from './types.js';
export type * from './questions.js';
export type * from './util/storage.js';
export { default as Storage } from './util/storage.js';
type SimpleGitWithConstants = SimpleGit & {
    CheckRepoActions: typeof CheckRepoActions;
    CleanOptions: typeof CleanOptions;
};
export default class Generator<C extends Record<any, any> = Record<any, any>, O extends BaseOptions = BaseOptions, F extends BaseFeatures = BaseFeatures> extends BaseGenerator<C, O, F> {
    constructor(arguments_?: string[], options?: BaseOptions, features?: BaseFeatures);
    get simpleGit(): SimpleGitWithConstants;
    createSimpleGit(options?: Partial<SimpleGitOptions>): SimpleGitWithConstants;
}
