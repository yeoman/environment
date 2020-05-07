'use strict';
const debug = require('debug')('yeoman:environment:namespace');

// ============ | == @ ======== scope ========== | ====== unscoped ====== | = : ========== generator ========== | = @ ===== semver ====== @  | = # ========= instanceId ========== | == + =========== method ============== |= flags = |
const regexp = /^(?:(@[a-z0-9-~][a-z0-9-._~]*)\/)?([a-z0-9-~][a-z0-9-._~]*)(?::((?:[a-z0-9-~][a-z0-9-._~]*:?)*))?(?:@([a-z0-9-.~><+=^* ]*)@?)?(?:#((?:[a-z0-9-~][a-z0-9-._~]*|\*)))?(?:\+((?:[a-zA-Z0-9][a-zA-Z0-9_]*\+?)*))?(\?)?$/;

const groups = {complete: 0, scope: 1, unscoped: 2, generator: 3, semver: 4, instanceId: 5, method: 6, flags: 7};
const flags = {optional: '?'};

const namespaceModule = module.exports;

class YeomanNamespace {
  constructor(parsed) {
    this._original = parsed.complete;
    this.scope = parsed.scope;
    this.unscoped = parsed.unscoped;
    this.generator = parsed.generator;
    this.instanceId = parsed.instanceId;
    this.semver = parsed.semver;
    if (parsed.method) {
      this.methods = parsed.method.split('+');
    } else {
      this.methods = parsed.methods;
    }
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
    this.command = parsed.command || this.command;
    this.flags = parsed.flags || this.flags;
  }

  get _scopeAddition() {
    return this.scope ? `${this.scope}/` : '';
  }

  get generatorName() {
    return this.generator ? `:${this.generator}` : '';
  }

  _semverAddition(post) {
    if (!this.semver) {
      return post ? post : '';
    }
    if (post) {
      return `@${this.semver}@${post}`;
    }
    return `@${this.semver}`;
  }

  get instanceName() {
    return this.instanceId ? `#${this.instanceId}` : '';
  }

  get complete() {
    let methods = '';
    if (this.methods && this.methods.length > 0) {
      methods = '+' + this.methods.join('+');
    }
    const postSemver = `${this.instanceName}${methods}${this.flags || ''}`;
    return `${this.namespace}${this._semverAddition(postSemver)}`;
  }

  get packageNamespace() {
    return `${this._scopeAddition}${this.unscoped}`;
  }

  get namespace() {
    return `${this.packageNamespace}${this.generatorName}`;
  }

  set namespace(namespace) {
    this._update(YeomanNamespace.parse(namespace));
  }

  get unscopedNamespace() {
    return `${this.unscoped}${this.generatorName}`;
  }

  get id() {
    return `${this.namespace}${this.instanceName}`;
  }

  get generatorHint() {
    return `${this._scopeAddition}generator-${this.unscoped}`;
  }

  get versionedHint() {
    return this.semver ? `${this.generatorHint}@"${this.semver}"` : this.generatorHint;
  }

  with(newValues) {
    const self = this;
    return new YeomanNamespace({
      ...self,
      ...newValues
    });
  }

  toString() {
    return this.complete;
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
 * @return {String} parsed.instanceId - Instance id with format @scope/namespace:generator#id
 * @return {String} parsed.method - Method id with format @scope/namespace:generator+foo+bar
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
 * Convert a package name to a namespace object
 *
 * @private
 * @param  {String} packageName
 * @return {YeomanNamespace}
 */
namespaceModule.namespaceFromPackageName = function (packageName) {
  const namespace = namespaceModule.parseNamespace(packageName);
  if (!namespace.unscoped.startsWith('generator-')) {
    throw new Error(`${packageName} is not a valid generator package name`);
  }
  namespace.unscoped = namespace.unscoped.replace(/^generator-/, '');
  return namespace;
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
