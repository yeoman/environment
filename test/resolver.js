'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const sinon = require('sinon');
const spawn = require('cross-spawn');
const Environment = require('../lib/environment');

const globalLookupTest = process.env.NODE_PATH ? it : xit;

describe('Environment Resolver', function () {
  this.timeout(100000);

  describe('#lookup()', () => {
    const scopedFolder = path.resolve('node_modules/@dummyscope');
    const scopedGenerator = path.join(scopedFolder, 'generator-scoped');

    before(function () {
      this.timeout(500000);
      this.projectRoot = path.join(__dirname, 'fixtures/lookup-project');
      process.chdir(this.projectRoot);
      spawn.sync('npm', ['install', '--no-package-lock']);
      spawn.sync('npm', ['install', 'generator-jquery', '--no-package-lock']);
      spawn.sync('npm', ['install', '-g', 'generator-dummytest', 'generator-dummy', '--no-package-lock']);

      fs.symlinkSync(
        path.resolve('../generator-extend'),
        path.resolve('node_modules/generator-extend'),
        'dir'
      );

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
    });

    after(function () {
      fs.unlinkSync(path.join(this.projectRoot, 'node_modules/generator-extend'));
      fs.unlinkSync(scopedGenerator);
      fs.rmdirSync(scopedFolder);
      process.chdir(__dirname);
    });

    beforeEach(function (done) {
      this.env = new Environment();
      assert.equal(this.env.namespaces().length, 0, 'ensure env is empty');
      this.env.lookup(done);
    });

    it('register local generators', function () {
      assert.ok(this.env.get('dummy:app'));
      assert.ok(this.env.get('dummy:yo'));

      assert.ok(this.env.get('dummy:app').packagePath.endsWith('node_modules/generator-dummy'));
      assert.ok(this.env.get('dummy:app').packagePath.endsWith('node_modules/generator-dummy'));
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
      const resolved = this.env.get('dummy:app').resolved;
      assert.ok(resolved.indexOf('lookup-project') !== -1, `Couldn't find 'lookup-project' in ${resolved}`);
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

      beforeEach(function () {
        this.env = new Environment();
        assert.equal(this.env.namespaces().length, 0, 'ensure env is empty');
        this.env.lookup();
      });

      it('register generators in ancestor node_modules directory', function () {
        assert.ok(this.env.get('jquery:app'));
      });

      it('local generators are prioritized over ancestor', function () {
        const resolved = this.env.get('dummy:app').resolved;
        assert.ok(resolved.indexOf('subdir') !== -1, `Couldn't find 'subdir' in ${resolved}`);
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
        assert(this.env.getNpmPaths().indexOf(process.env.NODE_PATH) >= 0);
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
        assert(this.env.getNpmPaths().indexOf(this.bestBet) >= 0);
        assert(this.env.getNpmPaths().indexOf(this.bestBet2) >= 0);
      });

      it('append default NPM dir depending on your OS', function () {
        if (process.platform === 'win32') {
          assert(this.env.getNpmPaths().indexOf(path.join(process.env.APPDATA, 'npm/node_modules')) >= 0);
        } else {
          assert(this.env.getNpmPaths().indexOf('/usr/lib/node_modules') >= 0);
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
        assert(this.env.getNpmPaths().indexOf(path.join(path.dirname(process.env.NVM_PATH), 'node_modules')) >= 0);
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
        assert(this.env.getNpmPaths().indexOf(path.join(this.bestBet, 'node_modules')) >= 0);
        assert(this.env.getNpmPaths().indexOf(this.bestBet2) >= 0);
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
        assert(this.env.getNpmPaths(true).indexOf(process.env.NODE_PATH) === -1);
      });

      it('does not append NVM_PATH', function () {
        process.env.NVM_PATH = '/some/dummy/path';
        assert(this.env.getNpmPaths(true).indexOf(path.join(path.dirname(process.env.NVM_PATH), 'node_modules')) === -1);
      });

      it('does not append best bet', function () {
        assert(this.env.getNpmPaths(true).indexOf(this.bestBet) === -1);
      });

      it('does not append default NPM dir depending on your OS', function () {
        if (process.platform === 'win32') {
          assert(this.env.getNpmPaths(true).indexOf(path.join(process.env.APPDATA, 'npm/node_modules')) === -1);
        } else {
          assert(this.env.getNpmPaths(true).indexOf('/usr/lib/node_modules') === -1);
        }
      });
    });

    describe('with npm global prefix', () => {
      it('append npm modules path depending on your OS', function () {
        const npmPrefix = '/npm_prefix';
        const spawnStub = sinon.stub(spawn, 'sync').returns({stdout: npmPrefix});
        if (process.platform === 'win32') {
          assert(this.env.getNpmPaths().indexOf(path.resolve(npmPrefix, 'node_modules')) > 0);
        } else {
          assert(this.env.getNpmPaths().indexOf(path.resolve(npmPrefix, 'lib/node_modules')) > 0);
        }
        spawnStub.restore();
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
        assert.ok(packagePath.endsWith('node_modules/generator-dummy'));
        assert.ok(packagePath2.endsWith('node_modules/generator-dummy'));
      });
      it('Module Lookup', () => {
        const modulePath = Environment.lookupGenerator('module:app');
        assert.ok(modulePath.endsWith('node_modules/generator-module/generators/app/index.js'));

        const packagePath = Environment.lookupGenerator('module:app', {packagePath: true});
        assert.ok(packagePath.endsWith('node_modules/generator-module'));

        const generatorPath = Environment.lookupGenerator('module:app', {generatorPath: true});
        assert.ok(generatorPath.endsWith('node_modules/generator-module/generators'));
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
      fs.unlinkSync(multipleModuleGenerator);
      fs.rmdirSync(chdirRootNodeModule);
      fs.rmdirSync(chdirRoot);

      fs.unlinkSync(moduleGenerator);
      process.chdir(__dirname);
    });

    describe('Find generator', () => {
      it('Module Lookup', () => {
        const modulePath = Environment.lookupGenerator('module:app');
        assert.ok(modulePath.endsWith('node_modules/generator-module/generators/app/index.js'));

        const multiplePath = Environment.lookupGenerator('module:app', {multiple: true});
        assert.ok(multiplePath[0].endsWith('lookup-project/node_modules/generator-module/generators/app/index.js'));
        assert.ok(multiplePath[1].endsWith('lookup-project/node_modules/foo/node_modules/generator-module/generators/app/index.js'));
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
