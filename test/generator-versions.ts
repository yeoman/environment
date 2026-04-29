export const generator2 = 'yeoman-generator-2';
export const generator4 = 'yeoman-generator-4';
export const generator5 = 'yeoman-generator-5';
export const generator6 = 'yeoman-generator-6';
export const generator7 = 'yeoman-generator-7';

export type GeneratorVersion = typeof generator2 | typeof generator4 | typeof generator5 | typeof generator6 | typeof generator7;
type GeneratorConstructor = abstract new (...arguments_: unknown[]) => object;

export const allVersions: GeneratorVersion[] = [generator6, generator5, generator4, generator2];
const legacyVersions = new Set<GeneratorVersion>([generator2, generator4]);
export const isLegacyVersion = (version: GeneratorVersion): boolean => legacyVersions.has(version);

const greaterThan6 = new Set<GeneratorVersion>([generator6, generator7]);
export const isGreaterThan6 = (version: GeneratorVersion): boolean => greaterThan6.has(version);

export const greaterThan5 = new Set<GeneratorVersion>([generator5, ...greaterThan6]);
export const isGreaterThan5 = (version: GeneratorVersion): boolean => greaterThan5.has(version);

export const importGenerator = async (generatorVersion: GeneratorVersion): Promise<GeneratorConstructor> => {
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
  return generator as GeneratorConstructor;
};
