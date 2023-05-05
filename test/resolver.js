/* eslint-disable unicorn/no-await-expression-member */
import path, { dirname, relative } from 'node:path';
import assert from 'node:assert';
import fs from 'fs-extra';
import spawn from 'cross-spawn';
import { expect } from 'esmocha';
import slash from 'slash';

import Environment from '../lib/index.mjs';

import { execaOutput } from '../lib/util/util.js';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const globalLookupTest = () => (process.env.NODE_PATH ? it : xit);

const toRelativeMeta = meta =>
  Object.fromEntries(
    Object.entries(meta).map(([namespace, meta]) => {
      return [
        namespace,
        { ...meta, packagePath: slash(relative(__dirname, meta.packagePath)), resolved: slash(relative(__dirname, meta.resolved)) },
      ];
    }),
  );

const linkGenerator = (generator, scope) => {
  const nodeModulesPath = path.resolve('node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    fs.mkdirSync(nodeModulesPath);
  }

  let dest = path.join(nodeModulesPath, generator);
  if (scope) {
    const scopeDir = path.join(nodeModulesPath, scope);
    dest = path.join(scopeDir, generator);
    if (!fs.existsSync(scopeDir)) {
      fs.mkdirSync(scopeDir, { recursive: true });
    }
  }

  if (!fs.existsSync(dest)) {
    fs.symlinkSync(path.resolve(path.join(__dirname, 'fixtures', generator)), path.resolve(dest), 'dir');
  }
};

const unlinkGenerator = (generator, scope) => {
  let dest = path.resolve(path.join('node_modules', generator));
  let scopeDir;
  if (scope) {
    scopeDir = path.resolve(path.join('node_modules', scope));
    dest = path.join(scopeDir, generator);
  }

  if (fs.existsSync(dest)) {
    fs.unlinkSync(dest);
  }

  if (scopeDir && fs.existsSync(scopeDir)) {
    fs.rmdirSync(scopeDir);
  }
};

const projectRoot = path.join(__dirname, 'fixtures/lookup-project');
const customProjectRoot = path.join(__dirname, 'fixtures/lookup-custom');
const subDirRoot = path.join(projectRoot, 'subdir');

describe('Environment Resolver', async function () {
  this.timeout(100_000);

  before(function () {
    this.timeout(500_000);
    this.cwd = process.cwd();

    if (!fs.existsSync(projectRoot)) {
      fs.mkdirSync(projectRoot);
    }

    process.chdir(projectRoot);
    if (!fs.existsSync(path.join(projectRoot, 'node_modules'))) {
      spawn.sync('npm', ['ci']);
      spawn.sync('npm', ['install', '-g', 'generator-dummytest', 'generator-dummy', '--no-package-lock']);
    }
  });

  beforeEach(() => {
    this.NODE_PATH = process.env.NODE_PATH;
    delete process.env.NODE_PATH;
    this.NVM_PATH = process.env.NVM_PATH;
    delete process.env.NVM_PATH;
  });

  afterEach(function () {
    process.env.NODE_PATH = this.NODE_PATH;
    process.env.NVM_PATH = this.NVM_PATH;
  });

  after(function () {
    process.chdir(this.cwd);
  });

  describe('#lookup()', async () => {
    let lookupOptions;

    before(() => {
      linkGenerator('generator-extend');
      linkGenerator('generator-scoped', '@dummyscope');
      linkGenerator('generator-esm');
      linkGenerator('generator-common-js');
      linkGenerator('generator-ts');
      linkGenerator('generator-ts-js');
    });

    after(() => {
      unlinkGenerator('generator-extend');
      unlinkGenerator('generator-scoped', '@dummyscope');
      unlinkGenerator('generator-esm');
      unlinkGenerator('generator-common-js');
      unlinkGenerator('generator-ts');
      unlinkGenerator('generator-ts-js');
    });

    beforeEach(function () {
      this.env = new Environment();
      assert.equal(this.env.namespaces().length, 0, 'ensure env is empty');
      this.env.lookup({ ...lookupOptions, localOnly: true });
    });

    it('should register expected generators', async function () {
      expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();

      // Register local generators
      assert.ok(await this.env.get('dummy:app'));
      assert.ok(await this.env.get('dummy:yo'));

      assert.ok((await this.env.get('dummy:app')).packagePath.endsWith('node_modules/generator-dummy'));
      assert.ok((await this.env.get('dummy:app')).packagePath.endsWith('node_modules/generator-dummy'));

      // Registers local ts generators
      assert.ok(await this.env.get('ts:app'));

      // Registers local common js generators with cjs extension
      assert.ok(await this.env.get('common-js:cjs'));

      // Registers local esm generators with js extension
      assert.ok(await this.env.get('ts:app'));

      // Registers local esm generators with mjs extension
      assert.ok(await this.env.get('esm:mjs'));

      // Js generators takes precedence
      assert.equal(await this.env.get('ts-js:app'), require('./fixtures/generator-ts-js/generators/app/index.js'));

      // Register generators in scoped packages
      assert.ok(await this.env.get('@dummyscope/scoped:app'));

      // Register non-dependency local generator
      assert.ok(await this.env.get('jquery:app'));

      // Register symlinked generators
      assert.ok(await this.env.get('extend:support'));
    });

    globalLookupTest()('register global generators', async function () {
      assert.ok(await this.env.get('dummytest:app'));
      assert.ok(await this.env.get('dummytest:controller'));
    });

    describe("when there's ancestor node_modules/ folder", async () => {
      before(() => {
        process.chdir(subDirRoot);
        spawn.sync('npm', ['install', '--no-package-lock']);
      });

      after(() => {
        process.chdir(projectRoot);
        fs.rmdirSync(path.join(subDirRoot, 'node_modules'), {
          recursive: true,
        });
      });

      beforeEach(async function () {
        this.env = new Environment();
        assert.equal(this.env.namespaces().length, 0, 'ensure env is empty');
        await this.env.lookup({ localOnly: true });
      });

      it('should register expected generators', async function () {
        expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();
      });

      it('register generators in ancestor node_modules directory', async function () {
        assert.ok(await this.env.get('jquery:app'));
      });

      it('local generators are prioritized over ancestor', async function () {
        const { resolved } = await this.env.get('dummy:app');
        assert.ok(resolved.includes('subdir'), `Couldn't find 'subdir' in ${resolved}`);
      });
    });

    describe('when node_modules is a symlink', async () => {
      before(() => {
        if (!fs.existsSync(path.resolve('orig'))) {
          fs.ensureDirSync(path.resolve('orig'));
          fs.moveSync(path.resolve('node_modules'), path.resolve('orig/node_modules'));
          fs.ensureSymlinkSync(path.resolve('orig/node_modules'), path.resolve('node_modules'));
        }
      });
      after(() => {
        if (fs.existsSync(path.resolve('orig'))) {
          fs.removeSync(path.resolve('node_modules'));
          fs.moveSync(path.resolve('orig/node_modules'), path.resolve('node_modules'));
          fs.removeSync(path.resolve('orig'));
        }
      });

      it('should register expected generators', async function () {
        expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();

        // Register local generators
        assert.ok(await this.env.get('dummy:app'));
        assert.ok(await this.env.get('dummy:yo'));

        assert.ok((await this.env.get('dummy:app')).packagePath.endsWith('node_modules/generator-dummy'));
        assert.ok((await this.env.get('dummy:app')).packagePath.endsWith('node_modules/generator-dummy'));

        // Registers local ts generators
        assert.ok(await this.env.get('ts:app'));

        // Js generators takes precedence
        assert.equal(await this.env.get('ts-js:app'), require('./fixtures/generator-ts-js/generators/app/index.js'));

        // Register generators in scoped packages
        assert.ok(await this.env.get('@dummyscope/scoped:app'));

        // Register non-dependency local generator
        assert.ok(await this.env.get('jquery:app'));

        // Local generators prioritized over global
        const { resolved } = await this.env.get('dummy:app');
        assert.ok(resolved.includes('lookup-project'), `Couldn't find 'lookup-project' in ${resolved}`);

        // Register symlinked generators
        assert.ok(await this.env.get('extend:support'));
      });

      globalLookupTest()('register global generators', async function () {
        assert.ok(await this.env.get('dummytest:app'));
        assert.ok(await this.env.get('dummytest:controller'));
      });
    });

    describe('when modules repository is not called node_modules', async () => {
      let lookupOptionsBackup;
      let customRepositoryPath;
      before(() => {
        customRepositoryPath = path.resolve('orig');
        lookupOptionsBackup = lookupOptions;
        lookupOptions = { npmPaths: [customRepositoryPath] };
        if (!fs.existsSync(customRepositoryPath)) {
          fs.moveSync(path.resolve('node_modules'), customRepositoryPath);
        }
      });
      after(() => {
        lookupOptions = lookupOptionsBackup;
        if (fs.existsSync(path.resolve('orig'))) {
          fs.moveSync(customRepositoryPath, path.resolve('node_modules'));
        }
      });

      it('should register expected generators', async function () {
        expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();

        // Register local generators
        assert.ok(await this.env.get('dummy:app'));
        assert.ok(await this.env.get('dummy:yo'));

        assert.ok((await this.env.get('dummy:app')).packagePath.endsWith('/generator-dummy'));
        assert.ok((await this.env.get('dummy:app')).packagePath.endsWith('/generator-dummy'));

        // Registers local ts generators', async function () {
        assert.ok(await this.env.get('ts:app'));

        // Js generators takes precedence', async function () {
        assert.equal(await this.env.get('ts-js:app'), require('./fixtures/generator-ts-js/generators/app/index.js'));

        // Register generators in scoped packages', async function () {
        assert.ok(await this.env.get('@dummyscope/scoped:app'));

        // Local generators prioritized over global
        const { resolved } = await this.env.get('dummy:app');
        assert.ok(resolved.includes('orig'), `Couldn't find 'lookup-project' in ${resolved}`);

        // Register symlinked generators
        assert.ok(await this.env.get('extend:support'));
      });
    });

    describe('when localOnly argument is true', async () => {
      beforeEach(function () {
        this.env = new Environment();
        assert.equal(this.env.namespaces().length, 0, 'ensure env is empty');
        this.env.lookup(true);
        this.env.alias('dummy-alias', 'dummy');
      });

      it('should register expected generators', async function () {
        expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();

        // Register local generators
        assert.ok(await this.env.get('dummy:app'));
        assert.ok(await this.env.get('dummy:yo'));
        assert.ok(this.env.isPackageRegistered('dummy'));
        assert.ok(this.env.isPackageRegistered('dummy-alias'));

        // Register generators in scoped packages
        assert.ok(await this.env.get('@dummyscope/scoped:app'));

        // Register non-dependency local generator
        assert.ok(await this.env.get('jquery:app'));

        // Register symlinked generators
        assert.ok(await this.env.get('extend:support'));
      });

      globalLookupTest()('does not register global generators', async function () {
        assert.ok(!this.env.get('dummytest:app'));
        assert.ok(!this.env.get('dummytest:controller'));
      });
    });

    describe('when options.localOnly argument is true', async () => {
      beforeEach(function () {
        this.env = new Environment();
        assert.equal(this.env.namespaces().length, 0, 'ensure env is empty');
        this.env.lookup({ localOnly: true });
      });

      it('should register expected generators', async function () {
        expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();

        // Register local generators
        assert.ok(await this.env.get('dummy:app'));
        assert.ok(await this.env.get('dummy:yo'));

        // Register generators in scoped packages
        assert.ok(await this.env.get('@dummyscope/scoped:app'));

        // Register non-dependency local generator
        assert.ok(await this.env.get('jquery:app'));

        // Register symlinked generators
        assert.ok(await this.env.get('extend:support'));
      });

      globalLookupTest()('does not register global generators', async function () {
        assert.ok(!this.env.get('dummytest:app'));
        assert.ok(!this.env.get('dummytest:controller'));
      });
    });
  });

  describe('#lookup() with options', async () => {
    before(() => {
      process.chdir(customProjectRoot);

      linkGenerator('generator-scoped', '@scoped');
      linkGenerator('generator-module-lib-gen');
      linkGenerator('generator-module');
      linkGenerator('generator-module-root');
    });

    beforeEach(function () {
      this.env = new Environment();
    });

    after(() => {
      unlinkGenerator('generator-scoped', '@scoped');
      unlinkGenerator('generator-module-lib-gen');
      unlinkGenerator('generator-module');
      unlinkGenerator('generator-module-root');

      process.chdir(projectRoot);
    });

    it('with packagePaths', async function () {
      this.env.lookup({ localOnly: true, packagePaths: ['node_modules/generator-module'] });

      expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();

      assert.ok(await this.env.get('module:app'));
      assert.ok(this.env.getRegisteredPackages().length === 1);
    });

    it('with scope and packagePaths', async function () {
      this.env.lookup({
        localOnly: true,
        packagePaths: ['node_modules/generator-module', 'node_modules/@scoped/generator-scoped'],
        registerToScope: 'test',
      });

      expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();

      assert.ok(await this.env.get('@test/module:app'));
      assert.ok(await this.env.get('@scoped/scoped:app'));
      assert.ok(this.env.getRegisteredPackages().length === 2);
    });

    it('with 2 packagePaths', async function () {
      this.env.lookup({
        localOnly: true,
        packagePaths: ['node_modules/generator-module', 'node_modules/generator-module-root'],
      });

      expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();

      assert.ok(await this.env.get('module:app'));
      assert.ok(await this.env.get('module-root:app'));
      assert.ok(this.env.getRegisteredPackages().length === 2);
    });

    it('with 3 packagePaths', async function () {
      this.env.lookup({
        localOnly: true,
        packagePaths: ['node_modules/generator-module', 'node_modules/generator-module-root', 'node_modules/generator-module-lib-gen'],
      });

      expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();

      assert.ok(await this.env.get('module:app'));
      assert.ok(await this.env.get('module-root:app'));
      assert.ok(await this.env.get('module-lib-gen:app'));
      assert.ok(this.env.getRegisteredPackages().length === 3);
    });

    it('with scoped packagePaths', async function () {
      this.env.lookup({
        localOnly: true,
        packagePaths: [
          'node_modules/generator-module',
          'node_modules/generator-module-root',
          'node_modules/generator-module-lib-gen',
          'node_modules/@scoped/generator-scoped',
        ],
      });

      expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();

      assert.ok(await this.env.get('module:app'));
      assert.ok(await this.env.get('module-root:app'));
      assert.ok(await this.env.get('module-lib-gen:app'));
      assert.ok(await this.env.get('@scoped/scoped:app'));
      assert.ok(this.env.getRegisteredPackages().length === 4);
    });

    it('with npmPaths', async function () {
      this.env.lookup({ npmPaths: ['node_modules'] });

      expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();

      assert.ok(await this.env.get('module:app'));
      assert.ok(await this.env.get('module-root:app'));
      assert.ok(await this.env.get('module-lib-gen:app'));
      assert.ok(await this.env.get('@scoped/scoped:app'));
      assert.ok(this.env.getRegisteredPackages().length === 4);
    });

    it('with sub-sub-generators filePatterns', async function () {
      this.env.lookup({
        localOnly: true,
        npmPaths: ['node_modules'],
        filePatterns: ['*/*/index.js'],
      });

      expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();

      assert.ok(await this.env.get('@scoped/scoped:app:scaffold'));
    });

    it('with packagePatterns', async function () {
      this.env.lookup({
        localOnly: true,
        npmPaths: ['node_modules'],
        packagePatterns: ['generator-module', 'generator-module-root'],
      });

      expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();

      assert.ok(await this.env.get('module:app'));
      assert.ok(await this.env.get('module-root:app'));
      assert.ok(this.env.getRegisteredPackages().length === 2);
    });

    it('with sub-sub-generators and packagePaths', async function () {
      this.env.lookup({
        localOnly: true,
        packagePaths: ['node_modules/@scoped/generator-scoped'],
        filePatterns: ['*/*/index.js'],
      });

      expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();

      assert.ok(await this.env.get('@scoped/scoped:app:scaffold'));
    });

    it('with sub-sub-generators and packagePatterns', async function () {
      this.env.lookup({
        localOnly: true,
        npmPaths: ['node_modules'],
        packagePatterns: ['generator-scoped'],
        filePatterns: ['*/*/index.js'],
      });

      expect(toRelativeMeta(this.env.getGeneratorsMeta())).toMatchSnapshot();

      assert.ok(await this.env.get('@scoped/scoped:app:scaffold'));
    });
  });

  describe('#lookupNamespaces()', async () => {
    before(() => {
      process.chdir(customProjectRoot);

      linkGenerator('generator-scoped', '@scoped');
      linkGenerator('generator-module-lib-gen');
      linkGenerator('generator-module');
      linkGenerator('generator-module-root');
    });

    beforeEach(function () {
      this.env = new Environment({ experimental: true });
    });

    after(() => {
      unlinkGenerator('generator-scoped', '@scoped');
      unlinkGenerator('generator-module-lib-gen');
      unlinkGenerator('generator-module');
      unlinkGenerator('generator-module-root');

      process.chdir(projectRoot);
      fs.rmdirSync(path.join(customProjectRoot, 'node_modules'), {
        recursive: true,
      });
    });

    it('with 1 namespace', async function () {
      this.env.lookupNamespaces('module:app', { localOnly: true, npmPaths: ['node_modules'] });
      assert.ok(await this.env.get('module:app'));
      assert.ok(this.env.getRegisteredPackages().length === 1);
    });

    it('with 2 namespaces', async function () {
      this.env.lookupNamespaces(['module:app', 'module-root:app'], {
        localOnly: true,
        npmPaths: ['node_modules'],
      });
      assert.ok(await this.env.get('module:app'));
      assert.ok(await this.env.get('module-root:app'));
      assert.ok(this.env.getRegisteredPackages().length === 2);
    });

    it('with sub-sub-generators', async function () {
      this.env.lookupNamespaces('@scoped/scoped:app:scaffold', {
        localOnly: true,
        npmPaths: ['node_modules'],
      });
      assert.ok(await this.env.get('@scoped/scoped:app:scaffold'));
      assert.ok(this.env.getRegisteredPackages().length === 1);
    });
  });

  describe('#getNpmPaths()', async () => {
    beforeEach(function () {
      this.bestBet = path.join(__dirname, '../../../..');
      this.bestBet2 = path.join(path.dirname(process.argv[1]), '../..');
      this.env = new Environment();
    });

    describe('with NODE_PATH', async () => {
      beforeEach(() => {
        process.env.NODE_PATH = '/some/dummy/path';
      });

      it('walk up the CWD lookups dir', async function () {
        const paths = this.env.getNpmPaths();
        assert.equal(paths[0], path.join(process.cwd(), 'node_modules'));
        assert.equal(paths[1], path.join(process.cwd(), '../node_modules'));
      });

      it('append NODE_PATH', async function () {
        assert(this.env.getNpmPaths().includes(process.env.NODE_PATH));
      });
    });

    describe('without NODE_PATH', async () => {
      it('walk up the CWD lookups dir', async function () {
        const paths = this.env.getNpmPaths();
        assert.equal(paths[0], path.join(process.cwd(), 'node_modules'));
        const prevdir = process.cwd().split(path.sep).slice(0, -1).join(path.sep);
        assert.equal(paths[1], path.join(prevdir, 'node_modules'));
      });

      it('append best bet if NODE_PATH is unset', async function () {
        assert(this.env.getNpmPaths().includes(this.bestBet));
        assert(this.env.getNpmPaths().includes(this.bestBet2));
      });

      it('append default NPM dir depending on your OS', async function () {
        if (process.platform === 'win32') {
          assert(this.env.getNpmPaths().includes(path.join(process.env.APPDATA, 'npm/node_modules')));
        } else {
          assert(this.env.getNpmPaths().includes('/usr/lib/node_modules'));
        }
      });
    });

    describe('with NVM_PATH', async () => {
      beforeEach(() => {
        process.env.NVM_PATH = '/some/dummy/path';
      });

      it('walk up the CWD lookups dir', async function () {
        const paths = this.env.getNpmPaths();
        assert.equal(paths[0], path.join(process.cwd(), 'node_modules'));
        assert.equal(paths[1], path.join(process.cwd(), '../node_modules'));
      });

      it('append NVM_PATH', async function () {
        assert(this.env.getNpmPaths().includes(path.join(path.dirname(process.env.NVM_PATH), 'node_modules')));
      });
    });

    describe('without NVM_PATH', async () => {
      it('walk up the CWD lookups dir', async function () {
        const paths = this.env.getNpmPaths();
        assert.equal(paths[0], path.join(process.cwd(), 'node_modules'));
        assert.equal(paths[1], path.join(process.cwd(), '../node_modules'));
      });

      it('append best bet if NVM_PATH is unset', async function () {
        assert(this.env.getNpmPaths().includes(path.join(this.bestBet, 'node_modules')));
        assert(this.env.getNpmPaths().includes(this.bestBet2));
      });
    });

    describe('when localOnly argument is true', async () => {
      it('walk up the CWD lookups dir', async function () {
        const paths = this.env.getNpmPaths();
        assert.equal(paths[0], path.join(process.cwd(), 'node_modules'));
        assert.equal(paths[1], path.join(process.cwd(), '../node_modules'));
      });

      it('does not append NODE_PATH', async function () {
        process.env.NODE_PATH = '/some/dummy/path';
        assert(!this.env.getNpmPaths(true).includes(process.env.NODE_PATH));
      });

      it('does not append NVM_PATH', async function () {
        process.env.NVM_PATH = '/some/dummy/path';
        assert(!this.env.getNpmPaths(true).includes(path.join(path.dirname(process.env.NVM_PATH), 'node_modules')));
      });

      it('does not append best bet', async function () {
        assert(!this.env.getNpmPaths(true).includes(this.bestBet));
      });

      it('does not append default NPM dir depending on your OS', async function () {
        if (process.platform === 'win32') {
          assert(!this.env.getNpmPaths(true).includes(path.join(process.env.APPDATA, 'npm/node_modules')));
        } else {
          assert(!this.env.getNpmPaths(true).includes('/usr/lib/node_modules'));
        }
      });
    });

    describe('with npm global prefix', async () => {
      it('append npm modules path depending on your OS', async function () {
        const npmPrefix = execaOutput('npm', ['prefix', '-g']);
        if (process.platform === 'win32') {
          assert(this.env.getNpmPaths().indexOf(path.resolve(npmPrefix, 'node_modules')) > 0);
        } else {
          assert(this.env.getNpmPaths().indexOf(path.resolve(npmPrefix, 'lib/node_modules')) > 0);
        }
      });
    });
  });

  describe('#findPackagesIn()', async () => {
    before(() => {
      linkGenerator('generator-scoped', '@dummyscope');
    });

    after(() => {
      unlinkGenerator('generator-scoped', '@dummyscope');
    });

    beforeEach(function () {
      this.env = new Environment();
    });

    describe('when passing package patterns without scope', async () => {
      it('finds it', async function () {
        const packageToFind = 'generator-dummy';
        const actual = this.env.packageLookup.findPackagesIn(['node_modules'], [packageToFind]);
        assert.equal(actual.length, 1);
        assert.ok(actual[0].endsWith(packageToFind));
      });
    });

    describe('when passing package patterns with scope', async () => {
      it('finds it', async function () {
        const packageToFind = '@dummyscope/generator-scoped';
        const actual = this.env.packageLookup.findPackagesIn(['node_modules'], [packageToFind]);
        assert.equal(actual.length, 1);
        assert.ok(actual[0].endsWith(packageToFind));
      });
    });
  });

  describe('#lookupGenerator()', async () => {
    before(() => {
      process.chdir(customProjectRoot);

      linkGenerator('generator-extend');
      linkGenerator('generator-scoped', '@dummyscope');
      linkGenerator('generator-module');
    });

    after(() => {
      unlinkGenerator('generator-extend');
      unlinkGenerator('generator-scoped', '@dummyscope');
      unlinkGenerator('generator-module');

      process.chdir(projectRoot);
      fs.rmdirSync(path.join(customProjectRoot, 'node_modules'), {
        recursive: true,
      });
    });

    describe('Find generator', async () => {
      it('Scoped lookup', async () => {
        const modulePath = Environment.lookupGenerator('@dummyscope/scoped:app');
        assert.ok(modulePath.endsWith('node_modules/@dummyscope/generator-scoped/app/index.js'));
        const packagePath = Environment.lookupGenerator('@dummyscope/scoped:app', { packagePath: true });
        assert.ok(packagePath.endsWith('node_modules/@dummyscope/generator-scoped'));
      });
      it('Lookup', async () => {
        const modulePath = Environment.lookupGenerator('extend:support');
        assert.ok(modulePath.endsWith('node_modules/generator-extend/support/index.js'));

        const packagePath = Environment.lookupGenerator('extend:support', {
          packagePath: true,
        });
        const packagePath3 = Environment.lookupGenerator('extend', {
          packagePath: true,
        });
        assert.ok(packagePath.endsWith('node_modules/generator-extend'));
        assert.ok(packagePath3.endsWith('node_modules/generator-extend'));
      });
      it('Module Lookup', async () => {
        const modulePath = Environment.lookupGenerator('module:app');
        assert.ok(modulePath.endsWith('node_modules/generator-module/generators/app/index.js'), modulePath);

        const packagePath = Environment.lookupGenerator('module:app', {
          packagePath: true,
        });
        assert.ok(packagePath.endsWith('node_modules/generator-module'), packagePath);

        const generatorPath = Environment.lookupGenerator('module:app', {
          generatorPath: true,
        });
        assert.ok(generatorPath.endsWith('node_modules/generator-module/generators/'), generatorPath);
      });
    });
  });

  describe('#lookupGenerator() with multiple option', async () => {
    before(() => {
      process.chdir(customProjectRoot);

      this.chdirRoot = path.join(customProjectRoot, 'node_modules/foo');
      this.chdirRootNodeModule = path.join(this.chdirRoot, 'node_modules');
      this.multipleModuleGenerator = path.join(this.chdirRootNodeModule, 'generator-module');

      fs.mkdirSync(this.chdirRoot, { recursive: true });
      linkGenerator('generator-module');
      process.chdir(this.chdirRoot);
      linkGenerator('generator-module');
    });

    after(() => {
      unlinkGenerator('generator-module');
      process.chdir(customProjectRoot);
      unlinkGenerator('generator-module');
      process.chdir(projectRoot);

      fs.rmdirSync(path.join(customProjectRoot, 'node_modules'), {
        recursive: true,
      });
    });

    describe('Find generator', async () => {
      it('Module Lookup', async () => {
        const modulePath = Environment.lookupGenerator('module:app');
        assert.ok(modulePath.endsWith('node_modules/generator-module/generators/app/index.js'));

        const multiplePath = Environment.lookupGenerator('module:app', {
          multiple: true,
        });
        assert.equal(multiplePath.length, 2);
        assert.ok(multiplePath[0].endsWith('lookup-custom/node_modules/generator-module/generators/app/index.js'));
        assert.ok(multiplePath[1].endsWith('lookup-custom/node_modules/foo/node_modules/generator-module/generators/app/index.js'));

        const multiplePath2 = Environment.lookupGenerator('module:app', {
          singleResult: false,
        });
        assert.equal(multiplePath2.length, 2);
        assert.ok(multiplePath2[0].endsWith('lookup-custom/node_modules/generator-module/generators/app/index.js'));
        assert.ok(multiplePath2[1].endsWith('lookup-custom/node_modules/foo/node_modules/generator-module/generators/app/index.js'));
      });
    });
  });

  describe('Enviroment with a generator extended by environment lookup', async () => {
    before(() => {
      linkGenerator('generator-environment-extend');
    });

    after(() => {
      unlinkGenerator('generator-environment-extend');
    });

    describe('Find generator', async () => {
      it('Generator extended by environment lookup', async () => {
        this.env = new Environment();
        assert.equal(this.env.namespaces().length, 0, 'ensure env is empty');
        this.env.lookup();
        assert.ok(await this.env.get('environment-extend:app'));
        assert.ok(await this.env.create('environment-extend:app'));
      });
    });
  });
});
