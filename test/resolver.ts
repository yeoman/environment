/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import path, { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import process from 'node:process';
import fs from 'fs-extra';
import { after, afterEach, before, beforeEach, describe, expect, it } from 'esmocha';
import { execaSync } from 'execa';
import slash from 'slash';
import Environment from '../src/index.ts';
import { execaOutput } from '../src/util/util.ts';
import { findPackagesIn, getNpmPaths } from '../src/module-lookup.ts';
import { lookupGenerator } from '../src/generator-lookup.ts';
import type { GeneratorMeta } from '@yeoman/types';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const globalLookupTest = () => (process.env.NODE_PATH ? it : xit);

const toRelativeMeta = (meta: Record<string, GeneratorMeta>): Record<string, Record<string, string>> =>
  Object.fromEntries(
    Object.entries(meta).map(([namespace, meta]) => {
      return [
        namespace,
        { ...meta, packagePath: slash(relative(__dirname, meta.packagePath)), resolved: slash(relative(__dirname, meta.resolved)) },
      ];
    }),
  );

const linkGenerator = (generator: string, scope?: string) => {
  const nodeModulesPath = path.resolve('node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    fs.mkdirSync(nodeModulesPath);
  }

  let destination = path.join(nodeModulesPath, generator);
  if (scope) {
    const scopeDir = path.join(nodeModulesPath, scope);
    destination = path.join(scopeDir, generator);
    if (!fs.existsSync(scopeDir)) {
      fs.mkdirSync(scopeDir, { recursive: true });
    }
  }

  if (!fs.existsSync(destination)) {
    fs.symlinkSync(path.resolve(path.join(__dirname, 'fixtures', generator)), path.resolve(destination), 'dir');
  }
};

const unlinkGenerator = (generator: string, scope?: string) => {
  let destination = path.resolve(path.join('node_modules', generator));
  let scopeDir;
  if (scope) {
    scopeDir = path.resolve(path.join('node_modules', scope));
    destination = path.join(scopeDir, generator);
  }

  if (fs.existsSync(destination)) {
    fs.unlinkSync(destination);
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

  let cwd: string;
  let nodePathEnv: string | undefined;
  let nvmPathEnv: string | undefined;
  let env: InstanceType<typeof Environment>;
  let bestBet: string;
  let bestBet2: string;
  let chdirRoot: string;

  before(function () {
    this.timeout(500_000);
    cwd = process.cwd();

    if (!fs.existsSync(projectRoot)) {
      fs.mkdirSync(projectRoot);
    }

    process.chdir(projectRoot);
    if (!fs.existsSync(path.join(projectRoot, 'node_modules'))) {
      execaSync('npm', ['ci']);
      execaSync('npm', ['install', '-g', 'generator-dummytest', 'generator-dummy', '--no-package-lock']);
    }
  });

  beforeEach(() => {
    nodePathEnv = process.env.NODE_PATH;
    delete process.env.NODE_PATH;
    nvmPathEnv = process.env.NVM_PATH;
    delete process.env.NVM_PATH;
  });

  afterEach(function () {
    process.env.NODE_PATH = nodePathEnv;
    process.env.NVM_PATH = nvmPathEnv;
  });

  after(function () {
    process.chdir(cwd);
  });

  describe('#lookup()', async () => {
    let lookupOptions: Record<string, string[]> | undefined;

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

    beforeEach(async function () {
      env = new Environment();
      expect(env.namespaces().length).toEqual(0);
      await env.lookup({ ...lookupOptions, localOnly: true });
    });

    it('should register expected generators', async function () {
      expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

      // Register local generators
      expect(await env.get('dummy:app')).toBeTruthy();
      expect(await env.get('dummy:yo')).toBeTruthy();

      expect((await env.get('dummy:app'))!.packagePath!.endsWith(join('node_modules/generator-dummy'))).toBeTruthy();
      expect((await env.get('dummy:app'))!.packagePath!.endsWith(join('node_modules/generator-dummy'))).toBeTruthy();

      // Registers local ts generators
      expect(await env.get('ts:app')).toBeTruthy();

      // Registers local common js generators with cjs extension
      expect(await env.get('common-js:cjs')).toBeTruthy();

      // Registers local esm generators with js extension
      expect(await env.get('ts:app')).toBeTruthy();

      // Registers local esm generators with mjs extension
      expect(await env.get('esm:mjs')).toBeTruthy();

      // Js generators takes precedence
      // eslint-disable-next-line import-x/extensions
      expect(await env.get('ts-js:app')).toEqual(require('./fixtures/generator-ts-js/generators/app/index.js'));

      // Register generators in scoped packages
      expect(await env.get('@dummyscope/scoped:app')).toBeTruthy();

      // Register non-dependency local generator
      expect(await env.get('jquery:app')).toBeTruthy();

      // Register symlinked generators
      expect(await env.get('extend:support')).toBeTruthy();
    });

    globalLookupTest()('register global generators', async function () {
      expect(await env.get('dummytest:app')).toBeTruthy();
      expect(await env.get('dummytest:controller')).toBeTruthy();
    });

    describe("when there's ancestor node_modules/ folder", async () => {
      before(() => {
        process.chdir(subDirRoot);
        execaSync('npm', ['install', '--no-package-lock']);
      });

      after(() => {
        process.chdir(projectRoot);
        fs.rmdirSync(path.join(subDirRoot, 'node_modules'), {
          recursive: true,
        });
      });

      beforeEach(async function () {
        env = new Environment();
        expect(env.namespaces().length).toEqual(0);
        await env.lookup({ localOnly: true });
      });

      it('should register expected generators', async function () {
        expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();
      });

      it('register generators in ancestor node_modules directory', async function () {
        expect(await env.get('jquery:app')).toBeTruthy();
      });

      it('local generators are prioritized over ancestor', async function () {
        const { resolved } = (await env.get('dummy:app')) as any;
        expect(resolved.includes('subdir')).toBeTruthy();
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
        expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

        // Register local generators
        expect(await env.get('dummy:app')).toBeTruthy();
        expect(await env.get('dummy:yo')).toBeTruthy();

        expect((await env.get('dummy:app'))!.packagePath!.endsWith(join('node_modules/generator-dummy'))).toBeTruthy();
        expect((await env.get('dummy:app'))!.packagePath!.endsWith(join('node_modules/generator-dummy'))).toBeTruthy();

        // Registers local ts generators
        expect(await env.get('ts:app')).toBeTruthy();

        // Js generators takes precedence
        // eslint-disable-next-line import-x/extensions
        expect(await env.get('ts-js:app')).toEqual(require('./fixtures/generator-ts-js/generators/app/index.js'));

        // Register generators in scoped packages
        expect(await env.get('@dummyscope/scoped:app')).toBeTruthy();

        // Register non-dependency local generator
        expect(await env.get('jquery:app')).toBeTruthy();

        // Local generators prioritized over global
        const { resolved } = (await env.get('dummy:app')) as any;
        expect(resolved.includes('lookup-project')).toBeTruthy();

        // Register symlinked generators
        expect(await env.get('extend:support')).toBeTruthy();
      });

      globalLookupTest()('register global generators', async function () {
        expect(await env.get('dummytest:app')).toBeTruthy();
        expect(await env.get('dummytest:controller')).toBeTruthy();
      });
    });

    describe('when modules repository is not called node_modules', async () => {
      let lookupOptionsBackup: Record<string, string[]> | undefined;
      let customRepositoryPath: string;
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
        expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

        // Register local generators
        expect(await env.get('dummy:app')).toBeTruthy();
        expect(await env.get('dummy:yo')).toBeTruthy();

        expect((await env.get('dummy:app'))!.packagePath!.endsWith(join('/generator-dummy'))).toBeTruthy();
        expect((await env.get('dummy:app'))!.packagePath!.endsWith(join('/generator-dummy'))).toBeTruthy();

        // Registers local ts generators', async function () {
        expect(await env.get('ts:app')).toBeTruthy();

        // Js generators takes precedence', async function () {
        // eslint-disable-next-line import-x/extensions
        expect(await env.get('ts-js:app')).toEqual(require('./fixtures/generator-ts-js/generators/app/index.js'));

        // Register generators in scoped packages', async function () {
        expect(await env.get('@dummyscope/scoped:app')).toBeTruthy();

        // Local generators prioritized over global
        const { resolved } = (await env.get('dummy:app')) as any;
        expect(resolved.includes('orig')).toBeTruthy();

        // Register symlinked generators
        expect(await env.get('extend:support')).toBeTruthy();
      });
    });

    describe('when localOnly argument is true', async () => {
      beforeEach(async function () {
        env = new Environment();
        expect(env.namespaces().length).toEqual(0);
        await env.lookup({ localOnly: true });
        env.alias('dummy-alias', 'dummy');
      });

      it('should register expected generators', async function () {
        expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

        // Register local generators
        expect(await env.get('dummy:app')).toBeTruthy();
        expect(await env.get('dummy:yo')).toBeTruthy();
        expect(env.isPackageRegistered('dummy')).toBeTruthy();
        expect(env.isPackageRegistered('dummy-alias')).toBeTruthy();

        // Register generators in scoped packages
        expect(await env.get('@dummyscope/scoped:app')).toBeTruthy();

        // Register non-dependency local generator
        expect(await env.get('jquery:app')).toBeTruthy();

        // Register symlinked generators
        expect(await env.get('extend:support')).toBeTruthy();
      });

      globalLookupTest()('does not register global generators', async function () {
        expect(env.get('dummytest:app')).toBeFalsy();
        expect(env.get('dummytest:controller')).toBeFalsy();
      });
    });

    describe('when options.localOnly argument is true', async () => {
      beforeEach(async function () {
        env = new Environment();
        expect(env.namespaces().length).toEqual(0);
        await env.lookup({ localOnly: true });
      });

      it('should register expected generators', async function () {
        expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

        // Register local generators
        expect(await env.get('dummy:app')).toBeTruthy();
        expect(await env.get('dummy:yo')).toBeTruthy();

        // Register generators in scoped packages
        expect(await env.get('@dummyscope/scoped:app')).toBeTruthy();

        // Register non-dependency local generator
        expect(await env.get('jquery:app')).toBeTruthy();

        // Register symlinked generators
        expect(await env.get('extend:support')).toBeTruthy();
      });

      globalLookupTest()('does not register global generators', async function () {
        expect(env.get('dummytest:app')).toBeFalsy();
        expect(env.get('dummytest:controller')).toBeFalsy();
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
      env = new Environment();
    });

    after(() => {
      unlinkGenerator('generator-scoped', '@scoped');
      unlinkGenerator('generator-module-lib-gen');
      unlinkGenerator('generator-module');
      unlinkGenerator('generator-module-root');

      process.chdir(projectRoot);
    });

    it('with packagePaths', async function () {
      await env.lookup({ localOnly: true, packagePaths: ['node_modules/generator-module'] });

      expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

      expect(await env.get('module:app')).toBeTruthy();
      expect(env.getRegisteredPackages().length === 1).toBeTruthy();
    });

    it('with customizeNamespace', async function () {
      await env.lookup({
        localOnly: true,
        packagePaths: ['node_modules/generator-module'],
        customizeNamespace: ns => ns?.replace('module', 'custom'),
      });

      expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

      expect(await env.get('custom:app')).toBeTruthy();
      expect(env.getRegisteredPackages().length === 1).toBeTruthy();
    });

    it('with scope and packagePaths', async function () {
      await env.lookup({
        localOnly: true,
        packagePaths: ['node_modules/generator-module', 'node_modules/@scoped/generator-scoped'],
        registerToScope: 'test',
      });

      expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

      expect(await env.get('@test/module:app')).toBeTruthy();
      expect(await env.get('@scoped/scoped:app')).toBeTruthy();
      expect(env.getRegisteredPackages().length === 2).toBeTruthy();
    });

    it('with 2 packagePaths', async function () {
      await env.lookup({
        localOnly: true,
        packagePaths: ['node_modules/generator-module', 'node_modules/generator-module-root'],
      });

      expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

      expect(await env.get('module:app')).toBeTruthy();
      expect(await env.get('module-root:app')).toBeTruthy();
      expect(env.getRegisteredPackages().length === 2).toBeTruthy();
    });

    it('with 3 packagePaths', async function () {
      await env.lookup({
        localOnly: true,
        packagePaths: ['node_modules/generator-module', 'node_modules/generator-module-root', 'node_modules/generator-module-lib-gen'],
      });

      expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

      expect(await env.get('module:app')).toBeTruthy();
      expect(await env.get('module-root:app')).toBeTruthy();
      expect(await env.get('module-lib-gen:app')).toBeTruthy();
      expect(env.getRegisteredPackages().length === 3).toBeTruthy();
    });

    it('with scoped packagePaths', async function () {
      await env.lookup({
        localOnly: true,
        packagePaths: [
          'node_modules/generator-module',
          'node_modules/generator-module-root',
          'node_modules/generator-module-lib-gen',
          'node_modules/@scoped/generator-scoped',
        ],
      });

      expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

      expect(await env.get('module:app')).toBeTruthy();
      expect(await env.get('module-root:app')).toBeTruthy();
      expect(await env.get('module-lib-gen:app')).toBeTruthy();
      expect(await env.get('@scoped/scoped:app')).toBeTruthy();
      expect(env.getRegisteredPackages().length === 4).toBeTruthy();
    });

    it('with npmPaths', async function () {
      await env.lookup({ npmPaths: ['node_modules'] });

      expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

      expect(await env.get('module:app')).toBeTruthy();
      expect(await env.get('module-root:app')).toBeTruthy();
      expect(await env.get('module-lib-gen:app')).toBeTruthy();
      expect(await env.get('@scoped/scoped:app')).toBeTruthy();
      expect(env.getRegisteredPackages().length === 4).toBeTruthy();
    });

    it('with sub-sub-generators filePatterns', async function () {
      await env.lookup({
        localOnly: true,
        npmPaths: ['node_modules'],
        filePatterns: ['*/*/index.js'],
      });

      expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

      expect(await env.get('@scoped/scoped:app:scaffold')).toBeTruthy();
    });

    it('with packagePatterns', async function () {
      await env.lookup({
        localOnly: true,
        npmPaths: ['node_modules'],
        packagePatterns: ['generator-module', 'generator-module-root'],
      });

      expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

      expect(await env.get('module:app')).toBeTruthy();
      expect(await env.get('module-root:app')).toBeTruthy();
      expect(env.getRegisteredPackages().length === 2).toBeTruthy();
    });

    it('with sub-sub-generators and packagePaths', async function () {
      await env.lookup({
        localOnly: true,
        packagePaths: ['node_modules/@scoped/generator-scoped'],
        filePatterns: ['*/*/index.js'],
      });

      expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

      expect(await env.get('@scoped/scoped:app:scaffold')).toBeTruthy();
    });

    it('with sub-sub-generators and packagePatterns', async function () {
      await env.lookup({
        localOnly: true,
        npmPaths: ['node_modules'],
        packagePatterns: ['generator-scoped'],
        filePatterns: ['*/*/index.js'],
      });

      expect(toRelativeMeta(env.getGeneratorsMeta())).toMatchSnapshot();

      expect(await env.get('@scoped/scoped:app:scaffold')).toBeTruthy();
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
      env = new Environment({ experimental: true });
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
      await env.lookupNamespaces('module:app', { localOnly: true, npmPaths: ['node_modules'] });
      expect(await env.get('module:app')).toBeTruthy();
      expect(env.getRegisteredPackages().length === 1).toBeTruthy();
    });

    it('with 2 namespaces', async function () {
      await env.lookupNamespaces(['module:app', 'module-root:app'], {
        localOnly: true,
        npmPaths: ['node_modules'],
      });
      expect(await env.get('module:app')).toBeTruthy();
      expect(await env.get('module-root:app')).toBeTruthy();
      expect(env.getRegisteredPackages().length === 2).toBeTruthy();
    });

    it('with sub-sub-generators', async function () {
      await env.lookupNamespaces('@scoped/scoped:app:scaffold', {
        localOnly: true,
        npmPaths: ['node_modules'],
      });
      expect(await env.get('@scoped/scoped:app:scaffold')).toBeTruthy();
      expect(env.getRegisteredPackages().length === 1).toBeTruthy();
    });
  });

  describe('#getNpmPaths()', async () => {
    beforeEach(function () {
      bestBet = path.join(__dirname, '../../../..');
      bestBet2 = path.join(path.dirname(process.argv[1]), '../..');
      env = new Environment();
    });

    describe('with NODE_PATH', async () => {
      beforeEach(() => {
        process.env.NODE_PATH = '/some/dummy/path';
      });

      it('walk up the CWD lookups dir', async function () {
        const paths = getNpmPaths({ localOnly: false, filterPaths: false });
        expect(paths[0]).toEqual(path.join(process.cwd(), 'node_modules'));
        expect(paths[1]).toEqual(path.join(process.cwd(), '../node_modules'));
      });

      it('append NODE_PATH', async function () {
        expect(getNpmPaths({ localOnly: false, filterPaths: false }).includes(process.env.NODE_PATH!)).toBeTruthy();
      });
    });

    describe('without NODE_PATH', async () => {
      it('walk up the CWD lookups dir', async function () {
        const paths = getNpmPaths({ localOnly: false, filterPaths: false });
        expect(paths[0]).toEqual(path.join(process.cwd(), 'node_modules'));
        const prevdir = process.cwd().split(path.sep).slice(0, -1).join(path.sep);
        expect(paths[1]).toEqual(path.join(prevdir, 'node_modules'));
      });

      it('append best bet if NODE_PATH is unset', async function () {
        expect(getNpmPaths({ localOnly: false, filterPaths: false }).includes(bestBet)).toBeTruthy();
        expect(getNpmPaths({ localOnly: false, filterPaths: false }).includes(bestBet2)).toBeTruthy();
      });

      it('append default NPM dir depending on your OS', async function () {
        if (process.platform === 'win32') {
          expect(
            getNpmPaths({ localOnly: false, filterPaths: false }).includes(path.join(process.env.APPDATA!, 'npm/node_modules')),
          ).toBeTruthy();
        } else {
          expect(getNpmPaths({ localOnly: false, filterPaths: false }).includes('/usr/lib/node_modules')).toBeTruthy();
        }
      });
    });

    describe('with NVM_PATH', async () => {
      beforeEach(() => {
        process.env.NVM_PATH = '/some/dummy/path';
      });

      it('walk up the CWD lookups dir', async function () {
        const paths = getNpmPaths({ localOnly: false, filterPaths: false });
        expect(paths[0]).toEqual(path.join(process.cwd(), 'node_modules'));
        expect(paths[1]).toEqual(path.join(process.cwd(), '../node_modules'));
      });

      it('append NVM_PATH', async function () {
        expect(
          getNpmPaths({ localOnly: false, filterPaths: false }).includes(path.join(path.dirname(process.env.NVM_PATH!), 'node_modules')),
        ).toBeTruthy();
      });
    });

    describe('without NVM_PATH', async () => {
      it('walk up the CWD lookups dir', async function () {
        const paths = getNpmPaths({ localOnly: false, filterPaths: false });
        expect(paths[0]).toEqual(path.join(process.cwd(), 'node_modules'));
        expect(paths[1]).toEqual(path.join(process.cwd(), '../node_modules'));
      });

      it('append best bet if NVM_PATH is unset', async function () {
        expect(getNpmPaths({ localOnly: false, filterPaths: false }).includes(path.join(bestBet, 'node_modules'))).toBeTruthy();
        expect(getNpmPaths({ localOnly: false, filterPaths: false }).includes(bestBet2)).toBeTruthy();
      });
    });

    describe('when localOnly argument is true', async () => {
      it('walk up the CWD lookups dir', async function () {
        const paths = getNpmPaths({ localOnly: false, filterPaths: false });
        expect(paths[0]).toEqual(path.join(process.cwd(), 'node_modules'));
        expect(paths[1]).toEqual(path.join(process.cwd(), '../node_modules'));
      });

      it('does not append NODE_PATH', async function () {
        process.env.NODE_PATH = '/some/dummy/path';
        expect(getNpmPaths({ localOnly: true, filterPaths: false }).includes(process.env.NODE_PATH)).toBeFalsy();
      });

      it('does not append NVM_PATH', async function () {
        process.env.NVM_PATH = '/some/dummy/path';
        expect(
          getNpmPaths({ localOnly: true, filterPaths: false }).includes(path.join(path.dirname(process.env.NVM_PATH!), 'node_modules')),
        ).toBeFalsy();
      });

      it('does not append best bet', async function () {
        expect(getNpmPaths({ localOnly: true, filterPaths: false }).includes(bestBet)).toBeFalsy();
      });

      it('does not append default NPM dir depending on your OS', async function () {
        if (process.platform === 'win32') {
          expect(
            getNpmPaths({ localOnly: true, filterPaths: false }).includes(path.join(process.env.APPDATA!, 'npm/node_modules')),
          ).toBeFalsy();
        } else {
          expect(getNpmPaths({ localOnly: true, filterPaths: false }).includes('/usr/lib/node_modules')).toBeFalsy();
        }
      });
    });

    describe('with npm global prefix', async () => {
      it('append npm modules path depending on your OS', async function () {
        const npmPrefix = execaOutput('npm', ['prefix', '-g'])!;
        if (process.platform === 'win32') {
          expect(getNpmPaths({ localOnly: false, filterPaths: false }).indexOf(path.resolve(npmPrefix, 'node_modules')) > 0).toBeTruthy();
        } else {
          expect(
            getNpmPaths({ localOnly: false, filterPaths: false }).indexOf(path.resolve(npmPrefix, 'lib/node_modules')) > 0,
          ).toBeTruthy();
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
      env = new Environment();
    });

    describe('when passing package patterns without scope', async () => {
      it('finds it', async function () {
        const packageToFind = 'generator-dummy';
        const actual = findPackagesIn(['node_modules'], [packageToFind]);
        expect(actual.length).toEqual(1);
        expect(actual[0].endsWith(packageToFind)).toBeTruthy();
      });
    });

    describe('when passing package patterns with scope', async () => {
      it('finds it', async function () {
        const packageToFind = '@dummyscope/generator-scoped';
        const actual = findPackagesIn(['node_modules'], [packageToFind]);
        expect(actual.length).toEqual(1);
        expect(actual[0].endsWith(packageToFind)).toBeTruthy();
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
        const modulePath = lookupGenerator('@dummyscope/scoped:app');
        expect(modulePath.endsWith('node_modules/@dummyscope/generator-scoped/app/index.js')).toBeTruthy();
        const packagePath = lookupGenerator('@dummyscope/scoped:app', { packagePath: true });
        expect(packagePath.endsWith('node_modules/@dummyscope/generator-scoped')).toBeTruthy();
      });
      it('Lookup', async () => {
        const modulePath = lookupGenerator('extend:support');
        expect(modulePath.endsWith('node_modules/generator-extend/support/index.js')).toBeTruthy();

        const packagePath = lookupGenerator('extend:support', {
          packagePath: true,
        });
        const packagePath3 = lookupGenerator('extend', {
          packagePath: true,
        });
        expect(packagePath.endsWith('node_modules/generator-extend')).toBeTruthy();
        expect(packagePath3.endsWith('node_modules/generator-extend')).toBeTruthy();
      });
      it('Module Lookup', async () => {
        const modulePath = lookupGenerator('module:app');
        expect(modulePath.endsWith('node_modules/generator-module/generators/app/index.js')).toBeTruthy();

        const packagePath = lookupGenerator('module:app', {
          packagePath: true,
        });
        expect(packagePath.endsWith('node_modules/generator-module')).toBeTruthy();

        const generatorPath = lookupGenerator('module:app', {
          generatorPath: true,
        });
        expect(generatorPath.endsWith('node_modules/generator-module/generators/')).toBeTruthy();
      });
    });
  });

  describe('#lookupGenerator() with multiple option', async () => {
    before(() => {
      process.chdir(customProjectRoot);

      chdirRoot = path.join(customProjectRoot, 'node_modules/foo');

      fs.mkdirSync(chdirRoot, { recursive: true });
      linkGenerator('generator-module');
      process.chdir(chdirRoot);
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
        const modulePath = lookupGenerator('module:app');
        expect(modulePath.endsWith('node_modules/generator-module/generators/app/index.js')).toBeTruthy();

        const multiplePath = lookupGenerator('module:app', {
          singleResult: false,
        });
        expect(multiplePath.length).toEqual(2);
        expect(multiplePath[0].endsWith('lookup-custom/node_modules/generator-module/generators/app/index.js')).toBeTruthy();
        expect(
          multiplePath[1].endsWith('lookup-custom/node_modules/foo/node_modules/generator-module/generators/app/index.js'),
        ).toBeTruthy();

        const multiplePath2 = lookupGenerator('module:app', {
          singleResult: false,
        });
        expect(multiplePath2.length).toEqual(2);
        expect(multiplePath2[0].endsWith('lookup-custom/node_modules/generator-module/generators/app/index.js')).toBeTruthy();
        expect(
          multiplePath2[1].endsWith('lookup-custom/node_modules/foo/node_modules/generator-module/generators/app/index.js'),
        ).toBeTruthy();
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
        env = new Environment();
        expect(env.namespaces().length).toEqual(0);
        await env.lookup();
        expect(await env.get('environment-extend:app')).toBeTruthy();
        expect(await env.create('environment-extend:app')).toBeTruthy();
      });
    });
  });
});
