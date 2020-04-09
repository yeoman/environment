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
  'generatorHint',
  'flags',
  'load',
  'install',
  'optional',
  'instanceId',
  'semver',
  'versionedHint'
];

const equalsNamespace = function (namespace, expected) {
  fields.forEach(field => assert.equal(
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
      const parsed = namespace.requireNamespace('foo-bar+1');
      assert(equalsNamespace(parsed, {
        complete: 'foo-bar+1',
        unscoped: 'foo-bar',
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar',
        namespace: 'foo-bar',
        id: 'foo-bar+1',
        instanceId: '1',
        packageNamespace: 'foo-bar'
      }));
    });

    it('returns namespace with generator and id', () => {
      const parsed = namespace.requireNamespace('foo-bar:app+1');
      assert(equalsNamespace(parsed, {
        complete: 'foo-bar:app+1',
        unscoped: 'foo-bar',
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar',
        namespace: 'foo-bar:app',
        id: 'foo-bar:app+1',
        instanceId: '1',
        packageNamespace: 'foo-bar',
        generator: 'app'
      }));
    });

    it('returns namespace with scope, generator, id and load', () => {
      const parsed = namespace.requireNamespace('@scope/foo-bar:app+1!?');
      assert(equalsNamespace(parsed, {
        complete: '@scope/foo-bar:app+1!?',
        unscoped: 'foo-bar',
        generatorHint: '@scope/generator-foo-bar',
        versionedHint: '@scope/generator-foo-bar',
        namespace: '@scope/foo-bar:app',
        id: '@scope/foo-bar:app+1',
        instanceId: '1',
        scope: '@scope',
        packageNamespace: '@scope/foo-bar',
        generator: 'app',
        flags: '!?',
        load: true
      }));
    });

    it('returns namespace with scope, generator, id and optional', () => {
      const parsed = namespace.requireNamespace('@scope/foo-bar:app+1?');
      assert(equalsNamespace(parsed, {
        complete: '@scope/foo-bar:app+1?',
        scope: '@scope',
        unscoped: 'foo-bar',
        generatorHint: '@scope/generator-foo-bar',
        versionedHint: '@scope/generator-foo-bar',
        namespace: '@scope/foo-bar:app',
        id: '@scope/foo-bar:app+1',
        instanceId: '1',
        packageNamespace: '@scope/foo-bar',
        generator: 'app',
        flags: '?',
        optional: true
      }));
    });

    it('throws exception with namespace with scope, generator, id and invalid flags', () => {
      assert.throws(() => namespace.requireNamespace('@scope/foo-bar:app+1!$'));
    });

    it('returns namespace with scope, multiples generator and id', () => {
      const parsed = namespace.requireNamespace('@scope/foo-bar:app:client+1');
      assert(equalsNamespace(parsed, {
        complete: '@scope/foo-bar:app:client+1',
        scope: '@scope',
        unscoped: 'foo-bar',
        generatorHint: '@scope/generator-foo-bar',
        versionedHint: '@scope/generator-foo-bar',
        namespace: '@scope/foo-bar:app:client',
        id: '@scope/foo-bar:app:client+1',
        instanceId: '1',
        packageNamespace: '@scope/foo-bar',
        generator: 'app:client'
      }));
    });

    it('bumps id', () => {
      const parsed = namespace.requireNamespace('@scope/foo-bar:app:client?');
      assert(equalsNamespace(parsed, {
        complete: '@scope/foo-bar:app:client?',
        scope: '@scope',
        unscoped: 'foo-bar',
        generatorHint: '@scope/generator-foo-bar',
        versionedHint: '@scope/generator-foo-bar',
        namespace: '@scope/foo-bar:app:client',
        id: '@scope/foo-bar:app:client',
        instanceId: undefined,
        packageNamespace: '@scope/foo-bar',
        generator: 'app:client',
        flags: '?',
        optional: true
      }));

      parsed.bumpId();
      assert(equalsNamespace(parsed, {
        complete: '@scope/foo-bar:app:client+1?',
        scope: '@scope',
        unscoped: 'foo-bar',
        generatorHint: '@scope/generator-foo-bar',
        versionedHint: '@scope/generator-foo-bar',
        namespace: '@scope/foo-bar:app:client',
        id: '@scope/foo-bar:app:client+1',
        instanceId: '1',
        packageNamespace: '@scope/foo-bar',
        generator: 'app:client',
        flags: '?',
        optional: true
      }));

      parsed.bumpId();
      assert(equalsNamespace(parsed, {
        complete: '@scope/foo-bar:app:client+2?',
        scope: '@scope',
        unscoped: 'foo-bar',
        generatorHint: '@scope/generator-foo-bar',
        versionedHint: '@scope/generator-foo-bar',
        namespace: '@scope/foo-bar:app:client',
        id: '@scope/foo-bar:app:client+2',
        instanceId: '2',
        packageNamespace: '@scope/foo-bar',
        generator: 'app:client',
        flags: '?',
        optional: true
      }));
    });

    it('bumps id with another id', () => {
      const parsed = namespace.requireNamespace('@scope/foo-bar:app:client+angular?');
      assert(equalsNamespace(parsed, {
        complete: '@scope/foo-bar:app:client+angular?',
        scope: '@scope',
        unscoped: 'foo-bar',
        generatorHint: '@scope/generator-foo-bar',
        versionedHint: '@scope/generator-foo-bar',
        namespace: '@scope/foo-bar:app:client',
        id: '@scope/foo-bar:app:client+angular',
        instanceId: 'angular',
        packageNamespace: '@scope/foo-bar',
        generator: 'app:client',
        flags: '?',
        optional: true
      }));

      parsed.bumpId();
      assert(equalsNamespace(parsed, {
        complete: '@scope/foo-bar:app:client+angular+1?',
        scope: '@scope',
        unscoped: 'foo-bar',
        generatorHint: '@scope/generator-foo-bar',
        versionedHint: '@scope/generator-foo-bar',
        namespace: '@scope/foo-bar:app:client',
        id: '@scope/foo-bar:app:client+angular+1',
        instanceId: 'angular+1',
        packageNamespace: '@scope/foo-bar',
        generator: 'app:client',
        flags: '?',
        optional: true
      }));

      parsed.bumpId();
      assert(equalsNamespace(parsed, {
        complete: '@scope/foo-bar:app:client+angular+2?',
        scope: '@scope',
        unscoped: 'foo-bar',
        generatorHint: '@scope/generator-foo-bar',
        versionedHint: '@scope/generator-foo-bar',
        namespace: '@scope/foo-bar:app:client',
        id: '@scope/foo-bar:app:client+angular+2',
        instanceId: 'angular+2',
        packageNamespace: '@scope/foo-bar',
        generator: 'app:client',
        flags: '?',
        optional: true
      }));
    });

    it('returns with install', () => {
      const parsed = namespace.requireNamespace('foo-bar!');
      assert(equalsNamespace(parsed, {
        complete: 'foo-bar!',
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar',
        packageNamespace: 'foo-bar',
        flags: '!',
        install: true
      }));
    });

    it('returns with semver', () => {
      const complete = 'foo-bar@1.0.0-beta+exp.sha.5114f85@';
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
      const complete = 'foo-bar@1.0.0-beta+exp.sha.5114f85@';
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
      const complete = 'foo-bar@^1.0.4@';
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
      const complete = 'foo-bar@*@';
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
      const complete = 'foo-bar@1.0.0 - 1.2.0@';
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
      const complete = 'foo-bar@>=1.2.3 <2.0.0@';
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

    it('method test', () => {
      const parsed = namespace.requireNamespace('foo-bar#test');
      assert(equalsNamespace(parsed, {
        complete: 'foo-bar',
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar',
        packageNamespace: 'foo-bar',
        method: 'test',
        methodName: 'test'
      }));
    });

    it('method snake-case', () => {
      const parsed = namespace.requireNamespace('foo-bar#snake-case');
      assert(equalsNamespace(parsed, {
        complete: 'foo-bar',
        generatorHint: 'generator-foo-bar',
        versionedHint: 'generator-foo-bar',
        namespace: 'foo-bar',
        unscoped: 'foo-bar',
        id: 'foo-bar',
        packageNamespace: 'foo-bar',
        method: 'snake-case',
        methodName: 'snakeCase#'
      }));
    });
  });
});
