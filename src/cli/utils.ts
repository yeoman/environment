import { requireNamespace } from '@yeoman/namespace';
import type { BaseGeneratorMeta } from '@yeoman/types';
import createLogger from 'debug';
import { createEnv as createEnvironment } from '../index.ts';
import type YeomanCommand from '../util/command.ts';

const debug = createLogger('yeoman:yoe');

export const printGroupedGenerator = (generators: BaseGeneratorMeta[]) => {
  const grouped = new Map<string, BaseGeneratorMeta[]>();
  for (const generator of generators) {
    const packagePath = String(generator.packagePath);
    grouped.set(packagePath, [...(grouped.get(packagePath) ?? []), generator]);
  }

  for (const [packagePath, group] of grouped) {
    const namespace = requireNamespace(group[0].namespace);
    console.log(`  ${namespace.packageNamespace} at ${packagePath}`);
    for (const generator of group) {
      const generatorNamespace = requireNamespace(generator.namespace);
      console.log(`    :${generatorNamespace.generator || 'app'}`);
    }

    console.log('');
  }

  console.log(`${generators.length} generators`);
};

/**
 * @param {string} generatorNamespace
 * @param {*} options
 * @param {*} command
 * @returns
 */
export const environmentAction = async function (this: YeomanCommand, generatorNamespace: string, options: any, command: any) {
  debug('Handling operands %o', generatorNamespace);
  if (!generatorNamespace) {
    return;
  }

  const environment = createEnvironment({ ...options, command: this });
  this.env = environment;
  await environment.lookupLocalPackages();

  return environment.execute(generatorNamespace, command.args.splice(1));
};
