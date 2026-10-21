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
