import { createHelpers } from 'yeoman-test';
import Environment from '../src/index.js';

export default createHelpers({
  createEnv: (args, ...others) => (Array.isArray(args) ? new Environment(...others) : new Environment(args, ...others)),
});
