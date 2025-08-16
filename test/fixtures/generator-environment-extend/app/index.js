import { lookupGenerator } from '../../../../src/generator-lookup.ts';
const maybeGenerator = await import(lookupGenerator('dummy:app'));
const Generator = maybeGenerator.default ?? maybeGenerator;
export default class extends Generator {};
