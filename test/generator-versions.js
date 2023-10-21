export const generator2 = 'yeoman-generator-2';
export const generator4 = 'yeoman-generator-4';
export const generator5 = 'yeoman-generator-5';
export const generator6 = 'yeoman-generator-6';

export const allVersions = [generator6, generator5, generator4, generator2];
const legacyVersions = new Set([generator2, generator4]);
export const isLegacyVersion = version => legacyVersions.has(version);

export const greaterThan5 = new Set([generator5, generator6]);
export const isGreaterThan5 = version => greaterThan5.has(version);

const greaterThan6 = new Set([generator6]);
export const isGreaterThan6 = version => greaterThan6.has(version);

export const importGenerator = async generatorVersion => {
  // eslint-disable-next-line no-warning-comments
  /*
   TODO use dynamic install works for yeoman-generator@4, but not for v2
  if (isLegacyVersion(generatorVersion)) {
    const version = generatorVersion.split('-')[2];
    console.log(version);
    const hash = createHash('shake256', { outputLength: 2 }).update(version, 'utf8').digest('hex');
    console.log(hash);
    const { default: generator } = await flyImport(`@yeoman/generator-impl-${hash}@npm:yeoman-generator@${version}`);
    return generator;
  }
  */

  const { default: generator } = await import(generatorVersion);
  return generator;
};
