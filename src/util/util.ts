import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * The output of a command, `undefined` when it fails. execa is loaded at the first command only: a lookup given the
 * paths of its packages runs none, and the store does not load it.
 */
export const execaOutput = (cmg: string, arguments_: string[]): string | undefined => {
  try {
    const { execaSync } = require('execa') as typeof import('execa');
    const { failed, stdout } = execaSync(cmg, arguments_, { encoding: 'utf8' });
    if (!failed) {
      return stdout;
    }
  } catch {
    // ignore error
  }

  return;
};

/**
 * Two-step argument splitting function that first splits arguments in quotes,
 * and then splits up the remaining arguments if they are not part of a quote.
 */
export function splitArgsFromString(argumentsString: string | string[]): string[] {
  if (Array.isArray(argumentsString)) {
    return argumentsString;
  }

  let result: string[] = [];
  if (!argumentsString) {
    return result;
  }

  const quoteSeparatedArguments = argumentsString.split(/("[^"]*")/).filter(Boolean);
  for (const argument of quoteSeparatedArguments) {
    if (argument.includes('"')) {
      result.push(argument.replaceAll('"', ''));
    } else {
      result = result.concat(argument.trim().split(' '));
    }
  }

  return result;
}

/**
 * The properties of an object present in it (own or inherited), like lodash `pick`.
 */
export const pick = (object: object | undefined, keys: readonly string[]): Record<string, any> =>
  Object.fromEntries(object ? keys.filter(key => key in object).map(key => [key, (object as any)[key]]) : []);

/**
 * Assign to the target the properties of the sources it has as undefined, the first source first, like lodash
 * `defaults`.
 */
export const defaults = <T extends object>(target: T, ...sources: Array<object | undefined>): T => {
  for (const source of sources) {
    if (!source) continue;
    for (const key in source) {
      if ((target as any)[key] === undefined) {
        (target as any)[key] = (source as any)[key];
      }
    }
  }

  return target;
};

/**
 * Escape the characters with a meaning in a regular expression, like lodash `escapeRegExp`.
 */
export const escapeRegExp = (value: string): string => value.replaceAll(/[\\^$.*+?()[\]{}|]/g, String.raw`\$&`);
