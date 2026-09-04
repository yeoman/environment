import { type Options as ExecaOptions, type ResultPromise, type SyncOptions, type SyncResult } from 'execa';
import type { BaseGenerator } from '../generator.js';
export declare class SpawnCommandMixin {
    /**
     * Normalize a command across OS and spawn it (asynchronously).
     *
     * @param command program to execute
     * @param opt execa options options
     * @see https://github.com/sindresorhus/execa#execacommandcommand-options
     */
    spawnCommand<const OptionsType extends ExecaOptions>(this: BaseGenerator, command: string, opt?: OptionsType): ResultPromise<OptionsType>;
    /**
     * Normalize a command across OS and spawn it (asynchronously).
     *
     * @param command program to execute
     * @param args list of arguments to pass to the program
     * @param opt execa options options
     * @see https://github.com/sindresorhus/execa#execafile-arguments-options
     */
    spawn<const OptionsType extends ExecaOptions>(this: BaseGenerator, command: string, args?: readonly string[], opt?: OptionsType): ResultPromise<OptionsType>;
    /**
     * Normalize a command across OS and spawn it (synchronously).
     *
     * @param command program to execute
     * @param opt execa options options
     * @see https://github.com/sindresorhus/execa#execacommandsynccommand-options
     */
    spawnCommandSync<const OptionsType extends SyncOptions>(this: BaseGenerator, command: string, opt?: OptionsType): SyncResult<OptionsType>;
    /**
     * Normalize a command across OS and spawn it (synchronously).
     *
     * @param command program to execute
     * @param args list of arguments to pass to the program
     * @param opt execa options options
     * @see https://github.com/sindresorhus/execa#execafile-arguments-options
     */
    spawnSync<const OptionsType extends SyncOptions>(this: BaseGenerator, command: string, args?: readonly string[], opt?: OptionsType): SyncResult<OptionsType>;
}
