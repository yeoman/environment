'use strict';
const fs = require('fs-extra');
const path = require('path');
const assert = require('assert');
const spawn = require('cross-spawn');
const Environment = require('../lib/environment');
const {execaOutput} = require('../lib/util/util');

const globalLookupTest = process.env.NODE_PATH ? it : xit;

describe('Environment Resolver', function () {
  this.timeout(100000);

  before(function () {
    this.cwd = process.cwd();
    process.chdir(__dirname);
  });

  after(function () {
    process.chdir(this.cwd);
  });

  describe('#lookup()', () => {
    let scopedFolder;
    let scopedGenerator;
    let lookupOptions;

    before(function () {
      this.timeout(500000);
      this.projectRoot = path.join(__dirname, 'fixtures/lookup-project');
      process.chdir(this.projectRoot);
      scopedFolder = path.resolve('node_modules/@dummyscope');
      scopedGenerator = path.join(scopedFolder, 'generator-scoped');
      spawn.sync('npm', ['ci']);
      spawn.sync('npm', ['install', '-g', 'generator-dummytest', 'generator-dummy', '--no-package-lock']);

      if (!fs.existsSync(path.resolve('node_modules/generator-extend'))) {
        fs.symlinkSync(
          path.resolve('../generator-extend'),
          path.resolve('node_modules/generator-extend'),
          'dir'
        );
      }

      if (!fs.existsSync(scopedFolder)) {
        fs.mkdirSync(scopedFolder);
      }

      if (!fs.existsSync(scopedGenerator)) {
        fs.symlinkSync(
          path.resolve('../generator-scoped'),
          scopedGenerator,
          'dir'
        );
      }

      if (!fs.existsSync(path.resolve('node_modules/generator-ts'))) {
        fs.symlinkSync(
          path.resolve('../generator-ts'),
          path.resolve('node_modules/generator-ts'),
          'dir'
        );
      }

      if (!fs.existsSync(path.resolve('node_modules/generator-ts-js'))) {
        fs.symlinkSync(
          path.resolve('../generator-ts-js'),
          path.resolve('node_modules/generator-ts-js'),
          'dir'
        );
      }
    });

    after(function () {
      fs.unlinkSync(path.join(this.projectRoot, 'node_modules/generator-extend'));
      fs.unlinkSync(scopedGenerator);
      fs.rmdirSync(scopedFolder);
      process.chdir(__dirname);
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
      before(function () {
        this.projectSubRoot = path.join(this.projectRoot, 'subdir');
        process.chdir(this.projectSubRoot);
        spawn.sync('npm', ['install', '--no-package-lock']);
      });

      after(function () {
        process.chdir(this.projectRoot);
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
    before(function () {
      this.projectRoot = path.join(__dirname, 'fixtures/lookup-custom');
      process.chdir(this.projectRoot);

      this.npmPath = path.join(this.projectRoot, 'node_modules');
      if (!fs.existsSync(this.npmPath)) {
        fs.mkdirSync(this.npmPath);
      }

      this.generatorScope = path.join(this.npmPath, '@scoped');
      if (!fs.existsSync(this.generatorScope)) {
        fs.mkdirSync(this.generatorScope);
      }

      this.generatorScopedPath = path.join(this.generatorScope, 'generator-scoped');
      if (!fs.existsSync(this.generatorScopedPath)) {
        fs.symlinkSync(
          path.resolve('../generator-scoped'),
          this.generatorScopedPath,
          'dir'
        );
      }

      this.generatorLibGenPath = path.join(this.npmPath, 'generator-module-lib-gen');
      if (!fs.existsSync(this.generatorLibGenPath)) {
        fs.symlinkSync(
          path.resolve('../generator-module-lib-gen'),
          this.generatorLibGenPath,
          'dir'
        );
      }

      this.generatorPath = path.join(this.npmPath, 'generator-module');
      if (!fs.existsSync(this.generatorPath)) {
        fs.symlinkSync(
          path.resolve('../generator-module'),
          this.generatorPath,
          'dir'
        );
      }

      this.generatorRootPath = path.join(this.npmPath, 'generator-module-root');
      if (!fs.existsSync(this.generatorRootPath)) {
        fs.symlinkSync(
          path.resolve('../generator-module-root'),
          this.generatorRootPath,
          'dir'
        );
      }
    });

    beforeEach(function () {
      this.env = new Environment();
    });

    after(function () {
      fs.unlinkSync(this.generatorPath);
      fs.unlinkSync(this.generatorLibGenPath);
      fs.unlinkSync(this.generatorRootPath);

      fs.unlinkSync(this.generatorScopedPath);
      fs.rmdirSync(this.generatorScope);

      fs.rmdirSync(this.npmPath);

      process.chdir(__dirname);
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
    before(function () {
      this.projectRoot = path.join(__dirname, 'fixtures/lookup-custom');
      process.chdir(this.projectRoot);

      this.npmPath = path.join(this.projectRoot, 'node_modules');
      if (!fs.existsSync(this.npmPath)) {
        fs.mkdirSync(this.npmPath);
      }

      this.generatorScope = path.join(this.npmPath, '@scoped');
      if (!fs.existsSync(this.generatorScope)) {
        fs.mkdirSync(this.generatorScope);
      }

      this.generatorScopedPath = path.join(this.generatorScope, 'generator-scoped');
      if (!fs.existsSync(this.generatorScopedPath)) {
        fs.symlinkSync(
          path.resolve('../generator-scoped'),
          this.generatorScopedPath,
          'dir'
        );
      }

      this.generatorLibGenPath = path.join(this.npmPath, 'generator-module-lib-gen');
      if (!fs.existsSync(this.generatorLibGenPath)) {
        fs.symlinkSync(
          path.resolve('../generator-module-lib-gen'),
          this.generatorLibGenPath,
          'dir'
        );
      }

      this.generatorPath = path.join(this.npmPath, 'generator-module');
      if (!fs.existsSync(this.generatorPath)) {
        fs.symlinkSync(
          path.resolve('../generator-module'),
          this.generatorPath,
          'dir'
        );
      }

      this.generatorRootPath = path.join(this.npmPath, 'generator-module-root');
      if (!fs.existsSync(this.generatorRootPath)) {
        fs.symlinkSync(
          path.resolve('../generator-module-root'),
          this.generatorRootPath,
          'dir'
        );
      }
    });

    beforeEach(function () {
      this.env = new Environment([], {experimental: true});
    });

    after(function () {
      fs.unlinkSync(this.generatorPath);
      fs.unlinkSync(this.generatorLibGenPath);
      fs.unlinkSync(this.generatorRootPath);

      fs.unlinkSync(this.generatorScopedPath);
      fs.rmdirSync(this.generatorScope);

      fs.rmdirSync(this.npmPath);

      process.chdir(__dirname);
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
    beforeEach(function () {
      this.env = new Environment();
    });

    describe('when passing package patterns without scope', () => {
      it('finds it', function () {
        const dummyGenerator = 'fixtures/lookup-project/node_modules';
        const packageToFind = 'generator-dummy';
        const actual = this.env.packageLookup.findPackagesIn([dummyGenerator], {packagePatterns: [packageToFind]});
        assert.equal(actual.length, 1);
        assert.ok(actual[0].endsWith(packageToFind));
      });
    });

    describe('when passing package patterns with scope', () => {
      it('finds it', function () {
        const dummyGenerator = 'fixtures/lookup-project/node_modules';
        const packageToFind = '@dummyscope/generator-scoped';
        const actual = this.env.packageLookup.findPackagesIn([dummyGenerator], {packagePatterns: [packageToFind]});
        assert.equal(actual.length, 1);
        assert.ok(actual[0].endsWith(packageToFind));
      });
    });
  });

  describe('#lookupGenerator()', () => {
    const scopedFolder = path.resolve('node_modules/@dummyscope');
    const scopedGenerator = path.join(scopedFolder, 'generator-scoped');
    const moduleGenerator = path.resolve('node_modules/generator-module');

    before(function () {
      this.projectRoot = path.join(__dirname, 'fixtures/lookup-project');
      process.chdir(this.projectRoot);

      if (!fs.existsSync(scopedFolder)) {
        fs.mkdirSync(scopedFolder);
      }

      if (!fs.existsSync(scopedGenerator)) {
        fs.symlinkSync(
          path.resolve('../generator-scoped'),
          scopedGenerator,
          'dir'
        );
      }

      if (!fs.existsSync(moduleGenerator)) {
        fs.symlinkSync(
          path.resolve('../generator-module'),
          moduleGenerator,
          'dir'
        );
      }
    });

    after(() => {
      fs.unlinkSync(moduleGenerator);
      fs.unlinkSync(scopedGenerator);
      fs.rmdirSync(scopedFolder);
      process.chdir(__dirname);
    });

    describe('Find generator', () => {
      it('Scoped lookup', () => {
        const modulePath = Environment.lookupGenerator('@dummyscope/scoped:app');
        assert.ok(modulePath.endsWith('node_modules/@dummyscope/generator-scoped/app/index.js'));
        const packagePath = Environment.lookupGenerator('@dummyscope/scoped:app', {packagePath: true});
        assert.ok(packagePath.endsWith('node_modules/@dummyscope/generator-scoped'));
      });
      it('Lookup', () => {
        const modulePath = Environment.lookupGenerator('dummy:app');
        const modulePath2 = Environment.lookupGenerator('dummy:yo');
        assert.ok(modulePath.endsWith('node_modules/generator-dummy/app/index.js'));
        assert.ok(modulePath2.endsWith('node_modules/generator-dummy/yo/index.js'));

        const packagePath = Environment.lookupGenerator('dummy:app', {packagePath: true});
        const packagePath2 = Environment.lookupGenerator('dummy:yo', {packagePath: true});
        const packagePath3 = Environment.lookupGenerator('dummy', {packagePath: true});
        assert.ok(packagePath.endsWith('node_modules/generator-dummy'));
        assert.ok(packagePath2.endsWith('node_modules/generator-dummy'));
        assert.ok(packagePath3.endsWith('node_modules/generator-dummy'));
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
    const projectRoot = path.join(__dirname, 'fixtures/lookup-project/');
    const moduleGenerator = path.join(projectRoot, 'node_modules/generator-module');
    const chdirRoot = path.join(__dirname, 'fixtures/lookup-project/node_modules/foo');
    const chdirRootNodeModule = path.join(chdirRoot, 'node_modules');
    const multipleModuleGenerator = path.join(chdirRoot, 'node_modules/generator-module');

    before(() => {
      if (!fs.existsSync(chdirRoot)) {
        fs.mkdirSync(chdirRoot);
      }

      if (!fs.existsSync(moduleGenerator)) {
        fs.symlinkSync(
          path.resolve('fixtures/generator-module'),
          moduleGenerator,
          'dir'
        );
      }

      if (!fs.existsSync(chdirRootNodeModule)) {
        fs.mkdirSync(chdirRootNodeModule);
      }

      if (!fs.existsSync(multipleModuleGenerator)) {
        fs.symlinkSync(
          path.resolve('fixtures/generator-module'),
          multipleModuleGenerator,
          'dir'
        );
      }

      process.chdir(chdirRoot);
    });

    after(() => {
      process.chdir(__dirname);

      fs.unlinkSync(multipleModuleGenerator);
      fs.rmdirSync(chdirRootNodeModule);
      fs.rmdirSync(chdirRoot);
      fs.unlinkSync(moduleGenerator);
    });

    describe('Find generator', () => {
      it('Module Lookup', () => {
        const modulePath = Environment.lookupGenerator('module:app');
        assert.ok(modulePath.endsWith('node_modules/generator-module/generators/app/index.js'));

        const multiplePath = Environment.lookupGenerator('module:app', {multiple: true});
        assert.ok(multiplePath[0].endsWith('lookup-project/node_modules/generator-module/generators/app/index.js'));
        assert.ok(multiplePath[1].endsWith('lookup-project/node_modules/foo/node_modules/generator-module/generators/app/index.js'));

        const multiplePath2 = Environment.lookupGenerator('module:app', {singleResult: false});
        assert.ok(multiplePath2[0].endsWith('lookup-project/node_modules/generator-module/generators/app/index.js'));
        assert.ok(multiplePath2[1].endsWith('lookup-project/node_modules/foo/node_modules/generator-module/generators/app/index.js'));
      });
    });
  });

  describe('Enviroment with a generator extended by environment lookup', () => {
    before(function () {
      this.projectRoot = path.join(__dirname, 'fixtures/lookup-project');
      process.chdir(this.projectRoot);

      fs.symlinkSync(
        path.resolve('../generator-environment-extend'),
        path.resolve('node_modules/generator-environment-extend'),
        'dir'
      );
    });

    after(function () {
      fs.unlinkSync(path.join(this.projectRoot, 'node_modules/generator-environment-extend'));
      process.chdir(__dirname);
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
