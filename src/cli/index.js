#!/usr/bin/env node
import process from 'node:process';
import YeomanCommand, { addEnvironmentOptions } from '../util/command.js';
import packageJson from '../package.json';
import Env from '../index.js';
import { printGroupedGenerator, environmentAction } from './utils.js';

const program = new YeomanCommand();

program.version(packageJson.version).allowExcessArguments(false).enablePositionalOptions();

addEnvironmentOptions(
  program
    .command('run <namespace>')
    .description('Run a generator')
    .argument('<namespace>', 'Generator to run')
    .passThroughOptions()
    .allowUnknownOption()
    .allowExcessArguments(true)
    .action(environmentAction)
    .usage('[environment options] <namespace> [generator-options]'),
);

program
  .command('find')
  .description('Find installed generators')
  .action(async () => {
    const env = Env.createEnv();
    const generators = await env.lookup();
    printGroupedGenerator(generators, env);
  });

program
  .command('list')
  .description('List generators available to be used')
  .action(async () => {
    const env = Env.createEnv();
    await env.lookup();
    printGroupedGenerator(Object.values(env.getGeneratorsMeta()), env);
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.log(error);
  process.exit(1);
}
