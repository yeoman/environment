import { createHash } from 'node:crypto';
import { basename, join, relative } from 'node:path';
import { realpathSync } from 'node:fs';
import { type LookupGeneratorMeta } from '@yeoman/types';
import { flyImport } from 'fly-import';
import semver from 'semver';
import { requireNamespace } from '@yeoman/namespace';
import Environment from './environment.js';
import { type LookupOptions, lookupGenerators } from './generator-lookup.js';
import { asNamespace } from './util/namespace.js';
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
    if (!this.get(namespace.namespace)) {
      await this.lookup({
        packagePatterns: [namespace.generatorHint],
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
    const generator = await this.create(namespace.namespace, [], { help: true });
    namespaceCommand.registerGenerator(generator);

    namespaceCommand._parseCommand([], args);
    return this.run([namespace.namespace, ...namespaceCommand.args], {
      ...namespaceCommand.opts(),
    });
  }

  /**
   * Search for generators and their sub generators.
   *
   * A generator is a `:lookup/:name/index.js` file placed inside an npm package.
   *
   * Defaults lookups are:
   *   - ./
   *   - generators/
   *   - lib/generators/
   *
   * So this index file `node_modules/generator-dummy/lib/generators/yo/index.js` would be
   * registered as `dummy:yo` generator.
   *
   * @param {boolean|Object} [options]
   * @param {boolean} [options.localOnly = false] - Set true to skip lookups of
   *                                               globally-installed generators.
   * @param {string|Array} [options.packagePaths] - Paths to look for generators.
   * @param {string|Array} [options.npmPaths] - Repository paths to look for generators packages.
   * @param {string|Array} [options.filePatterns='*\/index.js'] - File pattern to look for.
   * @param {string|Array} [options.packagePatterns='generator-*'] - Package pattern to look for.
   * @param {boolean}      [options.singleResult=false] - Set true to stop lookup on the first match.
   * @param {Number}       [options.globbyDeep] - Deep option to be passed to globby.
   * @return {Promise<Object[]>} List of generators
   */
  async lookup(options: LookupOptions & { registerToScope?: string }) {
    // Resolve signature where options is omitted.
    if (typeof options === 'function') {
      throw new TypeError('Callback support have been removed.');
      // Resolve signature where options is boolean.
    } else if (typeof options === 'boolean') {
      options = { localOnly: options };
    } else {
      options = options || { localOnly: false };
    }

    const { registerToScope, lookups = this.lookups, ...remainingOptions } = options;
    options = {
      ...remainingOptions,
      lookups,
    };

    const generators: LookupGeneratorMeta[] = [];
    await lookupGenerators(options, ({ packagePath, filePath, lookups }) => {
      try {
        let repositoryPath = join(packagePath, '..');
        if (basename(repositoryPath).startsWith('@')) {
          // Scoped package
          repositoryPath = join(repositoryPath, '..');
        }

        let namespace = asNamespace(relative(repositoryPath, filePath), { lookups });
        const resolved = realpathSync(filePath);
        if (!namespace) {
          namespace = asNamespace(resolved, { lookups });
        }

        if (registerToScope && !namespace.startsWith('@')) {
          namespace = `@${registerToScope}/${namespace}`;
        }

        this.store.add({ namespace, packagePath, resolved });
        const meta = this.getGeneratorMeta(namespace);
        if (meta) {
          generators.push({
            ...meta,
            generatorPath: meta.resolved,
            registered: true,
          });
          return Boolean(options.singleResult);
        }
      } catch (error) {
        console.error('Unable to register %s (Error: %s)', filePath, error);
      }

      generators.push({
        generatorPath: filePath,
        resolved: filePath,
        packagePath,
        registered: false,
      } as any);

      return false;
    });

    return generators;
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
    let missing = namespaces.map(ns => requireNamespace(ns)).filter(ns => !this.getByNamespace(ns));

    // Install missing
    const toInstall: Record<string, string | undefined> = Object.fromEntries(missing.map(ns => [ns.generatorHint, ns.semver]));

    await this.installLocalGenerators(toInstall);

    missing = missing.filter(ns => !this.getByNamespace(ns));
    if (missing.length === 0) {
      return true;
    }

    throw new Error(`Error preparing environment for ${missing.map(ns => ns.complete).join(',')}`);
  }
}

export default FullEnvironment;
