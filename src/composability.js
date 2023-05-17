import { createHash } from 'node:crypto';
import { join } from 'node:path';
import semver from 'semver';
import { flyImport } from 'fly-import';

/**
 * @mixin
 * @alias env/composability
 */
const composability = {};

export default composability;

composability.requireGenerator = async function (namespace) {
  if (namespace === undefined) {
    try {
      const { default: Generator } = await import('yeoman-generator');
      return Generator;
    } catch {}

    const { default: Generator } = await flyImport('yeoman-generator');
    return Generator;
  }

  // Namespace is a version
  if (semver.valid(namespace)) {
    // Create a hash to install any version range in the local repository
    const hash = createHash('shake256', { outputLength: 2 }).update(namespace, 'utf8').digest('hex');
    const { default: Generator } = await flyImport(`@yeoman/generator-impl-${hash}@npm:yeoman-generator@${semver}`);
    return Generator;
  }

  return this.get(namespace);
};

/**
 * Install generators at the custom local repository and register.
 *
 * @param  {Object} packages - packages to install key(packageName): value(versionRange).
 * @return  {Boolean} - true if the install succeeded.
 */
composability.installLocalGenerators = async function (packages) {
  const entries = Object.entries(packages);
  const specs = entries.map(([packageName, version]) => `${packageName}${version ? `@${version}` : ''}`);
  const installResult = await this.repository.install(specs);
  const failToInstall = installResult.find(result => !result.path);
  if (failToInstall) {
    throw new Error(`Fail to install ${failToInstall.pkgid}`);
  }
  this.lookup({ packagePaths: installResult.map(result => result.path) });
  return true;
};

/**
 * Lookup and register generators from the custom local repository.
 *
 * @param  {String[]} [packagesToLookup='generator-*'] - packages to lookup.
 */
composability.lookupLocalPackages = async function (packagesToLookup = 'generator-*') {
  await this.lookup({
    packagePatterns: packagesToLookup,
    npmPaths: join(this.repository.repositoryPath, 'node_modules'),
  });
};
