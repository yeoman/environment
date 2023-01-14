import Environment from '../../../../lib/index.mjs';
const maybeGenerator = await import(Environment.lookupGenerator('dummy:app'));
const Generator = maybeGenerator.default ?? maybeGenerator;
export default class extends Generator {};
