var Generator = require('yeoman-generator');

class NewGenerator extends Generator {
  default() {
    console.log('Executing NewGenerator generator', this.arguments);
  }
};

NewGenerator.name = 'You can name your generator';
NewGenerator.description = 'Ana add a custom description by adding a `description` property to your function.';
NewGenerator.usage = 'Usage can be used to customize the help output';

// namespace is resolved depending on the location of this generator,
// unless you specifically define it.
NewGenerator.namespace = 'mocha:generator';

module.exports = NewGenerator;
