
/**
 * @mixin
 * @alias env/composability
 */
const composability = module.exports;

/**
 * Install generators at the custom local repository and register.
 *
 * @private
 * @param  {Object} packages - packages to install key(packageName): value(versionRange).
 * @return  {Boolean} - true if the install succeeded.
 */
composability.installLocalGenerators = function (packages) {
  const entries = Object.entries(packages).filter(([packageName, version]) => !this.repository.verifyInstalledVersion(packageName, version));
  if (entries.length === 0) {
    return true;
  }
  const toInstall = {};
  entries.forEach(([packageName, version]) => {
    toInstall[packageName] = version;
  });
  if (this.repository.installPackages(toInstall)) {
    const packagesToLookup = entries.map(([packageName, _]) => packageName);
    this.lookupLocalPackages(packagesToLookup);
    return true;
  }
  return false;
};

/**
 * Lookup and register generators from the custom local repository.
 *
 * @private
 * @param  {String[]} [packagesToLookup='generator-*'] - packages to lookup.
 */
composability.lookupLocalPackages = function (packagesToLookup = 'generator-*') {
  this.lookup({packagePatterns: packagesToLookup, npmPaths: this.repository.nodeModulesPath});
};
