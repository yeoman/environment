import { type MemFsEditor } from 'mem-fs-editor';
import type { BaseGenerator } from '../generator.js';
type ExtractOverload1<T> = T extends {
    (...args: infer P): infer R;
    (...args: any[]): any;
    (...args: any[]): any;
    (...args: any[]): any;
} ? (...args: P) => R : never;
type ExtractOverload2<T> = T extends {
    (...args: any[]): any;
    (...args: infer P): infer R;
    (...args: any[]): any;
    (...args: any[]): any;
} ? (...args: P) => R : never;
type ReadOverload1 = ExtractOverload1<MemFsEditor['read']>;
type ReadOverload2 = ExtractOverload2<MemFsEditor['read']>;
type ReadJSONOverload1 = ExtractOverload1<MemFsEditor['readJSON']>;
type ReadJSONOverload2 = ExtractOverload2<MemFsEditor['readJSON']>;
export type Template<G, C extends 'copyTplAsync' | 'copyTpl', D extends NonNullable<Parameters<MemFsEditor[C]>[2]>> = {
    /**
     * Template file, absolute or relative to templatePath().
     */
    source: string;
    /**
     * Conditional if the template should be written.
     * @param TemplateData
     * @param Generator
     * @returns
     */
    when?: (data: D, generator: G) => boolean;
    /**
     * Destination, absolute or relative to destinationPath().
     */
    destination?: string;
    /**
     * Mem-fs-editor copy options
     */
    copyOptions?: NonNullable<Parameters<MemFsEditor[C]>[3]>;
    /**
     * Ejs data
     */
    templateData?: string | D;
};
export type Templates<G, C extends 'copyTplAsync' | 'copyTpl', D extends NonNullable<Parameters<MemFsEditor[C]>[2]>> = Array<Template<G, C, D>>;
export declare class FsMixin {
    fs: MemFsEditor;
    /**
     * Read file from templates folder.
     * mem-fs-editor method's shortcut, for more information see [mem-fs-editor]{@link https://github.com/SBoudrias/mem-fs-editor}.
     * Shortcut for this.fs!.read(this.templatePath(filepath))
     */
    readTemplate(this: BaseGenerator, ...args: Parameters<ReadOverload1>): ReturnType<ReadOverload1>;
    readTemplate(this: BaseGenerator, ...args: Parameters<ReadOverload2>): ReturnType<ReadOverload2>;
    /**
     * Copy file from templates folder to destination folder.
     * mem-fs-editor method's shortcut, for more information see [mem-fs-editor]{@link https://github.com/SBoudrias/mem-fs-editor}.
     * Shortcut for this.fs!.copy(this.templatePath(from), this.destinationPath(to))
     */
    copyTemplate(this: BaseGenerator, ...args: Parameters<MemFsEditor['copy']>): ReturnType<MemFsEditor['copy']>;
    /**
     * Copy file from templates folder to destination folder.
     * mem-fs-editor method's shortcut, for more information see [mem-fs-editor]{@link https://github.com/SBoudrias/mem-fs-editor}.
     * Shortcut for this.fs!.copy(this.templatePath(from), this.destinationPath(to))
     */
    copyTemplateAsync(this: BaseGenerator, ...args: Parameters<MemFsEditor['copyAsync']>): ReturnType<MemFsEditor['copyAsync']>;
    /**
     * Read file from destination folder
     * mem-fs-editor method's shortcut, for more information see [mem-fs-editor]{@link https://github.com/SBoudrias/mem-fs-editor}.
     * Shortcut for this.fs!.read(this.destinationPath(filepath)).
     */
    readDestination(this: BaseGenerator, ...args: Parameters<ReadOverload1>): ReturnType<ReadOverload1>;
    readDestination(this: BaseGenerator, ...args: Parameters<ReadOverload2>): ReturnType<ReadOverload2>;
    /**
     * Read JSON file from destination folder
     * mem-fs-editor method's shortcut, for more information see [mem-fs-editor]{@link https://github.com/SBoudrias/mem-fs-editor}.
     * Shortcut for this.fs!.readJSON(this.destinationPath(filepath)).
     */
    readDestinationJSON(this: BaseGenerator, ...args: Parameters<ReadJSONOverload1>): ReturnType<ReadJSONOverload1>;
    readDestinationJSON(this: BaseGenerator, ...args: Parameters<ReadJSONOverload2>): ReturnType<ReadJSONOverload2>;
    /**
     * Write file to destination folder
     * mem-fs-editor method's shortcut, for more information see [mem-fs-editor]{@link https://github.com/SBoudrias/mem-fs-editor}.
     * Shortcut for this.fs!.write(this.destinationPath(filepath)).
     */
    writeDestination(this: BaseGenerator, ...args: Parameters<MemFsEditor['write']>): ReturnType<MemFsEditor['write']>;
    /**
     * Write json file to destination folder
     * mem-fs-editor method's shortcut, for more information see [mem-fs-editor]{@link https://github.com/SBoudrias/mem-fs-editor}.
     * Shortcut for this.fs!.writeJSON(this.destinationPath(filepath)).
     */
    writeDestinationJSON(this: BaseGenerator, ...args: Parameters<MemFsEditor['writeJSON']>): ReturnType<MemFsEditor['writeJSON']>;
    /**
     * Delete file from destination folder
     * mem-fs-editor method's shortcut, for more information see [mem-fs-editor]{@link https://github.com/SBoudrias/mem-fs-editor}.
     * Shortcut for this.fs!.delete(this.destinationPath(filepath)).
     */
    deleteDestination(this: BaseGenerator, ...args: Parameters<MemFsEditor['delete']>): ReturnType<MemFsEditor['delete']>;
    /**
     * Copy file from destination folder to another destination folder.
     * mem-fs-editor method's shortcut, for more information see [mem-fs-editor]{@link https://github.com/SBoudrias/mem-fs-editor}.
     * Shortcut for this.fs!.copy(this.destinationPath(from), this.destinationPath(to)).
     */
    copyDestination(this: BaseGenerator, ...args: Parameters<MemFsEditor['copy']>): ReturnType<MemFsEditor['copy']>;
    /**
     * Move file from destination folder to another destination folder.
     * mem-fs-editor method's shortcut, for more information see [mem-fs-editor]{@link https://github.com/SBoudrias/mem-fs-editor}.
     * Shortcut for this.fs!.move(this.destinationPath(from), this.destinationPath(to)).
     */
    moveDestination(this: BaseGenerator, ...args: Parameters<MemFsEditor['move']>): ReturnType<MemFsEditor['move']>;
    /**
     * Exists file on destination folder.
     * mem-fs-editor method's shortcut, for more information see [mem-fs-editor]{@link https://github.com/SBoudrias/mem-fs-editor}.
     * Shortcut for this.fs!.exists(this.destinationPath(filepath)).
     */
    existsDestination(this: BaseGenerator, ...args: Parameters<MemFsEditor['exists']>): ReturnType<MemFsEditor['exists']>;
    /**
     * Copy a template from templates folder to the destination.
     *
     * @param source - template file, absolute or relative to templatePath().
     * @param destination - destination, absolute or relative to destinationPath().
     * @param templateData - ejs data
     * @param templateOptions - ejs options
     * @param copyOptions - mem-fs-editor copy options
     */
    renderTemplate<const D extends NonNullable<Parameters<MemFsEditor['copyTpl']>[2]>>(this: BaseGenerator, source?: string | string[], destination?: string | string[], templateData?: string | D, copyOptions?: NonNullable<Parameters<MemFsEditor['copyTpl']>[3]>): void;
    /**
     * Copy a template from templates folder to the destination.
     *
     * @param source - template file, absolute or relative to templatePath().
     * @param destination - destination, absolute or relative to destinationPath().
     * @param templateData - ejs data
     * @param templateOptions - ejs options
     * @param copyOptions - mem-fs-editor copy options
     */
    renderTemplateAsync<const D extends NonNullable<Parameters<MemFsEditor['copyTplAsync']>[2]>>(this: BaseGenerator, source?: string | string[], destination?: string | string[], templateData?: string | D, copyOptions?: NonNullable<Parameters<MemFsEditor['copyTplAsync']>[3]>): Promise<void>;
    /**
     * Copy templates from templates folder to the destination.
     */
    renderTemplates<const D extends NonNullable<Parameters<MemFsEditor['copyTpl']>[2]>>(this: BaseGenerator, templates: Templates<typeof this, 'copyTpl', D>, templateData?: string | D): void;
    /**
     * Copy templates from templates folder to the destination.
     *
     * @param templates - template file, absolute or relative to templatePath().
     * @param templateData - ejs data
     */
    renderTemplatesAsync<const D extends NonNullable<Parameters<MemFsEditor['copyTplAsync']>[2]>>(this: BaseGenerator, templates: Templates<typeof this, 'copyTplAsync', D>, templateData?: string | D): Promise<void[]>;
    /**
     * Utility method to get a formatted data for templates.
     *
     * @param path - path to the storage key.
     * @return data to be passed to the templates.
     */
    _templateData(this: BaseGenerator, path?: string): any;
}
export {};
