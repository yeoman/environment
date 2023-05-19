import { readFileSync } from 'node:fs';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type RegisteredLookupGeneratorMeta } from '@yeoman/types';
import YeomanCommand, { addEnvironmentOptions } from '../util/command.js';
import { createEnv } from '../index.js';
import { printGroupedGenerator, environmentAction } from './utils.js';

const program = new YeomanCommand();

const packageJson = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json')).toString());

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
    const env = createEnv();
    printGroupedGenerator(await env.lookup());
  });

program
  .command('list')
  .description('List generators available to be used')
  .action(async () => {
    const env = createEnv();
    await env.lookup();
    printGroupedGenerator(Object.values(env.getGeneratorsMeta()));
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.log(error);
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}
