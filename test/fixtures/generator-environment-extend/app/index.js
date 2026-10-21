import { lookupGenerator } from '../../../../src/store/lookup-generator.ts';
const maybeGenerator = await import(lookupGenerator('dummy:app'));
const Generator = maybeGenerator.default ?? maybeGenerator;
export default class extends Generator {};
