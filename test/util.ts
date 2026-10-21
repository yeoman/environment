import { describe, expect, it } from 'expect-node';
import { defaults, escapeRegExp, pick } from '../src/util/util.ts';

describe('util', () => {
  describe('pick()', () => {
    it('picks the properties present, own or inherited, undefined values included', () => {
      const object = Object.assign(Object.create({ inherited: 1 }), { own: 2, undefinedValue: undefined });
      expect(pick(object, ['own', 'inherited', 'undefinedValue', 'missing'])).toEqual({ own: 2, inherited: 1, undefinedValue: undefined });
      expect(Object.keys(pick(object, ['own', 'missing']))).toEqual(['own']);
    });

    it('gives an empty object for an undefined object', () => {
      expect(pick(undefined, ['own'])).toEqual({});
    });
  });

  describe('defaults()', () => {
    it('assigns the properties the target has as undefined, the first source first', () => {
      const target: Record<string, any> = { set: 'target', undefinedValue: undefined, nullValue: null };
      const result = defaults(target, { set: 'first', undefinedValue: 'first', nullValue: 'first', added: 'first' }, undefined, {
        added: 'second',
        other: 'second',
      });
      expect(result).toBe(target);
      expect(result).toEqual({ set: 'target', undefinedValue: 'first', nullValue: null, added: 'first', other: 'second' });
    });
  });

  describe('escapeRegExp()', () => {
    it('escapes the characters with a meaning in a regular expression', () => {
      const special = String.raw`^$.*+?()[]{}|\ /-`;
      expect(escapeRegExp(special)).toBe(String.raw`\^\$\.\*\+\?\(\)\[\]\{\}\|\\ /-`);
      expect(new RegExp(`^${escapeRegExp(special)}$`).test(special)).toBe(true);
    });
  });
});
