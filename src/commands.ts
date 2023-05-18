import { type BaseGeneratorConstructor, type GeneratorMeta } from '@yeoman/types';
import YeomanCommand, { addEnvironmentOptions } from './util/command.js';
import { createEnv } from './index.js';

export type CommandPreparation = {
  resolved?: string;
  command?: YeomanCommand;
  generator?: BaseGeneratorConstructor;
  namespace?: string;
};

/**
 * Prepare a commander instance for cli support.
 *
 * @param {Command} command - Command to be prepared
 * @param  generatorPath - Generator to create Command
 * @return {Command} return command
 */
export const prepareGeneratorCommand = async ({
  command = addEnvironmentOptions(new YeomanCommand()),
  resolved,
  generator,
  namespace,
}: CommandPreparation) => {
  const env = createEnv();
  let meta: GeneratorMeta;
  if (generator && namespace) {
    meta = env.register(generator, { namespace, resolved });
  } else if (resolved) {
    meta = env.register(resolved, { namespace });
  } else {
    throw new Error(`A generator with namespace or a generator path is required`);
  }

  command.env = env;
  command.registerGenerator(await meta.instantiateHelp());
  command.action(async function (this: YeomanCommand) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let rootCommand: YeomanCommand = this;
    while (rootCommand.parent) {
      rootCommand = rootCommand.parent as YeomanCommand;
    }

    const generator = await meta.instantiate(this.args, this.opts());
    await env.runGenerator(generator);
  });
  return command;
};

/**
 * Prepare a commander instance for cli support.
 *
 * @param generatorPaht - Generator to create Command
 * @return Return a Command instance
 */
export const prepareCommand = async (options: CommandPreparation) => {
  options.command = options.command ?? new YeomanCommand();
  addEnvironmentOptions(options.command);
  return prepareGeneratorCommand(options);
};
