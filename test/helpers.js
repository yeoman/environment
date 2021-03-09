const {createHelpers} = require('yeoman-test');

module.exports = createHelpers({createEnv: require('../lib/environment').createEnv});
