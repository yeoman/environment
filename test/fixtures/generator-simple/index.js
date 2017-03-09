module.exports = (args, options) => {
  console.log('Executing generator with', args, options);
};

module.exports.name = 'You can name your generator';
module.exports.description = 'And add a custom description by adding a `description` property to your function.';
module.exports.usage = 'Usage can be used to customize the help output';
