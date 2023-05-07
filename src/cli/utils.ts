import { groupBy } from 'lodash-es';
import createLogger from 'debug';
import Environment from '../index.js';
import { toNamespace } from '../util/namespace.js';

const debug = createLogger('yeoman:yoe');

export const printGroupedGenerator = (generators: any) => {
  const grouped = groupBy(generators, 'packagePath');
  for (const [packagePath, group] of Object.entries(grouped)) {
    const namespace = toNamespace(group[0].namespace);
    console.log(`  ${namespace.packageNamespace} at ${packagePath}`);
    for (const generator of group) {
      const generatorNamespace = toNamespace(generator.namespace);
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
export const environmentAction = async function (this: any, generatorNamespace: string, options: any, command: any) {
  debug('Handling operands %o', generatorNamespace);
  if (!generatorNamespace) {
    return;
  }

  this.env = Environment.createEnv([], { ...options, command: this });
  this.env.lookupLocalPackages();

  return this.env.execute(generatorNamespace, command.args.splice(1));
};
