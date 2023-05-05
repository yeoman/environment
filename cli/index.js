#!/usr/bin/env node
import YeomanCommand from '../lib/util/command.js';
import packageJson from '../package.json';
import Env from '..';
import { printGroupedGenerator, environmentAction } from './utils.js';
import process from 'node:process';

const program = new YeomanCommand();

program.version(packageJson.version).allowExcessArguments(false).enablePositionalOptions();

Env.addEnvironmentOptions(
  program
    .command('run <namespace>')
    .description('Run a generator', { namespace: 'Generator to run' })
    .passThroughOptions()
    .allowUnknownOption()
    .allowExcessArguments(true)
    .action(environmentAction)
    .usage('[environment options] <namespace> [generator-options]'),
);

program
  .command('find')
  .description('Find installed generators')
  .action(() => {
    const env = Env.createEnv();
    const generators = env.lookup();
    printGroupedGenerator(generators, env);
  });

program
  .command('list')
  .description('List generators available to be used')
  .action(() => {
    const env = Env.createEnv();
    env.lookup();
    printGroupedGenerator(Object.values(env.getGeneratorsMeta()), env);
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.log(error);
  process.exit(1);
}
