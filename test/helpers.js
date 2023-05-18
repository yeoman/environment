import { createHelpers } from 'yeoman-test';
import Environment from '../src/index.js';

export const getCreateEnv =
  Environment =>
  (args, ...others) =>
    Array.isArray(args) ? new Environment(...others) : new Environment(args, ...others);

export default createHelpers({
  createEnv: getCreateEnv(Environment),
});
