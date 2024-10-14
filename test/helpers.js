import { createHelpers } from 'yeoman-test';
import Environment from '../src/index.js';

export const getCreateEnv =
  Environment =>
  (arguments_, ...others) =>
    Array.isArray(arguments_) ? new Environment(...others) : new Environment(arguments_, ...others);

export default createHelpers({
  createEnv: getCreateEnv(Environment),
});
