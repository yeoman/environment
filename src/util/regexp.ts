/**
 * Escape the characters with a meaning in a regular expression, like lodash `escapeRegExp`.
 */
export const escapeRegExp = (value: string): string => value.replaceAll(/[\\^$.*+?()[\]{}|]/g, String.raw`\$&`);
