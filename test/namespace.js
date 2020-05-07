'use strict';
const assert = require('assert');
const namespace = require('../lib/namespace');

const fields = [
  'complete',
  'scope',
  'unscoped',
  'packageNamespace',
  'id',
  'instanceId',
  'methods',
  'generatorHint',
  'flags',
  'optional',
  'instanceId',
  'semver',
  'versionedHint'
];

const equalsNamespace = function (namespace, expected) {
  fields.forEach(field => assert.deepStrictEqual(
    namespace[field], expected[field],
    `Field ${field} differs: ${namespace[field]} === ${expected[field]}`
  ));
  return true;
};

describe('Namespace', () => {
  describe('#isNamespace()', () => {
    it('returns true if a YeomanNamespace is passed', () => {
      assert(namespace.isNamespace(namespace.requireNamespace('foo-bar')));
    });
  });

  describe('#requireNamespace()', () => {
    it('returns namespace', () => {
      const parsed = namespace.requireNamespace('foo-bar');
      assert(equalsNamespace(parsed, {
        complete: 'foo-bar',
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar',
        packageNamespace: 'foo-bar'
      }));
    });

    it('returns namespace with scope', () => {
      const parsed = namespace.requireNamespace('@scope/foo-bar');
      assert(equalsNamespace(parsed, {
        complete: '@scope/foo-bar',
        scope: '@scope',
        unscoped: 'foo-bar',
        generatorHint: '@scope/generator-foo-bar',
        versionedHint: '@scope/generator-foo-bar',
        namespace: '@scope/foo-bar',
        id: '@scope/foo-bar',
        packageNamespace: '@scope/foo-bar'
      }));
    });

    it('returns namespace with scope and generator', () => {
      const parsed = namespace.requireNamespace('@scope/foo-bar:app');
      assert(equalsNamespace(parsed, {
        complete: '@scope/foo-bar:app',
        scope: '@scope',
        unscoped: 'foo-bar',
        generatorHint: '@scope/generator-foo-bar',
        versionedHint: '@scope/generator-foo-bar',
        namespace: '@scope/foo-bar:app',
        id: '@scope/foo-bar:app',
        packageNamespace: '@scope/foo-bar',
        generator: 'app'
      }));
    });

    it('returns namespace with generator', () => {
      const parsed = namespace.requireNamespace('foo-bar:app');
      assert(equalsNamespace(parsed, {
        complete: 'foo-bar:app',
        unscoped: 'foo-bar',
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar',
        namespace: 'foo-bar:app',
        id: 'foo-bar:app',
        packageNamespace: 'foo-bar',
        generator: 'app'
      }));
    });

    it('returns namespace with id', () => {
      const parsed = namespace.requireNamespace('foo-bar#1');
      assert(equalsNamespace(parsed, {
        complete: 'foo-bar#1',
        unscoped: 'foo-bar',
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar',
        namespace: 'foo-bar',
        id: 'foo-bar#1',
        instanceId: '1',
        packageNamespace: 'foo-bar'
      }));
    });

    it('returns namespace with generator and id', () => {
      const parsed = namespace.requireNamespace('foo-bar:app#1');
      assert(equalsNamespace(parsed, {
        complete: 'foo-bar:app#1',
        unscoped: 'foo-bar',
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar',
        namespace: 'foo-bar:app',
        id: 'foo-bar:app#1',
        instanceId: '1',
        packageNamespace: 'foo-bar',
        generator: 'app'
      }));
    });

    it('returns namespace with scope, generator, id and optional', () => {
      const parsed = namespace.requireNamespace('@scope/foo-bar:app#1?');
      assert(equalsNamespace(parsed, {
        complete: '@scope/foo-bar:app#1?',
        scope: '@scope',
        unscoped: 'foo-bar',
        generatorHint: '@scope/generator-foo-bar',
        versionedHint: '@scope/generator-foo-bar',
        namespace: '@scope/foo-bar:app',
        id: '@scope/foo-bar:app#1',
        instanceId: '1',
        packageNamespace: '@scope/foo-bar',
        generator: 'app',
        flags: '?',
        optional: true
      }));
    });

    it('throws exception with namespace with scope, generator, id and invalid flags', () => {
      assert.throws(() => namespace.requireNamespace('@scope/foo-bar:app#1!$'));
    });

    it('returns namespace with scope, multiples generator and id', () => {
      const parsed = namespace.requireNamespace('@scope/foo-bar:app:client#1');
      assert(equalsNamespace(parsed, {
        complete: '@scope/foo-bar:app:client#1',
        scope: '@scope',
        unscoped: 'foo-bar',
        generatorHint: '@scope/generator-foo-bar',
        versionedHint: '@scope/generator-foo-bar',
        namespace: '@scope/foo-bar:app:client',
        id: '@scope/foo-bar:app:client#1',
        instanceId: '1',
        packageNamespace: '@scope/foo-bar',
        generator: 'app:client'
      }));
    });

    it('returns with semver', () => {
      const complete = 'foo-bar@1.0.0-beta+exp.sha.5114f85';
      const parsed = namespace.requireNamespace(complete);
      assert(equalsNamespace(parsed, {
        complete,
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar@"1.0.0-beta+exp.sha.5114f85"',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar',
        packageNamespace: 'foo-bar',
        semver: '1.0.0-beta+exp.sha.5114f85'
      }));
    });

    it('returns with semver +', () => {
      const complete = 'foo-bar@1.0.0-beta+exp.sha.5114f85';
      const parsed = namespace.requireNamespace(complete);
      assert(equalsNamespace(parsed, {
        complete,
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar@"1.0.0-beta+exp.sha.5114f85"',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar',
        packageNamespace: 'foo-bar',
        semver: '1.0.0-beta+exp.sha.5114f85'
      }));
    });

    it('returns with semver ^', () => {
      const complete = 'foo-bar@^1.0.4';
      const parsed = namespace.requireNamespace(complete);
      assert(equalsNamespace(parsed, {
        complete,
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar@"^1.0.4"',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar',
        packageNamespace: 'foo-bar',
        semver: '^1.0.4'
      }));
    });

    it('returns with semver *', () => {
      const complete = 'foo-bar@*';
      const parsed = namespace.requireNamespace(complete);
      assert(equalsNamespace(parsed, {
        complete,
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar@"*"',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar',
        packageNamespace: 'foo-bar',
        semver: '*'
      }));
    });

    it('semver space', () => {
      const complete = 'foo-bar@1.0.0 - 1.2.0';
      const parsed = namespace.requireNamespace(complete);
      assert(equalsNamespace(parsed, {
        complete,
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar@"1.0.0 - 1.2.0"',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar',
        packageNamespace: 'foo-bar',
        semver: '1.0.0 - 1.2.0'
      }));
    });

    it('returns with semver <=>', () => {
      const complete = 'foo-bar@>=1.2.3 <2.0.0';
      const parsed = namespace.requireNamespace(complete);
      assert(equalsNamespace(parsed, {
        complete,
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar@">=1.2.3 <2.0.0"',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar',
        packageNamespace: 'foo-bar',
        semver: '>=1.2.3 <2.0.0'
      }));
    });

    it('returns with semver and instanceId', () => {
      const complete = 'foo-bar@>=1.2.3 <2.0.0@#1';
      const parsed = namespace.requireNamespace(complete);
      assert(equalsNamespace(parsed, {
        complete,
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar@">=1.2.3 <2.0.0"',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar#1',
        instanceId: '1',
        packageNamespace: 'foo-bar',
        semver: '>=1.2.3 <2.0.0'
      }));
    });

    it('returns method update', () => {
      const parsed = namespace.requireNamespace('foo-bar+update');
      assert(equalsNamespace(parsed, {
        complete: 'foo-bar+update',
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar',
        packageNamespace: 'foo-bar',
        methods: ['update']
      }));
    });

    it('returns method update and done', () => {
      const parsed = namespace.requireNamespace('foo-bar+update+done');
      assert(equalsNamespace(parsed, {
        complete: 'foo-bar+update+done',
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar',
        packageNamespace: 'foo-bar',
        methods: ['update', 'done']
      }));
    });

    it('accepts upper case methods', () => {
      const parsed = namespace.requireNamespace('foo-bar+UPDATE+done');
      assert(equalsNamespace(parsed, {
        complete: 'foo-bar+UPDATE+done',
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar',
        packageNamespace: 'foo-bar',
        methods: ['UPDATE', 'done']
      }));
    });

    it('returns instanceId with methods update and done', () => {
      const parsed = namespace.requireNamespace('foo-bar#foo+update+done');
      assert(equalsNamespace(parsed, {
        complete: 'foo-bar#foo+update+done',
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar#foo',
        instanceId: 'foo',
        packageNamespace: 'foo-bar',
        methods: ['update', 'done']
      }));
    });

    it('returns instanceId *', () => {
      const parsed = namespace.requireNamespace('foo-bar#*');
      assert(equalsNamespace(parsed, {
        complete: 'foo-bar#*',
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar#*',
        instanceId: '*',
        packageNamespace: 'foo-bar'
      }));
    });
  });
});
