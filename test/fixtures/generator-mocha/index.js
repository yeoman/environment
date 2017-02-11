var Generator = require('yeoman-generator');

var Generator = module.exports = Generator.extend({
  default: function () {
    console.log('Executing generator with', this.arguments, this.options);
  }
});

Generator.name = 'You can name your generator';
Generator.description = 'Ana add a custom description by adding a `description` property to your function.';
Generator.usage = 'Usage can be used to customize the help output';

// namespace is resolved depending on the location of this generator,
// unless you specifically define it.
Generator.namespace = 'mocha:generator';
