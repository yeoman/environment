'use strict';

/**
 * @mixin
 * @alias env/generators
 */
const generators = module.exports;

/**
 * Get an instance of the generator if it already got instantiated.
 *
 * @param  {namespace} Namespace of the instantiated generator.
 * @return {Object} generator - Generator
 */
generators.getInstance = function (namespace) {
  namespace = this.requireNamespace(namespace);
  return this._generators[namespace.id] || this._generators[this.alias(namespace.id)];
};

generators.nextInstanceId = function (namespace) {
  namespace = this.requireNamespace(namespace);
  while (this._generators[namespace.id]) {
    namespace.bumpId();
  }
  return namespace;
};

generators.registerInstance = function (namespace, generator) {
  if (!generator) {
    generator = namespace;
    namespace = generator.options.id || generator.options.namespace;
  }
  namespace = this.requireNamespace(namespace);
  this._generators[namespace.id] = generator;
};

/**
 * Get the generator instance that was called at Environment.run().
 *
 * @return {Object} generator - Generator
 */
generators.rootGenerator = function () {
  return this._rootGenerator;
};
