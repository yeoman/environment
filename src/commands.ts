import YeomanCommand, { addEnvironmentOptions } from './util/command.js';
import { createEnv } from './index.js';

/**
 * Prepare a commander instance for cli support.
 *
 * @param {Command} command - Command to be prepared
 * @param  generatorPath - Generator to create Command
 * @return {Command} return command
 */
export const prepareGeneratorCommand = async (command: YeomanCommand, generatorPath: string, namespace?: string) => {
  const env = createEnv();
  const meta = env.register(generatorPath, { namespace });
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
export const prepareCommand = async (generatorPath: string, command = new YeomanCommand()) => {
  command = addEnvironmentOptions(command);
  return prepareGeneratorCommand(command, generatorPath);
};
