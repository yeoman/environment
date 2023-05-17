import assert from 'node:assert';
import { createHash } from 'node:crypto';
import semver from 'semver';
import pacote from 'pacote';
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
  await this.repository.install(specs);

  const packagesToLookup = entries.map(([packageName, _]) => packageName);
  await this.lookupLocalPackages(packagesToLookup);

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
    npmPaths: this.repository.nodeModulesPath,
  });
};

/**
 * Resolve a package name with version.
 *
 * @param  {string} packageName - package to resolve.
 * @param  {string} [packageVersion] - version or range to resolve.
 * @param  {string[]} Array of key, value pairs.
 */
composability.resolvePackage = async function (packageName, packageVersion) {
  assert(packageName, 'Parameter packageName is required');
  if (packageVersion) {
    packageName = `${packageName}@${packageVersion}`;
  }

  const manifest = await pacote.manifest(packageName);
  if (!manifest) {
    return undefined;
  }

  const from = manifest._from;
  const index = from.lastIndexOf('@');
  if (index > 1) {
    const resolvedVersion = from.slice(index + 1, from.length) || manifest.version;
    return [from.slice(0, Math.max(0, index)), resolvedVersion];
  }

  return [manifest.name, from || manifest.version];
};
