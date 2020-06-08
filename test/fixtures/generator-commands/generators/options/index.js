var Generator = require('yeoman-generator');
exports.default = class extends Generator {
  constructor(args, options = {}) {
    super(args, options);

    options = options || {};

    this.option('bool', {
      type: Boolean,
      alias: 'b',
    });

    this.option('bool-default', {
      type: Boolean,
      defaults: true,
    });

    this.option('string', {
      type: String,
      alias: 's',
    });

    this.option('string-default', {
      type: String,
      defaults: 'defaultValue',
    });
  }

  empty() {}
};