'use strict';
const fs = require('fs-extra');
const path = require('path');
const assert = require('assert');
const spawn = require('cross-spawn');
const Environment = require('../lib/environment');
const {execaOutput} = require('../lib/util/util');

const globalLookupTest = process.env.NODE_PATH ? it : xit;

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
      fs.mkdirSync(scopeDir, {recursive: true});
    }
  }
  if (!fs.existsSync(dest)) {
    fs.symlinkSync(
      path.resolve(path.join(__dirname, 'fixtures', generator)),
      path.resolve(dest),
      'dir'
    );
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

describe('Environment Resolver', function () {
  this.timeout(100000);

  before(function () {
    this.timeout(500000);
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

  after(function () {
    process.chdir(this.cwd);
  });

  describe('#lookup()', () => {
    let lookupOptions;

    before(() => {
      linkGenerator('generator-extend');
      linkGenerator('generator-scoped', '@dummyscope');
      linkGenerator('generator-ts');
      linkGenerator('generator-ts-js');
    });

    after(() => {
      unlinkGenerator('generator-extend');
      unlinkGenerator('generator-scoped', '@dummyscope');
      unlinkGenerator('generator-ts');
      unlinkGenerator('generator-ts-js');
    });

    beforeEach(function () {
      this.env = new Environment();
      assert.equal(this.env.namespaces().length, 0, 'ensure env is empty');
      this.env.lookup(lookupOptions);
    });

    it('register local generators', function () {
      assert.ok(this.env.get('dummy:app'));
      assert.ok(this.env.get('dummy:yo'));

      assert.ok(this.env.get('dummy:app').packagePath.endsWith('node_modules/generator-dummy'));
      assert.ok(this.env.get('dummy:app').packagePath.endsWith('node_modules/generator-dummy'));
    });

    it('registers local ts generators', function () {
      assert.ok(this.env.get('ts:app'));
    });

    it('js generators takes precedence', function () {
      // eslint-disable-next-line unicorn/import-index
      assert.equal(this.env.get('ts-js:app'), require('./fixtures/generator-ts-js/generators/app/index.js'));
    });

    it('register generators in scoped packages', function () {
      assert.ok(this.env.get('@dummyscope/scoped:app'));
    });

    it('register non-dependency local generator', function () {
      assert.ok(this.env.get('jquery:app'));
    });

    if (!process.env.NODE_PATH) {
      console.log('Skipping tests for global generators. Please setup `NODE_PATH` environment variable to run it.');
    }

    it('local generators prioritized over global', function () {
      const {resolved} = this.env.get('dummy:app');
      assert.ok(resolved.includes('lookup-project'), `Couldn't find 'lookup-project' in ${resolved}`);
    });

    globalLookupTest('register global generators', function () {
      assert.ok(this.env.get('dummytest:app'));
      assert.ok(this.env.get('dummytest:controller'));
    });

    it('register symlinked generators', function () {
      assert.ok(this.env.get('extend:support'));
    });

    describe('when there\'s ancestor node_modules/ folder', () => {
      before(() => {
        process.chdir(subDirRoot);
        spawn.sync('npm', ['install', '--no-package-lock']);
      });

      after(() => {
        process.chdir(projectRoot);
        fs.rmdirSync(path.join(subDirRoot, 'node_modules'), {recursive: true});
      });

      beforeEach(function () {
        this.env = new Environment();
        assert.equal(this.env.namespaces().length, 0, 'ensure env is empty');
        this.env.lookup();
      });

      it('register generators in ancestor node_modules directory', function () {
        assert.ok(this.env.get('jquery:app'));
      });

      it('local generators are prioritized over ancestor', function () {
        const {resolved} = this.env.get('dummy:app');
        assert.ok(resolved.includes('subdir'), `Couldn't find 'subdir' in ${resolved}`);
      });
    });

    describe('when node_modules is a symlink', () => {
      before(() => {
        if (!fs.existsSync(path.resolve('orig'))) {
          fs.ensureDirSync(path.resolve('orig'));
          fs.moveSync(
            path.resolve('node_modules'),
            path.resolve('orig/node_modules')
          );
          fs.ensureSymlinkSync(
            path.resolve('orig/node_modules'),
            path.resolve('node_modules')
          );
        }
      });
      after(() => {
        if (fs.existsSync(path.resolve('orig'))) {
          fs.removeSync(path.resolve('node_modules'));
          fs.moveSync(
            path.resolve('orig/node_modules'),
            path.resolve('node_modules')
          );
          fs.removeSync(path.resolve('orig'));
        }
      });

      it('register local generators', function () {
        assert.ok(this.env.get('dummy:app'));
        assert.ok(this.env.get('dummy:yo'));

        assert.ok(this.env.get('dummy:app').packagePath.endsWith('node_modules/generator-dummy'));
        assert.ok(this.env.get('dummy:app').packagePath.endsWith('node_modules/generator-dummy'));
      });

      it('registers local ts generators', function () {
        assert.ok(this.env.get('ts:app'));
      });

      it('js generators takes precedence', function () {
        // eslint-disable-next-line unicorn/import-index
        assert.equal(this.env.get('ts-js:app'), require('./fixtures/generator-ts-js/generators/app/index.js'));
      });

      it('register generators in scoped packages', function () {
        assert.ok(this.env.get('@dummyscope/scoped:app'));
      });

      it('register non-dependency local generator', function () {
        assert.ok(this.env.get('jquery:app'));
      });

      if (!process.env.NODE_PATH) {
        console.log('Skipping tests for global generators. Please setup `NODE_PATH` environment variable to run it.');
      }

      it('local generators prioritized over global', function () {
        const {resolved} = this.env.get('dummy:app');
        assert.ok(resolved.includes('lookup-project'), `Couldn't find 'lookup-project' in ${resolved}`);
      });

      globalLookupTest('register global generators', function () {
        assert.ok(this.env.get('dummytest:app'));
        assert.ok(this.env.get('dummytest:controller'));
      });

      it('register symlinked generators', function () {
        assert.ok(this.env.get('extend:support'));
      });
    });

    describe('when modules repository is not called node_modules', () => {
      let lookupOptionsBackup;
      let customRepositoryPath;
      before(() => {
        customRepositoryPath = path.resolve('orig');
        lookupOptionsBackup = lookupOptions;
        lookupOptions = {npmPaths: [customRepositoryPath]};
        if (!fs.existsSync(customRepositoryPath)) {
          fs.moveSync(
            path.resolve('node_modules'),
            customRepositoryPath
          );
        }
      });
      after(() => {
        lookupOptions = lookupOptionsBackup;
        if (fs.existsSync(path.resolve('orig'))) {
          fs.moveSync(
            customRepositoryPath,
            path.resolve('node_modules')
          );
        }
      });

      it('register local generators', function () {
        assert.ok(this.env.get('dummy:app'));
        assert.ok(this.env.get('dummy:yo'));

        assert.ok(this.env.get('dummy:app').packagePath.endsWith('/generator-dummy'));
        assert.ok(this.env.get('dummy:app').packagePath.endsWith('/generator-dummy'));
      });

      it('registers local ts generators', function () {
        assert.ok(this.env.get('ts:app'));
      });

      it('js generators takes precedence', function () {
        // eslint-disable-next-line unicorn/import-index
        assert.equal(this.env.get('ts-js:app'), require('./fixtures/generator-ts-js/generators/app/index.js'));
      });

      it('register generators in scoped packages', function () {
        assert.ok(this.env.get('@dummyscope/scoped:app'));
      });

      if (!process.env.NODE_PATH) {
        console.log('Skipping tests for global generators. Please setup `NODE_PATH` environment variable to run it.');
      }

      it('local generators prioritized over global', function () {
        const {resolved} = this.env.get('dummy:app');
        assert.ok(resolved.includes('orig'), `Couldn't find 'lookup-project' in ${resolved}`);
      });

      it('register symlinked generators', function () {
        assert.ok(this.env.get('extend:support'));
      });
    });

    describe('when localOnly argument is true', () => {
      beforeEach(function () {
        this.env = new Environment();
        assert.equal(this.env.namespaces().length, 0, 'ensure env is empty');
        this.env.lookup(true);
      });

      it('register local generators', function () {
        assert.ok(this.env.get('dummy:app'));
        assert.ok(this.env.get('dummy:yo'));
        assert.ok(this.env.isPackageRegistered('dummy'));
      });

      it('register generators in scoped packages', function () {
        assert.ok(this.env.get('@dummyscope/scoped:app'));
      });

      it('register non-dependency local generator', function () {
        assert.ok(this.env.get('jquery:app'));
      });

      it('register symlinked generators', function () {
        assert.ok(this.env.get('extend:support'));
      });

      globalLookupTest('does not register global generators', function () {
        assert.ok(!this.env.get('dummytest:app'));
        assert.ok(!this.env.get('dummytest:controller'));
      });
    });

    describe('when options.localOnly argument is true', () => {
      beforeEach(function () {
        this.env = new Environment();
        assert.equal(this.env.namespaces().length, 0, 'ensure env is empty');
        this.env.lookup({localOnly: true});
      });

      it('register local generators', function () {
        assert.ok(this.env.get('dummy:app'));
        assert.ok(this.env.get('dummy:yo'));
      });

      it('register generators in scoped packages', function () {
        assert.ok(this.env.get('@dummyscope/scoped:app'));
      });

      it('register non-dependency local generator', function () {
        assert.ok(this.env.get('jquery:app'));
      });

      it('register symlinked generators', function () {
        assert.ok(this.env.get('extend:support'));
      });

      globalLookupTest('does not register global generators', function () {
        assert.ok(!this.env.get('dummytest:app'));
        assert.ok(!this.env.get('dummytest:controller'));
      });
    });
  });

  describe('#lookup() with options', () => {
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

    it('with packagePaths', function () {
      this.env.lookup({packagePaths: [
        'node_modules/generator-module'
      ]});
      assert.ok(this.env.get('module:app'));
      assert.ok(this.env.getRegisteredPackages().length === 1);
    });

    it('with scope and packagePaths', function () {
      this.env.lookup({packagePaths: [
        'node_modules/generator-module',
        'node_modules/@scoped/generator-scoped'
      ], registerToScope: 'test'});
      assert.ok(this.env.get('@test/module:app'));
      assert.ok(this.env.get('@scoped/scoped:app'));
      assert.ok(this.env.getRegisteredPackages().length === 2);
    });

    it('with 2 packagePaths', function () {
      this.env.lookup({packagePaths: [
        'node_modules/generator-module',
        'node_modules/generator-module-root'
      ]});
      assert.ok(this.env.get('module:app'));
      assert.ok(this.env.get('module-root:app'));
      assert.ok(this.env.getRegisteredPackages().length === 2);
    });

    it('with 3 packagePaths', function () {
      this.env.lookup({packagePaths: [
        'node_modules/generator-module',
        'node_modules/generator-module-root',
        'node_modules/generator-module-lib-gen'
      ]});
      assert.ok(this.env.get('module:app'));
      assert.ok(this.env.get('module-root:app'));
      assert.ok(this.env.get('module-lib-gen:app'));
      assert.ok(this.env.getRegisteredPackages().length === 3);
    });

    it('with scoped packagePaths', function () {
      this.env.lookup({packagePaths: [
        'node_modules/generator-module',
        'node_modules/generator-module-root',
        'node_modules/generator-module-lib-gen',
        'node_modules/@scoped/generator-scoped'
      ]});
      assert.ok(this.env.get('module:app'));
      assert.ok(this.env.get('module-root:app'));
      assert.ok(this.env.get('module-lib-gen:app'));
      assert.ok(this.env.get('@scoped/scoped:app'));
      assert.ok(this.env.getRegisteredPackages().length === 4);
    });

    it('with npmPaths', function () {
      this.env.lookup({npmPaths: ['node_modules']});
      assert.ok(this.env.get('module:app'));
      assert.ok(this.env.get('module-root:app'));
      assert.ok(this.env.get('module-lib-gen:app'));
      assert.ok(this.env.get('@scoped/scoped:app'));
      assert.ok(this.env.getRegisteredPackages().length === 4);
    });

    it('with sub-sub-generators filePatterns', function () {
      this.env.lookup({npmPaths: ['node_modules'], filePatterns: ['*/*/index.js']});
      assert.ok(this.env.get('@scoped/scoped:app:scaffold'));
    });

    it('with packagePatterns', function () {
      this.env.lookup({npmPaths: ['node_modules'], packagePatterns: ['generator-module', 'generator-module-root']});
      assert.ok(this.env.get('module:app'));
      assert.ok(this.env.get('module-root:app'));
      assert.ok(this.env.getRegisteredPackages().length === 2);
    });

    it('with sub-sub-generators and packagePaths', function () {
      this.env.lookup({packagePaths: ['node_modules/@scoped/generator-scoped'], filePatterns: ['*/*/index.js']});
      assert.ok(this.env.get('@scoped/scoped:app:scaffold'));
    });

    it('with sub-sub-generators and packagePatterns', function () {
      this.env.lookup({npmPaths: ['node_modules'], packagePatterns: ['generator-scoped'], filePatterns: ['*/*/index.js']});
      assert.ok(this.env.get('@scoped/scoped:app:scaffold'));
    });
  });

  describe('#lookupNamespaces()', () => {
    before(() => {
      process.chdir(customProjectRoot);

      linkGenerator('generator-scoped', '@scoped');
      linkGenerator('generator-module-lib-gen');
      linkGenerator('generator-module');
      linkGenerator('generator-module-root');
    });

    beforeEach(function () {
      this.env = new Environment([], {experimental: true});
    });

    after(() => {
      unlinkGenerator('generator-scoped', '@scoped');
      unlinkGenerator('generator-module-lib-gen');
      unlinkGenerator('generator-module');
      unlinkGenerator('generator-module-root');

      process.chdir(projectRoot);
      fs.rmdirSync(path.join(customProjectRoot, 'node_modules'), {recursive: true});
    });

    it('with 1 namespace', function () {
      this.env.lookupNamespaces('module:app', {npmPaths: [
        'node_modules'
      ]});
      assert.ok(this.env.get('module:app'));
      assert.ok(this.env.getRegisteredPackages().length === 1);
    });

    it('with 2 namespaces', function () {
      this.env.lookupNamespaces(
        [
          'module:app',
          'module-root:app'
        ], {npmPaths: ['node_modules']}
      );
      assert.ok(this.env.get('module:app'));
      assert.ok(this.env.get('module-root:app'));
      assert.ok(this.env.getRegisteredPackages().length === 2);
    });

    it('with sub-sub-generators', function () {
      this.env.lookupNamespaces('@scoped/scoped:app:scaffold', {npmPaths: [
        'node_modules'
      ]});
      assert.ok(this.env.get('@scoped/scoped:app:scaffold'));
      assert.ok(this.env.getRegisteredPackages().length === 1);
    });
  });

  describe('#getNpmPaths()', () => {
    beforeEach(function () {
      this.NODE_PATH = process.env.NODE_PATH;
      this.bestBet = path.join(__dirname, '../../../..');
      this.bestBet2 = path.join(path.dirname(process.argv[1]), '../..');
      this.env = new Environment();
    });

    afterEach(function () {
      process.env.NODE_PATH = this.NODE_PATH;
    });

    describe('with NODE_PATH', () => {
      beforeEach(() => {
        process.env.NODE_PATH = '/some/dummy/path';
      });

      afterEach(() => {
        delete process.env.NODE_PATH;
      });

      it('walk up the CWD lookups dir', function () {
        const paths = this.env.getNpmPaths();
        assert.equal(paths[0], path.join(process.cwd(), 'node_modules'));
        assert.equal(paths[1], path.join(process.cwd(), '../node_modules'));
      });

      it('append NODE_PATH', function () {
        assert(this.env.getNpmPaths().includes(process.env.NODE_PATH));
      });
    });

    describe('without NODE_PATH', () => {
      beforeEach(() => {
        delete process.env.NODE_PATH;
      });

      it('walk up the CWD lookups dir', function () {
        const paths = this.env.getNpmPaths();
        assert.equal(paths[0], path.join(process.cwd(), 'node_modules'));
        const prevdir = process.cwd().split(path.sep).slice(0, -1).join(path.sep);
        assert.equal(paths[1], path.join(prevdir, 'node_modules'));
      });

      it('append best bet if NODE_PATH is unset', function () {
        assert(this.env.getNpmPaths().includes(this.bestBet));
        assert(this.env.getNpmPaths().includes(this.bestBet2));
      });

      it('append default NPM dir depending on your OS', function () {
        if (process.platform === 'win32') {
          assert(this.env.getNpmPaths().includes(path.join(process.env.APPDATA, 'npm/node_modules')));
        } else {
          assert(this.env.getNpmPaths().includes('/usr/lib/node_modules'));
        }
      });
    });

    describe('with NVM_PATH', () => {
      beforeEach(() => {
        process.env.NVM_PATH = '/some/dummy/path';
      });

      afterEach(() => {
        delete process.env.NVM_PATH;
      });

      it('walk up the CWD lookups dir', function () {
        const paths = this.env.getNpmPaths();
        assert.equal(paths[0], path.join(process.cwd(), 'node_modules'));
        assert.equal(paths[1], path.join(process.cwd(), '../node_modules'));
      });

      it('append NVM_PATH', function () {
        assert(this.env.getNpmPaths().includes(path.join(path.dirname(process.env.NVM_PATH), 'node_modules')));
      });
    });

    describe('without NVM_PATH', () => {
      beforeEach(() => {
        delete process.env.NVM_PATH;
      });

      it('walk up the CWD lookups dir', function () {
        const paths = this.env.getNpmPaths();
        assert.equal(paths[0], path.join(process.cwd(), 'node_modules'));
        assert.equal(paths[1], path.join(process.cwd(), '../node_modules'));
      });

      it('append best bet if NVM_PATH is unset', function () {
        assert(this.env.getNpmPaths().includes(path.join(this.bestBet, 'node_modules')));
        assert(this.env.getNpmPaths().includes(this.bestBet2));
      });
    });

    describe('when localOnly argument is true', () => {
      afterEach(() => {
        delete process.env.NODE_PATH;
        delete process.env.NVM_PATH;
      });

      it('walk up the CWD lookups dir', function () {
        const paths = this.env.getNpmPaths();
        assert.equal(paths[0], path.join(process.cwd(), 'node_modules'));
        assert.equal(paths[1], path.join(process.cwd(), '../node_modules'));
      });

      it('does not append NODE_PATH', function () {
        process.env.NODE_PATH = '/some/dummy/path';
        assert(!this.env.getNpmPaths(true).includes(process.env.NODE_PATH));
      });

      it('does not append NVM_PATH', function () {
        process.env.NVM_PATH = '/some/dummy/path';
        assert(!this.env.getNpmPaths(true).includes(path.join(path.dirname(process.env.NVM_PATH), 'node_modules')));
      });

      it('does not append best bet', function () {
        assert(!this.env.getNpmPaths(true).includes(this.bestBet));
      });

      it('does not append default NPM dir depending on your OS', function () {
        if (process.platform === 'win32') {
          assert(!this.env.getNpmPaths(true).includes(path.join(process.env.APPDATA, 'npm/node_modules')));
        } else {
          assert(!this.env.getNpmPaths(true).includes('/usr/lib/node_modules'));
        }
      });
    });

    describe('with npm global prefix', () => {
      it('append npm modules path depending on your OS', function () {
        const npmPrefix = execaOutput('npm', ['prefix', '-g']);
        if (process.platform === 'win32') {
          assert(this.env.getNpmPaths().indexOf(path.resolve(npmPrefix, 'node_modules')) > 0);
        } else {
          assert(this.env.getNpmPaths().indexOf(path.resolve(npmPrefix, 'lib/node_modules')) > 0);
        }
      });
    });
  });

  describe('#findPackagesIn()', () => {
    before(() => {
      linkGenerator('generator-scoped', '@dummyscope');
    });

    after(() => {
      unlinkGenerator('generator-scoped', '@dummyscope');
    });

    beforeEach(function () {
      this.env = new Environment();
    });

    describe('when passing package patterns without scope', () => {
      it('finds it', function () {
        const packageToFind = 'generator-dummy';
        const actual = this.env.packageLookup.findPackagesIn(['node_modules'], [packageToFind]);
        assert.equal(actual.length, 1);
        assert.ok(actual[0].endsWith(packageToFind));
      });
    });

    describe('when passing package patterns with scope', () => {
      it('finds it', function () {
        const packageToFind = '@dummyscope/generator-scoped';
        const actual = this.env.packageLookup.findPackagesIn(['node_modules'], [packageToFind]);
        assert.equal(actual.length, 1);
        assert.ok(actual[0].endsWith(packageToFind));
      });
    });
  });

  describe('#lookupGenerator()', () => {
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
      fs.rmdirSync(path.join(customProjectRoot, 'node_modules'), {recursive: true});
    });

    describe('Find generator', () => {
      it('Scoped lookup', () => {
        const modulePath = Environment.lookupGenerator('@dummyscope/scoped:app');
        assert.ok(modulePath.endsWith('node_modules/@dummyscope/generator-scoped/app/index.js'));
        const packagePath = Environment.lookupGenerator('@dummyscope/scoped:app', {packagePath: true});
        assert.ok(packagePath.endsWith('node_modules/@dummyscope/generator-scoped'));
      });
      it('Lookup', () => {
        const modulePath = Environment.lookupGenerator('extend:support');
        assert.ok(modulePath.endsWith('node_modules/generator-extend/support/index.js'));

        const packagePath = Environment.lookupGenerator('extend:support', {packagePath: true});
        const packagePath3 = Environment.lookupGenerator('extend', {packagePath: true});
        assert.ok(packagePath.endsWith('node_modules/generator-extend'));
        assert.ok(packagePath3.endsWith('node_modules/generator-extend'));
      });
      it('Module Lookup', () => {
        const modulePath = Environment.lookupGenerator('module:app');
        assert.ok(modulePath.endsWith('node_modules/generator-module/generators/app/index.js'), modulePath);

        const packagePath = Environment.lookupGenerator('module:app', {packagePath: true});
        assert.ok(packagePath.endsWith('node_modules/generator-module'), packagePath);

        const generatorPath = Environment.lookupGenerator('module:app', {generatorPath: true});
        assert.ok(generatorPath.endsWith('node_modules/generator-module/generators/'), generatorPath);
      });
    });
  });

  describe('#lookupGenerator() with multiple option', () => {
    before(() => {
      process.chdir(customProjectRoot);

      this.chdirRoot = path.join(customProjectRoot, 'node_modules/foo');
      this.chdirRootNodeModule = path.join(this.chdirRoot, 'node_modules');
      this.multipleModuleGenerator = path.join(this.chdirRootNodeModule, 'generator-module');

      fs.mkdirSync(this.chdirRoot, {recursive: true});
      linkGenerator('generator-module');
      process.chdir(this.chdirRoot);
      linkGenerator('generator-module');
    });

    after(() => {
      unlinkGenerator('generator-module');
      process.chdir(customProjectRoot);
      unlinkGenerator('generator-module');
      process.chdir(projectRoot);

      fs.rmdirSync(path.join(customProjectRoot, 'node_modules'), {recursive: true});
    });

    describe('Find generator', () => {
      it('Module Lookup', () => {
        const modulePath = Environment.lookupGenerator('module:app');
        assert.ok(modulePath.endsWith('node_modules/generator-module/generators/app/index.js'));

        const multiplePath = Environment.lookupGenerator('module:app', {multiple: true});
        assert.equal(multiplePath.length, 2);
        assert.ok(multiplePath[0].endsWith('lookup-custom/node_modules/generator-module/generators/app/index.js'));
        assert.ok(multiplePath[1].endsWith('lookup-custom/node_modules/foo/node_modules/generator-module/generators/app/index.js'));

        const multiplePath2 = Environment.lookupGenerator('module:app', {singleResult: false});
        assert.equal(multiplePath2.length, 2);
        assert.ok(multiplePath2[0].endsWith('lookup-custom/node_modules/generator-module/generators/app/index.js'));
        assert.ok(multiplePath2[1].endsWith('lookup-custom/node_modules/foo/node_modules/generator-module/generators/app/index.js'));
      });
    });
  });

  describe('Enviroment with a generator extended by environment lookup', () => {
    before(() => {
      linkGenerator('generator-environment-extend');
    });

    after(() => {
      unlinkGenerator('generator-environment-extend');
    });

    describe('Find generator', () => {
      it('Generator extended by environment lookup', () => {
        this.env = new Environment();
        assert.equal(this.env.namespaces().length, 0, 'ensure env is empty');
        this.env.lookup();
        assert.ok(this.env.get('environment-extend:app'));
        assert.ok(this.env.create('environment-extend:app'));
      });
    });
  });
});
