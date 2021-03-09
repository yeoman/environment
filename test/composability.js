'use strict';
const assert = require('assert');

const Env = require('..');

describe('composability', () => {
  before(function () {
    this.env = Env.createEnv();
  });

  describe('resolvePackage()', () => {
    it('should throw on missing packageName', async function () {
      assert.rejects(async () => this.env.resolvePackage());
    });

    it('should lookup for latest package version', async function () {
      const entry = await this.env.resolvePackage('yeoman-generator');
      assert.ok(entry[1], 'must provide an version');
    });

    it('should return package entry', async function () {
      assert.deepStrictEqual(
        await this.env.resolvePackage('yeoman-generator', '^2'),
        ['yeoman-generator', '^2']
      );
    });

    it('should accept github repository version and return package entry', async function () {
      this.timeout(10000);
      assert.deepStrictEqual(
        await this.env.resolvePackage('yeoman-generator', 'yeoman/generator'),
        ['yeoman-generator', 'github:yeoman/generator']
      );
    });

    it('should accept github repository and return package entry', async function () {
      this.timeout(10000);
      assert.deepStrictEqual(
        await this.env.resolvePackage('yeoman/generator'),
        ['yeoman-generator', 'github:yeoman/generator']
      );
    });
  });
});
