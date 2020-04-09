'use strict';
const _ = require('lodash');
const debug = require('debug')('yeoman:environment:namespace');

// ============ | == @ ======== scope ========== | ====== unscoped ====== | = : ========== generator ========== | = @ ===== semver ====== @ | == + ========= instanceId =========== | = # ======= method ========= |= flags = |
const regexp = /^(?:(@[a-z0-9-~][a-z0-9-._~]*)\/)?([a-z0-9-~][a-z0-9-._~]*)(?::((?:[a-z0-9-~][a-z0-9-._~]*:?)*))?(?:@([a-z0-9-.~><+=^* ]*)@)?(?:\+((?:[a-z0-9-~][a-z0-9-._~]*\+?)*))?(?:#([a-z0-9-~][a-z0-9-._~]*))?(!|!\?|\?)?$/;

const groups = {complete: 0, scope: 1, unscoped: 2, generator: 3, semver: 4, instanceId: 5, method: 6, flags: 7};
const flags = {install: '!', load: '!?', optional: '?'};

const namespaceModule = module.exports;

class YeomanNamespace {
  constructor(parsed) {
    this._complete = parsed.complete;
    this.scope = parsed.scope;
    this.unscoped = parsed.unscoped;
    this.generator = parsed.generator;
    this.instanceId = parsed.instanceId;
    this.semver = parsed.semver;
    this.method = parsed.method;
    this.flags = parsed.flags;

    // Populate flags
    if (this.flags) {
      Object.entries(flags).forEach(([name, value]) => {
        if (this.flags === value) {
          this[name] = true;
        } else {
          delete this[name];
        }
      });
    }

    debug('Parsed namespace %o', this);
  }

  static parse(complete) {
    const result = regexp.exec(complete);
    if (!result) {
      debug('Namespace failed RegExp parse %s, using fallback', complete);
      return null;
    }

    const parsed = {complete};
    // Populate fields
    Object.entries(groups).forEach(([name, value]) => {
      if (result[value]) {
        parsed[name] = result[value];
      }
    });
    return parsed;
  }

  _update(parsed) {
    this.scope = parsed.scope || this.scope;
    this.unscoped = parsed.unscoped || this.unscoped;
    this.generator = parsed.generator || this.generator;
    this.instanceId = parsed.instanceId || this.instanceId;
    this.method = parsed.method || this.method;
    this.flags = parsed.flags || this.flags;
  }

  get _scopeAddition() {
    return this.scope ? `${this.scope}/` : '';
  }

  get _generatorAddition() {
    return this.generator ? `:${this.generator}` : '';
  }

  get _semverAddition() {
    return this.semver ? `@${this.semver}@` : '';
  }

  get _idAddition() {
    return this.instanceId ? `+${this.instanceId}` : '';
  }

  get complete() {
    return `${this.namespace}${this._semverAddition}${this._idAddition}${this.flags || ''}`;
  }

  get packageNamespace() {
    return `${this._scopeAddition}${this.unscoped}`;
  }

  get namespace() {
    return `${this.packageNamespace}${this._generatorAddition}`;
  }

  set namespace(namespace) {
    this._update(YeomanNamespace.parse(namespace));
  }

  get id() {
    return `${this.namespace}${this._idAddition}`;
  }

  get generatorHint() {
    return `${this._scopeAddition}generator-${this.unscoped}`;
  }

  get versionedHint() {
    return this.semver ? `${this.generatorHint}@"${this.semver}"` : this.generatorHint;
  }

  get methodName() {
    return this.method ? `${_.camelCase(this.method)}#` : undefined;
  }

  bumpId() {
    if (!this.instanceId) {
      this.instanceId = '1';
      this._rebuildId();
      return;
    }
    const ids = this.instanceId.split('+');
    const id = ids.pop();
    if (isNaN(parseInt(id, 10)) || id.startsWith('0')) {
      ids.push(id);
      ids.push('1');
    } else {
      ids.push(String(parseInt(id, 10) + 1));
    }
    this.instanceId = ids.join('+');
    this._rebuildId();
  }

  _rebuildId() {
    delete this._namespace;
    delete this._id;
    delete this._complete;
  }
}

/**
 * Parse an namespace
 *
 * @private
 * @param  {String} namespace
 * @return {Object} parsed
 * @return {String} parsed.complete - Complete namespace
 * @return {String} parsed.namespace - Namespace with format @scope/namespace:generator
 * @return {String} parsed.generatorHint - Package name
 * @return {String} parsed.id - Id of the instance.
 * @return {String} parsed.instanceId - Instance id with format @scope/namespace:generator+id
 * @return {String} parsed.scope - Scope name
 * @return {String} parsed.packageNamespace - Package namespace with format @scope/namespace
 * @return {String} parsed.generator - Original namespace
 * @return {String} parsed.flags - Original namespace
 */
namespaceModule.parseNamespace = function (complete) {
  if (typeof complete !== 'string') {
    return null;
  }
  const parsed = YeomanNamespace.parse(complete);
  return parsed ? new YeomanNamespace(parsed) : null;
};

/**
 * Convert a namespace to a namespace object
 *
 * @private
 * @param  {String | YeomanNamespace} namespace
 * @return {YeomanNamespace}
 */
namespaceModule.toNamespace = function (namespace) {
  return namespaceModule.isNamespace(namespace) ? namespace : namespaceModule.parseNamespace(namespace);
};

/**
 * Convert a namespace to a namespace object
 *
 * @private
 * @param  {String | YeomanNamespace} namespace
 * @return {YeomanNamespace}
 */
namespaceModule.requireNamespace = function (namespace) {
  const parsed = namespaceModule.toNamespace(namespace);
  if (!parsed) {
    throw new Error(`Error parsing namespace ${namespace}`);
  }
  return parsed;
};

/**
 * Test if the object is an Namespace instance.
 *
 * @private
 * @param  {Object} namespace
 * @return {Boolean} True if namespace is a YeomanNamespace
 */
namespaceModule.isNamespace = function (namespace) {
  return namespace && namespace.constructor && namespace.constructor.name === 'YeomanNamespace';
};
