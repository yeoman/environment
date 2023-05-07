import { createHelpers } from 'yeoman-test';
import Environment from '../src/environment.js';

export default createHelpers({ createEnv: Environment.createEnv });
