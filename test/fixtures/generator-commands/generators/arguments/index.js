var Generator = require('yeoman-generator-5');
module.exports = class extends Generator {
  constructor(args, options = {}) {
    super(args, options);

    this.argument('name', {
      type: String,
      required: false,
    });
  }

  empty() {}
};