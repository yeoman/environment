import { requireNamespace } from '@yeoman/namespace';
import createdLogger from 'debug';
import YeomanCommand from './util/command.js';

const debug = createdLogger('yeoman:environment:command');

const commandMixin = cls =>
  class EnvironmentCommand extends cls {
    /**
     * Generate a command for the generator and execute.
     *
     * @param {string} generatorNamespace
     * @param {string[]} args
     */
    async execute(generatorNamespace, args = []) {
      const namespace = requireNamespace(generatorNamespace);
      if (!this.get(namespace.namespace)) {
        await this.lookup({
          packagePatterns: namespace.generatorHint,
          singleResult: true,
        });
      }

      if (!this.get(namespace.namespace)) {
        await this.installLocalGenerators({
          [namespace.generatorHint]: namespace.semver,
        });
      }

      const namespaceCommand = this.command ? this.command.command(namespace.namespace) : new YeomanCommand();
      namespaceCommand.usage('[generator-options]');

      // Instantiate the generator for options
      const generator = await this.create(namespace.namespace, { help: true });
      namespaceCommand.registerGenerator(generator);

      namespaceCommand._parseCommand([], args);
      debug('Running generator with arguments %o, options %o', namespaceCommand.args, namespaceCommand.opts());
      return this.run([namespace.namespace, ...namespaceCommand.args], {
        ...namespaceCommand.opts(),
      });
    }
  };
export default commandMixin;
