import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { flyImport } from 'fly-import';
import semver from 'semver';
import { type YeomanNamespace, requireNamespace } from '@yeoman/namespace';
import Environment from './environment.js';
import { type LookupOptions } from './generator-lookup.js';
import YeomanCommand from './util/command.js';

class FullEnvironment extends Environment {
  /**
   * Generate a command for the generator and execute.
   *
   * @param {string} generatorNamespace
   * @param {string[]} args
   */
  async execute(generatorNamespace: string, args = []) {
    const namespace = requireNamespace(generatorNamespace);
    if (!(await this.get(namespace.namespace))) {
      await this.lookup({
        packagePatterns: [namespace.generatorHint],
        singleResult: true,
      });
    }

    if (!(await this.get(namespace.namespace))) {
      await this.installLocalGenerators({
        [namespace.generatorHint]: namespace.semver,
      });
    }

    const namespaceCommand = this.command ? this.command.command(namespace.namespace) : new YeomanCommand();
    namespaceCommand.usage('[generator-options]');

    // Instantiate the generator for options
    const generator = await this.create(namespace.namespace, { generatorArgs: [], generatorOptions: { help: true } });
    namespaceCommand.registerGenerator(generator);

    (namespaceCommand as any)._parseCommand([], args);
    return this.run([namespace.namespace, ...namespaceCommand.args], {
      ...namespaceCommand.opts(),
    });
  }

  async requireGenerator(namespace: string) {
    if (namespace === undefined) {
      try {
        // @ts-expect-error yeoman-generator type maybe missing
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const { default: Generator } = await import('yeoman-generator');
        return Generator;
      } catch {}

      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { default: Generator } = await flyImport('yeoman-generator');
      return Generator;
    }

    // Namespace is a version
    if (semver.valid(namespace)) {
      // Create a hash to install any version range in the local repository
      const hash = createHash('shake256', { outputLength: 2 }).update(namespace, 'utf8').digest('hex');
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { default: Generator } = await flyImport(`@yeoman/generator-impl-${hash}@npm:yeoman-generator@${namespace}`);
      return Generator;
    }

    return this.get(namespace);
  }

  /**
   * Install generators at the custom local repository and register.
   *
   * @param  {Object} packages - packages to install key(packageName): value(versionRange).
   * @return  {Boolean} - true if the install succeeded.
   */
  async installLocalGenerators(packages: Record<string, string | undefined>) {
    const entries = Object.entries(packages);
    const specs = entries.map(([packageName, version]) => `${packageName}${version ? `@${version}` : ''}`);
    const installResult = await this.repository.install(specs);
    const failToInstall = installResult.find(result => !result.path);
    if (failToInstall) {
      throw new Error(`Fail to install ${failToInstall.pkgid}`);
    }

    await this.lookup({ packagePaths: installResult.map(result => result.path) as string[] });
    return true;
  }

  /**
   * Lookup and register generators from the custom local repository.
   *
   * @param  {String[]} [packagesToLookup='generator-*'] - packages to lookup.
   */
  async lookupLocalPackages(packagesToLookup = ['generator-*']) {
    await this.lookup({
      packagePatterns: packagesToLookup,
      npmPaths: [join(this.repository.repositoryPath, 'node_modules')],
    });
  }

  /**
   * Lookup and register generators from the custom local repository.
   *
   * @private
   * @param  {YeomanNamespace[]} namespacesToLookup - namespaces to lookup.
   * @return {Promise<Object[]>} List of generators
   */
  async lookupLocalNamespaces(namespacesToLookup: string | string[]) {
    if (!namespacesToLookup) {
      return [];
    }

    namespacesToLookup = Array.isArray(namespacesToLookup) ? namespacesToLookup : [namespacesToLookup];
    const namespaces = namespacesToLookup.map(ns => requireNamespace(ns));
    // Keep only those packages that has a compatible version.
    return this.lookupLocalPackages(namespaces.map(ns => ns.generatorHint));
  }

  /**
   * Search for generators or sub generators by namespace.
   *
   * @private
   * @param {boolean|Object} [options] options passed to lookup. Options singleResult,
   *                                   filePatterns and packagePatterns can be overridden
   * @return {Array|Object} List of generators
   */
  async lookupNamespaces(namespaces: string | string[], options: LookupOptions = {}) {
    if (!namespaces) {
      return [];
    }

    namespaces = Array.isArray(namespaces) ? namespaces : [namespaces];
    const namespacesObjs = namespaces.map(ns => requireNamespace(ns));
    const options_ = namespacesObjs.map(ns => {
      const nsOptions: LookupOptions = { packagePatterns: [ns.generatorHint] };
      if (ns.generator) {
        // Build filePatterns to look specifically for the namespace.
        const genPath = ns.generator.split(':').join('/');
        let filePatterns = [`${genPath}/index.?s`, `${genPath}.?s`];
        const lookups = options.lookups ?? this.lookups;
        filePatterns = lookups.flatMap(prefix => filePatterns.map(pattern => join(prefix, pattern)));
        nsOptions.filePatterns = filePatterns;
        nsOptions.singleResult = true;
      }

      return nsOptions;
    });
    return Promise.all(options_.flatMap(async opt => this.lookup({ ...opt, ...options })));
  }

  /**
   * Load or install namespaces based on the namespace flag
   *
   * @private
   * @param  {String|Array} - namespaces
   * @return  {boolean} - true if every required namespace was found.
   */
  async prepareEnvironment(namespaces: string | string[]) {
    namespaces = Array.isArray(namespaces) ? namespaces : [namespaces];
    let missing = namespaces.map(ns => requireNamespace(ns));
    const updateMissing = async () => {
      const entries = await Promise.all(missing.map(async ns => [ns, await this.get(ns)]));
      missing = entries.filter(([_ns, gen]) => Boolean(gen)).map(([ns]) => ns) as YeomanNamespace[];
    };

    await updateMissing();

    // Install missing
    const toInstall: Record<string, string | undefined> = Object.fromEntries(missing.map(ns => [ns.generatorHint, ns.semver]));

    await this.installLocalGenerators(toInstall);

    await updateMissing();

    if (missing.length === 0) {
      return true;
    }

    throw new Error(`Error preparing environment for ${missing.map(ns => ns.complete).join(',')}`);
  }
}

export default FullEnvironment;
