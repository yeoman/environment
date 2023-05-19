import { requireNamespace } from '@yeoman/namespace';
import type { BaseGeneratorMeta } from '@yeoman/types';
import { groupBy } from 'lodash-es';
import createLogger from 'debug';
import { createEnv } from '../index.js';
import type YeomanCommand from '../util/command.js';

const debug = createLogger('yeoman:yoe');

export const printGroupedGenerator = (generators: BaseGeneratorMeta[]) => {
  const grouped = groupBy(generators, 'packagePath');
  for (const [packagePath, group] of Object.entries(grouped)) {
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

  const env = createEnv({ ...options, command: this });
  this.env = env;
  await env.lookupLocalPackages();

  return env.execute(generatorNamespace, command.args.splice(1));
};
