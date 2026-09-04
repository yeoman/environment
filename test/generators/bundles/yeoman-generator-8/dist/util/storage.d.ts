import type { Get } from 'type-fest';
import type { MemFsEditor } from 'mem-fs-editor';
import type { StorageTransform, StorageValue } from '../types.js';
export type StorageOptions = {
    name?: string;
    /**
     * Set true to treat name as a lodash path.
     */
    lodashPath?: boolean;
    /**
     * Set true to disable json object cache.
     */
    disableCache?: boolean;
    /**
     * Set true to cleanup cache for every fs change.
     */
    disableCacheByFile?: boolean;
    /**
     * Set true to write sorted json.
     */
    sorted?: boolean;
    /**
     * Transform the content of the storage when reading it. This can be used to sanitize or modify the data before it is returned.
     */
    transform?: StorageTransform<Record<string, any>>;
};
/**
 * Storage instances handle a json file where Generator authors can store data.
 *
 * The `Generator` class instantiate the storage named `config` by default.
 *
 * @constructor
 * @param name     The name of the new storage (this is a namespace)
 * @param fs  A mem-fs editor instance
 * @param configPath The filepath used as a storage.
 *
 * @example
 * class extend Generator {
 *   writing: function() {
 *     this.config.set('coffeescript', false);
 *   }
 * }
 */
declare class Storage<StorageRecord extends Record<string, any> = Record<string, any>> {
    path: string;
    name?: string;
    fs: MemFsEditor;
    indent: number;
    lodashPath: boolean;
    disableCache: boolean;
    disableCacheByFile: boolean;
    sorted: boolean;
    existed: boolean;
    _cachedStore?: StorageRecord;
    private transform?;
    constructor(name: string | undefined, fs: MemFsEditor, configPath: string, options?: StorageOptions);
    constructor(fs: MemFsEditor, configPath: string, options?: StorageOptions);
    /**
     * @protected
     * @return the store content
     */
    readContent(): StorageRecord;
    /**
     * @protected
     * @return the store content
     */
    writeContent(fullStore: StorageValue): string;
    /**
     * Return the current store as JSON object
     * @return the store content
     * @private
     */
    get _store(): StorageRecord;
    /**
     * Persist a configuration to disk
     * @param val - current configuration values
     * @private
     */
    _persist(value: StorageRecord): void;
    /**
     * Save a new object of values
     */
    save(): void;
    /**
     * Get a stored value
     * @param key  The key under which the value is stored.
     * @return The stored value. Any JSON valid type could be returned
     */
    get<const Key extends keyof StorageRecord>(key: Key, { raw }?: {
        raw?: boolean;
    }): StorageRecord[Key];
    /**
     * Get a stored value from a lodash path
     * @param path  The path under which the value is stored.
     * @return The stored value. Any JSON valid type could be returned
     */
    getPath<const KeyPath extends string>(path: KeyPath): Get<StorageRecord, KeyPath>;
    /**
     * Get all the stored values
     * @return key-value object
     */
    getAll(): StorageRecord;
    /**
     * Assign a key to a value and schedule a save.
     * @param key  The key under which the value is stored
     * @param val  Any valid JSON type value (String, Number, Array, Object).
     * @return val  Whatever was passed in as val.
     */
    set(value: Partial<StorageRecord>): StorageRecord;
    set<const Key extends keyof StorageRecord, const Value extends StorageRecord[Key]>(key: Key, value?: Value): Value | undefined;
    /**
     * Assign a lodash path to a value and schedule a save.
     * @param path  The key under which the value is stored
     * @param val  Any valid JSON type value (String, Number, Array, Object).
     * @return val  Whatever was passed in as val.
     */
    setPath<const KeyPath extends string>(path: KeyPath, value: Get<StorageValue, KeyPath>): Get<StorageValue, KeyPath>;
    /**
     * Delete a key from the store and schedule a save.
     * @param key  The key under which the value is stored.
     */
    delete(key: keyof StorageRecord): void;
    /**
     * Setup the store with defaults value and schedule a save.
     * If keys already exist, the initial value is kept.
     * @param defaults  Key-value object to store.
     * @return val  Returns the merged options.
     */
    defaults(defaults: Partial<StorageRecord>): StorageRecord;
    /**
     * @param defaults  Key-value object to store.
     * @return val  Returns the merged object.
     */
    merge(source: Partial<StorageRecord>): StorageRecord;
    /**
     * Create a child storage.
     * @param path - relative path of the key to create a new storage.
     *                         Some paths need to be escaped. Eg: ["dotted.path"]
     * @return Returns a new Storage.
     */
    createStorage<StoredType extends Record<any, any>>(path: string): Storage<StoredType>;
    createStorage<const KeyPath extends string>(path: KeyPath): Storage<Get<StorageRecord, KeyPath>>;
    /**
     * Creates a proxy object.
     * @return proxy.
     */
    createProxy(): StorageRecord;
    private transformedStore;
}
export default Storage;
